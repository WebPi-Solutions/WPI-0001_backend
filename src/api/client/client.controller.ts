import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Client } from 'src/entities/client/client.entity';
import { ClientService } from './client.service';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';

@ApiTags('Clientes')
@Controller('clients')
export class ClientController {

  constructor(private readonly clientService: ClientService){}

  /**
   * Crea un nuevo cliente
   * @param client - El cliente a crear
   * @returns El cliente creado
   */
  @Post()
  @ApiOperation({ summary: 'Crear un nuevo cliente' })
  @ApiResponse({ status: 201, description: 'El cliente ha sido creado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async create(
    @Query('enterpriseId') enterpriseId: string,
    @Body() client: Client
  ) {
    if(!enterpriseId) throw new HttpException('Es obligatorio especificar el ID de la empresa', HttpStatus.BAD_REQUEST);
    client.enterpriseId = enterpriseId;

    return this.clientService.create(client);
  }

  /**
   * Obtiene todos los clientes
   * @returns Los clientes
   */
  @Get()
  @ApiOperation({ summary: 'Obtener todos los clientes' })
  @ApiResponse({ status: 200, description: 'Los clientes han sido obtenidos correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findAll(
    @Query('enterpriseId') enterpriseId: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 10,
    @Query('sort') sort: string = 'name',
    @Query('order') order: 'ASC' | 'DESC' = 'ASC',
    @Query('filter') filter?: string,
    @Query('relations') relations?: string
  ): Promise<PaginatedResponse<Client>> {
    if(!enterpriseId) throw new HttpException('Es obligatorio especificar el ID de la empresa', HttpStatus.BAD_REQUEST);

    const pageNumber = Number(page);
    const pageSizeNumber = Number(pageSize);

    // Parsear las relaciones si existen
    const relationsArray = relations ? relations.split(',') : [];

    
    // Parsear el filtro si existe
    let filterObj = {
      enterpriseId: enterpriseId
    };
    if (filter) {
      try {
        filterObj = {
          ...JSON.parse(filter),
          ...filterObj
        };
      } catch (error) {
        console.error('Error parsing filter JSON:', error);
      }
    }

    return this.clientService.findAll(pageNumber, pageSizeNumber, sort, order, filterObj, relationsArray);
  }

  /**
   * Obtiene un cliente por su id
   * @param id - El id del cliente
   * @returns El cliente
   */
  @Get(':id')
  @ApiOperation({ summary: 'Obtener un cliente por su id' })
  @ApiResponse({ status: 200, description: 'El cliente ha sido obtenido correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findById(@Param('id') id: string, @Query('relations') relations?: string) {
    const relationsArray = relations ? relations.split(',') : [];
    return this.clientService.findById(id, relationsArray);
  }

  /**
   * Actualiza un cliente por su id
   * @param id - El id del cliente
   * @param client - El cliente a actualizar
   * @returns El cliente actualizado
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un cliente por su id' })
  @ApiResponse({ status: 200, description: 'El cliente ha sido actualizado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async updateById(@Param('id') id: string, @Body() client: Client) {
    return this.clientService.updateById(id, client);
  }

  /**
   * Elimina un cliente por su id
   * @param id - El id del cliente
   * @returns El cliente eliminado
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un cliente por su id' })
  @ApiResponse({ status: 200, description: 'El cliente ha sido eliminado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async delete(@Param('id') id: string) {
    return this.clientService.deleteById(id);
  }
}
