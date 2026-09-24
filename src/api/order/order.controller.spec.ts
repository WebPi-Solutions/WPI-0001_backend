import { Logger } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus } from 'src/common/enums';
import { Order } from 'src/entities/order/order.entity';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

describe('OrderController', () => {
  let controller: OrderController;
  let orderService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    updateStatusById: jest.Mock;
    deleteById: jest.Mock;
    downloadDocumentById: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const orderId = 'order-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  beforeEach(async () => {
    orderService = {
      create: jest.fn().mockResolvedValue({ id: orderId }),
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
      findById: jest.fn(),
      updateById: jest.fn(),
      updateStatusById: jest.fn(),
      deleteById: jest.fn(),
      downloadDocumentById: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [{ provide: OrderService, useValue: orderService }],
    }).compile();

    controller = testingModule.get(OrderController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('delega la creación al servicio', async () => {
      const order = { name: 'Pedido Demo' } as Order;

      await expect(controller.create(order)).resolves.toEqual({ id: orderId });
      expect(orderService.create).toHaveBeenCalledWith(order);
    });
  });

  describe('findAll', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findAll('')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(orderService.findAll).not.toHaveBeenCalled();
    });

    it('parsea el filtro JSON y fuerza client.enterpriseId', async () => {
      await controller.findAll(
        enterpriseId,
        2,
        25,
        'date',
        'ASC',
        JSON.stringify({ 'client.enterpriseId': 'empresa-atacante', status: 'received' }),
        'client',
      );

      expect(orderService.findAll).toHaveBeenCalledWith(
        2,
        25,
        'date',
        'ASC',
        { status: 'received', 'client.enterpriseId': enterpriseId },
        ['client'],
      );
    });

    it('conserva client.enterpriseId si el filtro JSON es inválido', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await controller.findAll(enterpriseId, 1, 10, 'date', 'DESC', '{no-es-json');

      expect(Logger.prototype.error).toHaveBeenCalled();
      expect(orderService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'date',
        'DESC',
        { 'client.enterpriseId': enterpriseId },
        ['client'],
      );
    });

    it('usa valores por defecto al omitir query opcionales', async () => {
      await controller.findAll(enterpriseId);

      expect(orderService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'date',
        'DESC',
        { 'client.enterpriseId': enterpriseId },
        ['client'],
      );
    });
  });

  describe('findById', () => {
    it('delega al servicio parseando las relaciones', async () => {
      orderService.findById.mockResolvedValue({ id: orderId });

      await expect(controller.findById(orderId, 'client,quote')).resolves.toEqual({
        id: orderId,
      });
      expect(orderService.findById).toHaveBeenCalledWith(orderId, ['client', 'quote']);
    });

    it('busca sin relaciones cuando no se informan', async () => {
      orderService.findById.mockResolvedValue({ id: orderId });

      await controller.findById(orderId);

      expect(orderService.findById).toHaveBeenCalledWith(orderId, []);
    });
  });

  describe('downloadDocumentById', () => {
    it('delega la descarga del PDF en el servicio', async () => {
      const response = {};

      await controller.downloadDocumentById(orderId, response as never);

      expect(orderService.downloadDocumentById).toHaveBeenCalledWith(orderId, response);
    });
  });

  describe('updateById', () => {
    it('delega la actualización al servicio', async () => {
      const payload = { name: 'Pedido Actualizado' } as Order;
      orderService.updateById.mockResolvedValue({ id: orderId, ...payload });

      await expect(controller.updateById(orderId, payload)).resolves.toEqual({
        id: orderId,
        name: 'Pedido Actualizado',
      });
      expect(orderService.updateById).toHaveBeenCalledWith(orderId, payload);
    });
  });

  describe('updateStatusById', () => {
    it('delega el cambio de estado al servicio', async () => {
      orderService.updateStatusById.mockResolvedValue({
        id: orderId,
        status: OrderStatus.RECEIVED,
      });

      await expect(controller.updateStatusById(orderId, OrderStatus.RECEIVED)).resolves.toEqual({
        id: orderId,
        status: OrderStatus.RECEIVED,
      });
      expect(orderService.updateStatusById).toHaveBeenCalledWith(orderId, OrderStatus.RECEIVED);
    });
  });

  describe('delete', () => {
    it('delega la eliminación al servicio', async () => {
      orderService.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(controller.delete(orderId)).resolves.toEqual({ affected: 1, raw: [] });
      expect(orderService.deleteById).toHaveBeenCalledWith(orderId);
    });
  });
});
