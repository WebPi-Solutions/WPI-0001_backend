jest.mock('src/common/helpers/query-builder/query-builder.service', () => ({
  QueryBuilderService: {
    getCount: jest.fn().mockResolvedValue(0),
    getPaginatedResults: jest.fn().mockResolvedValue({
      items: [],
      total: 0,
      currentPage: 1,
      totalPages: 0,
    }),
  },
}));

import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrderStatus } from 'src/common/enums';
import { QueryBuilderService } from 'src/common/helpers/query-builder/query-builder.service';
import { Order } from './order.entity';
import { OrderRepository } from './order-repository.service';

/**
 * Extrae la HttpException lanzada por una promesa rechazada.
 *
 * @param rejectedPromise - Promesa que debe fallar
 * @returns La excepción HTTP capturada
 */
async function expectHttpException(rejectedPromise: Promise<unknown>): Promise<HttpException> {
  try {
    await rejectedPromise;
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(HttpException);
    return error as HttpException;
  }
  throw new Error('Se esperaba una HttpException');
}

describe('OrderRepository', () => {
  let orderRepositoryService: OrderRepository;
  let typeOrmRepositoryMock: {
    save: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
  };
  const originalTemplatePath = process.env.DROPBOX_TEMPLATE_HTML_FILE_PATH;

  afterEach(() => {
    if (originalTemplatePath === undefined) {
      delete process.env.DROPBOX_TEMPLATE_HTML_FILE_PATH;
      return;
    }
    process.env.DROPBOX_TEMPLATE_HTML_FILE_PATH = originalTemplatePath;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    (QueryBuilderService.getPaginatedResults as jest.Mock).mockResolvedValue({
      items: [],
      total: 0,
      currentPage: 1,
      totalPages: 0,
    });

    typeOrmRepositoryMock = {
      save: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        OrderRepository,
        {
          provide: getRepositoryToken(Order),
          useValue: typeOrmRepositoryMock,
        },
      ],
    }).compile();

    orderRepositoryService = testingModule.get(OrderRepository);
  });

  it('debería estar definido', () => {
    expect(orderRepositoryService).toBeDefined();
  });

  describe('create', () => {
    it('persiste el pedido mediante save', async () => {
      const orderToCreate = { name: 'Pedido', status: OrderStatus.AWAITING_RECEIPT } as Order;
      typeOrmRepositoryMock.save.mockResolvedValue({ id: 'order-uuid', ...orderToCreate });

      const result = await orderRepositoryService.create(orderToCreate);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith(orderToCreate);
      expect(result.id).toBe('order-uuid');
    });
  });

  describe('findAll', () => {
    it('lista pedidos paginados usando QueryBuilderService', async () => {
      const paginatedResponse = {
        items: [],
        total: 0,
        currentPage: 1,
        totalPages: 0,
      };

      const result = await orderRepositoryService.findAll(
        1,
        10,
        'date',
        'DESC',
        { status: OrderStatus.RECEIVED },
        ['client'],
      );

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'salesOrder',
        expect.objectContaining({
          page: 1,
          pageSize: 10,
          sort: 'date',
          order: 'DESC',
          filter: { status: OrderStatus.RECEIVED },
          relations: [
            {
              property: 'client',
              alias: 'client',
              isLeftJoinAndSelect: true,
            },
          ],
        }),
      );
      expect(result).toEqual(paginatedResponse);
    });

    it('lista pedidos con valores por defecto y sin relaciones', async () => {
      await orderRepositoryService.findAll();

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'salesOrder',
        expect.objectContaining({
          page: 1,
          pageSize: 10,
          sort: 'date',
          order: 'DESC',
          filter: {},
          relations: [],
        }),
      );
    });
  });

  describe('findById', () => {
    it('busca un pedido con relaciones', async () => {
      const foundOrder = { id: 'order-uuid', status: OrderStatus.RECEIVED } as Order;
      typeOrmRepositoryMock.findOne.mockResolvedValue(foundOrder);

      const result = await orderRepositoryService.findById('order-uuid', ['client']);

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'order-uuid' },
        relations: ['client'],
      });
      expect(result).toEqual(foundOrder);
    });

    it('busca un pedido sin relaciones opcionales', async () => {
      await orderRepositoryService.findById('order-uuid');

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'order-uuid' },
        relations: undefined,
      });
    });
  });

  describe('getHtmlTemplateFilePath', () => {
    it('resuelve la plantilla HTML de pedidos de la empresa', () => {
      process.env.DROPBOX_TEMPLATE_HTML_FILE_PATH = '//enterprises//:enterpriseId//templates//html//:entityType.html';

      expect(orderRepositoryService.getHtmlTemplateFilePath('enterprise-uuid')).toBe(
        '/enterprises/enterprise-uuid/templates/html/order.html',
      );
    });

    it('lanza 500 si no está configurada la ruta de plantillas', () => {
      delete process.env.DROPBOX_TEMPLATE_HTML_FILE_PATH;

      expect(() => orderRepositoryService.getHtmlTemplateFilePath('enterprise-uuid')).toThrow(
        'No está configurada la ruta de plantillas HTML en el servidor',
      );
    });
  });

  describe('findOneByQuoteId', () => {
    it('busca un pedido vinculado al presupuesto', async () => {
      const foundOrder = { id: 'order-uuid', quoteId: 'quote-uuid' } as Order;
      typeOrmRepositoryMock.findOne.mockResolvedValue(foundOrder);

      const result = await orderRepositoryService.findOneByQuoteId('quote-uuid');

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { quoteId: 'quote-uuid' },
      });
      expect(result).toEqual(foundOrder);
    });
  });

  describe('updateById', () => {
    it('lanza 404 si el pedido no existe', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue(null);

      const thrownError = await expectHttpException(
        orderRepositoryService.updateById('missing-id', {
          status: OrderStatus.RECEIVED,
        } as Order),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(typeOrmRepositoryMock.save).not.toHaveBeenCalled();
    });

    it('lanza 400 si el estado del pedido no es válido', async () => {
      const thrownError = await expectHttpException(
        orderRepositoryService.updateById('order-uuid', {
          status: 'invalid' as OrderStatus,
        } as Order),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(typeOrmRepositoryMock.findOne).not.toHaveBeenCalled();
    });

    it('actualiza el pedido y lo recarga con cliente y presupuesto', async () => {
      const existingOrder = {
        id: 'order-uuid',
        status: OrderStatus.AWAITING_RECEIPT,
        name: 'Antiguo',
      } as Order;
      const payload = {
        status: OrderStatus.RECEIVED,
        name: 'Nuevo',
      } as Order;
      const reloadedOrder = { ...existingOrder, ...payload } as Order;

      typeOrmRepositoryMock.findOne
        .mockResolvedValueOnce(existingOrder)
        .mockResolvedValueOnce(reloadedOrder);
      typeOrmRepositoryMock.save.mockResolvedValue(reloadedOrder);

      const result = await orderRepositoryService.updateById('order-uuid', payload);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith({
        ...existingOrder,
        ...payload,
      });
      expect(typeOrmRepositoryMock.findOne).toHaveBeenLastCalledWith({
        where: { id: 'order-uuid' },
        relations: ['client', 'quote'],
      });
      expect(result).toEqual(reloadedOrder);
    });
  });

  describe('deleteById', () => {
    it('elimina el pedido por identificador', async () => {
      const deleteResult = { affected: 1, raw: [] };
      typeOrmRepositoryMock.delete.mockResolvedValue(deleteResult);

      const result = await orderRepositoryService.deleteById('order-uuid');

      expect(typeOrmRepositoryMock.delete).toHaveBeenCalledWith('order-uuid');
      expect(result).toEqual(deleteResult);
    });
  });
});
