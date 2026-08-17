import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as tesseract from 'node-tesseract-ocr';
import { OcrService } from './ocr.service';

jest.mock('node-tesseract-ocr', () => ({
  recognize: jest.fn(),
}));

describe('OcrService', () => {
  let service: OcrService;
  const mockedRecognize = tesseract.recognize as jest.Mock;

  beforeEach(async () => {
    mockedRecognize.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [OcrService],
    }).compile();

    service = module.get<OcrService>(OcrService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('extractTextFromImage', () => {
    it('debe devolver el texto reconocido por Tesseract', async () => {
      mockedRecognize.mockResolvedValue('  Texto de factura  ');

      const extractedText = await service.extractTextFromImage(Buffer.from('imagen'));

      expect(extractedText).toBe('Texto de factura');
      expect(mockedRecognize).toHaveBeenCalledTimes(1);
    });

    it('debe rechazar una imagen vacía', async () => {
      await expect(service.extractTextFromImage(Buffer.alloc(0))).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
      await expect(service.extractTextFromImage(Buffer.alloc(0))).rejects.toBeInstanceOf(
        HttpException,
      );
      expect(mockedRecognize).not.toHaveBeenCalled();
    });

    it('debe lanzar un error HTTP si Tesseract falla', async () => {
      mockedRecognize.mockRejectedValue(new Error('tesseract no disponible'));

      await expect(service.extractTextFromImage(Buffer.from('imagen'))).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      });
    });
  });
});
