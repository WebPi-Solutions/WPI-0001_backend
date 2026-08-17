import { Module } from '@nestjs/common';
import { OcrModule } from '../ocr/ocr.module';
import { FileService } from './file.service';

/**
 * Módulo de gestión de archivos (validación, conversión de PDF e orquestación de OCR).
 */
@Module({
  imports: [OcrModule],
  providers: [FileService],
  exports: [FileService],
})
export class FileModule {}
