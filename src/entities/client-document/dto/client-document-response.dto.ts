import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/** Vista pública de los metadatos de un documento de cliente. */
export class ClientDocumentResponseDto {
  @ApiProperty({ description: 'UUID del documento' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'UUID del cliente propietario' })
  @Expose()
  clientId: string;

  @ApiProperty({ description: 'Nombre original del archivo' })
  @Expose()
  name: string;

  @ApiProperty({ description: 'Tamaño del archivo en bytes' })
  @Expose()
  size: number;

  @ApiProperty({ description: 'Fecha de creación del registro' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: 'Fecha de última actualización del registro' })
  @Expose()
  updatedAt: Date;
}
