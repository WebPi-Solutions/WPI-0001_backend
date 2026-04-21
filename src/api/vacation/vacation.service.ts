import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EnterpriseAccessService } from 'src/api/common/enterprise-access.service';
import { VacationRepository } from 'src/entities/vacation/vacation-repository.service';
import { Vacation } from 'src/entities/vacation/vacation.entity';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { DeleteResult } from 'typeorm';
import { CreateVacationDto } from './dto/create-vacation.dto';
import { UpdateVacationDto } from './dto/update-vacation.dto';

const USER_ENTERPRISE_RELATIONS = [
  'userEnterprise',
  'userEnterprise.enterprise',
  'userEnterprise.user',
];

/**
 * Servicio de API para vacaciones y permisos (`vacations`), aislado por empresa.
 */
@Injectable()
export class VacationService {
  private readonly logger = new Logger(VacationService.name);

  constructor(
    private readonly vacationRepository: VacationRepository,
    private readonly enterpriseAccessService: EnterpriseAccessService,
  ) {}

  /**
   * Carga el permiso y valida pertenencia a la empresa vía usuario.
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @param relations - Relaciones adicionales
   * @returns Vacation
   */
  private async loadScopedOrThrow(
    id: string,
    enterpriseId: string,
    relations?: string[],
  ): Promise<Vacation> {
    const mergedRelations = [
      ...new Set([...USER_ENTERPRISE_RELATIONS, ...(relations ?? [])]),
    ];
    const entity = await this.vacationRepository.findById(id, mergedRelations);
    if (!entity) {
      this.logger.warn(`Vacación ${id} no encontrada`);
      throw new HttpException(
        'Registro de vacaciones no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.enterpriseAccessService.assertUserEnterpriseBelongsToEnterprise(
      entity.userEnterpriseId,
      enterpriseId,
      { operationContext: 'vacation', notFoundMessage: 'Registro de vacaciones no encontrado' },
    );
    return entity;
  }

  /**
   * Crea un día de permiso para un usuario de la empresa.
   * @param enterpriseId - Empresa (query)
   * @param dto - Datos permitidos
   * @returns Registro creado
   */
  async create(
    enterpriseId: string,
    dto: CreateVacationDto,
  ): Promise<Vacation> {
    this.logger.log(
      `Creando vacación/permiso para userEnterprise ${dto.userEnterpriseId} (empresa ${enterpriseId})`,
    );

    await this.enterpriseAccessService.assertUserEnterpriseBelongsToEnterprise(
      dto.userEnterpriseId,
      enterpriseId,
      { operationContext: 'vacation', notFoundMessage: 'Registro de vacaciones no encontrado' },
    );

    const entityData: Partial<Vacation> = {
      userEnterpriseId: dto.userEnterpriseId,
      name: dto.name ?? 'Vacaciones',
      calendarDate: dto.calendarDate,
    };

    try {
      const created = await this.vacationRepository.create(entityData);
      this.logger.log(`Registro de vacaciones creado con id ${created.id}`);
      return created;
    } catch (error) {
      this.logger.error(`Error al crear vacación:`, error);
      throw error;
    }
  }

  /**
   * Listado paginado con filtro por empresa (vía `userEnterprise` / `userEnterprise.enterpriseId`).
   * @param page - Página
   * @param pageSize - Tamaño
   * @param sort - Orden
   * @param order - Dirección
   * @param filter - Filtros
   * @param relations - Relaciones
   * @returns Página
   */
  async findAll(
    page: number,
    pageSize: number,
    sort: string,
    order: 'ASC' | 'DESC',
    filter: Record<string, unknown>,
    relations?: string[],
  ): Promise<PaginatedResponse<Vacation>> {
    const mergedRelations = [
      ...new Set([...USER_ENTERPRISE_RELATIONS, ...(relations ?? [])]),
    ];

    this.logger.log(
      `Listando vacaciones — página ${page}, orden ${sort} ${order}, filtros: ${JSON.stringify(filter)}`,
    );

    return this.vacationRepository.findAll(
      page,
      pageSize,
      sort,
      order,
      filter,
      mergedRelations,
    );
  }

  /**
   * Obtiene un registro si el usuario pertenece a la empresa.
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @param relations - Relaciones opcionales
   * @returns Vacation
   */
  async findById(
    id: string,
    enterpriseId: string,
    relations?: string[],
  ): Promise<Vacation> {
    this.logger.log(`Buscando vacación ${id} para empresa ${enterpriseId}`);
    return this.loadScopedOrThrow(id, enterpriseId, relations);
  }

  /**
   * Actualiza nombre y/o fecha si el registro pertenece a la empresa.
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @param dto - Campos opcionales
   * @returns Entidad actualizada
   */
  async updateById(
    id: string,
    enterpriseId: string,
    dto: UpdateVacationDto,
  ): Promise<Vacation> {
    this.logger.log(`Actualizando vacación ${id} para empresa ${enterpriseId}`);

    await this.loadScopedOrThrow(id, enterpriseId);

    const entityData: Partial<Vacation> = {};
    if (dto.name !== undefined) {
      entityData.name = dto.name;
    }
    if (dto.calendarDate !== undefined) {
      entityData.calendarDate = dto.calendarDate;
    }

    if (Object.keys(entityData).length === 0) {
      this.logger.log(`Sin campos editables; se devuelve el registro actual`);
      return this.findById(id, enterpriseId, [
        'userEnterprise',
        'userEnterprise.user',
      ]);
    }

    try {
      const updated = await this.vacationRepository.updateById(id, entityData);
      this.logger.log(`Vacación ${id} actualizada`);
      return updated;
    } catch (error) {
      this.logger.error(`Error al actualizar vacación ${id}:`, error);
      throw error;
    }
  }

  /**
   * Elimina el registro si pertenece a la empresa.
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @returns Resultado de borrado
   */
  async deleteById(id: string, enterpriseId: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando vacación ${id} para empresa ${enterpriseId}`);

    await this.loadScopedOrThrow(id, enterpriseId);

    try {
      const result = await this.vacationRepository.deleteById(id);
      this.logger.log(
        `Vacación ${id} eliminada, filas afectadas: ${result.affected ?? 0}`,
      );
      return result;
    } catch (error) {
      this.logger.error(`Error al eliminar vacación ${id}:`, error);
      throw error;
    }
  }
}
