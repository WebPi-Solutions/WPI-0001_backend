import { MulterFile } from 'multer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para la subida del logo de la empresa
 * Usado cuando se sube o reemplaza el logo de una empresa
 */
export class EnterpriseLogoUploadDto {
  /**
   * Archivo de imagen del logo (JPEG, JPG, PNG)
   */
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Logo image file (JPEG, JPG, PNG)'
  })
  file: MulterFile;
}

