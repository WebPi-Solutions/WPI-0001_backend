import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as Mustache from 'mustache';
import * as puppeteer from 'puppeteer-core';
import { Browser } from 'puppeteer-core';
import { Enterprise } from 'src/entities/enterprise/enterprise.entity';
import { EnterpriseSettingsRepository } from 'src/entities/enterprise-settings/enterprise-settings-repository.service';
import { getEnterpriseLogoFilePath } from 'src/entities/enterprise/enterprise-repository.service';
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

type TemplateSource = {
  buffer: Buffer;
  path: string;
  local: boolean;
};

/** Genera PDFs estáticos a partir de plantillas HTML almacenadas en Dropbox. */
@Injectable()
export class HtmlPdfService implements OnModuleDestroy {
  private readonly logger = new Logger(HtmlPdfService.name);
  private browserPromise: Promise<Browser> | undefined;

  constructor(
    private readonly dropboxService: DropboxService,
    private readonly htmlTemplateDataService: HtmlTemplateDataService,
    private readonly enterpriseSettingsRepository: EnterpriseSettingsRepository,
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
    return this.generatePdf(
      templatePath,
      this.htmlTemplateDataService.getQuoteTemplateData(quote, enterprise),
      enterprise,
    );
  }

  /** Completa la plantilla HTML del pedido y devuelve su PDF no editable. */
  async generateOrderPdf(templatePath: string, order: Order, enterprise: Enterprise): Promise<Buffer> {
    return this.generatePdf(templatePath, this.htmlTemplateDataService.getOrderTemplateData(order, enterprise), enterprise);
  }

  /** Completa la plantilla HTML de la factura y devuelve su PDF no editable. */
  async generateInvoicePdf(templatePath: string, invoice: Invoice, enterprise: Enterprise): Promise<Buffer> {
    return this.generatePdf(templatePath, this.htmlTemplateDataService.getInvoiceTemplateData(invoice, enterprise), enterprise);
  }

