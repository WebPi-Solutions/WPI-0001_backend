import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import * as Mustache from 'mustache';
import * as puppeteer from 'puppeteer-core';
import { Browser } from 'puppeteer-core';
import { Enterprise } from 'src/entities/enterprise/enterprise.entity';
import { Invoice } from 'src/entities/invoice/invoice.entity';
import { Order } from 'src/entities/order/order.entity';
import { Quote } from 'src/entities/quote/quote.entity';
import { DropboxFileNotFoundError } from '../dropbox/dropbox-file-not-found.error';
import { DropboxService } from '../dropbox/dropbox.service';
import { HtmlTemplateData, HtmlTemplateDataService } from './html-template-data.service';

/** Error HTTP que permite identificar la ausencia de una plantilla HTML. */
export class HtmlTemplateNotFoundException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        message: 'No existe una plantilla HTML para este documento',
        error: 'TEMPLATE_NOT_FOUND',
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

const IMAGE_MIME_TYPES: Record<string, string> = {
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};

/** Genera PDFs estáticos a partir de plantillas HTML almacenadas en Dropbox. */
@Injectable()
export class HtmlPdfService implements OnModuleDestroy {
  private readonly logger = new Logger(HtmlPdfService.name);
  private browserPromise: Promise<Browser> | undefined;

  constructor(
    private readonly dropboxService: DropboxService,
    private readonly htmlTemplateDataService: HtmlTemplateDataService,
  ) {}

  /**
   * Completa la plantilla HTML del presupuesto y devuelve un PDF no editable.
   *
   * @param templatePath Ruta de la plantilla HTML en Dropbox
   * @param quote Presupuesto con cliente y conceptos cargados
   * @param enterprise Empresa emisora del presupuesto
   * @returns Buffer del PDF ya generado
   */
  async generateQuotePdf(
    templatePath: string,
    quote: Quote,
    enterprise: Enterprise,
  ): Promise<Buffer> {
    return this.generatePdf(templatePath, this.htmlTemplateDataService.getQuoteTemplateData(quote, enterprise));
  }

  /** Completa la plantilla HTML del pedido y devuelve su PDF no editable. */
  async generateOrderPdf(templatePath: string, order: Order, enterprise: Enterprise): Promise<Buffer> {
    return this.generatePdf(templatePath, this.htmlTemplateDataService.getOrderTemplateData(order, enterprise));
  }

  /** Completa la plantilla HTML de la factura y devuelve su PDF no editable. */
  async generateInvoicePdf(templatePath: string, invoice: Invoice, enterprise: Enterprise): Promise<Buffer> {
    return this.generatePdf(templatePath, this.htmlTemplateDataService.getInvoiceTemplateData(invoice, enterprise));
  }

