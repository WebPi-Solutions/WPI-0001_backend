import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ClientRepository } from 'src/entities/client/client-repository.service';
import { Client } from 'src/entities/client/client.entity';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { DeleteResult } from 'typeorm';

@Injectable()
export class ClientService {
  private readonly logger = new Logger(ClientService.name);

  constructor(private readonly clientRepository: ClientRepository){}

  /**
   * Crea un nuevo cliente
   * @param client - El cliente a crear
   * @returns El cliente creado
   */
  async create(client: Client): Promise<Client> {
    this.logger.log(`Iniciando proceso de creación de cliente: ${client.name}`);
    this.logger.log(`Datos del cliente a crear:`, JSON.stringify(client, null, 2));

    const clientExists = await this.verifyClientExistsByNif(client.nif, client.enterpriseId);
    if (clientExists) {
      this.logger.warn(`Ya existe un cliente con el NIF: ${client.nif} para la empresa ${client.enterpriseId}`);
      throw new HttpException('Ya existe un cliente con el NIF', HttpStatus.CONFLICT);
    }
    
    try {
      const newClient = await this.clientRepository.create(client);
      this.logger.log(`Cliente creado exitosamente con ID: ${newClient.id}`);
      return newClient;
    } catch (error) {
      this.logger.error(`Error al crear cliente ${client.name}:`, error);
      throw error;
    }
  }

  /**
   * Obtiene todos los clientes con paginación, filtros y ordenación
   * @param page - El número de página
   * @param pageSize - El tamaño de la página
   * @param sort - El campo por el que ordenar
   * @param order - La dirección de ordenación
   * @param filter - Los filtros a aplicar
   * @param relations - Las relaciones a incluir
   * @returns Los clientes encontrados
   */
  async findAll(page: number, pageSize: number, sort: string, order: 'ASC' | 'DESC', filter: Record<string, any>, relations?: string[]): Promise<PaginatedResponse<Client>> {
    this.logger.log(`Obteniendo clientes paginados - Página: ${page}, Tamaño: ${pageSize}, Ordenación: ${sort} ${order}`);
    this.logger.log(`Filtros aplicados:`, JSON.stringify(filter, null, 2));
    
    if (relations && relations.length > 0) {
      this.logger.log(`Incluyendo relaciones: ${relations.join(', ')}`);
    }
    
    const result = await this.clientRepository.findAll(page, pageSize, sort, order, filter, relations);
    this.logger.log(`Clientes obtenidos: ${result.items.length} de ${result.total}`);
    return result;
  }

  /**
   * Obtiene un cliente por su ID
   * @param id - El ID del cliente a obtener
   * @param relations - Las relaciones a incluir
   * @returns El cliente encontrado
   */
  async findById(id: string, relations?: string[]): Promise<Client> {
    this.logger.log(`Buscando cliente por ID: ${id}${relations ? ` con relaciones: [${relations.join(', ')}]` : ''}`);
    
    const client = await this.clientRepository.findById(id, relations);
    
    if (client) {
      this.logger.log(`Cliente encontrado: ${client.name} (ID: ${client.id})`);
    } else {
      this.logger.log(`No se encontró ningún cliente con ID: ${id}`);
      throw new HttpException('Cliente no encontrado', HttpStatus.NOT_FOUND);
    }
    
    return client;
  }

  /**
   * Actualiza un cliente por su ID
   * @param id - El ID del cliente a actualizar
   * @param client - El cliente con los datos actualizados
   * @returns El cliente actualizado
   */
  async updateById(id: string, client: Client): Promise<Client> {
    this.logger.log(`Iniciando actualización de cliente con ID: ${id}`);
    this.logger.log(`Datos a actualizar:`, JSON.stringify(client, null, 2));
    
    if (!await this.verifyClientExistsById(id)) {
      this.logger.log(`No se encontró ningún cliente con ID: ${id}`);
      throw new HttpException('Cliente no encontrado', HttpStatus.NOT_FOUND);
    }
    
    try {
      const updatedClient = await this.clientRepository.updateById(id, client);
      this.logger.log(`Cliente ${id} actualizado exitosamente`);
      return updatedClient;
    } catch (error) {
      this.logger.error(`Error al actualizar cliente ${id}:`, error);
      throw error;
    }
  }

  /**
   * Elimina un cliente por su ID
   * @param id - El ID del cliente a eliminar
   * @returns El resultado de la eliminación
   */
  async deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Iniciando eliminación de cliente con ID: ${id}`);

    const client = await this.clientRepository.findById(id, ['recurrentEarnings']);
    if (!client) {
      this.logger.log(`No se encontró ningún cliente con ID: ${id}`);
      throw new HttpException('Cliente no encontrado', HttpStatus.NOT_FOUND);
    }

    if (client.recurrentEarnings && client.recurrentEarnings.length > 0) {
      this.logger.error(`No se puede eliminar el cliente ${id} porque tiene ingresos recurrentes asociados`);
      throw new HttpException(
        'No se puede eliminar el cliente porque tiene ingresos recurrentes asociados',
        HttpStatus.BAD_REQUEST,
      );
    }
    
    try {
      const result = await this.clientRepository.deleteById(id);
      this.logger.log(`Cliente ${id} eliminado exitosamente. Filas afectadas: ${result.affected}`);
      return result;
    } catch (error) {
      this.logger.error(`Error al eliminar cliente ${id}:`, error);
      throw error;
    }
  }

  /**
   * Verifica si existe un cliente con el NIF y el ID de la empresa
   * @param nif - El NIF del cliente a buscar
   * @param enterpriseId - El ID de la empresa a la que pertenece el cliente
   * @returns El cliente si se encuentra, de lo contrario null
   */
  async verifyClientExistsByNif(nif: string, enterpriseId: string): Promise<Client | null> {
    this.logger.log(`Verificando si existe un cliente con el NIF: ${nif} para la empresa ${enterpriseId}`);
    const clientExists = await this.clientRepository.findByNifAndEnterpriseId(nif, enterpriseId);
    if (clientExists) {
      this.logger.warn(`El cliente ${clientExists.name} existe con el NIF: ${clientExists.nif} para la empresa ${enterpriseId}`);
      return clientExists;
    }

    this.logger.log(`No existe un cliente con el NIF: ${nif} para la empresa ${enterpriseId}`);
    return null;
  }

  /**
   * Verifica si existe un cliente con el ID
   * @param id - El ID del cliente a buscar
   * @returns El cliente si se encuentra, de lo contrario null
   */
  async verifyClientExistsById(id: string): Promise<Client | null> {
    this.logger.log(`Verificando si existe un cliente con el ID: ${id}`);
    const clientExists = await this.clientRepository.findById(id);
    if (clientExists) {
      this.logger.warn(`El cliente ${clientExists.name} existe con el ID: ${id}`);
      return clientExists;
    }

    this.logger.log(`No existe un cliente con el ID: ${id}`);
    return null;
  }
}