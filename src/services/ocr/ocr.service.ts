import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import * as tesseract from 'node-tesseract-ocr';

/**
 * Servicio de OCR: reconoce texto en imágenes mediante Tesseract.
 * La conversión y el recorte de páginas del PDF corresponden a `FileService`.
 */
@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  /**
   * Configuración de Tesseract para facturas (español e inglés).
   */
  private readonly tesseractConfig = {
    lang: 'spa+eng',
    oem: 1,
    psm: 4,
  };

  /**
   * Reconoce el texto de una imagen mediante Tesseract.
   * @param imageBuffer Imagen PNG de la página
   * @returns Texto reconocido
   */
  async extractTextFromImage(imageBuffer: Buffer): Promise<string> {
    if (!imageBuffer || imageBuffer.length === 0) {
      this.logger.error('El buffer de la imagen está vacío o no se ha proporcionado');
      throw new HttpException('La imagen recibida para OCR está vacía', HttpStatus.BAD_REQUEST);
    }

    try {
      const recognizedText = await tesseract.recognize(imageBuffer, this.tesseractConfig);
      return recognizedText?.trim() ?? '';
    } catch (error) {
      this.logger.error(`Error durante el OCR de la imagen: ${error.message}`, error.stack);
      throw new HttpException(
        `Error al reconocer el texto de la imagen: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
