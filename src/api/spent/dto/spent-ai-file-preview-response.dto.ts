import { ApiProperty } from '@nestjs/swagger';
import { SpentConcept } from 'src/models/Concept';

/**
 * Datos del emisor extraídos por IA para crear un proveedor si no existe en la empresa.
 */
export class SpentAiSuggestedSupplierDto {
  /**
   * Nombre fiscal (razón social) del emisor extraído de la factura.
   */
  @ApiProperty({
    description: 'Nombre fiscal (razón social) extraído de la factura, no la marca comercial',
    example: 'Proveedor Ejemplo S.L.',
  })
  name: string;

  /**
   * CIF/NIF propuesto para el alta, preferentemente sin prefijo de país.
   */
  @ApiProperty({
    description: 'CIF/NIF propuesto para crear el proveedor',
    example: 'B12345678',
  })
  nif: string;

  /**
   * Tipo de proveedor inferido a partir del CIF/NIF.
   */
  @ApiProperty({
    description: 'Tipo de proveedor inferido: company o individual',
    example: 'company',
    enum: ['company', 'individual'],
  })
  type: string;
}

/**
 * Datos de gasto listos para crear el registro tras la extracción con IA.
 */
export class SpentAiPreviewSpentDataDto {
  /**
   * Nombre del gasto, siguiendo el patrón de facturas anteriores si existe.
   */
  @ApiProperty({
    description: 'Nombre del gasto extraído de la factura',
    example: 'Recarga Tesla',
  })
  name: string;

  /**
   * Fecha de emisión de la factura.
   */
  @ApiProperty({
    description: 'Fecha de emisión de la factura (YYYY-MM-DD)',
    example: '2026-06-27',
  })
  issuedDate: string;

  /**
   * Fecha de cobro. En la extracción con IA coincide con la de emisión.
   */
  @ApiProperty({
    description: 'Fecha de cobro (YYYY-MM-DD). Coincide con la fecha de emisión',
    example: '2026-06-27',
  })
  collectionDate: string;

  /**
   * Fecha de declaración. En la extracción con IA coincide con la de emisión.
   */
  @ApiProperty({
    description: 'Fecha de declaración (YYYY-MM-DD). Coincide con la fecha de emisión',
    example: '2026-06-27',
  })
  declarationDate: string;

  /**
   * Conceptos del gasto extraídos de la factura.
   */
  @ApiProperty({
    description: 'Conceptos del gasto extraídos de la factura',
    type: 'array',
  })
  concepts: SpentConcept[];

  /**
   * Estado del gasto. En la extracción con IA es siempre pagado.
   */
  @ApiProperty({
    description: 'Estado del gasto. Por defecto pagado',
    example: 'paid',
  })
  status: string;

  /**
   * ID del proveedor si existe en la empresa para el CIF extraído.
   */
  @ApiProperty({
    description: 'ID del proveedor si existe; null si no se ha encontrado',
    example: '65528c0d-b56e-4e3d-b4d3-90649d04fc0f',
    nullable: true,
  })
  supplierId: string | null;

  /**
   * Datos del emisor extraídos de la factura para crear un proveedor.
   * Se envían aunque ya exista un proveedor vinculado, por si el emparejamiento no es el correcto.
   */
  @ApiProperty({
    description:
      'Datos extraídos del emisor para crear un proveedor. Null solo si la factura no trae nombre ni CIF',
    type: SpentAiSuggestedSupplierDto,
    nullable: true,
  })
  suggestedSupplier: SpentAiSuggestedSupplierDto | null;
}

/**
 * Respuesta del endpoint que recibe un PDF para gastos con IA.
 * No implica persistencia ni subida a Dropbox.
 */
export class SpentAiFilePreviewResponseDto {
  /**
   * Nombre original del archivo recibido.
   */
  @ApiProperty({
    description: 'Nombre original del archivo recibido',
    example: 'factura-proveedor.pdf',
  })
  originalName: string;

  /**
   * Tamaño del archivo expresado en megabytes.
   */
  @ApiProperty({
    description: 'Tamaño del archivo en megabytes',
    example: 1.25,
  })
  sizeInMegabytes: number;

  /**
   * Mensaje de confirmación de la recepción.
   */
  @ApiProperty({
    description: 'Mensaje de confirmación de la recepción del archivo',
    example: 'Archivo recibido correctamente',
  })
  message: string;

  /**
   * Datos del gasto listos para su creación.
   */
  @ApiProperty({
    description: 'Datos del gasto extraídos y completados para su creación',
    type: SpentAiPreviewSpentDataDto,
  })
  spentData: SpentAiPreviewSpentDataDto;
}
