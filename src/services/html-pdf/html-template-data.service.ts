import { Injectable } from '@nestjs/common';
import { PaymentMethod } from 'src/common/enums';
import { Enterprise } from 'src/entities/enterprise/enterprise.entity';
import { Invoice } from 'src/entities/invoice/invoice.entity';
import { Order } from 'src/entities/order/order.entity';
import { Quote } from 'src/entities/quote/quote.entity';

export type HtmlTemplateData = Record<string, unknown>;

type CommercialConcept = Pick<Quote['quoteConcepts'][number],
  'basePrice' | 'irpf' | 'name' | 'position' | 'quantity' | 'vat'>;

interface CommercialDocumentInput {
  date: Date | string | null | undefined;
  clientName: string | null | undefined;
  clientNif: string | null | undefined;
  clientAddress: string | null | undefined;
  issuerName: string | null | undefined;
  issuerNif: string | null | undefined;
  issuerAddress: string | null | undefined;
  client: Quote['client'] | undefined;
  concepts: CommercialConcept[] | undefined;
}

/** Normaliza los datos comerciales usados por las plantillas HTML. */
@Injectable()
export class HtmlTemplateDataService {
  getQuoteTemplateData(quote: Quote, enterprise: Enterprise): HtmlTemplateData {
    return this.buildCommercialTemplateData({
      date: quote.issuedDate,
      clientName: quote.clientName,
      clientNif: quote.clientNif,
      clientAddress: quote.clientAddress,
      issuerName: quote.issuerName,
      issuerNif: quote.issuerNif,
      issuerAddress: quote.issuerAddress,
      client: quote.client,
      concepts: quote.quoteConcepts,
    }, enterprise);
  }

  getOrderTemplateData(order: Order, enterprise: Enterprise): HtmlTemplateData {
    return {
      ...this.buildCommercialTemplateData({
        date: order.date,
        clientName: order.clientName,
        clientNif: order.clientNif,
        clientAddress: order.clientAddress,
        issuerName: order.issuerName,
        issuerNif: order.issuerNif,
        issuerAddress: order.issuerAddress,
        client: order.client,
        concepts: order.orderConcepts,
      }, enterprise),
      order: { status: order.status ?? '' },
    };
  }

  getInvoiceTemplateData(invoice: Invoice, enterprise: Enterprise): HtmlTemplateData {
    return this.buildCommercialTemplateData({
      date: invoice.issuedDate,
      clientName: invoice.clientName,
      clientNif: invoice.clientNif,
      clientAddress: invoice.clientAddress,
      issuerName: invoice.issuerName,
      issuerNif: invoice.issuerNif,
      issuerAddress: invoice.issuerAddress,
      client: invoice.client,
      concepts: invoice.invoiceConcepts,
    }, enterprise, { invoice: { code: this.formatInvoiceCode(invoice) } });
  }

