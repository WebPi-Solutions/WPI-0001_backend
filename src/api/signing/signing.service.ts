import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EnterpriseAccessService } from 'src/api/common/enterprise-access.service';
import { SigningRepository } from 'src/entities/signing/signing-repository.service';
import { Signing } from 'src/entities/signing/signing.entity';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { DeleteResult } from 'typeorm';
import { CreateSigningDto } from './dto/create-signing.dto';
import { UpdateSigningDto } from './dto/update-signing.dto';

const USER_ENTERPRISE_RELATIONS = ['user', 'user.userEnterprises'];

/**
 * Servicio de API para fichajes (`signings`), con aislamiento por empresa vía usuario vinculado.
 */
@Injectable()
export class SigningService {
  private readonly logger = new Logger(SigningService.name);

  constructor(
    private readonly signingRepository: SigningRepository,
    private readonly enterpriseAccessService: EnterpriseAccessService,
  ) {}

  /**
   * Carga el fichaje y valida pertenencia indirecta a la empresa.
   * @param id - UUID del fichaje
   * @param enterpriseId - Empresa
   * @param relations - Relaciones adicionales
   * @returns Signing
   */
  private async loadScopedOrThrow(
    id: string,
    enterpriseId: string,
    relations?: string[],
  ): Promise<Signing> {
    const mergedRelations = [
      ...new Set([...USER_ENTERPRISE_RELATIONS, ...(relations ?? [])]),
    ];
    const entity = await this.signingRepository.findById(id, mergedRelations);
    if (!entity) {
      this.logger.warn(`Fichaje ${id} no encontrado`);
      throw new HttpException('Fichaje no encontrado', HttpStatus.NOT_FOUND);
    }
    await this.enterpriseAccessService.assertUserBelongsToEnterprise(
      entity.userId,
      enterpriseId,
      {
        operationContext: 'signing',
        notFoundMessage: 'Fichaje no encontrado',
      },
    );
    return entity;
  }

  /**
   * Registra un fichaje para un usuario de la empresa.
   * @param enterpriseId - Empresa (query)
   * @param dto - Datos permitidos (sin poder fijar `createdAt` / `updatedAt`)
   * @returns Registro creado
   */
  async create(enterpriseId: string, dto: CreateSigningDto): Promise<Signing> {
    this.logger.log(
      `Creando fichaje para usuario ${dto.userId} (empresa ${enterpriseId})`,
    );

    await this.enterpriseAccessService.assertUserBelongsToEnterprise(
      dto.userId,
      enterpriseId,
      {
        operationContext: 'signing',
        notFoundMessage: 'Fichaje no encontrado',
      },
    );

    const entityData: Partial<Signing> = {
      userId: dto.userId,
      action: dto.action,
    };

    if (dto.moment !== undefined && dto.moment !== null && dto.moment !== '') {
      entityData.moment = new Date(dto.moment);
    }

    if (dto.durationInSeconds !== undefined) {
      entityData.durationInSeconds = dto.durationInSeconds;
    }

    try {
      const created = await this.signingRepository.create(entityData);
      this.logger.log(`Fichaje creado con id ${created.id}`);
      return created;
    } catch (error) {
      this.logger.error(`Error al crear fichaje:`, error);
      throw error;
    }
  }

  /**
   * Listado paginado filtrado por empresa (y opcionalmente por `userId` en filtros).
   * @param page - Página
   * @param pageSize - Tamaño
   * @param sort - Orden
   * @param order - Dirección
   * @param filter - Filtros con `userEnterprises.enterpriseId`
   * @param relations - Relaciones (se fusionan con las del filtro)
   * @returns Página
   */
  async findAll(
    page: number,
    pageSize: number,
    sort: string,
    order: 'ASC' | 'DESC',
    filter: Record<string, unknown>,
    relations?: string[],
  ): Promise<PaginatedResponse<Signing>> {
    const mergedRelations = [
      ...new Set([...USER_ENTERPRISE_RELATIONS, ...(relations ?? [])]),
    ];

    this.logger.log(
      `Listando fichajes — página ${page}, orden ${sort} ${order}, filtros: ${JSON.stringify(filter)}`,
    );

    return this.signingRepository.findAll(
      page,
      pageSize,
      sort,
      order,
      filter,
      mergedRelations,
    );
  }

  /**
   * Obtiene un fichaje si el usuario está en la empresa.
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @param relations - Relaciones opcionales
   * @returns Signing
   */
  async findById(
    id: string,
    enterpriseId: string,
    relations?: string[],
  ): Promise<Signing> {
    this.logger.log(`Buscando fichaje ${id} para empresa ${enterpriseId}`);
    return this.loadScopedOrThrow(id, enterpriseId, relations);
  }

  /**
   * Actualiza acción, momento o duración; no permite cambiar `userId` desde esta API.
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @param dto - Campos opcionales
   * @returns Entidad actualizada
   */
  async updateById(
    id: string,
    enterpriseId: string,
    dto: UpdateSigningDto,
  ): Promise<Signing> {
    this.logger.log(`Actualizando fichaje ${id} para empresa ${enterpriseId}`);

    await this.loadScopedOrThrow(id, enterpriseId);

    const entityData: Partial<Signing> = {};
    if (dto.action !== undefined) {
      entityData.action = dto.action;
    }
    if (dto.moment !== undefined && dto.moment !== null && dto.moment !== '') {
      entityData.moment = new Date(dto.moment);
    }
    if (dto.durationInSeconds !== undefined) {
      entityData.durationInSeconds = dto.durationInSeconds;
    }

    if (Object.keys(entityData).length === 0) {
      this.logger.log(`Sin campos editables; se devuelve el registro actual`);
      return this.findById(id, enterpriseId, ['user']);
    }

    try {
      const updated = await this.signingRepository.updateById(id, entityData);
      this.logger.log(`Fichaje ${id} actualizado`);
      return updated;
    } catch (error) {
      this.logger.error(`Error al actualizar fichaje ${id}:`, error);
      throw error;
    }
  }

  /**
   * Elimina el fichaje si el usuario pertenece a la empresa.
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @returns Resultado de borrado
   */
  async deleteById(id: string, enterpriseId: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando fichaje ${id} para empresa ${enterpriseId}`);

    await this.loadScopedOrThrow(id, enterpriseId);

    try {
      const result = await this.signingRepository.deleteById(id);
      this.logger.log(
        `Fichaje ${id} eliminado, filas afectadas: ${result.affected ?? 0}`,
      );
      return result;
    } catch (error) {
      this.logger.error(`Error al eliminar fichaje ${id}:`, error);
      throw error;
    }
  }
}
