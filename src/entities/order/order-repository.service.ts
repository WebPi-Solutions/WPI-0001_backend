import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeleteResult, Repository } from 'typeorm';
import { isValidOrderStatus } from 'src/common/enums';
import { QueryBuilderService, QueryFilterOptions } from 'src/common/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { Order } from './order.entity';

/**
 * Persistencia TypeORM de pedidos.
 */
@Injectable()
export class OrderRepository {
  private readonly logger = new Logger(OrderRepository.name);

  constructor(
    @InjectRepository(Order) private readonly orderTypeOrmRepository: Repository<Order>,
  ) {}

  /**
   * Crea un nuevo pedido.
   *
   * @param order - Pedido a persistir
   * @returns El pedido creado
   */
  create(order: Order): Promise<Order> {
    return this.orderTypeOrmRepository.save(order);
  }

  /**
   * Obtiene pedidos paginados con filtros, ordenación y relaciones.
   *
   * @param page - Número de página
   * @param pageSize - Tamaño de página
   * @param sort - Campo por el que ordenar
   * @param orderDirection - Dirección de ordenación
   * @param filter - Filtros a aplicar
   * @param relations - Relaciones a incluir
   * @returns Respuesta paginada con los pedidos
   */
  findAll(
    page: number = 1,
    pageSize: number = 10,
    sort: string = 'date',
    orderDirection: 'ASC' | 'DESC' = 'DESC',
    filter: Record<string, any> = {},
    relations?: string[],
  ): Promise<PaginatedResponse<Order>> {
    const options: QueryFilterOptions = {
      page,
      pageSize,
      sort,
      order: orderDirection,
      filter,
      relations: (relations || []).map((relation) => ({
        property: relation,
        alias: relation,
        isLeftJoinAndSelect: true,
      })),
    };

    return QueryBuilderService.getPaginatedResults(
      this.orderTypeOrmRepository,
      'salesOrder',
      options,
    );
  }

  /**
   * Obtiene un pedido por su identificador.
   *
   * @param id - UUID del pedido
   * @param relations - Relaciones a incluir
   * @returns El pedido si existe; `null` en caso contrario
   */
  findById(id: string, relations?: string[]): Promise<Order> {
    return this.orderTypeOrmRepository.findOne({ where: { id }, relations });
  }

  /**
   * Comprueba si existe un pedido asociado a un presupuesto.
   *
   * @param quoteId Identificador del presupuesto
   * @returns El primer pedido vinculado o `null` si no existe ninguno
   */
  findOneByQuoteId(quoteId: string): Promise<Order | null> {
    return this.orderTypeOrmRepository.findOne({ where: { quoteId } });
  }

  /**
   * Actualiza un pedido existente por su identificador.
   *
   * @param id - UUID del pedido
   * @param order - Datos a fusionar
   * @returns El pedido actualizado con cliente y presupuesto
   */
  async updateById(id: string, order: Order): Promise<Order> {
    this.verifyOrderStatus(order);

    const orderToUpdate = await this.orderTypeOrmRepository.findOne({ where: { id } });
    if (!orderToUpdate) {
      throw new HttpException('Pedido no encontrado', HttpStatus.NOT_FOUND);
    }

    await this.orderTypeOrmRepository.save({ ...orderToUpdate, ...order });
    return this.findById(id, ['client', 'quote']);
  }

  /**
   * Elimina un pedido por su identificador.
   *
   * @param id - UUID del pedido
   * @returns Resultado de la operación de eliminación
   */
  deleteById(id: string): Promise<DeleteResult> {
    return this.orderTypeOrmRepository.delete(id);
  }

  /**
   * Comprueba que el estado pertenece al enumerado `order_status`.
   *
   * @param order - Pedido a validar
   */
  private verifyOrderStatus(order: Order): void {
    if (!isValidOrderStatus(order.status)) {
      this.logger.error(`El estado del pedido no es válido: ${order.status}`);
      throw new HttpException(
        `El estado del pedido no es válido: ${order.status}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
