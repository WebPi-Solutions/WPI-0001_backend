import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { Enterprise } from 'src/entities/enterprise/enterprise.entity';
import { Quote } from 'src/entities/quote/quote.entity';
import { PaymentMethod } from 'src/common/enums';
import { DropboxFileNotFoundError } from '../dropbox/dropbox-file-not-found.error';
import { DropboxService } from '../dropbox/dropbox.service';

/** Error HTTP que permite al cliente distinguir la ausencia de plantilla. */
export class WordTemplateNotFoundException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        message: 'No existe una plantilla Word para este presupuesto',
        error: 'TEMPLATE_NOT_FOUND',
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

export type WordTemplateData = Record<string, unknown>;

/** Genera documentos DOCX completando plantillas almacenadas en Dropbox. */
@Injectable()
export class WordService {
  private readonly logger = new Logger(WordService.name);

  constructor(private readonly dropboxService: DropboxService) {}

  /**
   * Descarga una plantilla DOCX y la completa con la información del presupuesto.
   *
   * @param templatePath Ruta de la plantilla de la empresa en Dropbox
   * @param quote Presupuesto con cliente y conceptos cargados
   * @param enterprise Empresa emisora del presupuesto
   * @returns Documento DOCX ya cumplimentado
   */
  async generateQuoteDocument(
    templatePath: string,
    quote: Quote,
    enterprise: Enterprise,
  ): Promise<Buffer> {
    return this.generateDocument(templatePath, this.buildQuoteTemplateData(quote, enterprise));
  }

