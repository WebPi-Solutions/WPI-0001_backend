import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InvoiceConceptSerial } from 'src/entities/invoice-concept-serial/invoice-concept-serial.entity';
import { InvoiceConceptSerialResponseDto } from 'src/entities/invoice-concept-serial/dto/invoice-concept-serial-response.dto';
import { InvoiceConceptSerialService } from './invoice-concept-serial.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { MapResponse } from 'src/common/decorators/map-response.decorator';
import { RequireEnterpriseId } from 'src/common/decorators/enterprise-access.decorator';
import { RequirePermission } from 'src/common/decorators/enterprise-permission.decorator';

/**
 * API HTTP de números de serie de línea de factura.
 * El listado exige `enterpriseId` e `invoiceConceptId` en query.
 * El permiso es el de facturas.
 */
@ApiTags('Números de serie de conceptos de factura')
@Controller('invoice-concept-serials')
export class InvoiceConceptSerialController {
  constructor(
    private readonly invoiceConceptSerialService: InvoiceConceptSerialService,
  ) {}

  /**
   * Crea un número de serie en una línea de la empresa de la query.
   * @param enterpriseId - Empresa objetivo
   * @param invoiceConceptSerial - Datos del número de serie
   * @returns El registro creado
   */
  @Post()
  @RequirePermission('invoices', 'write')
  @RequireEnterpriseId()
  @MapResponse(InvoiceConceptSerialResponseDto)
  @ApiOperation({ summary: 'Crear un número de serie de concepto de factura' })
  @ApiOkResponse({
    type: InvoiceConceptSerialResponseDto,
    description: 'Número de serie creado (vista pública).',
  })
  @ApiResponse({ status: 201, description: 'El número de serie ha sido creado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async create(
    @Query('enterpriseId') enterpriseId: string,
    @Body() invoiceConceptSerial: InvoiceConceptSerial,
  ): Promise<InvoiceConceptSerial> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.invoiceConceptSerialService.create(invoiceConceptSerial, enterpriseId);
  }

  /**
   * Lista los números de serie de una línea. Exige `invoiceConceptId`.
   * @param enterpriseId - Empresa objetivo
   * @param invoiceConceptId - Línea propietaria
   * @param page - Página
   * @param pageSize - Tamaño de página
   * @param sort - Campo de ordenación
   * @param order - Dirección
   * @param filter - Filtro JSON opcional
   * @param relations - Relaciones separadas por coma
   * @returns Página de números de serie
   */
  @Get()
  @RequirePermission('invoices', 'read')
  @RequireEnterpriseId()
  @MapResponse(InvoiceConceptSerialResponseDto)
  @ApiOperation({ summary: 'Obtener los números de serie de un concepto de factura' })
  @ApiOkResponse({
    type: InvoiceConceptSerialResponseDto,
    isArray: true,
    description: 'Números de serie (vista pública).',
  })
  @ApiResponse({ status: 200, description: 'Los números de serie han sido obtenidos correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findAll(
    @Query('enterpriseId') enterpriseId: string,
    @Query('invoiceConceptId') invoiceConceptId: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 10,
    @Query('sort') sort: string = 'createdAt',
    @Query('order') order: 'ASC' | 'DESC' = 'ASC',
    @Query('filter') filter?: string,
    @Query('relations') relations?: string,
  ): Promise<PaginatedResponse<InvoiceConceptSerial>> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!invoiceConceptId) {
      throw new HttpException(
        'Es obligatorio especificar el ID del concepto de factura',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.invoiceConceptSerialService.assertInvoiceConceptAccessibleForList(
      invoiceConceptId,
      enterpriseId,
    );

    const pageNumber = Number(page);
    const pageSizeNumber = Number(pageSize);
    const relationsArray = relations ? relations.split(',') : [];
    if (!relationsArray.includes('invoiceConcept')) {
      relationsArray.push('invoiceConcept');
    }

    let filterObj: Record<string, unknown> = {
      invoiceConceptId,
    };
    if (filter) {
      try {
        filterObj = {
          ...JSON.parse(filter),
          ...filterObj,
        };
      } catch (error) {
        console.error('Error parsing filter JSON:', error);
      }
    }

    return this.invoiceConceptSerialService.findAll(
      pageNumber,
      pageSizeNumber,
      sort,
      order,
      filterObj,
      relationsArray,
    );
  }

  /**
   * Obtiene un número de serie por identificador.
   * @param id - UUID
   * @param relations - Relaciones separadas por coma
   * @returns El registro
   */
  @Get(':id')
  @RequirePermission('invoices', 'read')
  @MapResponse(InvoiceConceptSerialResponseDto)
  @ApiOperation({ summary: 'Obtener un número de serie de concepto por su id' })
  @ApiOkResponse({
    type: InvoiceConceptSerialResponseDto,
    description: 'Número de serie (vista pública).',
  })
  @ApiResponse({ status: 200, description: 'El número de serie ha sido obtenido correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findById(
    @Param('id') id: string,
    @Query('relations') relations?: string,
  ): Promise<InvoiceConceptSerial> {
    const relationsArray = relations ? relations.split(',') : [];
    return this.invoiceConceptSerialService.findById(id, relationsArray);
  }

  /**
   * Actualiza un número de serie por identificador.
   * @param id - UUID
   * @param invoiceConceptSerial - Campos a actualizar
   * @returns El registro actualizado
   */
  @Patch(':id')
  @RequirePermission('invoices', 'write')
  @MapResponse(InvoiceConceptSerialResponseDto)
  @ApiOperation({ summary: 'Actualizar un número de serie de concepto por su id' })
  @ApiOkResponse({
    type: InvoiceConceptSerialResponseDto,
    description: 'Número de serie actualizado (vista pública).',
  })
  @ApiResponse({ status: 200, description: 'El número de serie ha sido actualizado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async updateById(
    @Param('id') id: string,
    @Body() invoiceConceptSerial: InvoiceConceptSerial,
  ): Promise<InvoiceConceptSerial> {
    return this.invoiceConceptSerialService.updateById(id, invoiceConceptSerial);
  }

  /**
   * Elimina un número de serie por identificador.
   * @param id - UUID
   * @returns Resultado del borrado
   */
  @Delete(':id')
  @RequirePermission('invoices', 'delete')
  @ApiOperation({ summary: 'Eliminar un número de serie de concepto por su id' })
  @ApiResponse({ status: 200, description: 'El número de serie ha sido eliminado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async delete(@Param('id') id: string): Promise<unknown> {
    return this.invoiceConceptSerialService.deleteById(id);
  }
}
