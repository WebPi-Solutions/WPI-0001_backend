jest.mock('puppeteer-core', () => ({ launch: jest.fn() }));

import { HttpStatus } from '@nestjs/common';
import * as fsPromises from 'node:fs/promises';
import * as puppeteer from 'puppeteer-core';
import { Enterprise } from 'src/entities/enterprise/enterprise.entity';
import { EnterpriseSettingsRepository } from 'src/entities/enterprise-settings/enterprise-settings-repository.service';
import { Invoice } from 'src/entities/invoice/invoice.entity';
import { Order } from 'src/entities/order/order.entity';
import { Quote } from 'src/entities/quote/quote.entity';
import { DropboxFileNotFoundError } from '../dropbox/dropbox-file-not-found.error';
import { DropboxService } from '../dropbox/dropbox.service';
import { HtmlTemplateDataService } from './html-template-data.service';
import { HtmlPdfService } from './html-pdf.service';

describe('HtmlPdfService', () => {
  let service: HtmlPdfService;
  let dropboxService: { downloadFile: jest.Mock };
  let htmlTemplateDataService: {
    getQuoteTemplateData: jest.Mock;
    getOrderTemplateData: jest.Mock;
    getInvoiceTemplateData: jest.Mock;
  };
  let enterpriseSettingsRepository: { findByKey: jest.Mock };
  let page: {
    close: jest.Mock;
    pdf: jest.Mock;
    setContent: jest.Mock;
    setJavaScriptEnabled: jest.Mock;
  };
  let browser: { close: jest.Mock; newPage: jest.Mock };
  const templatePath = '/enterprises/enterprise-uuid/templates/html/quote.html';
  const quote = { id: 'quote-uuid' } as Quote;
  const enterprise = { id: 'enterprise-uuid' } as Enterprise;
  const templateData = {
    client: { name: 'Cliente & Demo' },
    concepts: [{ name: 'Servicio <principal>' }],
  };
  const previousExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  const previousLogoPath = process.env.DROPBOX_ENTERPRISE_LOGO_FILE_PATH;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PUPPETEER_EXECUTABLE_PATH = '/usr/bin/chromium-browser';
    process.env.DROPBOX_ENTERPRISE_LOGO_FILE_PATH = '/enterprises/:enterpriseId/logo';
    page = {
      close: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.7')),
      setContent: jest.fn().mockResolvedValue(undefined),
      setJavaScriptEnabled: jest.fn().mockResolvedValue(undefined),
    };
    browser = {
      close: jest.fn().mockResolvedValue(undefined),
      newPage: jest.fn().mockResolvedValue(page),
    };
    (puppeteer.launch as jest.Mock).mockResolvedValue(browser);
    dropboxService = { downloadFile: jest.fn() };
    htmlTemplateDataService = {
      getQuoteTemplateData: jest.fn().mockReturnValue(templateData),
      getOrderTemplateData: jest.fn().mockReturnValue(templateData),
      getInvoiceTemplateData: jest.fn().mockReturnValue(templateData),
    };
    enterpriseSettingsRepository = {
      findByKey: jest.fn().mockResolvedValue({ value: '' }),
    };
    service = new HtmlPdfService(
      dropboxService as unknown as DropboxService,
      htmlTemplateDataService as unknown as HtmlTemplateDataService,
      enterpriseSettingsRepository as unknown as EnterpriseSettingsRepository,
    );
  });

  afterAll(() => {
    if (previousExecutablePath === undefined) {
      delete process.env.PUPPETEER_EXECUTABLE_PATH;
    } else {
      process.env.PUPPETEER_EXECUTABLE_PATH = previousExecutablePath;
    }
    if (previousLogoPath === undefined) {
      delete process.env.DROPBOX_ENTERPRISE_LOGO_FILE_PATH;
    } else {
      process.env.DROPBOX_ENTERPRISE_LOGO_FILE_PATH = previousLogoPath;
    }
  });

  it('genera un PDF estático, escapa los datos e incorpora las imágenes de Dropbox', async () => {
    dropboxService.downloadFile
      .mockResolvedValueOnce(Buffer.from(
        '<img src="data:image/png;base64,YA=="><img src="./logo.png"><main>{{client.name}}</main>{{#concepts}}<p>{{name}}</p>{{/concepts}}',
      ))
      .mockResolvedValueOnce(Buffer.from('logo'))
      .mockResolvedValueOnce(Buffer.from(
        '<img src="data:image/png;base64,YA=="><img src="./logo.png"><main>{{client.name}}</main>{{#concepts}}<p>{{name}}</p>{{/concepts}}',
      ))
      .mockResolvedValueOnce(Buffer.from('logo'));

    const pdf = await service.generateQuotePdf(templatePath, quote, enterprise);
    await service.generatePdf(templatePath, templateData);

    expect(htmlTemplateDataService.getQuoteTemplateData).toHaveBeenCalledWith(quote, enterprise);
    expect(dropboxService.downloadFile).toHaveBeenNthCalledWith(2, '/enterprises/enterprise-uuid/templates/html/logo.png');
    expect(page.setJavaScriptEnabled).toHaveBeenCalledWith(false);
    expect(page.setContent).toHaveBeenCalledWith(
      expect.stringContaining('Cliente &amp; Demo'),
      { waitUntil: 'load' },
    );
    expect(page.setContent).toHaveBeenCalledWith(
      expect.stringContaining('Servicio &lt;principal&gt;'),
      { waitUntil: 'load' },
    );
    expect(page.setContent).toHaveBeenCalledWith(
      expect.stringContaining('data:image/png;base64,bG9nbw=='),
      { waitUntil: 'load' },
    );
    expect(page.pdf).toHaveBeenCalledWith({
      format: 'A4',
      preferCSSPageSize: true,
      printBackground: true,
    });
    expect(puppeteer.launch).toHaveBeenCalledTimes(1);
    expect(pdf).toEqual(Buffer.from('%PDF-1.7'));
  });

  it('genera pedidos y facturas con sus datos de plantilla específicos', async () => {
    dropboxService.downloadFile.mockResolvedValue(Buffer.from('<main>{{client.name}}</main>'));

    await service.generateOrderPdf(templatePath, { id: 'order-uuid' } as Order, enterprise);
    await service.generateInvoicePdf(templatePath, { id: 'invoice-uuid' } as Invoice, enterprise);

    expect(htmlTemplateDataService.getOrderTemplateData).toHaveBeenCalledWith(
      { id: 'order-uuid' }, enterprise,
    );
    expect(htmlTemplateDataService.getInvoiceTemplateData).toHaveBeenCalledWith(
      { id: 'invoice-uuid' }, enterprise,
    );
  });

  it('inyecta el pie configurado según el tipo de plantilla y empresa', async () => {
    dropboxService.downloadFile.mockResolvedValue(Buffer.from('<main><footer class="legal-notice"><p>{{footer_text}}</p></footer></main>'));
    enterpriseSettingsRepository.findByKey.mockResolvedValue({ value: 'Texto de factura' });

    await service.generateInvoicePdf('/enterprises/enterprise-uuid/templates/html/invoice.html', { id: 'invoice-uuid' } as Invoice, enterprise);

    expect(enterpriseSettingsRepository.findByKey).toHaveBeenCalledWith('document.footer', 'enterprise-uuid');
    expect(enterpriseSettingsRepository.findByKey).toHaveBeenCalledWith('document.left', 'enterprise-uuid');
    expect(enterpriseSettingsRepository.findByKey).toHaveBeenCalledWith('document.right', 'enterprise-uuid');
    expect(page.setContent).toHaveBeenCalledWith(expect.stringContaining('Texto de factura'), { waitUntil: 'load' });
  });

  it('incorpora el logo de Dropbox solo cuando la empresa lo tiene configurado', async () => {
    const enterpriseWithLogo = { id: 'enterprise-uuid', logo: 'logo.png' } as Enterprise;
    dropboxService.downloadFile
      .mockResolvedValueOnce(Buffer.from('{{#logo}}<img class="brand-logo" src="{{{logo}}}">{{/logo}}'))
      .mockResolvedValueOnce(Buffer.from('logo'));

    await service.generateQuotePdf(templatePath, quote, enterpriseWithLogo);

    expect(dropboxService.downloadFile).toHaveBeenLastCalledWith('/enterprises/enterprise-uuid/logo.png');
    expect(page.setContent).toHaveBeenCalledWith(
      expect.stringContaining('data:image/png;base64,bG9nbw=='),
      { waitUntil: 'load' },
    );
  });

  it('no añade ninguna imagen cuando la empresa no tiene logo', async () => {
    dropboxService.downloadFile.mockResolvedValue(Buffer.from('{{#logo}}<img src="{{{logo}}}">{{/logo}}'));

    await service.generateQuotePdf(templatePath, quote, enterprise);

    expect(page.setContent).toHaveBeenCalledWith('', { waitUntil: 'load' });
  });

  it('omite el logo cuando el archivo ya no existe en Dropbox', async () => {
    const enterpriseWithLogo = { id: 'enterprise-uuid', logo: 'logo.jpg' } as Enterprise;
    dropboxService.downloadFile
      .mockResolvedValueOnce(Buffer.from('{{#logo}}<img src="{{{logo}}}">{{/logo}}'))
      .mockRejectedValueOnce(new DropboxFileNotFoundError('/enterprises/enterprise-uuid/logo.jpg'));

    await expect(service.generateQuotePdf(templatePath, quote, enterpriseWithLogo)).resolves.toEqual(Buffer.from('%PDF-1.7'));
    expect(page.setContent).toHaveBeenCalledWith('', { waitUntil: 'load' });
  });

  it('sustituye el logo fijo de una plantilla existente sin buscarlo en su carpeta', async () => {
    const enterpriseWithLogo = { id: 'enterprise-uuid', logo: 'logo.png' } as Enterprise;
    dropboxService.downloadFile
      .mockResolvedValueOnce(Buffer.from('<img class="brand-logo" src="./logo.png" alt="Infoprec">'))
      .mockResolvedValueOnce(Buffer.from('logo'));

    await service.generateQuotePdf(templatePath, quote, enterpriseWithLogo);

    expect(dropboxService.downloadFile).toHaveBeenCalledTimes(2);
    expect(dropboxService.downloadFile).not.toHaveBeenCalledWith(
      '/enterprises/enterprise-uuid/templates/html/logo.png',
    );
    expect(page.setContent).toHaveBeenCalledWith(
      expect.stringContaining('data:image/png;base64,bG9nbw=='),
      { waitUntil: 'load' },
    );
  });

  it('añade el aviso registral a una plantilla remota anterior', () => {
    const html = (service as any).ensureRegistrationNotice('<main><header></header></main>');

    expect(html).toContain('registration-notice');
    expect(html).toContain('registration-notice-right');
    expect(html).toContain('{{document.left}}');
    expect(html).toContain('{{document.right}}');
  });

  it('añade el aviso si la plantilla solo contiene la clase en su CSS', () => {
    const html = (service as any).ensureRegistrationNotice('<style>.registration-notice { position: absolute; }</style><main class="document"></main>');

    expect(html.match(/\{\{document\.(left|right)\}\}/g)).toHaveLength(2);
  });

  it('fuerza una posición imprimible para el aviso registral', () => {
    const html = (service as any).applyRegistrationNoticePrintStyles('<head></head><aside class="registration-notice"></aside>');

    expect(html).toContain('position: fixed !important');
    expect(html).toContain('margin: 5mm 5mm 9mm');
    expect(html).toContain('left: 1mm !important');
    expect(html).toContain('right: 1mm !important');
    expect(html).toContain('rotate(90deg) !important');
    expect(html).toContain('text-align: center !important');
    expect(html).toContain('top: 50% !important');
  });

  it('sustituye el aviso legal de la plantilla por el marcador de configuración', () => {
    const html = (service as any).applyLegalFooter(
      '<footer class="legal-notice"><p>{{enterprise.name}}</p></footer>',
    );

    expect(html).toContain('{{document.footer}}');
    expect(html).not.toContain('{{enterprise.name}}');
    expect(html).not.toContain('{{enterprise.name}}');
  });

  it('usa la plantilla por defecto cuando Dropbox responde que no existe', async () => {
    dropboxService.downloadFile.mockRejectedValue(new DropboxFileNotFoundError(templatePath));

    await expect(service.generatePdf(templatePath, templateData)).resolves.toEqual(Buffer.from('%PDF-1.7'));
  });

  it('mantiene el 404 para tipos de documento sin plantilla por defecto', async () => {
    const unknownTemplatePath = '/enterprises/enterprise-uuid/templates/html/custom.html';
    dropboxService.downloadFile.mockRejectedValue(new DropboxFileNotFoundError(unknownTemplatePath));

    await expect(service.generatePdf(unknownTemplatePath, templateData)).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      response: expect.objectContaining({ error: 'TEMPLATE_NOT_FOUND' }),
    });
  });

  it('propaga que falta un fichero de plantilla por defecto del backend', async () => {
    const readFileSpy = jest.spyOn(fsPromises, 'readFile').mockRejectedValueOnce(new Error('default missing'));
    await expect((service as any).readDefaultTemplate(templatePath)).resolves.toBeUndefined();
    readFileSpy.mockRestore();
  });

  it('resuelve imágenes relativas para plantillas de Dropbox', () => {
    expect((service as any).resolveTemplateImagePath('templates/quote.html', './logo.png'))
      .toBe('templates/logo.png');
  });

  it('informa si falta un recurso de una plantilla local', async () => {
    await expect(
      (service as any).inlineTemplateImages('<img src="./missing.png">', '/tmp/default.html', true),
    ).rejects.toMatchObject({ status: HttpStatus.INTERNAL_SERVER_ERROR });
    await expect((service as any).inlineTemplateImages('<main>sin imágenes</main>', 'templates/quote.html'))
      .resolves.toContain('sin imágenes');
  });

  it('propaga errores de Dropbox que no corresponden a una plantilla inexistente', async () => {
    const dropboxError = new Error('Dropbox no disponible');
    dropboxService.downloadFile.mockRejectedValue(dropboxError);

    await expect(service.generatePdf(templatePath, templateData)).rejects.toBe(dropboxError);
  });

  it('rechaza rutas de imagen que no sean locales a la plantilla', async () => {
    dropboxService.downloadFile.mockResolvedValue(Buffer.from('<img src="https://example.com/logo.png">'));

    await expect(service.generatePdf(templatePath, templateData)).rejects.toMatchObject({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Las imágenes de la plantilla HTML deben usar una ruta relativa que comience por ./',
    });
  });

  it('rechaza rutas de imagen que intenten salir de la carpeta de la plantilla', async () => {
    dropboxService.downloadFile.mockResolvedValue(Buffer.from('<img src="./../logo.png">'));

    await expect(service.generatePdf(templatePath, templateData)).rejects.toMatchObject({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'La ruta de una imagen de plantilla HTML no es válida',
    });
  });

  it('informa de forma controlada si falta una imagen requerida por la plantilla', async () => {
    dropboxService.downloadFile
      .mockResolvedValueOnce(Buffer.from('<img src="./logo.png">'))
      .mockRejectedValueOnce(new DropboxFileNotFoundError('/enterprises/enterprise-uuid/templates/html/logo.png'));

    await expect(service.generatePdf(templatePath, templateData)).rejects.toMatchObject({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'No se ha encontrado una imagen requerida por la plantilla HTML del presupuesto',
    });
  });

  it('convierte en error controlado el fallo de Dropbox al descargar una imagen existente', async () => {
    const dropboxError = new Error('Dropbox no disponible');
    dropboxService.downloadFile
      .mockResolvedValueOnce(Buffer.from('<img src="./logo.png">'))
      .mockRejectedValueOnce(dropboxError);

    await expect(service.generatePdf(templatePath, templateData)).rejects.toMatchObject({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'No se ha podido generar el PDF del documento desde su plantilla HTML',
    });
  });

  it('convierte errores de Chromium en un error controlado y cierra la página', async () => {
    dropboxService.downloadFile.mockResolvedValue(Buffer.from('<main>{{client.name}}</main>'));
    page.pdf.mockRejectedValue(new Error('Chromium no disponible'));

    await expect(service.generatePdf(templatePath, templateData)).rejects.toMatchObject({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'No se ha podido generar el PDF del documento desde su plantilla HTML',
    });
    expect(page.close).toHaveBeenCalled();
  });

  it('reinicia Chromium si el arranque falla y cierra la instancia en la destrucción del módulo', async () => {
    dropboxService.downloadFile.mockResolvedValue(Buffer.from('<main>{{client.name}}</main>'));
    (puppeteer.launch as jest.Mock)
      .mockRejectedValueOnce(new Error('No se puede iniciar Chromium'))
      .mockResolvedValueOnce(browser);

    await expect(service.generatePdf(templatePath, templateData)).rejects.toMatchObject({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    });
    await expect(service.generatePdf(templatePath, templateData)).resolves.toEqual(Buffer.from('%PDF-1.7'));
    await service.onModuleDestroy();

    expect(puppeteer.launch).toHaveBeenCalledTimes(2);
    expect(browser.close).toHaveBeenCalled();
  });

  it('no intenta cerrar Chromium si nunca se ha iniciado y usa un MIME genérico para extensiones desconocidas', async () => {
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    const serviceInternals = service as unknown as {
      toDataUri: (imageSource: string, imageBuffer: Buffer) => string;
    };

    expect(serviceInternals.toDataUri('./logo.bmp', Buffer.from('image'))).toBe(
      'data:application/octet-stream;base64,aW1hZ2U=',
    );
  });

  it('usa la ruta de Chromium por defecto si no se configura una alternativa', async () => {
    delete process.env.PUPPETEER_EXECUTABLE_PATH;
    dropboxService.downloadFile.mockResolvedValue(Buffer.from('<main>{{client.name}}</main>'));

    await expect(service.generatePdf(templatePath, templateData)).resolves.toEqual(Buffer.from('%PDF-1.7'));

    expect(puppeteer.launch).toHaveBeenCalledWith(expect.objectContaining({
      executablePath: '/usr/bin/chromium-browser',
    }));
  });
});