  /**
   * Completa una plantilla HTML, incorpora sus imágenes locales y la imprime en PDF.
   *
   * @param templatePath Ruta de la plantilla HTML en Dropbox
   * @param templateData Datos disponibles para los marcadores Mustache
   * @returns Buffer del PDF estático
   */
  async generatePdf(
    templatePath: string,
    templateData: HtmlTemplateData,
    enterprise?: Enterprise,
  ): Promise<Buffer> {
    this.logger.debug(`Solicitando plantilla HTML en Dropbox: ${templatePath}`);
    const template = await this.downloadTemplate(templatePath);
    this.logger.debug(
      `Plantilla HTML ${template.local ? 'por defecto local' : 'encontrada en Dropbox'}: ${template.path} (${template.buffer.length} bytes)`,
    );

    try {
      const documentType = path.basename(templatePath, path.extname(templatePath));
      this.logger.debug(`Preparando reemplazos de plantilla para ${documentType}: ${templatePath}`);
      const templateHtml = this.applyRegistrationNoticePrintStyles(
        this.applyLegalFooter(
          this.applyRegistrationNoticeFields(
            this.ensureRegistrationNotice(
              this.replaceLegacyBrandLogo(template.buffer.toString('utf8')),
              documentType,
            ),
            documentType,
          ),
          documentType,
        ),
      );
      const logo = enterprise ? await this.getEnterpriseLogoDataUri(enterprise) : '';
      const documentSettings = await this.getDocumentSettings(enterprise?.id);
      const renderedHtml = Mustache.render(templateHtml, {
        ...templateData,
        logo,
        document: documentSettings,
      });
      this.logger.debug(
        `Marcadores de plantilla renderizados para ${documentType}: footer=${documentSettings.footer.length} caracteres, left=${documentSettings.left.length} caracteres, right=${documentSettings.right.length} caracteres`,
      );
      const templateWithAssets = await this.inlineTemplateImages(
        renderedHtml,
        template.path,
        template.local,
      );
      const pdf = await this.renderPdf(templateWithAssets);
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

  /** Obtiene los textos comunes configurados para los documentos de una empresa. */
  private async getDocumentSettings(enterpriseId?: string): Promise<{
    footer: string;
    left: string;
    right: string;
  }> {
    if (!enterpriseId) return { footer: '', left: '', right: '' };
    const [footer, left, right] = await Promise.all([
      this.enterpriseSettingsRepository.findByKey('document.footer', enterpriseId),
      this.enterpriseSettingsRepository.findByKey('document.left', enterpriseId),
      this.enterpriseSettingsRepository.findByKey('document.right', enterpriseId),
    ]);
    this.logger.debug(
      `Configuración documental resuelta para empresa ${enterpriseId}: document.footer=${footer?.id ? 'BD' : 'por defecto'}, document.left=${left?.id ? 'BD' : 'por defecto'}, document.right=${right?.id ? 'BD' : 'por defecto'}`,
    );
    return {
      footer: footer?.value ?? '',
      left: left?.value ?? '',
      right: right?.value ?? '',
    };
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

  /** Descarga la plantilla y aplica el HTML incluido cuando aún no existe en Dropbox. */
  private async downloadTemplate(templatePath: string): Promise<TemplateSource> {
    try {
      return {
        buffer: await this.dropboxService.downloadFile(templatePath),
        path: templatePath,
        local: false,
      };
    } catch (error: unknown) {
      if (error instanceof DropboxFileNotFoundError) {
        const defaultTemplate = await this.readDefaultTemplate(templatePath);
        if (defaultTemplate) {
          return defaultTemplate;
        }
        this.logger.warn(`No se ha encontrado la plantilla HTML en Dropbox: ${templatePath}`);
        throw new HtmlTemplateNotFoundException();
      }
      throw error;
    }
  }

  /** Usa la plantilla incluida en el backend cuando la empresa aún no tiene una en Dropbox. */
  private async readDefaultTemplate(templatePath: string): Promise<TemplateSource | undefined> {
    const entityType = path.basename(templatePath, path.extname(templatePath));
    if (!['quote', 'invoice', 'order'].includes(entityType)) {
      return undefined;
    }
    const defaultPath = path.join(__dirname, 'templates', 'default', `${entityType}.html`);
    try {
      return { buffer: await readFile(defaultPath), path: defaultPath, local: true };
    } catch (error: unknown) {
      this.logger.error(`No se pudo leer la plantilla HTML por defecto ${defaultPath}: ${String(error)}`);
      return undefined;
    }
  }

  /** Incorpora las imágenes relativas de Dropbox como data URI para que Chromium no haga peticiones externas. */
  private async inlineTemplateImages(
    templateHtml: string,
    templatePath: string,
    localTemplate = false,
  ): Promise<string> {
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
        imageBuffer = localTemplate
          ? await readFile(assetPath)
          : await this.dropboxService.downloadFile(assetPath);
      } catch (error: unknown) {
        if (error instanceof DropboxFileNotFoundError || (localTemplate && (error as NodeJS.ErrnoException).code === 'ENOENT')) {
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

  /** Obtiene el logo configurado de la empresa como URI de datos para la plantilla. */
  private async getEnterpriseLogoDataUri(enterprise: Enterprise): Promise<string> {
    if (!enterprise.id || !enterprise.logo) {
      return '';
    }

    const extension = path.extname(enterprise.logo).slice(1).toLowerCase();
    if (!['png', 'jpg', 'jpeg'].includes(extension)) {
      this.logger.warn(`El logo de la empresa ${enterprise.id} tiene una extensión no compatible`);
      return '';
    }

    const logoPath = getEnterpriseLogoFilePath(enterprise.id, extension);
    try {
      const logo = await this.dropboxService.downloadFile(logoPath);
      return this.toDataUri(enterprise.logo, logo);
    } catch (error: unknown) {
      if (error instanceof DropboxFileNotFoundError) {
        this.logger.warn(`No se ha encontrado el logo de la empresa ${enterprise.id}: ${logoPath}`);
        return '';
      }
      throw error;
    }
  }

  /**
   * Convierte el logo fijo de las plantillas anteriores en el marcador dinámico.
   * Así los HTML ya almacenados en Dropbox no buscan `templates/html/logo.png`.
   */
  private replaceLegacyBrandLogo(templateHtml: string): string {
    return templateHtml.replace(/<img\b[^>]*>/gi, (imageTag) => {
      const className = imageTag.match(/\bclass=(["'])(.*?)\1/i)?.[2] ?? '';
      const source = imageTag.match(/\bsrc=(["'])(.*?)\1/i)?.[2];
      if (!className.split(/\s+/).includes('brand-logo') || source !== './logo.png') {
        return imageTag;
      }

      this.logger.debug('Reemplazando logo heredado de plantilla por el marcador dinámico {{logo}}');
      return [
        '{{#logo}}',
        '<img class="brand-logo" src="{{{logo}}}" alt="Logo de la empresa"',
        ' style="width: auto; height: auto; max-width: 72mm; max-height: 15mm; margin: 0; object-fit: contain;" />',
        '{{/logo}}',
      ].join('');
    });
  }

  /** Añade el aviso registral a plantillas antiguas que aún no lo incluyen. */
  private ensureRegistrationNotice(templateHtml: string, documentType = 'document'): string {
    const hasLeftNotice = /<[a-z][^>]*\bclass=["'][^"']*\bregistration-notice(?!-)[^"']*["'][^>]*>/i.test(templateHtml);
    const hasRightNotice = /<[a-z][^>]*\bclass=["'][^"']*\bregistration-notice-right\b[^"']*["'][^>]*>/i.test(templateHtml);
    if (hasLeftNotice && hasRightNotice) {
      this.logger.debug('La plantilla ya contiene los dos marcadores laterales del documento');
      return templateHtml;
    }

    const notices = [
      !hasLeftNotice
        ? '<aside class="registration-notice" aria-label="Información registral">{{document.left}}</aside>'
        : '',
      !hasRightNotice
        ? '<aside class="registration-notice-right" aria-label="Información registral">{{document.right}}</aside>'
        : '',
    ].join('');

    this.logger.debug(`Añadiendo marcadores laterales ausentes para documento ${documentType}`);
    return templateHtml.replace(/(<main\b[^>]*>)/i, `$1${notices}`);
  }

  /** Sustituye el contenido estático de los avisos laterales por sus marcadores de plantilla. */
  private applyRegistrationNoticeFields(templateHtml: string, documentType: string): string {
    const leftPattern = /(<aside\b[^>]*class=["'][^"']*\bregistration-notice(?!-)[^"']*["'][^>]*>)[\s\S]*?(<\/aside>)/i;
    const rightPattern = /(<aside\b[^>]*class=["'][^"']*\bregistration-notice-right\b[^"']*["'][^>]*>)[\s\S]*?(<\/aside>)/i;
    const replaced = templateHtml
      .replace(leftPattern, '$1{{document.left}}$2')
      .replace(rightPattern, '$1{{document.right}}$2');
    this.logger.debug(`Reemplazados los textos laterales por document.left/document.right para ${documentType}`);
    return replaced;
  }

  /** Sustituye el aviso legal de plantilla por el texto fijo del pie del documento. */
  private applyLegalFooter(templateHtml: string, documentType = 'document'): string {
    const legalFooterPattern = /<footer\b[^>]*\bclass=["'][^"']*\blegal-notice\b[^"']*["'][^>]*>[\s\S]*?<\/footer>/i;
    if (!legalFooterPattern.test(templateHtml)) {
      this.logger.debug('No se encontró footer legal en la plantilla; no se aplica reemplazo de document.footer');
      return templateHtml;
    }

    const legalFooter = '<footer class="legal-notice" aria-label="Aviso legal"><p>{{document.footer}}</p></footer>';
    this.logger.debug(`Reemplazado el contenido del footer legal por document.footer para ${documentType}`);
    return templateHtml.replace(legalFooterPattern, legalFooter);
  }

  /** Fuerza una posición visible dentro del área imprimible de Chromium. */
  private applyRegistrationNoticePrintStyles(templateHtml: string): string {
    if (!templateHtml.includes('registration-notice')) {
      return templateHtml;
    }

    const printStyles = '<style>@page { size: A4; margin: 5mm 5mm 9mm; } @media print { .document { width: calc(100% - 10mm) !important; margin-left: 5mm !important; } .registration-notice, .registration-notice-right { position: fixed !important; top: 50% !important; bottom: auto !important; margin: 0 !important; white-space: nowrap !important; font-size: 4.8pt !important; line-height: 1 !important; transform-origin: center !important; } .registration-notice { left: 1mm !important; right: auto !important; transform: translate(-50%, -50%) rotate(-90deg) !important; } .registration-notice-right { right: 1mm !important; left: auto !important; transform: translate(50%, -50%) rotate(90deg) !important; } .legal-notice { position: fixed !important; right: 5mm !important; bottom: 12mm !important; left: 5mm !important; margin: 0 !important; font-size: 6.3pt !important; line-height: 1.23 !important; text-align: center !important; } .page-number { bottom: 0 !important; } }</style>';
    return templateHtml.replace(/<\/head>/i, `${printStyles}</head>`);
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
    if (path.isAbsolute(templatePath)) {
      return path.resolve(path.dirname(templatePath), relativePath);
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
