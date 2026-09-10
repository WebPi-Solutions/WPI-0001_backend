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

    it('rechaza si no se proporciona archivo', async () => {
      await expect(service.processAiSpentPdf(undefined as unknown as MulterFile)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('rechaza un PDF sin buffer', async () => {
      await expect(
        service.processAiSpentPdf(createMulterFile({ buffer: undefined as unknown as Buffer })),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('rechaza un PDF con buffer vacío', async () => {
      await expect(
        service.processAiSpentPdf(createMulterFile({ buffer: Buffer.alloc(0) })),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('lanza 400 si el PDF no tiene páginas', async () => {
      mockedPdfDocumentLoad.mockResolvedValue(createPdfDocumentMock(0));

      await expect(service.processAiSpentPdf(createMulterFile())).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('usa el máximo por defecto si MAX_OCR_SPENT_PAGES no es válido', async () => {
      delete process.env.MAX_OCR_SPENT_PAGES;
      mockedPdfDocumentLoad.mockResolvedValue(createPdfDocumentMock(5));
      mockedFromBuffer.mockReturnValue(
        jest.fn().mockResolvedValue({ buffer: Buffer.from('imagen') }),
      );

      await service.processAiSpentPdf(createMulterFile());

      expect(ocrService.extractTextFromImage).toHaveBeenCalledTimes(3);
    });

    it('repropaga HttpException sin envolverla', async () => {
      mockedPdfDocumentLoad.mockRejectedValue(
        new HttpException('PDF corrupto', HttpStatus.BAD_REQUEST),
      );

      await expect(service.processAiSpentPdf(createMulterFile())).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'PDF corrupto',
      });
    });

    it('envuelve un error genérico como 500', async () => {
      mockedPdfDocumentLoad.mockRejectedValue(new Error('fallo interno'));

      await expect(service.processAiSpentPdf(createMulterFile())).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      });
    });

    it('lanza error si la conversión a imagen deja un buffer vacío', async () => {
      mockedPdfDocumentLoad.mockResolvedValue(createPdfDocumentMock(1));
      mockedFromBuffer.mockReturnValue(jest.fn().mockResolvedValue({ buffer: Buffer.alloc(0) }));

      await expect(service.processAiSpentPdf(createMulterFile())).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      });
    });

    it('usa dimensiones apaisadas cuando la página está rotada 90 grados', async () => {
      mockedPdfDocumentLoad.mockResolvedValue({
        getPageCount: () => 1,
        getPage: () => ({
          getSize: () => ({ width: 595, height: 842 }),
          getRotation: () => ({ angle: 90 }),
        }),
      });
      const convertMock = jest.fn().mockResolvedValue({ buffer: Buffer.from('imagen') });
      mockedFromBuffer.mockReturnValue(convertMock);

      await service.processAiSpentPdf(createMulterFile());

      expect(mockedFromBuffer).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({
          width: expect.any(Number),
          height: expect.any(Number),
        }),
      );
    });

    it('escala la imagen si supera la dimensión máxima', async () => {
      mockedPdfDocumentLoad.mockResolvedValue({
        getPageCount: () => 1,
        getPage: () => ({
          getSize: () => ({ width: 2000, height: 3000 }),
          getRotation: () => ({ angle: 0 }),
        }),
      });
      mockedFromBuffer.mockReturnValue(
        jest.fn().mockResolvedValue({ buffer: Buffer.from('imagen') }),
      );

      await service.processAiSpentPdf(createMulterFile());

      const conversionOptions = mockedFromBuffer.mock.calls[0][1] as {
        width: number;
        height: number;
      };
      expect(Math.max(conversionOptions.width, conversionOptions.height)).toBeLessThanOrEqual(3508);
    });
  });

  describe('convertBytesToMegabytes y getNumberOfPages', () => {
    it('convierte bytes a megabytes con dos decimales', () => {
      expect(service.convertBytesToMegabytes(1024 * 1024)).toBe(1);
    });

    it('devuelve el número de páginas del PDF', async () => {
      mockedPdfDocumentLoad.mockResolvedValue(createPdfDocumentMock(4));

      await expect(service.getNumberOfPages(Buffer.from('pdf'))).resolves.toBe(4);
    });
  });
});
