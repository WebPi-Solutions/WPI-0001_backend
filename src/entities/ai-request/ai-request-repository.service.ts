import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  QueryBuilderService,
  QueryFilterOptions,
  QueryRelation,
} from 'src/common/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { AiRequest, AiRequestType } from './ai-request.entity';

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
   * Cuenta peticiones de IA con los mismos filtros que el listado (sin paginar).
   *
   * @param filter - Filtros de consulta
   * @param relations - Relaciones solo JOIN (para filtros anidados)
   * @returns Número de filas
   */
  async count(
    filter: Record<string, unknown> = {},
    relations?: string[],
  ): Promise<number> {
    const queryRelations: QueryRelation[] | undefined = relations
      ? relations.map((relation) => ({
          property: relation,
          alias: relation,
          isLeftJoinAndSelect: false,
        }))
      : undefined;
    return QueryBuilderService.getCount(
      this.aiRequestTypeOrmRepository,
      'aiRequest',
      filter,
      queryRelations,
    );
  }

  /**
   * Conteos para las tarjetas del listado: total, emisor y conceptos.
   * Tres llamadas a {@link count}; el tipo fuerza emisor o conceptos.
   *
   * @param enterpriseId - Empresa
   * @param filter - Filtros de la vista (sin `enterpriseId`)
   * @returns Conteos alineados con las tarjetas de la vista
   */
  async getListViewCounts(
    enterpriseId: string,
    filter: Record<string, unknown> = {},
  ): Promise<{ total: number; issuer: number; concepts: number }> {
    const baseFilter: Record<string, unknown> = { enterpriseId, ...filter };
    const [total, issuer, concepts] = await Promise.all([
      this.count(baseFilter),
      this.count({ ...baseFilter, type: AiRequestType.GET_SPENT_ISSUER }),
      this.count({ ...baseFilter, type: AiRequestType.GET_SPENT_CONCEPTS }),
    ]);
    return { total, issuer, concepts };
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
