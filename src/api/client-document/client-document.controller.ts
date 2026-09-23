import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiOkResponse,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { MulterFile } from 'multer';
import { Response } from 'express';
import { MapResponse } from 'src/common/decorators/map-response.decorator';
import { RequireEnterpriseId } from 'src/common/decorators/enterprise-access.decorator';
import { RequirePermission } from 'src/common/decorators/enterprise-permission.decorator';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { ClientDocument } from 'src/entities/client-document/client-document.entity';
import { ClientDocumentResponseDto } from 'src/entities/client-document/dto/client-document-response.dto';
import { ClientDocumentService } from './client-document.service';

/** API HTTP de los metadatos documentales vinculados a clientes. */
@ApiTags('Documentos de cliente')
@Controller('client-documents')
export class ClientDocumentController {
  constructor(private readonly clientDocumentService: ClientDocumentService) {}

  /** Recibe y almacena un documento vinculado a un cliente de la empresa de la query. */
  @Post()
  @RequirePermission('documentManagement', 'write')
  @RequireEnterpriseId()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @MapResponse(ClientDocumentResponseDto)
  @ApiOperation({ summary: 'Crear un documento de cliente' })
  @ApiOkResponse({
    type: ClientDocumentResponseDto,
    description: 'Documento creado (vista pública).',
  })
  @ApiResponse({
    status: 201,
    description: 'El documento ha sido creado correctamente.',
  })
  async create(
    @Query('enterpriseId') enterpriseId: string,
    @Query('clientId') clientId: string,
    @UploadedFile() file: MulterFile,
  ): Promise<ClientDocument> {
    this.assertEnterpriseId(enterpriseId);
    if (!clientId) {
      throw new HttpException(
        'Es obligatorio especificar el ID del cliente',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!file) {
      throw new HttpException(
        'No se ha proporcionado ningún archivo',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.clientDocumentService.create(clientId, file, enterpriseId);
  }

  /** Lista los documentos de un cliente de la empresa de la query. */
  @Get()
  @RequirePermission('documentManagement', 'read')
  @RequireEnterpriseId()
  @MapResponse(ClientDocumentResponseDto)
  @ApiOperation({ summary: 'Obtener los documentos de un cliente' })
  @ApiOkResponse({
    type: ClientDocumentResponseDto,
    isArray: true,
    description: 'Documentos (vista pública).',
  })
  async findAll(
    @Query('enterpriseId') enterpriseId: string,
    @Query('clientId') clientId: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 10,
    @Query('sort') sort: string = 'createdAt',
    @Query('order') order: 'ASC' | 'DESC' = 'DESC',
    @Query('filter') filter?: string,
    @Query('relations') relations?: string,
  ): Promise<PaginatedResponse<ClientDocument>> {
    this.assertEnterpriseId(enterpriseId);
    if (!clientId) {
      throw new HttpException(
        'Es obligatorio especificar el ID del cliente',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.clientDocumentService.assertClientAccessibleForList(
      clientId,
      enterpriseId,
    );
    const relationsArray = relations ? relations.split(',') : [];
    let filterObj: Record<string, unknown> = { clientId };
    if (filter) {
      try {
        filterObj = { ...JSON.parse(filter), clientId };
      } catch (error) {
        console.error('Error parsing filter JSON:', error);
      }
    }
    return this.clientDocumentService.findAll(
      Number(page),
      Number(pageSize),
      sort,
      order,
      filterObj,
      relationsArray,
    );
  }

  /** Obtiene un documento por UUID. */
  @Get(':id')
  @RequirePermission('documentManagement', 'read')
  @MapResponse(ClientDocumentResponseDto)
  @ApiOperation({ summary: 'Obtener un documento de cliente por su id' })
  @ApiOkResponse({
    type: ClientDocumentResponseDto,
    description: 'Documento (vista pública).',
  })
  async findById(
    @Param('id') id: string,
    @Query('relations') relations?: string,
  ): Promise<ClientDocument> {
    return this.clientDocumentService.findById(
      id,
      relations ? relations.split(',') : [],
    );
  }

  /** Actualiza los metadatos de un documento. */
  @Patch(':id')
  @RequirePermission('documentManagement', 'write')
  @MapResponse(ClientDocumentResponseDto)
  @ApiOperation({ summary: 'Actualizar un documento de cliente por su id' })
  @ApiOkResponse({
    type: ClientDocumentResponseDto,
    description: 'Documento actualizado (vista pública).',
  })
  async updateById(
    @Param('id') id: string,
    @Body() clientDocument: ClientDocument,
  ): Promise<ClientDocument> {
    return this.clientDocumentService.updateById(id, clientDocument);
  }

  /** Descarga el archivo de un documento de cliente. */
  @Get(':id/download')
  @RequirePermission('documentManagement', 'read')
  @ApiOperation({ summary: 'Descargar un documento de cliente por su id' })
  @ApiResponse({ status: 200, description: 'El documento se ha descargado correctamente.' })
  async downloadById(@Param('id') id: string, @Res() response: Response) {
    return this.clientDocumentService.downloadById(id, response);
  }

  /** Elimina un documento de cliente. */
  @Delete(':id')
  @RequirePermission('documentManagement', 'delete')
  @ApiOperation({ summary: 'Eliminar un documento de cliente por su id' })
  async delete(@Param('id') id: string) {
    return this.clientDocumentService.deleteById(id);
  }

  /** Valida que la empresa venga en la query. */
  private assertEnterpriseId(enterpriseId: string): void {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