  private buildCommercialTemplateData(
    commercialDocument: CommercialDocumentInput,
    enterprise: Enterprise,
    additionalData: HtmlTemplateData = {},
  ): HtmlTemplateData {
    const concepts = [...(commercialDocument.concepts ?? [])].sort(
      (left, right) => left.position - right.position,
    );
    const vatBreakdownByRate = new Map<number, { subtotal: number; vatAmount: number; irpfAmount: number }>();
    const subtotal = concepts.reduce(
      (total, concept) => total + Number(concept.basePrice) * Number(concept.quantity), 0,
    );
    const vatAmount = concepts.reduce(
      (total, concept) => total + Number(concept.basePrice) * Number(concept.quantity) * Number(concept.vat) / 100, 0,
    );
    const irpfAmount = concepts.reduce(
      (total, concept) => total + Number(concept.basePrice) * Number(concept.quantity) * Number(concept.irpf) / 100, 0,
    );

    for (const concept of concepts) {
      const conceptSubtotal = Number(concept.basePrice) * Number(concept.quantity);
      const vatRate = Number(concept.vat) || 0;
      const current = vatBreakdownByRate.get(vatRate) ?? { subtotal: 0, vatAmount: 0, irpfAmount: 0 };
      vatBreakdownByRate.set(vatRate, {
        subtotal: current.subtotal + conceptSubtotal,
        vatAmount: current.vatAmount + conceptSubtotal * vatRate / 100,
        irpfAmount: current.irpfAmount + conceptSubtotal * (Number(concept.irpf) || 0) / 100,
      });
    }

    return {
      issued_date: this.formatDate(commercialDocument.date),
      client: {
        name: commercialDocument.clientName ?? commercialDocument.client?.name ?? '',
        nif: commercialDocument.clientNif ?? commercialDocument.client?.nif ?? '',
        address: commercialDocument.clientAddress ?? commercialDocument.client?.address ?? '',
        phone: commercialDocument.client?.phone ?? '',
        email: commercialDocument.client?.email ?? '',
        payment_method: this.formatPaymentMethod(commercialDocument.client?.paymentMethod),
      },
      enterprise: {
        name: commercialDocument.issuerName ?? enterprise.name ?? '',
        nif: commercialDocument.issuerNif ?? enterprise.nif ?? '',
        address: commercialDocument.issuerAddress ?? enterprise.address ?? '',
        phone: enterprise.phone ?? '',
        email: enterprise.email ?? '',
        iban: enterprise.bankAccount ?? '',
      },
      concept: this.formatConcept(concepts[0]),
      concepts: concepts.map((concept) => this.formatConcept(concept)),
      vat_breakdown: Array.from(vatBreakdownByRate, ([rate, breakdown]) => ({
        base: this.formatCurrency(breakdown.subtotal),
        percentage: this.formatPercentage(rate),
        amount: this.formatCurrency(breakdown.vatAmount),
        total: this.formatCurrency(breakdown.subtotal + breakdown.vatAmount - breakdown.irpfAmount),
      })),
      totals: {
        subtotal: this.formatCurrency(subtotal),
        iva: this.formatCurrency(vatAmount),
        vat_amount: this.formatCurrency(vatAmount),
        vat_percentage: this.formatPercentage(subtotal === 0 ? 0 : vatAmount * 100 / subtotal),
        irpf_amount: this.formatCurrency(irpfAmount),
        total: this.formatCurrency(subtotal + vatAmount - irpfAmount),
      },
      ...additionalData,
    };
  }

  private formatInvoiceCode(invoice: Invoice): string {
    const number = invoice.seriesNumber;
    return `${invoice.series?.series ?? ''}-${number === null || number === undefined ? '0000' : String(number).padStart(4, '0')}`;
  }

  private formatConcept(concept: CommercialConcept | undefined): HtmlTemplateData {
    if (!concept) {
      return { name: '', quantity: '0', subtotal: this.formatCurrency(0), iva: '0%', total: this.formatCurrency(0) };
    }
    const subtotal = Number(concept.basePrice) * Number(concept.quantity);
    return {
      name: concept.name ?? '',
      quantity: String(concept.quantity ?? 0),
      subtotal: this.formatCurrency(concept.basePrice),
      iva: `${this.formatPercentage(concept.vat)}%`,
      total: this.formatCurrency(subtotal + subtotal * Number(concept.vat) / 100 - subtotal * Number(concept.irpf) / 100),
    };
  }

  private formatDate(value: Date | string | null | undefined): string {
    if (!value || Number.isNaN(new Date(value).getTime())) return '';
    const date = new Date(value);
    return [date.getUTCDate(), date.getUTCMonth() + 1, date.getUTCFullYear()]
      .map((part, index) => index < 2 ? String(part).padStart(2, '0') : String(part)).join('/');
  }

  private formatCurrency(value: number): string {
    return `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)} €`;
  }

  private formatPercentage(value: number): string {
    return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(Number(value) || 0);
  }

  private formatPaymentMethod(value: PaymentMethod | null | undefined): string {
    const labels: Record<PaymentMethod, string> = {
      [PaymentMethod.CARD]: 'Tarjeta', [PaymentMethod.CASH]: 'Efectivo',
      [PaymentMethod.BANK_TRANSFER]: 'Transferencia bancaria', [PaymentMethod.DIRECT_DEBIT]: 'Domiciliación bancaria',
    };
    return value ? labels[value] ?? '' : '';
  }
}