  /**
   * Completa una plantilla DOCX con datos arbitrarios, incluidos bucles y propiedades anidadas.
   *
   * @param templatePath Ruta de la plantilla en Dropbox
   * @param templateData Datos disponibles para los marcadores de la plantilla
   * @returns Documento DOCX cumplimentado
   */
  async generateDocument(templatePath: string, templateData: WordTemplateData): Promise<Buffer> {
    this.logger.debug(`Solicitando plantilla Word en Dropbox: ${templatePath}`);
    const templateBuffer = await this.downloadTemplate(templatePath);
    this.logger.debug(
      `Plantilla Word encontrada en Dropbox: ${templatePath} (${templateBuffer.length} bytes)`,
    );

    try {
      const document = new Docxtemplater(new PizZip(templateBuffer), {
        delimiters: { start: '{{', end: '}}' },
        linebreaks: true,
        paragraphLoop: true,
        parser: (tag: string) => this.createTagParser(tag),
      });
      document.render(templateData);
      const generatedDocument = document.toBuffer();
      this.logger.debug(
        `Documento Word generado desde la plantilla ${templatePath} (${generatedDocument.length} bytes)`,
      );
      return generatedDocument;
    } catch (error: unknown) {
      const message = String(error);
      this.logger.error(`No se pudo completar la plantilla Word: ${message}`);
      throw new HttpException(
        'No se ha podido completar la plantilla Word del presupuesto',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** Descarga la plantilla y conserva la semántica 404 solo cuando no existe. */
  private async downloadTemplate(templatePath: string): Promise<Buffer> {
    try {
      return await this.dropboxService.downloadFile(templatePath);
    } catch (error: unknown) {
      if (error instanceof DropboxFileNotFoundError) {
        this.logger.warn(`No se ha encontrado la plantilla Word en Dropbox: ${templatePath}`);
        throw new WordTemplateNotFoundException();
      }
      throw error;
    }
  }

  /** Crea un resolvedor para marcadores como `{{client.name}}`. */
  private createTagParser(tag: string): { get: (scope: WordTemplateData) => unknown } {
    const path = tag.replace(/\s+/g, '').split('.').filter(Boolean);
    return {
      get: (scope: WordTemplateData): unknown => {
        const resolvedValue = path.reduce<unknown>(
          (value, property) => (
            value && typeof value === 'object'
              ? (value as WordTemplateData)[property]
              : undefined
          ),
          scope,
        );
        return resolvedValue ?? '';
      },
    };
  }

  /** Construye los datos expuestos a la plantilla de presupuesto. */
  private buildQuoteTemplateData(quote: Quote, enterprise: Enterprise): WordTemplateData {
    const concepts = [...(quote.quoteConcepts ?? [])].sort(
      (left, right) => left.position - right.position,
    );
    const vatBreakdownByRate = new Map<number, {
      subtotal: number;
      vatAmount: number;
      irpfAmount: number;
    }>();
    const subtotal = concepts.reduce(
      (total, concept) => total + Number(concept.basePrice) * Number(concept.quantity),
      0,
    );
    const vatAmount = concepts.reduce(
      (total, concept) => total + Number(concept.basePrice) * Number(concept.quantity) * Number(concept.vat) / 100,
      0,
    );
    const irpfAmount = concepts.reduce(
      (total, concept) => total + Number(concept.basePrice) * Number(concept.quantity) * Number(concept.irpf) / 100,
      0,
    );
    const total = subtotal + vatAmount - irpfAmount;
    const primaryConcept = concepts[0];

    for (const concept of concepts) {
      const conceptSubtotal = Number(concept.basePrice) * Number(concept.quantity);
      const vatRate = Number(concept.vat) || 0;
      const conceptVatAmount = conceptSubtotal * vatRate / 100;
      const conceptIrpfAmount = conceptSubtotal * (Number(concept.irpf) || 0) / 100;
      const currentBreakdown = vatBreakdownByRate.get(vatRate) ?? {
        subtotal: 0,
        vatAmount: 0,
        irpfAmount: 0,
      };
      vatBreakdownByRate.set(vatRate, {
        subtotal: currentBreakdown.subtotal + conceptSubtotal,
        vatAmount: currentBreakdown.vatAmount + conceptVatAmount,
        irpfAmount: currentBreakdown.irpfAmount + conceptIrpfAmount,
      });
    }

    return {
      issued_date: this.formatDate(quote.issuedDate),
      client: {
        name: quote.clientName ?? quote.client?.name ?? '',
        nif: quote.clientNif ?? quote.client?.nif ?? '',
        address: quote.clientAddress ?? quote.client?.address ?? '',
        phone: quote.client?.phone ?? '',
        email: quote.client?.email ?? '',
        payment_method: this.formatPaymentMethod(quote.client?.paymentMethod),
      },
      enterprise: {
        name: quote.issuerName ?? enterprise.name ?? '',
        nif: quote.issuerNif ?? enterprise.nif ?? '',
        address: quote.issuerAddress ?? enterprise.address ?? '',
        phone: enterprise.phone ?? '',
        email: enterprise.email ?? '',
        iban: enterprise.bankAccount ?? '',
      },
      concept: this.formatConcept(primaryConcept),
      concepts: concepts.map((concept) => this.formatConcept(concept)),
      vat_breakdown: Array.from(vatBreakdownByRate, ([rate, breakdown]) => ({
        base: this.formatCurrency(breakdown.subtotal),
        percentage: this.formatPercentage(rate),
        amount: this.formatCurrency(breakdown.vatAmount),
        total: this.formatCurrency(
          breakdown.subtotal + breakdown.vatAmount - breakdown.irpfAmount,
        ),
      })),
      totals: {
        subtotal: this.formatCurrency(subtotal),
        iva: this.formatCurrency(vatAmount),
        vat_amount: this.formatCurrency(vatAmount),
        vat_percentage: this.formatPercentage(subtotal === 0 ? 0 : vatAmount * 100 / subtotal),
        irpf_amount: this.formatCurrency(irpfAmount),
        total: this.formatCurrency(total),
      },
    };
  }

  /** Da formato a una línea para su uso en plantillas con `concept.*`. */
  private formatConcept(concept: Quote['quoteConcepts'][number] | undefined): WordTemplateData {
    if (!concept) {
      return {
        name: '',
        quantity: '0',
        subtotal: this.formatCurrency(0),
        iva: '0%',
        total: this.formatCurrency(0),
      };
    }

    const subtotal = Number(concept.basePrice) * Number(concept.quantity);
    const total = subtotal + subtotal * Number(concept.vat) / 100 - subtotal * Number(concept.irpf) / 100;
    return {
      name: concept.name ?? '',
      quantity: String(concept.quantity ?? 0),
      subtotal: this.formatCurrency(concept.basePrice),
      iva: `${this.formatPercentage(concept.vat)}%`,
      total: this.formatCurrency(total),
    };
  }

  /** Formatea una fecha sin depender de la zona horaria del servidor. */
  private formatDate(value: Date | string | null | undefined): string {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return [date.getUTCDate(), date.getUTCMonth() + 1, date.getUTCFullYear()]
      .map((part, index) => index < 2 ? String(part).padStart(2, '0') : String(part))
      .join('/');
  }

  /** Formatea importes monetarios para los documentos comerciales. */
  private formatCurrency(value: number): string {
    return `${new Intl.NumberFormat('es-ES', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value) || 0)} €`;
  }

  /** Formatea porcentajes sin añadir el símbolo, que queda en la plantilla. */
  private formatPercentage(value: number): string {
    return new Intl.NumberFormat('es-ES', {
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);
  }

  /** Traduce el método de pago persistido al texto comercial mostrado en la interfaz. */
  private formatPaymentMethod(value: PaymentMethod | null | undefined): string {
    const labels: Record<PaymentMethod, string> = {
      [PaymentMethod.CARD]: 'Tarjeta',
      [PaymentMethod.CASH]: 'Efectivo',
      [PaymentMethod.BANK_TRANSFER]: 'Transferencia bancaria',
      [PaymentMethod.DIRECT_DEBIT]: 'Domiciliación bancaria',
    };
    return value ? labels[value] ?? '' : '';
  }
}
