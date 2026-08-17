import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PDFDocument } from 'pdf-lib';
import { fromBuffer } from 'pdf2pic';
import { MulterFile } from 'multer';
import { OcrService } from '../ocr/ocr.service';
import { FileService } from './file.service';

jest.mock('pdf-lib', () => ({
  PDFDocument: {
    load: jest.fn(),
  },
}));

jest.mock('pdf2pic', () => ({
  fromBuffer: jest.fn(),
}));

describe('FileService', () => {
  let service: FileService;
  let ocrService: { extractTextFromImage: jest.Mock };
  const mockedPdfDocumentLoad = PDFDocument.load as jest.Mock;
  const mockedFromBuffer = fromBuffer as jest.Mock;

  /**
   * Crea un archivo Multer de prueba.
   * @param overrides Propiedades a sobrescribir del archivo
   * @returns Archivo Multer simulado
   */
  const createMulterFile = (overrides: Partial<MulterFile> = {}): MulterFile => {
    return {
      originalname: 'factura-proveedor.pdf',
      mimetype: 'application/pdf',
      size: 2.5 * 1024 * 1024,
      buffer: Buffer.from('contenido-pdf-de-prueba'),
      fieldname: 'file',
      encoding: '7bit',
      destination: '',
      filename: '',
      path: '',
      stream: undefined as unknown as MulterFile['stream'],
      ...overrides,
    } as MulterFile;
  };

  /**
   * Crea un mock de documento PDF con el número de páginas indicado.
   * @param pageCount Número de páginas del PDF simulado
   * @returns Documento PDF simulado
   */
  const createPdfDocumentMock = (pageCount: number) => {
    return {
      getPageCount: () => pageCount,
      getPage: () => ({
        getSize: () => ({ width: 595, height: 842 }),
        getRotation: () => ({ angle: 0 }),
      }),
    };
  };

  beforeEach(async () => {
    process.env.MAX_OCR_SPENT_PAGES = '3';
    mockedPdfDocumentLoad.mockReset();
    mockedFromBuffer.mockReset();
    ocrService = {
      extractTextFromImage: jest.fn().mockResolvedValue('Texto OCR'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [FileService, { provide: OcrService, useValue: ocrService }],
    }).compile();

    service = module.get<FileService>(FileService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processAiSpentPdf', () => {
    it('debe extraer el texto de todas las páginas si no se supera el máximo', async () => {
      mockedPdfDocumentLoad.mockResolvedValue(createPdfDocumentMock(2));
      mockedFromBuffer.mockReturnValue(
        jest.fn().mockImplementation(async (pageNumber: number) => ({
          buffer: Buffer.from(`imagen-pagina-${pageNumber}`),
        })),
      );
      ocrService.extractTextFromImage
        .mockResolvedValueOnce('Texto página 1')
        .mockResolvedValueOnce('Texto página 2');

      const result = await service.processAiSpentPdf(createMulterFile());

      expect(ocrService.extractTextFromImage).toHaveBeenCalledTimes(2);
      expect(result.originalName).toBe('factura-proveedor.pdf');
      expect(result.sizeInMegabytes).toBe(2.5);
      expect(result.extractedText).toContain('Texto página 1');
      expect(result.extractedText).toContain('Texto página 2');
      expect(result.message).toBe('Archivo recibido correctamente');
    });

    it('debe procesar solo las primeras páginas si el PDF supera MAX_OCR_SPENT_PAGES', async () => {
      mockedPdfDocumentLoad.mockResolvedValue(createPdfDocumentMock(5));
      mockedFromBuffer.mockReturnValue(
        jest.fn().mockImplementation(async (pageNumber: number) => ({
          buffer: Buffer.from(`imagen-pagina-${pageNumber}`),
        })),
      );

      await service.processAiSpentPdf(createMulterFile());

      expect(ocrService.extractTextFromImage).toHaveBeenCalledTimes(3);
    });

    it('debe rechazar un archivo que no sea PDF', async () => {
      const imageFile = createMulterFile({
        originalname: 'imagen.png',
        mimetype: 'image/png',
      });

      await expect(service.processAiSpentPdf(imageFile)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
      await expect(service.processAiSpentPdf(imageFile)).rejects.toBeInstanceOf(HttpException);
      expect(ocrService.extractTextFromImage).not.toHaveBeenCalled();
    });
  });
});
