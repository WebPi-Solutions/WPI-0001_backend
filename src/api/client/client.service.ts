import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ClientRepository } from 'src/entities/client/client-repository.service';
import { Client } from 'src/entities/client/client.entity';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import {
  DEFAULT_PAYMENT_METHOD,
  isValidPaymentMethod,
} from 'src/common/enums';
import { DeleteResult } from 'typeorm';

@Injectable()
export class ClientService {
  private readonly logger = new Logger(ClientService.name);

  constructor(
    private readonly clientRepository: ClientRepository,
    private readonly enterpriseAccessService: EnterpriseAccessService,
  ){}

  /**
   * Crea un nuevo cliente
   * @param client - El cliente a crear
   * @returns El cliente creado
   */
  async create(client: Client): Promise<Client> {
    this.logger.log(`Iniciando proceso de creación de cliente: ${client.name}`);
    this.logger.log(`Datos del cliente a crear:`, JSON.stringify(client, null, 2));

    this.applyDefaultPaymentMethodIfMissing(client);
    this.validatePaymentMethod(client);
    await this.assertNifIsUniqueForEnterprise(client.nif, client.enterpriseId);
    
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
      this.enterpriseAccessService.assertCurrentEntityAccessible(
        client.enterpriseId,
        'Cliente no encontrado',
        { resource: 'clients', action: 'read' },
        );
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
    
    const existingClient = await this.verifyClientExistsById(id);
    if (!existingClient) {
      this.logger.log(`No se encontró ningún cliente con ID: ${id}`);
      throw new HttpException('Cliente no encontrado', HttpStatus.NOT_FOUND);
    }

    this.enterpriseAccessService.assertCurrentEntityAccessible(
      existingClient.enterpriseId,
      'Cliente no encontrado',
      { resource: 'clients', action: 'write' },
      );

    if (client.paymentMethod) {
      this.validatePaymentMethod(client);
    }

    if (client.nif) {
      await this.assertNifIsUniqueForEnterprise(
        client.nif,
        existingClient.enterpriseId,
        id,
      );
    }

    const payloadForPersistence = {
      ...client,
      enterpriseId: existingClient.enterpriseId,
    } as Client;
    // Impide relocatar el cliente a otra empresa mediante PATCH del cuerpo.
    delete (payloadForPersistence as { enterprise?: unknown }).enterprise;
    
    try {
      const updatedClient = await this.clientRepository.updateById(id, payloadForPersistence);
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

    this.enterpriseAccessService.assertCurrentEntityAccessible(
      client.enterpriseId,
      'Cliente no encontrado',
      { resource: 'clients', action: 'delete' },
      );

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
      this.logger.log(`El cliente ${clientExists.name} existe con el NIF: ${clientExists.nif} para la empresa ${enterpriseId}`);
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

  /**
   * Impide registrar un NIF/CIF que ya pertenece a otro cliente de la misma empresa.
   * En actualizaciones se ignora el propio cliente.
   * @param nif - NIF/CIF a comprobar
   * @param enterpriseId - Empresa objetivo
   * @param excludedClientId - Identificador del cliente que se está actualizando
   * @returns Nada
   */
  private async assertNifIsUniqueForEnterprise(
    nif: string,
    enterpriseId: string,
    excludedClientId?: string,
  ): Promise<void> {
    const clientWithSameNif = await this.verifyClientExistsByNif(nif, enterpriseId);
    if (!clientWithSameNif) {
      return;
    }

    if (excludedClientId && clientWithSameNif.id === excludedClientId) {
      this.logger.log(
        `El NIF ${nif} pertenece al propio cliente ${excludedClientId}; se permite conservarlo`,
      );
      return;
    }

    this.logger.error(
      `Ya existe un cliente con el NIF ${nif} para la empresa ${enterpriseId}`,
    );
    throw new HttpException(
      `Ya existe un cliente con el NIF ${nif}`,
      HttpStatus.CONFLICT,
    );
  }

  /**
   * Asigna transferencia bancaria cuando el método de pago no se informa en el alta.
   * @param client - Cliente a normalizar
   * @returns Nada
   */
  private applyDefaultPaymentMethodIfMissing(client: Client): void {
    if (!client.paymentMethod) {
      client.paymentMethod = DEFAULT_PAYMENT_METHOD;
      this.logger.log(
        `Método de pago no informado; se aplica el valor por defecto ${DEFAULT_PAYMENT_METHOD}`,
      );
    }
  }

  /**
   * Rechaza un método de pago distinto de los valores del enum `payment_methods`.
   * @param client - Cliente a validar
   * @returns Nada
   */
  private validatePaymentMethod(client: Client): void {
    if (!isValidPaymentMethod(client.paymentMethod)) {
      this.logger.error(`Método de pago no válido: ${client.paymentMethod}`);
      throw new HttpException(
        'El método de pago debe ser card, cash, bank_transfer o direct_debit',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}