  /**
   * Completa una plantilla HTML, incorpora sus imágenes locales y la imprime en PDF.
   *
   * @param templatePath Ruta de la plantilla HTML en Dropbox
   * @param templateData Datos disponibles para los marcadores Mustache
   * @returns Buffer del PDF estático
   */
  async generatePdf(templatePath: string, templateData: HtmlTemplateData): Promise<Buffer> {
    this.logger.debug(`Solicitando plantilla HTML en Dropbox: ${templatePath}`);
    const template = await this.downloadTemplate(templatePath);
    this.logger.debug(
      `Plantilla HTML encontrada en Dropbox: ${templatePath} (${template.length} bytes)`,
    );

    try {
      const templateWithAssets = await this.inlineTemplateImages(template.toString('utf8'), templatePath);
      const renderedHtml = Mustache.render(templateWithAssets, templateData);
      const pdf = await this.renderPdf(renderedHtml);
      this.logger.debug(`PDF generado desde la plantilla ${templatePath} (${pdf.length} bytes)`);
      return pdf;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`No se pudo generar el PDF desde la plantilla HTML: ${String(error)}`);
      throw new InternalServerErrorException(
        'No se ha podido generar el PDF del documento desde su plantilla HTML',
      );
    }
  }

  /** Cierra Chromium al apagar la aplicación para no dejar procesos huérfanos. */
  async onModuleDestroy(): Promise<void> {
    const browserPromise = this.browserPromise;
    this.browserPromise = undefined;
    if (browserPromise) {
      const browser = await browserPromise;
      await browser.close();
    }
  }

  /** Descarga la plantilla y convierte exclusivamente una ausencia real en un 404 de plantilla. */
  private async downloadTemplate(templatePath: string): Promise<Buffer> {
    try {
      return await this.dropboxService.downloadFile(templatePath);
    } catch (error: unknown) {
      if (error instanceof DropboxFileNotFoundError) {
        this.logger.warn(`No se ha encontrado la plantilla HTML en Dropbox: ${templatePath}`);
        throw new HtmlTemplateNotFoundException();
      }
      throw error;
    }
  }

  /** Incorpora las imágenes relativas de Dropbox como data URI para que Chromium no haga peticiones externas. */
  private async inlineTemplateImages(templateHtml: string, templatePath: string): Promise<string> {
    const imageSources = Array.from(
      templateHtml.matchAll(/<img\b[^>]*\bsrc=(["'])([^"']+)\1[^>]*>/gi),
      (match) => match[2],
    );
    const imageDataUris = new Map<string, string>();

    for (const imageSource of new Set(imageSources)) {
      if (imageSource.startsWith('data:')) {
        continue;
      }
      const assetPath = this.resolveTemplateImagePath(templatePath, imageSource);
      let imageBuffer: Buffer;
      try {
        imageBuffer = await this.dropboxService.downloadFile(assetPath);
      } catch (error: unknown) {
        if (error instanceof DropboxFileNotFoundError) {
          this.logger.error(`No se ha encontrado la imagen de la plantilla HTML: ${assetPath}`);
          throw new InternalServerErrorException(
            'No se ha encontrado una imagen requerida por la plantilla HTML del presupuesto',
          );
        }
        throw error;
      }
      imageDataUris.set(imageSource, this.toDataUri(imageSource, imageBuffer));
    }

    return templateHtml.replace(
      /(<img\b[^>]*\bsrc=)(["'])([^"']+)(\2)/gi,
      (match, prefix: string, quote: string, imageSource: string, suffix: string) => {
        const dataUri = imageDataUris.get(imageSource);
        return dataUri ? `${prefix}${quote}${dataUri}${suffix}` : match;
      },
    );
  }

  /** Resuelve una imagen relativa sin permitir que la plantilla salga de su carpeta en Dropbox. */
  private resolveTemplateImagePath(templatePath: string, imageSource: string): string {
    if (!imageSource.startsWith('./')) {
      throw new InternalServerErrorException(
        'Las imágenes de la plantilla HTML deben usar una ruta relativa que comience por ./',
      );
    }
    const relativePath = imageSource.slice(2);
    const pathSegments = relativePath.split('/');
    if (!relativePath || pathSegments.some((segment) => !segment || segment === '.' || segment === '..')) {
      throw new InternalServerErrorException('La ruta de una imagen de plantilla HTML no es válida');
    }
    const lastSlashIndex = templatePath.lastIndexOf('/');
    return `${templatePath.slice(0, lastSlashIndex + 1)}${relativePath}`;
  }

  /** Convierte un recurso descargado a una data URI según su extensión. */
  private toDataUri(imageSource: string, imageBuffer: Buffer): string {
    const fileName = imageSource.split('?')[0];
    const extension = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
    const mimeType = IMAGE_MIME_TYPES[extension] ?? 'application/octet-stream';
    return `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
  }

  /** Genera el PDF usando una única instancia reutilizable de Chromium. */
  private async renderPdf(renderedHtml: string): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setJavaScriptEnabled(false);
      await page.setContent(renderedHtml, { waitUntil: 'load' });
      const pdf = await page.pdf({
        format: 'A4',
        preferCSSPageSize: true,
        printBackground: true,
      });
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }

  /** Inicializa Chromium bajo demanda y reutiliza la instancia entre conversiones. */
  private async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = puppeteer.launch({
        args: ['--disable-dev-shm-usage', '--disable-gpu', '--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? '/usr/bin/chromium-browser',
        headless: true,
      });
    }
    try {
      return await this.browserPromise;
    } catch (error: unknown) {
      this.browserPromise = undefined;
      throw error;
    }
  }
}
