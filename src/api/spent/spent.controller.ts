import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiConsumes, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Spent } from 'src/entities/spent/spent.entity';
import { SpentService } from './spent.service';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { FileInterceptor } from '@nestjs/platform-express';
import { MulterFile } from 'multer';
import { SpentFileUploadDto } from './dto/spent-file-upload.dto';
import { SpentAiFileUploadDto } from './dto/spent-ai-file-upload.dto';
import { SpentAiFilePreviewResponseDto } from './dto/spent-ai-file-preview-response.dto';

@ApiTags('Gastos')
@Controller('spents')
export class SpentController {

  constructor(private readonly spentService: SpentService){}

  /**
   * Crea un nuevo gasto
   * @param spent - El gasto a crear
   * @returns El gasto creado
   */
  @Post()
  @ApiOperation({ summary: 'Crear un nuevo gasto' })
  @ApiResponse({ status: 201, description: 'El gasto ha sido creado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async create(@Body() spent: Spent) {
    return this.spentService.create(spent);
  }
  
  /**
   * Crea un nuevo gasto con un archivo adjunto
   * @param file - Archivo PDF de la factura
   * @param spentData - Datos del gasto en formato JSON
   * @param enterpriseId - ID de la empresa
   * @returns El gasto creado con la ruta del archivo
   */
  @Post('file')
  @UseInterceptors(FileInterceptor('file', {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB max file size for spent files
    }
  }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: SpentFileUploadDto })
  @ApiOperation({ summary: 'Adjuntar un archivo a un gasto por su ID' })
  @ApiResponse({ status: 200, description: 'El archivo ha sido adjuntado correctamente al gasto.' })
  @ApiResponse({ status: 400, description: 'Solicitud incorrecta.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async addFileToSpentById(
    @UploadedFile() file: MulterFile,
    @Query('spentId') spentId: string,
  ) {
    if (!file) {
      throw new HttpException('No se ha proporcionado ningún archivo', HttpStatus.BAD_REQUEST);
    }
    
    if (!spentId) {
      throw new HttpException('No se ha proporcionado el ID del gasto', HttpStatus.BAD_REQUEST);
    }
    
    try {
      return this.spentService.addFileToSpentById(spentId, file);
    } catch (error) {
      throw new HttpException(`Error al procesar los datos: ${error.message}`, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Recibe un PDF para la subida de gastos con IA.
   * Extrae emisor, comprueba si el proveedor existe por CIF, extrae conceptos y devuelve spentData.
   * @param file Archivo PDF de la factura
   * @param enterpriseId ID de la empresa
   * @returns Datos del archivo y spentData listo para crear el gasto
   */
  @Post('ai/file')
  @UseInterceptors(FileInterceptor('file', {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB, mismo límite que la subida de factura de un gasto
    }
  }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: SpentAiFileUploadDto })
  @ApiOperation({
    summary: 'Recibir un PDF de gasto para procesamiento con IA (sin persistir ni subir a Dropbox)',
    description:
      'Requiere enterpriseId para buscar el proveedor por el CIF extraído del emisor. Extrae emisor, consulta el proveedor, conceptos, nombre, fecha de emisión y devuelve spentData. Incluye suggestedSupplier con los datos del emisor para crear un proveedor si no existe o si el vinculado no es el correcto.',
  })
  @ApiResponse({
    status: 201,
    description: 'El archivo ha sido recibido correctamente y se ha generado spentData.',
    type: SpentAiFilePreviewResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Solicitud incorrecta o archivo no válido.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async previewAiSpentFile(
    @UploadedFile() file: MulterFile,
    @Query('enterpriseId') enterpriseId: string,
  ): Promise<SpentAiFilePreviewResponseDto> {
    if (!file) {
      throw new HttpException('No se ha proporcionado ningún archivo', HttpStatus.BAD_REQUEST);
    }

    if (!enterpriseId) {
      throw new HttpException('Es obligatorio especificar el ID de la empresa', HttpStatus.BAD_REQUEST);
    }

    try {
      return await this.spentService.previewAiSpentFile(file, enterpriseId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        `Error al procesar el archivo: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // @Patch('change-enterprise-folder')
  // @ApiOperation({ summary: 'Cambiar la carpeta de Dropbox de un gasto por su id' })
  // @ApiResponse({ status: 200, description: 'La carpeta de Dropbox ha sido cambiada correctamente.' })
  // @ApiResponse({ status: 403, description: 'Forbidden.' })
  // @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  // async changeSpentEnterpriseFolderOndDropbox(@Query('spentId') spentId: string, @Query('oldEnterpriseId') oldEnterpriseId: string, @Query('newEnterpriseId') newEnterpriseId: string) {
  //   try {
  //     return this.spentService.changeSpentEnterpriseFolderOndDropbox(spentId, oldEnterpriseId, newEnterpriseId);
  //   } catch (error) {
  //     throw new HttpException(`Error al cambiar la carpeta de Dropbox del gasto ${spentId}: ${error.message}`, HttpStatus.BAD_REQUEST);
  //   }
  // }

  /**
   * Obtiene todos los gastos
   * @returns Los gastos
   */
  @Get()
  @ApiOperation({ summary: 'Obtener todos los gastos' })
  @ApiResponse({ status: 200, description: 'Los gastos han sido obtenidos correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findAll(
    @Query('enterpriseId') enterpriseId: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 10,
    @Query('sort') sort: string = 'issuedDate',
    @Query('order') order: 'ASC' | 'DESC' = 'DESC',
    @Query('filter') filter?: string,
    @Query('relations') relations?: string
  ): Promise<PaginatedResponse<Spent>> {
    if(!enterpriseId) throw new HttpException('Es obligatorio especificar el ID de la empresa', HttpStatus.BAD_REQUEST);

    const pageNumber = Number(page);
    const pageSizeNumber = Number(pageSize);

    // Parsear las relaciones si existen
    const relationsArray = relations ? relations.split(',') : [];

    
    // Parsear el filtro si existe
    let filterObj = {
      'supplier.enterpriseId': enterpriseId
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

    return this.spentService.findAll(pageNumber, pageSizeNumber, sort, order, filterObj, relationsArray);
  }

  /**
   * Obtiene un gasto por su id
   * @param id - El id del gasto
   * @returns El gasto
   */
  @Get(':id')
  @ApiOperation({ summary: 'Obtener un gasto por su id' })
  @ApiResponse({ status: 200, description: 'El gasto ha sido obtenido correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findById(@Param('id') id: string, @Query('relations') relations?: string) {
    const relationsArray = relations ? relations.split(',') : [];
    return this.spentService.findById(id, relationsArray);
  }

  /**
   * Actualiza un gasto por su id
   * @param id - El id del gasto
   * @param spent - El gasto a actualizar
   * @returns El gasto actualizado
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un gasto por su id' })
  @ApiResponse({ status: 200, description: 'El gasto ha sido actualizado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async updateById(@Param('id') id: string, @Body() spent: Spent) {
    return this.spentService.updateById(id, spent);
  }
  
  /**
   * Elimina un gasto por su id
   * @param id - El id del gasto
   * @returns El gasto eliminado
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un gasto por su id' })
  @ApiResponse({ status: 200, description: 'El gasto ha sido eliminado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async delete(@Param('id') id: string) {
    return this.spentService.deleteById(id);
  }

  /**
   * Descarga el archivo adjunto de un gasto por su id
   * @param id - El id del gasto
   * @param res - Response object
   * @returns El archivo PDF
   */
  @Get(':id/file/download')
  @ApiOperation({ summary: 'Descargar el archivo adjunto de un gasto por su id' })
  @ApiResponse({ status: 200, description: 'El archivo ha sido descargado correctamente.' })
  @ApiResponse({ status: 404, description: 'Gasto o archivo no encontrado.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async downloadSpentFile(@Param('id') id: string, @Res() res: Response) {
    return this.spentService.downloadSpentFile(id, res);
  }

  /**
   * Elimina el archivo adjunto de un gasto por su id
   * @param id - El id del gasto
   * @returns El gasto actualizado
   */
  @Delete(':id/file')
  @ApiOperation({ summary: 'Eliminar el archivo adjunto de un gasto por su id' })
  @ApiResponse({ status: 200, description: 'El archivo adjunto ha sido eliminado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async removeFileFromSpentById(@Param('id') id: string) {
    return this.spentService.removeFileFromSpentById(id);
  }
}
