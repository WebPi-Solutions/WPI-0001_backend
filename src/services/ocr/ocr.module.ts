import { Module } from '@nestjs/common';
import { OcrService } from './ocr.service';

/**
 * Módulo de OCR para reconocer texto en imágenes.
 */
@Module({
  providers: [OcrService],
  exports: [OcrService],
})
export class OcrModule {}
