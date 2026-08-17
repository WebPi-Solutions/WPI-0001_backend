import { MulterFile } from 'multer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para la recepción de un PDF de gasto destinado al procesamiento con IA.
 * El archivo se envía igual que en la subida de factura de un gasto (`multipart/form-data`, campo `file`).
 */
export class SpentAiFileUploadDto {
  /**
   * Archivo PDF de la factura a analizar con IA.
   */
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Archivo PDF de la factura a analizar con IA',
  })
  file: MulterFile;
}
