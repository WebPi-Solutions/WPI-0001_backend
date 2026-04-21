import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { DefaultScheduleRepository } from 'src/entities/default-schedule/default-schedule-repository.service';
import { DefaultSchedule } from 'src/entities/default-schedule/default-schedule.entity';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { DeleteResult } from 'typeorm';
import { CreateDefaultScheduleDto } from './dto/create-default-schedule.dto';
import { UpdateDefaultScheduleDto } from './dto/update-default-schedule.dto';

/**
 * Servicio de API para plantillas de horario por defecto (`default_schedules`).
 * Todas las operaciones quedan acotadas por `enterpriseId`.
 */
@Injectable()
export class DefaultScheduleService {
  private readonly logger = new Logger(DefaultScheduleService.name);

  constructor(
    private readonly defaultScheduleRepository: DefaultScheduleRepository,
  ) {}

  /**
   * Crea una plantilla asociada a la empresa indicada.
   * @param enterpriseId - Empresa propietaria (query obligatorio en controlador)
   * @param dto - Datos permitidos al crear (sin id ni marcas de auditoría)
   * @returns Registro persistido
   */
  async create(
    enterpriseId: string,
    dto: CreateDefaultScheduleDto,
  ): Promise<DefaultSchedule> {
    this.logger.log(
      `Creando plantilla de horario "${dto.name}" para la empresa ${enterpriseId}`,
    );

    const entityData: Partial<DefaultSchedule> = {
      enterpriseId,
      name: dto.name,
      schedule: dto.schedule,
    };
    if (dto.description !== undefined) {
      const trimmed = dto.description?.trim();
      entityData.description = trimmed ? trimmed : null;
    }

    try {
      const created = await this.defaultScheduleRepository.create(entityData);
      this.logger.log(`Plantilla creada con id ${created.id}`);
      return created;
    } catch (error) {
      this.logger.error(
        `Error al crear plantilla de horario para empresa ${enterpriseId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Listado paginado filtrado siempre por empresa.
   * @param page - Página (base 1)
   * @param pageSize - Tamaño de página
   * @param sort - Campo de orden
   * @param order - Dirección ASC/DESC
   * @param filter - Filtros adicionales (se fuerza enterpriseId)
   * @param relations - Relaciones TypeORM
   * @returns Página de resultados
   */
  async findAll(
    page: number,
    pageSize: number,
    sort: string,
    order: 'ASC' | 'DESC',
    filter: Record<string, unknown>,
    relations?: string[],
  ): Promise<PaginatedResponse<DefaultSchedule>> {
    this.logger.log(
      `Listando plantillas de horario — página ${page}, orden ${sort} ${order}, filtros: ${JSON.stringify(filter)}`,
    );

    return this.defaultScheduleRepository.findAll(
      page,
      pageSize,
      sort,
      order,
      filter,
      relations,
    );
  }

  /**
   * Obtiene una plantilla si pertenece a la empresa solicitada.
   * @param id - UUID de la plantilla
   * @param enterpriseId - Empresa esperada
   * @param relations - Relaciones opcionales
   * @returns Entidad
   */
  async findById(
    id: string,
    enterpriseId: string,
    relations?: string[],
  ): Promise<DefaultSchedule> {
    this.logger.log(`Buscando plantilla ${id} para empresa ${enterpriseId}`);

    const entity = await this.defaultScheduleRepository.findById(id, relations);
    if (!entity || entity.enterpriseId !== enterpriseId) {
      this.logger.warn(
        `Plantilla ${id} no encontrada o no pertenece a la empresa ${enterpriseId}`,
      );
      throw new HttpException(
        'Plantilla de horario no encontrada',
        HttpStatus.NOT_FOUND,
      );
    }
    return entity;
  }

  /**
   * Actualiza solo campos permitidos y solo si el registro pertenece a la empresa.
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @param dto - Campos opcionales a fusionar
   * @returns Entidad actualizada
   */
  async updateById(
    id: string,
    enterpriseId: string,
    dto: UpdateDefaultScheduleDto,
  ): Promise<DefaultSchedule> {
    this.logger.log(
      `Actualizando plantilla ${id} para empresa ${enterpriseId}`,
    );

    await this.findById(id, enterpriseId);

    const entityData: Partial<DefaultSchedule> = {};
    if (dto.name !== undefined) {
      entityData.name = dto.name;
    }
    if (dto.schedule !== undefined) {
      entityData.schedule = dto.schedule;
    }
    if (dto.description !== undefined) {
      const trimmed = dto.description?.trim();
      entityData.description = trimmed ? trimmed : null;
    }

    if (Object.keys(entityData).length === 0) {
      this.logger.log(
        `Sin campos editables en el cuerpo; se devuelve el registro actual`,
      );
      return this.findById(id, enterpriseId, ['enterprise']);
    }

    try {
      const updated = await this.defaultScheduleRepository.updateById(
        id,
        entityData,
      );
      this.logger.log(`Plantilla ${id} actualizada`);
      return updated;
    } catch (error) {
      this.logger.error(`Error al actualizar plantilla ${id}:`, error);
      throw error;
    }
  }

  /**
   * Elimina la plantilla si pertenece a la empresa.
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @returns Resultado TypeORM
   */
  async deleteById(id: string, enterpriseId: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando plantilla ${id} para empresa ${enterpriseId}`);

    await this.findById(id, enterpriseId);

    try {
      const result = await this.defaultScheduleRepository.deleteById(id);
      this.logger.log(
        `Plantilla ${id} eliminada, filas afectadas: ${result.affected ?? 0}`,
      );
      return result;
    } catch (error) {
      this.logger.error(`Error al eliminar plantilla ${id}:`, error);
      throw error;
    }
  }
}
