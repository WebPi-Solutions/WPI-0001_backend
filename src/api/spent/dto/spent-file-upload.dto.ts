import { MulterFile } from 'multer';
import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsString } from 'class-validator';

/**
 * DTO para la subida de archivos de gastos
 * Usado cuando se adjunta un archivo a un gasto
 */
export class SpentFileUploadDto {
  /**
   * Archivo PDF de la factura
   */
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'PDF file of the invoice'
  })
  file: MulterFile;

  /**
   * Datos del gasto en formato JSON string
   */
  @ApiProperty({
    type: 'string',
    description: 'JSON string containing the spent data'
  })
  @IsString()
  spentData: string;
}
