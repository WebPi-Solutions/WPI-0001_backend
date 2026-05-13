import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiConsumes, ApiBody, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Enterprise } from 'src/entities/enterprise/enterprise.entity';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { MulterFile } from 'multer';
import { EnterpriseService } from './enterprise.service';
import { Response } from 'express';
import { EnterpriseLogoUploadDto } from './dto/enterprise-logo-upload.dto';
import { EnterpriseResponseDto } from 'src/entities/enterprise/dto/enterprise-response.dto';
import { MapResponse } from 'src/common/decorators/map-response.decorator';

@ApiTags('Empresas')
@Controller('enterprises')
export class EnterpriseController {

  constructor(private readonly enterpriseService: EnterpriseService){}

  /**
   * Crea una nueva empresa
   * @param enterprise - La empresa a crear
   * @returns La empresa creada
   */
  @Post()
  @MapResponse(EnterpriseResponseDto)
  @ApiOperation({ summary: 'Crear una nueva empresa' })
  @ApiOkResponse({ type: EnterpriseResponseDto, description: 'Empresa creada (vista pública).' })
  @ApiResponse({ status: 201, description: 'La empresa ha sido creada correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async create(@Body() enterprise: Enterprise): Promise<Enterprise> {
    return this.enterpriseService.create(enterprise);
  }

  /**
   * Crea/reemplaza el archivo del logo de la empresa en Dropbox
   * @param file - Archivo del logo de la empresa
   * @param enterpriseId - ID de la empresa
   * @returns El archivo del logo de la empresa creado/reemplazado en Dropbox
   */
  @Post('logo')
  @MapResponse(EnterpriseResponseDto)
  @UseInterceptors(FileInterceptor('file', {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB max file size for logo files
    }
  }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: EnterpriseLogoUploadDto })
  @ApiOperation({ summary: 'Crear/reemplazar el archivo del logo de la empresa en Dropbox por su ID' })
  @ApiResponse({ status: 200, description: 'El archivo del logo de la empresa ha sido creado/reemplazado en Dropbox correctamente.' })
  @ApiResponse({ status: 400, description: 'Solicitud incorrecta.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async createLogoInDropbox(
    @UploadedFile() file: MulterFile,
    @Query('enterpriseId') enterpriseId: string,
  ): Promise<Enterprise> {
    if (!file) {
      throw new HttpException('No se ha proporcionado ningún archivo', HttpStatus.BAD_REQUEST);
    }
    
    if (!enterpriseId) {
      throw new HttpException('No se ha proporcionado el ID de la empresa', HttpStatus.BAD_REQUEST);
    }
    
    try {
      return this.enterpriseService.createLogoInDropbox(enterpriseId, file);
    } catch (error) {
      throw new HttpException(`Error al procesar los datos: ${error.message}`, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Obtiene todas las empresas
   * @returns Las empresas
   */
  @Get()
  @MapResponse(EnterpriseResponseDto)
  @ApiOperation({ summary: 'Obtener todas las empresas' })
  @ApiOkResponse({ description: 'Listado paginado de empresas (vista pública por ítem).' })
  @ApiResponse({ status: 200, description: 'Las empresas han sido obtenidas correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findAll(
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 10,
    @Query('sort') sort: string = 'name',
    @Query('order') order: 'ASC' | 'DESC' = 'ASC',
    @Query('filter') filter?: string,
    @Query('relations') relations?: string
  ): Promise<PaginatedResponse<Enterprise>> {
    const pageNumber = Number(page);
    const pageSizeNumber = Number(pageSize);

    // Parsear las relaciones si existen
    const relationsArray = relations ? relations.split(',') : [];

    
    // Parsear el filtro si existe
    let filterObj = {};
    if (filter) {
      try {
        filterObj = JSON.parse(filter);
      } catch (error) {
        console.error('Error parsing filter JSON:', error);
      }
    }

    return this.enterpriseService.findAll(pageNumber, pageSizeNumber, sort, order, filterObj, relationsArray);
  }

  /**
   * Obtiene una empresa por su id
   * @param id - El id de la empresa
   * @returns La empresa
   */
  @Get(':id')
  @MapResponse(EnterpriseResponseDto)
  @ApiOperation({ summary: 'Obtener una empresa por su id' })
  @ApiOkResponse({ type: EnterpriseResponseDto, description: 'Empresa encontrada (vista pública).' })
  @ApiResponse({ status: 200, description: 'La empresa ha sido obtenida correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findById(
    @Param('id') id: string,
    @Query('relations') relations?: string,
  ): Promise<Enterprise> {
    const relationsArray = relations ? relations.split(',') : [];
    return this.enterpriseService.findById(id, relationsArray);
  }

  /**
 * Descarga el archivo del logo de la empresa por su id
 * @param enterpriseId - El id de la empresa
 * @param res - Response object
 * @returns El archivo del logo de la empresa
 */
  @Get('logo/:enterpriseId')
  @ApiOperation({ summary: 'Descargar el archivo del logo de la empresa por su id' })
  @ApiResponse({ status: 200, description: 'El archivo ha sido descargado correctamente.' })
  @ApiResponse({ status: 404, description: 'Empresa o archivo no encontrado.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async downloadLogoFile(@Param('enterpriseId') enterpriseId: string, @Res() res: Response) {
    return this.enterpriseService.downloadLogoFile(enterpriseId, res);
  }

  /**
   * Actualiza una empresa por su id
   * @param id - El id de la empresa
   * @param enterprise - La empresa a actualizar
   * @returns La empresa actualizada
   */
  @Patch(':id')
  @MapResponse(EnterpriseResponseDto)
  @ApiOperation({ summary: 'Actualizar una empresa por su id' })
  @ApiOkResponse({ type: EnterpriseResponseDto, description: 'Empresa actualizada (vista pública).' })
  @ApiResponse({ status: 200, description: 'La empresa ha sido actualizada correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async updateById(
    @Param('id') id: string,
    @Body() enterprise: Enterprise,
  ): Promise<Enterprise> {
    return this.enterpriseService.updateById(id, enterprise);
  }

  /**
   * Elimina una empresa por su id
   * @param id - El id de la empresa
   * @returns La empresa eliminada
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una empresa por su id' })
  @ApiResponse({ status: 200, description: 'La empresa ha sido eliminada correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async delete(@Param('id') id: string) {
    return this.enterpriseService.deleteById(id);
  }
}
