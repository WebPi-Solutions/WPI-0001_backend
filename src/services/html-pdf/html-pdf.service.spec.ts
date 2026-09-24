jest.mock('puppeteer-core', () => ({ launch: jest.fn() }));

import { HttpStatus } from '@nestjs/common';
import * as puppeteer from 'puppeteer-core';
import { Enterprise } from 'src/entities/enterprise/enterprise.entity';
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

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PUPPETEER_EXECUTABLE_PATH = '/usr/bin/chromium-browser';
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
    service = new HtmlPdfService(
      dropboxService as unknown as DropboxService,
      htmlTemplateDataService as unknown as HtmlTemplateDataService,
    );
  });

  afterAll(() => {
    if (previousExecutablePath === undefined) {
      delete process.env.PUPPETEER_EXECUTABLE_PATH;
      return;
    }
    process.env.PUPPETEER_EXECUTABLE_PATH = previousExecutablePath;
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

  it('devuelve el error de plantilla inexistente únicamente si Dropbox responde que no existe', async () => {
    dropboxService.downloadFile.mockRejectedValue(new DropboxFileNotFoundError(templatePath));

    await expect(service.generatePdf(templatePath, templateData)).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      response: expect.objectContaining({ error: 'TEMPLATE_NOT_FOUND' }),
    });
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
