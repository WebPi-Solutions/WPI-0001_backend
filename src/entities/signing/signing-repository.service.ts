import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeleteResult, Repository } from 'typeorm';
import { QueryBuilderService, QueryFilterOptions } from 'src/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { Signing } from './signing.entity';

/**
 * Repositorio de fichajes (signings).
 */
@Injectable()
export class SigningRepository {
  private readonly logger = new Logger(SigningRepository.name);

  constructor(
    @InjectRepository(Signing)
    private readonly signingRepository: Repository<Signing>
  ) {}

  /**
   * Crea un fichaje
   * @param entity - Datos del fichaje
   * @returns Registro persistido
   */
  create(entity: Partial<Signing>): Promise<Signing> {
    return this.signingRepository.save(entity);
  }

  /**
   * Listado paginado de fichajes
   * @param page - Página
   * @param pageSize - Tamaño de página
   * @param sort - Campo de orden
   * @param order - Dirección
   * @param filter - Filtros
   * @param relations - Relaciones
   * @returns Página de resultados
   */
  findAll(
    page: number = 1,
    pageSize: number = 10,
    sort: string = 'moment',
    order: 'ASC' | 'DESC' = 'DESC',
    filter: Record<string, unknown> = {},
    relations?: string[]
  ): Promise<PaginatedResponse<Signing>> {
    const options: QueryFilterOptions = {
      page,
      pageSize,
      sort,
      order,
      filter,
      relations: (relations ?? []).map(relation => ({
        property: relation,
        alias: relation,
        isLeftJoinAndSelect: true,
      })),
    };

    return QueryBuilderService.getPaginatedResults(this.signingRepository, 'signing', options);
  }

  /**
   * Busca un fichaje por id
   * @param id - UUID
   * @param relations - Relaciones opcionales
   * @returns Signing o null
   */
  findById(id: string, relations?: string[]): Promise<Signing | null> {
    this.logger.log(`Buscando signing por id: ${id}`);
    return this.signingRepository.findOne({ where: { id }, relations });
  }

  /**
   * Actualiza un fichaje
   * @param id - UUID
   * @param partial - Campos a actualizar (no debe incluir createdAt en negocio)
   * @returns Entidad actualizada
   */
  async updateById(id: string, partial: Partial<Signing>): Promise<Signing> {
    const existing = await this.signingRepository.findOne({ where: { id } });
    if (!existing) {
      throw new HttpException('Fichaje no encontrado', HttpStatus.NOT_FOUND);
    }
    await this.signingRepository.save({ ...existing, ...partial });
    return this.findById(id, ['user']);
  }

  /**
   * Elimina un fichaje
   * @param id - UUID
   * @returns Resultado del borrado
   */
  deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando signing id: ${id}`);
    return this.signingRepository.delete(id);
  }
}
