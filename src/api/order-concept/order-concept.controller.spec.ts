import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrderConcept } from 'src/entities/order-concept/order-concept.entity';
import { OrderConceptController } from './order-concept.controller';
import { OrderConceptService } from './order-concept.service';

describe('OrderConceptController', () => {
  let controller: OrderConceptController;
  let orderConceptService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const orderConceptId = 'ic-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  beforeEach(async () => {
    orderConceptService = {
      create: jest.fn().mockResolvedValue({ id: orderConceptId }),
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [OrderConceptController],
      providers: [{ provide: OrderConceptService, useValue: orderConceptService }],
    }).compile();

    controller = testingModule.get(OrderConceptController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('exige enterpriseId', async () => {
      await expect(
        controller.create('', { name: 'Hora', orderId: 'order' } as OrderConcept),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
    });

    it('delega al servicio', async () => {
      const payload = { name: 'Hora', orderId: 'order' } as OrderConcept;

      await expect(controller.create(enterpriseId, payload)).resolves.toEqual({
        id: orderConceptId,
      });
      expect(orderConceptService.create).toHaveBeenCalledWith(payload, enterpriseId);
    });
  });

  describe('findAll', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findAll('')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
    });

    it('parsea el filtro y fuerza el tenant vía client.enterpriseId', async () => {
      await controller.findAll(
        enterpriseId,
        2,
        20,
        'name',
        'DESC',
        JSON.stringify({ 'client.enterpriseId': 'atacante', orderId: 'order' }),
        'order,item',
      );

      expect(orderConceptService.findAll).toHaveBeenCalledWith(
        2,
        20,
        'name',
        'DESC',
        { orderId: 'order', 'client.enterpriseId': enterpriseId },
        ['order', 'item', 'order.client'],
      );
    });

    it('añade order y order.client si no se piden', async () => {
      await controller.findAll(enterpriseId);

      expect(orderConceptService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'position',
        'ASC',
        { 'client.enterpriseId': enterpriseId },
        ['order', 'order.client'],
      );
    });

    it('conserva el tenant si el filtro JSON es inválido', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await controller.findAll(enterpriseId, 1, 10, 'position', 'ASC', '{no-es-json');

      expect(console.error).toHaveBeenCalled();
      expect(orderConceptService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'position',
        'ASC',
        { 'client.enterpriseId': enterpriseId },
        ['order', 'order.client'],
      );
    });
  });

  describe('findById', () => {
    it('parsea relaciones', async () => {
      orderConceptService.findById.mockResolvedValue({ id: orderConceptId });

      await expect(controller.findById(orderConceptId, 'item')).resolves.toEqual({
        id: orderConceptId,
      });
      expect(orderConceptService.findById).toHaveBeenCalledWith(orderConceptId, [
        'item',
      ]);
    });

    it('busca sin relaciones cuando no se informan', async () => {
      orderConceptService.findById.mockResolvedValue({ id: orderConceptId });

      await controller.findById(orderConceptId);

      expect(orderConceptService.findById).toHaveBeenCalledWith(orderConceptId, []);
    });
  });

  describe('updateById', () => {
    it('delega al servicio', async () => {
      const payload = { name: 'Nuevo' } as OrderConcept;
      orderConceptService.updateById.mockResolvedValue({ id: orderConceptId, ...payload });

      await expect(controller.updateById(orderConceptId, payload)).resolves.toEqual({
        id: orderConceptId,
        name: 'Nuevo',
      });
    });
  });

  describe('delete', () => {
    it('delega al servicio', async () => {
      orderConceptService.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(controller.delete(orderConceptId)).resolves.toEqual({
        affected: 1,
        raw: [],
      });
    });
  });
});
