import PizZip from 'pizzip';
import { Enterprise } from 'src/entities/enterprise/enterprise.entity';
import { Quote } from 'src/entities/quote/quote.entity';
import { PaymentMethod } from 'src/common/enums';
import { DropboxFileNotFoundError } from '../dropbox/dropbox-file-not-found.error';
import { DropboxService } from '../dropbox/dropbox.service';
import { WordService } from './word.service';

/** Construye una plantilla DOCX mínima con marcadores de doble llave. */
function buildTemplate(): Buffer {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>{{ client.name }}</w:t></w:r></w:p><w:p><w:r><w:t>{{concept.total}}</w:t></w:r></w:p><w:p><w:r><w:t>{{ totals.total }}</w:t></w:r></w:p><w:sectPr/></w:body></w:document>',
  );
  return zip.generate({ type: 'nodebuffer' });
}

/** Construye una plantilla DOCX mínima que repite un bloque por cada elemento. */
function buildLoopTemplate(): Buffer {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>{{#items}}</w:t></w:r></w:p><w:p><w:r><w:t>{{name}}</w:t></w:r></w:p><w:p><w:r><w:t>{{/items}}</w:t></w:r></w:p><w:sectPr/></w:body></w:document>',
  );
  return zip.generate({ type: 'nodebuffer' });
}

describe('WordService', () => {
  let service: WordService;
  let dropboxService: { downloadFile: jest.Mock };

  const quote = {
    issuedDate: new Date('2026-03-01T00:00:00.000Z'),
    clientName: 'Cliente Demo',
    quoteConcepts: [{ name: 'Servicio', basePrice: 100, quantity: 2, vat: 21, irpf: 0 }],
  } as Quote;
  const enterprise = { name: 'Empresa Demo', bankAccount: 'ES00' } as Enterprise;

  beforeEach(() => {
    dropboxService = { downloadFile: jest.fn().mockResolvedValue(buildTemplate()) };
    service = new WordService(dropboxService as unknown as DropboxService);
  });

  it('completa los marcadores anidados de una plantilla DOCX', async () => {
    const document = await service.generateQuoteDocument('/plantillas/quote.docx', quote, enterprise);
    const documentXml = new PizZip(document).file('word/document.xml')?.asText() ?? '';

    expect(dropboxService.downloadFile).toHaveBeenCalledWith('/plantillas/quote.docx');
    expect(documentXml).toContain('Cliente Demo');
    expect(documentXml).toContain('242,00 €');
  });

  it('genera documentos genéricos con un bloque por cada elemento de una colección', async () => {
    dropboxService.downloadFile.mockResolvedValue(buildLoopTemplate());

    const document = await service.generateDocument('/plantillas/generica.docx', {
      items: [{ name: 'Primera línea' }, { name: 'Segunda línea' }],
    });
    const documentXml = new PizZip(document).file('word/document.xml')?.asText() ?? '';

    expect(documentXml).toContain('Primera línea');
    expect(documentXml).toContain('Segunda línea');
  });

  it('devuelve el marcador de ausencia de plantilla únicamente si Dropbox informa 409', async () => {
    dropboxService.downloadFile.mockRejectedValue(
      new DropboxFileNotFoundError('/plantillas/quote.docx'),
    );

    await expect(
      service.generateQuoteDocument('/plantillas/quote.docx', quote, enterprise),
    ).rejects.toMatchObject({
      status: 404,
      response: expect.objectContaining({ error: 'TEMPLATE_NOT_FOUND' }),
    });
  });

  it('propaga los errores de Dropbox que no indican una plantilla inexistente', async () => {
    const error = new Error('Dropbox no disponible');
    dropboxService.downloadFile.mockRejectedValue(error);

    await expect(
      service.generateQuoteDocument('/plantillas/quote.docx', quote, enterprise),
    ).rejects.toBe(error);
  });

  it('devuelve 500 si la plantilla no es un DOCX válido', async () => {
    dropboxService.downloadFile.mockResolvedValue(Buffer.from('no es un docx'));

    await expect(
      service.generateQuoteDocument('/plantillas/quote.docx', quote, enterprise),
    ).rejects.toMatchObject({ status: 500 });
  });

  it('deja vacíos los campos opcionales, conceptos y fechas no válidas', () => {
    const data = (service as unknown as {
      buildQuoteTemplateData: (quote: Quote, enterprise: Enterprise) => Record<string, Record<string, string>>;
    }).buildQuoteTemplateData(
      { issuedDate: 'fecha inválida' } as unknown as Quote,
      {} as Enterprise,
    );

    expect(data.issued_date).toBe('');
    expect(data).not.toHaveProperty('employee');
    expect(data.concept).toEqual({
      name: '',
      quantity: '0',
      subtotal: '0,00 €',
      iva: '0%',
      total: '0,00 €',
    });
    expect(data.vat_breakdown).toEqual([]);
    expect(data.totals.total).toBe('0,00 €');
  });

  it('agrupa el desglose de IVA por porcentaje y conserva el orden de los conceptos', () => {
    const data = (service as unknown as {
      buildQuoteTemplateData: (quote: Quote, enterprise: Enterprise) => Record<string, unknown>;
    }).buildQuoteTemplateData({
      quoteConcepts: [
        { name: 'Artículo al 21%', basePrice: 100, quantity: 1, vat: 21, irpf: 0 },
        { name: 'Otro al 21%', basePrice: 50, quantity: 2, vat: 21, irpf: 0 },
        { name: 'Artículo al 10%', basePrice: 100, quantity: 1, vat: 10, irpf: 1 },
        { name: 'Artículo exento', basePrice: 100, quantity: 1, vat: 0, irpf: 0 },
      ],
    } as Quote, enterprise) as { vat_breakdown: unknown };

    expect(data.vat_breakdown).toEqual([
      { base: '200,00 €', percentage: '21', amount: '42,00 €', total: '242,00 €' },
      { base: '100,00 €', percentage: '10', amount: '10,00 €', total: '109,00 €' },
      { base: '100,00 €', percentage: '0', amount: '0,00 €', total: '100,00 €' },
    ]);
  });

  it('ordena las líneas del documento por su posición ascendente', () => {
    const data = (service as unknown as {
      buildQuoteTemplateData: (quote: Quote, enterprise: Enterprise) => Record<string, unknown>;
    }).buildQuoteTemplateData({
      quoteConcepts: [
        { name: 'Segundo', position: 1, basePrice: 20, quantity: 1, vat: 21, irpf: 0 },
        { name: 'Primero', position: 0, basePrice: 10, quantity: 1, vat: 21, irpf: 0 },
      ],
    } as Quote, enterprise) as { concepts: Array<{ name: string }> };

    expect(data.concepts.map((concept) => concept.name)).toEqual(['Primero', 'Segundo']);
  });

  it('resuelve marcadores desconocidos como valores vacíos y normaliza importes inválidos', () => {
    const serviceInternals = service as unknown as {
      createTagParser: (tag: string) => { get: (scope: Record<string, unknown>) => unknown };
      formatCurrency: (value: number) => string;
      formatPercentage: (value: number) => string;
      formatDate: (value: null) => string;
      formatPaymentMethod: (value: PaymentMethod | null) => string;
    };

    expect(serviceInternals.createTagParser('unknown.field').get({})).toBe('');
    expect(serviceInternals.formatCurrency(Number.NaN)).toBe('0,00 €');
    expect(serviceInternals.formatPercentage(Number.NaN)).toBe('0');
    expect(serviceInternals.formatDate(null)).toBe('');
    expect(serviceInternals.formatPaymentMethod(PaymentMethod.CASH)).toBe('Efectivo');
    expect(serviceInternals.formatPaymentMethod('otro' as PaymentMethod)).toBe('');
    expect(serviceInternals.formatPaymentMethod(null)).toBe('');
  });

  it('normaliza los campos nulos de una línea de presupuesto', () => {
    const formatConcept = (service as unknown as {
      formatConcept: (concept: Quote['quoteConcepts'][number]) => Record<string, string>;
    }).formatConcept;

    expect(formatConcept.call(service, {
      name: null,
      quantity: null,
      basePrice: 0,
      vat: 0,
      irpf: 0,
    } as unknown as Quote['quoteConcepts'][number])).toMatchObject({
      name: '',
      quantity: '0',
      iva: '0%',
    });
  });
});
