import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeleteResult, Repository } from 'typeorm';
import {
  QueryBuilderService,
  QueryFilterOptions,
} from 'src/common/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { ClientDocument } from './client-document.entity';

/** Repositorio de acceso a datos para `client_documents`. */
@Injectable()
export class ClientDocumentRepository {
  private readonly logger = new Logger(ClientDocumentRepository.name);

  constructor(
    @InjectRepository(ClientDocument)
    private readonly clientDocumentRepository: Repository<ClientDocument>,
  ) {}

  /** Crea un metadato documental. */
  create(entity: Partial<ClientDocument>): Promise<ClientDocument> {
    return this.clientDocumentRepository.save(entity);
  }

  /** Lista documentos con paginación, filtros y relaciones opcionales. */
  findAll(
    page: number = 1,
    pageSize: number = 10,
    sort: string = 'createdAt',
    order: 'ASC' | 'DESC' = 'DESC',
    filter: Record<string, unknown> = {},
    relations?: string[],
  ): Promise<PaginatedResponse<ClientDocument>> {
    const options: QueryFilterOptions = {
      page,
      pageSize,
      sort,
      order,
      filter,
      relations: (relations ?? []).map((relation) => ({
        property: relation,
        alias: relation,
        isLeftJoinAndSelect: true,
      })),
    };
    return QueryBuilderService.getPaginatedResults(
      this.clientDocumentRepository,
      'clientDocument',
      options,
    );
  }

  /** Busca un documento por UUID. */
  findById(id: string, relations?: string[]): Promise<ClientDocument | null> {
    return this.clientDocumentRepository.findOne({ where: { id }, relations });
  }

  /** Actualiza un documento y devuelve su relación con el cliente. */
  async updateById(
    id: string,
    partial: Partial<ClientDocument>,
  ): Promise<ClientDocument> {
    const existing = await this.clientDocumentRepository.findOne({
      where: { id },
    });
    if (!existing) {
      throw new HttpException(
        'Documento de cliente no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.clientDocumentRepository.save({ ...existing, ...partial });
    return this.findById(id, ['client']) as Promise<ClientDocument>;
  }

  /** Elimina un documento por UUID. */
  deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando documento de cliente ${id}`);
    return this.clientDocumentRepository.delete(id);
  }

  /**
   * Construye la ubicación del fichero en Dropbox a partir de la plantilla de entorno.
   */
  getClientDocumentFilePath(
    enterpriseId: string,
    clientId: string,
    documentId: string,
  ): string {
    return process.env.DROPBOX_CLIENT_FILE_PATH.replace(
      ':enterpriseId',
      enterpriseId,
    )
      .replace(':clientId', clientId)
      .replace(':documentId', documentId);
  }
}
