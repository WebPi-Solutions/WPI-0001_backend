import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryBuilderService, QueryFilterOptions } from 'src/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { AiRequest } from './ai-request.entity';

/**
 * Repositorio de peticiones a la API de IA.
 * Encapsula las operaciones de persistencia sobre la tabla `ai_requests`.
 */
@Injectable()
export class AiRequestRepository {
  private readonly logger = new Logger(AiRequestRepository.name);

  constructor(
    @InjectRepository(AiRequest)
    private readonly aiRequestTypeOrmRepository: Repository<AiRequest>,
  ) {}

  /**
   * Persiste una nueva petición de IA.
   * @param aiRequest - Datos de la petición a guardar
   * @returns La petición persistida
   */
  create(aiRequest: Partial<AiRequest>): Promise<AiRequest> {
    this.logger.log(
      `Persistiendo petición de IA tipo ${aiRequest.type} para la empresa ${aiRequest.enterpriseId}`,
    );
    return this.aiRequestTypeOrmRepository.save(aiRequest);
  }

  /**
   * Obtiene peticiones de IA paginadas, filtradas y ordenadas.
   * @param page - Número de página
   * @param pageSize - Tamaño de página
   * @param sort - Campo por el que ordenar
   * @param order - Dirección de ordenación
   * @param filter - Filtros a aplicar
   * @param relations - Relaciones a incluir
   * @returns Respuesta paginada con las peticiones
   */
  findAll(
    page: number = 1,
    pageSize: number = 10,
    sort: string = 'createdAt',
    order: 'ASC' | 'DESC' = 'DESC',
    filter: Record<string, unknown> = {},
    relations?: string[],
  ): Promise<PaginatedResponse<AiRequest>> {
    const options: QueryFilterOptions = {
      page,
      pageSize,
      sort,
      order,
      filter,
      relations: (relations || []).map((relation) => ({
        property: relation,
        alias: relation,
        isLeftJoinAndSelect: true,
      })),
    };

    return QueryBuilderService.getPaginatedResults(
      this.aiRequestTypeOrmRepository,
      'aiRequest',
      options,
    );
  }

  /**
   * Obtiene una petición de IA por su ID.
   * @param id - Identificador de la petición
   * @param relations - Relaciones a incluir
   * @returns La petición si existe; null en caso contrario
   */
  findById(id: string, relations?: string[]): Promise<AiRequest | null> {
    return this.aiRequestTypeOrmRepository.findOne({ where: { id }, relations });
  }

  /**
   * Obtiene una petición de IA por ID o lanza 404 si no existe.
   * @param id - Identificador de la petición
   * @param relations - Relaciones a incluir
   * @returns La petición encontrada
   */
  async findByIdOrFail(id: string, relations?: string[]): Promise<AiRequest> {
    const aiRequest = await this.findById(id, relations);
    if (!aiRequest) {
      this.logger.error(`Petición de IA no encontrada con ID: ${id}`);
      throw new HttpException('Petición de IA no encontrada', HttpStatus.NOT_FOUND);
    }
    return aiRequest;
  }
}
