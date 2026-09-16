import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InvoiceConcept } from 'src/entities/invoice-concept/invoice-concept.entity';
import { InvoiceConceptResponseDto } from 'src/entities/invoice-concept/dto/invoice-concept-response.dto';
import { InvoiceConceptService } from './invoice-concept.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { MapResponse } from 'src/common/decorators/map-response.decorator';
import { RequireEnterpriseId } from 'src/common/decorators/enterprise-access.decorator';
import { RequirePermission } from 'src/common/decorators/enterprise-permission.decorator';

/**
 * API HTTP de líneas de factura.
 * El listado y el alta exigen `enterpriseId` en query; el tenant se resuelve vía factura → cliente.
 * El permiso es el de facturas: las líneas no son un recurso de catálogo aparte.
 */
@ApiTags('Conceptos de factura')
@Controller('invoice-concepts')
export class InvoiceConceptController {
  constructor(private readonly invoiceConceptService: InvoiceConceptService) {}

  /**
   * Crea una línea en una factura de la empresa de la query.
   * @param enterpriseId - Empresa objetivo
   * @param invoiceConcept - Datos de la línea
   * @returns La línea creada
   */
  @Post()
  @RequirePermission('invoices', 'write')
  @RequireEnterpriseId()
  @MapResponse(InvoiceConceptResponseDto)
  @ApiOperation({ summary: 'Crear un concepto de factura' })
  @ApiOkResponse({ type: InvoiceConceptResponseDto, description: 'Concepto creado (vista pública).' })
  @ApiResponse({ status: 201, description: 'El concepto ha sido creado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async create(
    @Query('enterpriseId') enterpriseId: string,
    @Body() invoiceConcept: InvoiceConcept,
  ): Promise<InvoiceConcept> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.invoiceConceptService.create(invoiceConcept, enterpriseId);
  }

  /**
   * Lista las líneas de las facturas de una empresa.
   * @param enterpriseId - Empresa objetivo
   * @param page - Página
   * @param pageSize - Tamaño de página
   * @param sort - Campo de ordenación
   * @param order - Dirección
   * @param filter - Filtro JSON opcional
   * @param relations - Relaciones separadas por coma
   * @returns Página de líneas
   */
  @Get()
  @RequirePermission('invoices', 'read')
  @RequireEnterpriseId()
  @MapResponse(InvoiceConceptResponseDto)
  @ApiOperation({ summary: 'Obtener los conceptos de factura de una empresa' })
  @ApiOkResponse({
    type: InvoiceConceptResponseDto,
    isArray: true,
    description: 'Conceptos (vista pública).',
  })
  @ApiResponse({ status: 200, description: 'Los conceptos han sido obtenidos correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findAll(
    @Query('enterpriseId') enterpriseId: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 10,
    @Query('sort') sort: string = 'position',
    @Query('order') order: 'ASC' | 'DESC' = 'ASC',
    @Query('filter') filter?: string,
    @Query('relations') relations?: string,
  ): Promise<PaginatedResponse<InvoiceConcept>> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }

    const pageNumber = Number(page);
    const pageSizeNumber = Number(pageSize);
    const relationsArray = relations ? relations.split(',') : [];
    if (!relationsArray.includes('invoice')) {
      relationsArray.push('invoice');
    }
    if (!relationsArray.includes('invoice.client')) {
      relationsArray.push('invoice.client');
    }

    let filterObj: Record<string, unknown> = {
      'client.enterpriseId': enterpriseId,
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

    return this.invoiceConceptService.findAll(
      pageNumber,
      pageSizeNumber,
      sort,
      order,
      filterObj,
      relationsArray,
    );
  }

  /**
   * Obtiene una línea por identificador.
   * @param id - UUID de la línea
   * @param relations - Relaciones separadas por coma
   * @returns La línea
   */
  @Get(':id')
  @RequirePermission('invoices', 'read')
  @MapResponse(InvoiceConceptResponseDto)
  @ApiOperation({ summary: 'Obtener un concepto de factura por su id' })
  @ApiOkResponse({ type: InvoiceConceptResponseDto, description: 'Concepto (vista pública).' })
  @ApiResponse({ status: 200, description: 'El concepto ha sido obtenido correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findById(
    @Param('id') id: string,
    @Query('relations') relations?: string,
  ): Promise<InvoiceConcept> {
    const relationsArray = relations ? relations.split(',') : [];
    return this.invoiceConceptService.findById(id, relationsArray);
  }

  /**
   * Actualiza una línea por identificador.
   * @param id - UUID de la línea
   * @param invoiceConcept - Campos a actualizar
   * @returns La línea actualizada
   */
  @Patch(':id')
  @RequirePermission('invoices', 'write')
  @MapResponse(InvoiceConceptResponseDto)
  @ApiOperation({ summary: 'Actualizar un concepto de factura por su id' })
  @ApiOkResponse({
    type: InvoiceConceptResponseDto,
    description: 'Concepto actualizado (vista pública).',
  })
  @ApiResponse({ status: 200, description: 'El concepto ha sido actualizado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async updateById(
    @Param('id') id: string,
    @Body() invoiceConcept: InvoiceConcept,
  ): Promise<InvoiceConcept> {
    return this.invoiceConceptService.updateById(id, invoiceConcept);
  }

  /**
   * Elimina una línea por identificador.
   * @param id - UUID de la línea
   * @returns Resultado del borrado
   */
  @Delete(':id')
  @RequirePermission('invoices', 'delete')
  @ApiOperation({ summary: 'Eliminar un concepto de factura por su id' })
  @ApiResponse({ status: 200, description: 'El concepto ha sido eliminado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async delete(@Param('id') id: string): Promise<unknown> {
    return this.invoiceConceptService.deleteById(id);
  }
}
