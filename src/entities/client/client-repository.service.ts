import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Client } from './client.entity';
import { DeleteResult, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryBuilderService, QueryFilterOptions } from 'src/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';

@Injectable()
export class ClientRepository {

  constructor(@InjectRepository(Client) private clientRepository: Repository<Client>){}

  /**
   * Crea un nuevo cliente
   * @param client - El cliente a crear
   * @returns El cliente creado
   */
  create(client: Client): Promise<Client> {
    return this.clientRepository.save(client);
  }

  /**
   * Obtiene todos los clientes con paginación, filtros y ordenación
   * @param page - Número de página
   * @param pageSize - Tamaño de página
   * @param sort - Campo por el que ordenar
   * @param order - Dirección de ordenación
   * @param filter - Filtros a aplicar
   * @param relations - Las relaciones a incluir
   * @returns Respuesta paginada con los clientes
   */
  findAll(
    page: number = 1,
    pageSize: number = 10,
    sort: string = 'name',
    order: 'ASC' | 'DESC' = 'ASC',
    filter: Record<string, any> = {},
    relations?: string[]
  ): Promise<PaginatedResponse<Client>> {

    // Configurar opciones para el QueryBuilderService
    const options: QueryFilterOptions = {
      page,
      pageSize,
      sort,
      order,
      filter,
      relations: (relations || []).map(relation => ({
        property: relation,
        alias: relation,
        isLeftJoinAndSelect: true
      }))
    };

    // Usar el servicio genérico para construir la consulta
    return QueryBuilderService.getPaginatedResults(
      this.clientRepository,
      'client',
      options
    );
  }

  /**
   * Obtiene un cliente por su ID
   * @param id - El ID del cliente a buscar
   * @param relations - Las relaciones a incluir
   * @returns El cliente si se encuentra, de lo contrario null
   */
  findById(id: string, relations?: string[]): Promise<Client> {
    return this.clientRepository.findOne({ where: { id }, relations });
  }

  /**
   * Obtiene un cliente por su NIF y el ID de la empresa
   * @param nif - El NIF del cliente a buscar
   * @param enterpriseId - El ID de la empresa a la que pertenece el cliente
   * @returns El cliente si se encuentra, de lo contrario null
   */
  findByNifAndEnterpriseId(nif: string, enterpriseId: string): Promise<Client> {
    return this.clientRepository.findOne({ where: { nif, enterpriseId } });
  }

  /**
   * Actualiza un cliente existente por su ID
   * @param id - El ID del cliente a actualizar
   * @param client - El cliente con datos actualizados
   * @returns El cliente actualizado
   */
  async updateById(id: string, client: Client): Promise<Client> {
    // Obtiene el cliente a actualizar
    const clientToUpdate = await this.clientRepository.findOne({ where: { id } });

    // Si el cliente no existe, se lanza un error
    if (!clientToUpdate) {
      throw new HttpException('Cliente no encontrado', HttpStatus.NOT_FOUND);
    }

    // Actualiza el cliente
    await this.clientRepository.save({ ...clientToUpdate, ...client });

    // Devuelve el cliente actualizado con las relaciones incluidas
    return this.findById(id, ['enterprise']);
  }

  /**
   * Elimina un cliente por su ID
   * @param id - El ID del cliente a eliminar
   * @returns El resultado de la operación de eliminación
   */
  deleteById(id: string): Promise<DeleteResult> {
    return this.clientRepository.delete(id);
  }
}
