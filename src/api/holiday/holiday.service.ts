import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { HolidayRepository } from 'src/entities/holiday/holiday-repository.service';
import { Holiday } from 'src/entities/holiday/holiday.entity';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { DeleteResult } from 'typeorm';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { UpdateHolidayDto } from './dto/update-holiday.dto';

/**
 * Servicio de API para festivos (`holidays`), siempre acotado por empresa.
 */
@Injectable()
export class HolidayService {
  private readonly logger = new Logger(HolidayService.name);

  constructor(private readonly holidayRepository: HolidayRepository) {}

  /**
   * Crea un festivo para la empresa indicada.
   * @param enterpriseId - Empresa propietaria
   * @param dto - Datos permitidos (nombre opcional; por defecto «Festivo» en negocio)
   * @returns Registro creado
   */
  async create(enterpriseId: string, dto: CreateHolidayDto): Promise<Holiday> {
    this.logger.log(
      `Creando festivo para empresa ${enterpriseId} en fecha ${dto.calendarDate}`,
    );

    const entityData: Partial<Holiday> = {
      enterpriseId,
      name: dto.name ?? 'Festivo',
      calendarDate: dto.calendarDate,
      calendarColor: dto.calendarColor ?? '#00A76F',
    };

    try {
      const created = await this.holidayRepository.create(entityData);
      this.logger.log(`Festivo creado con id ${created.id}`);
      return created;
    } catch (error) {
      this.logger.error(
        `Error al crear festivo para empresa ${enterpriseId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Listado paginado; el filtro debe incluir `enterpriseId` desde el controlador.
   * @param page - Página (base 1)
   * @param pageSize - Tamaño de página
   * @param sort - Campo de orden
   * @param order - ASC o DESC
   * @param filter - Filtros (incluye enterpriseId)
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
  ): Promise<PaginatedResponse<Holiday>> {
    this.logger.log(
      `Listando festivos — página ${page}, orden ${sort} ${order}, filtros: ${JSON.stringify(filter)}`,
    );
    return this.holidayRepository.findAll(
      page,
      pageSize,
      sort,
      order,
      filter,
      relations,
    );
  }

  /**
   * Obtiene un festivo si pertenece a la empresa.
   * @param id - UUID
   * @param enterpriseId - Empresa esperada
   * @param relations - Relaciones opcionales
   * @returns Holiday
   */
  async findById(
    id: string,
    enterpriseId: string,
    relations?: string[],
  ): Promise<Holiday> {
    this.logger.log(`Buscando festivo ${id} para empresa ${enterpriseId}`);

    const entity = await this.holidayRepository.findById(id, relations);
    if (!entity || entity.enterpriseId !== enterpriseId) {
      this.logger.warn(
        `Festivo ${id} no encontrado o no pertenece a la empresa ${enterpriseId}`,
      );
      throw new HttpException('Festivo no encontrado', HttpStatus.NOT_FOUND);
    }
    return entity;
  }

  /**
   * Actualiza solo nombre y/o fecha de calendario si el registro es de la empresa.
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @param dto - Campos opcionales
   * @returns Entidad actualizada
   */
  async updateById(
    id: string,
    enterpriseId: string,
    dto: UpdateHolidayDto,
  ): Promise<Holiday> {
    this.logger.log(`Actualizando festivo ${id} para empresa ${enterpriseId}`);

    await this.findById(id, enterpriseId);

    const entityData: Partial<Holiday> = {};
    if (dto.name !== undefined) {
      entityData.name = dto.name;
    }
    if (dto.calendarDate !== undefined) {
      entityData.calendarDate = dto.calendarDate;
    }
    if (dto.calendarColor !== undefined) {
      entityData.calendarColor = dto.calendarColor;
    }

    if (Object.keys(entityData).length === 0) {
      this.logger.log(`Sin campos editables; se devuelve el registro actual`);
      return this.findById(id, enterpriseId, ['enterprise']);
    }

    try {
      const updated = await this.holidayRepository.updateById(id, entityData);
      this.logger.log(`Festivo ${id} actualizado`);
      return updated;
    } catch (error) {
      this.logger.error(`Error al actualizar festivo ${id}:`, error);
      throw error;
    }
  }

  /**
   * Elimina el festivo si pertenece a la empresa.
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @returns Resultado de borrado
   */
  async deleteById(id: string, enterpriseId: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando festivo ${id} para empresa ${enterpriseId}`);

    await this.findById(id, enterpriseId);

    try {
      const result = await this.holidayRepository.deleteById(id);
      this.logger.log(
        `Festivo ${id} eliminado, filas afectadas: ${result.affected ?? 0}`,
      );
      return result;
    } catch (error) {
      this.logger.error(`Error al eliminar festivo ${id}:`, error);
      throw error;
    }
  }
}
