import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrderConceptRepository } from 'src/entities/order-concept/order-concept-repository.service';
import { OrderConcept } from 'src/entities/order-concept/order-concept.entity';
import { OrderRepository } from 'src/entities/order/order-repository.service';
import { Order } from 'src/entities/order/order.entity';
import { OrderStatus } from 'src/common/enums';
import { ItemRepository } from 'src/entities/item/item-repository.service';
import { Item } from 'src/entities/item/item.entity';
import { ItemCategory } from 'src/entities/item-category/item-category.entity';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { OrderConceptService } from './order-concept.service';

describe('OrderConceptService', () => {
  let service: OrderConceptService;
  let orderConceptRepository: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    findMaxPositionByOrderId: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };
  let orderRepository: { findById: jest.Mock };
  let itemRepository: { findById: jest.Mock };
  let enterpriseAccessService: {
    assertCurrentEntityAccessible: jest.Mock;
    mergeRelationNames: (relations: string[] | undefined, required: string[]) => string[];
  };

  const orderConceptId = 'qc-uuid';
  const orderId = 'order-uuid';
  const itemId = 'item-uuid';
  const enterpriseId = 'enterprise-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  /**
   * Construye un pedido de prueba.
   * @param overrides - Campos a sobrescribir
   * @returns Entidad Order simulada
   */
  const buildOrder = (overrides: Partial<Order> = {}): Order =>
    ({
      id: orderId,
      status: OrderStatus.AWAITING_RECEIPT,
      client: { enterpriseId },
      ...overrides,
    }) as Order;

  /**
   * Construye un artículo de prueba.
   * @param overrides - Campos a sobrescribir
   * @returns Entidad Item simulada
   */
  const buildItem = (overrides: Partial<Item> = {}): Item =>
    ({
      id: itemId,
      name: 'Tornillo',
      pricePvp: 1.5,
      ean: '8412345678901',
      itemCategory: { enterpriseId } as ItemCategory,
      ...overrides,
    }) as Item;

  /**
   * Construye una línea de pedido de prueba.
   * @param overrides - Campos a sobrescribir
   * @returns Entidad OrderConcept simulada
   */
  const buildOrderConcept = (overrides: Partial<OrderConcept> = {}): OrderConcept =>
    ({
      id: orderConceptId,
      orderId,
      itemId,
      name: 'Hora de consultoría',
      order: buildOrder(),
      ...overrides,
    }) as OrderConcept;

  beforeEach(async () => {
    orderConceptRepository = {
      create: jest.fn(),
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
      findById: jest.fn(),
      findMaxPositionByOrderId: jest.fn().mockResolvedValue(null),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };
    orderRepository = { findById: jest.fn().mockResolvedValue(buildOrder()) };
    itemRepository = { findById: jest.fn().mockResolvedValue(buildItem()) };
    enterpriseAccessService = {
      assertCurrentEntityAccessible: jest.fn(),
      mergeRelationNames: (relations?: string[], required: string[] = []) =>
        [...new Set([...(relations ?? []), ...required])],
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        OrderConceptService,
        { provide: OrderConceptRepository, useValue: orderConceptRepository },
        { provide: OrderRepository, useValue: orderRepository },
        { provide: ItemRepository, useValue: itemRepository },
        { provide: EnterpriseAccessService, useValue: enterpriseAccessService },
      ],
    }).compile();

    service = testingModule.get(OrderConceptService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('exige un pedido', async () => {
      await expect(
        service.create({ itemId, name: 'Hora' } as OrderConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El concepto debe pertenecer a un pedido',
      });
    });

    it('persiste una línea manual con defaults y posición 0', async () => {
      const created = buildOrderConcept();
      orderConceptRepository.create.mockResolvedValue(created);

      await expect(
        service.create({ orderId, name: '  Hora  ' } as OrderConcept, enterpriseId),
      ).resolves.toEqual(created);

      expect(orderConceptRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId,
          itemId: null,
          position: 0,
          name: 'Hora',
          basePrice: 0,
          vat: 21,
          irpf: 0,
          quantity: 1,
          ean: null,
        }),
      );
    });

    it('lanza 404 si orderId y order.id no coinciden', async () => {
      await expect(
        service.create(
          { orderId, order: { id: 'otra' } as Order, itemId } as OrderConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de pedido no encontrado',
      });
    });

    it('lanza 404 si el pedido no existe', async () => {
      orderRepository.findById.mockResolvedValue(null);

      await expect(
        service.create({ orderId, itemId, name: 'Hora' } as OrderConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de pedido no encontrado',
      });
    });

    it('lanza 404 si el pedido es de otra empresa', async () => {
      orderRepository.findById.mockResolvedValue(
        buildOrder({ client: { enterpriseId: 'otra' } as Order['client'] }),
      );

      await expect(
        service.create({ orderId, itemId, name: 'Hora' } as OrderConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de pedido no encontrado',
      });
    });

    it('propaga 403 si el caller no tiene orders.write', async () => {
      enterpriseAccessService.assertCurrentEntityAccessible.mockImplementation(() => {
        throw new HttpException(
          'No tiene permiso para realizar la acción orders.write',
          HttpStatus.FORBIDDEN,
        );
      });

      await expect(
        service.create({ orderId, itemId, name: 'Hora' } as OrderConcept, enterpriseId),
      ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    });

    it('rechaza mutar un pedido emitido', async () => {
      orderRepository.findById.mockResolvedValue(buildOrder({ status: OrderStatus.RECEIVED }));

      await expect(
        service.create({ orderId, itemId, name: 'Hora' } as OrderConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'No se pueden modificar los conceptos de un pedido que ya no está pendiente de recepción',
      });
    });

    it('rechaza un nombre que no es texto', async () => {
      await expect(
        service.create(
          { orderId, itemId, name: 12 as unknown as string } as OrderConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El nombre del concepto debe ser una cadena de texto',
      });
    });

    it('exige nombre en una línea manual', async () => {
      await expect(
        service.create({ orderId } as OrderConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El concepto debe tener un nombre',
      });
    });

    it('rechaza un nombre vacío', async () => {
      await expect(
        service.create({ orderId, itemId, name: '   ' } as OrderConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El nombre del concepto no puede estar vacío',
      });
    });

    it('acepta el pedido anidado sin orderId escalar', async () => {
      orderConceptRepository.create.mockResolvedValue(buildOrderConcept());

      await service.create(
        { order: { id: orderId } as Order, itemId, name: 'Hora' } as OrderConcept,
        enterpriseId,
      );

      expect(orderRepository.findById).toHaveBeenCalledWith(orderId, ['client']);
    });

    it('instantánea el artículo y usa posición 0', async () => {
      const created = buildOrderConcept();
      orderConceptRepository.create.mockResolvedValue(created);

      await expect(
        service.create({ orderId, itemId } as OrderConcept, enterpriseId),
      ).resolves.toEqual(created);

      expect(orderConceptRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId,
          itemId,
          position: 0,
          name: 'Tornillo',
          basePrice: 1.5,
          vat: 21,
          irpf: 0,
          quantity: 1,
          ean: '8412345678901',
        }),
      );
    });

    it('usa precio 0 si el artículo no tiene PVP', async () => {
      itemRepository.findById.mockResolvedValue(buildItem({ pricePvp: undefined }));
      orderConceptRepository.create.mockResolvedValue(buildOrderConcept());

      await service.create({ orderId, itemId, name: 'Hora' } as OrderConcept, enterpriseId);

      expect(orderConceptRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ basePrice: 0 }),
      );
    });

    it('usa MAX(position)+1 cuando hay líneas previas', async () => {
      orderConceptRepository.findMaxPositionByOrderId.mockResolvedValue(4);
      orderConceptRepository.create.mockResolvedValue(buildOrderConcept());

      await service.create({ orderId, itemId, name: 'Hora' } as OrderConcept, enterpriseId);

      expect(orderConceptRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ position: 5 }),
      );
    });

    it('respeta la posición informada y recorta el EAN', async () => {
      orderConceptRepository.create.mockResolvedValue(buildOrderConcept());

      await service.create(
        {
          orderId,
          itemId,
          name: '  Hora  ',
          position: '2' as unknown as number,
          ean: '  123  ',
          basePrice: null as unknown as number,
          vat: null as unknown as number,
          irpf: null as unknown as number,
          quantity: null as unknown as number,
        } as OrderConcept,
        enterpriseId,
      );

      expect(orderConceptRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          position: 2,
          name: 'Hora',
          ean: '123',
          basePrice: 0,
          vat: 21,
          irpf: 0,
          quantity: 1,
        }),
      );
    });

    it('usa el EAN nulo del catálogo cuando el artículo no lo tiene', async () => {
      itemRepository.findById.mockResolvedValue(buildItem({ ean: null }));
      orderConceptRepository.create.mockResolvedValue(buildOrderConcept());

      await service.create(
        { orderId, item: { id: itemId } as Item } as OrderConcept,
        enterpriseId,
      );

      expect(itemRepository.findById).toHaveBeenCalledWith(itemId, ['itemCategory']);
      expect(orderConceptRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId,
          name: 'Tornillo',
          ean: null,
        }),
      );
    });

    it('persiste ean nulo cuando el cuerpo lo informa explícitamente', async () => {
      orderConceptRepository.create.mockResolvedValue(buildOrderConcept());

      await service.create(
        { orderId, itemId, name: 'Hora', ean: null } as OrderConcept,
        enterpriseId,
      );

      expect(orderConceptRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ ean: null }),
      );
    });

    it('propaga 403 si el caller no puede escribir el artículo vinculado', async () => {
      enterpriseAccessService.assertCurrentEntityAccessible
        .mockImplementationOnce(() => undefined)
        .mockImplementationOnce(() => {
          throw new HttpException(
            'No tiene permiso para realizar la acción orders.write',
            HttpStatus.FORBIDDEN,
          );
        });

      await expect(
        service.create({ orderId, itemId, name: 'X' } as OrderConcept, enterpriseId),
      ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    });

    it('lanza 404 si el artículo no existe', async () => {
      itemRepository.findById.mockResolvedValue(null);

      await expect(
        service.create({ orderId, itemId, name: 'X' } as OrderConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de pedido no encontrado',
      });
    });

    it('lanza 404 si itemId e item.id no coinciden', async () => {
      await expect(
        service.create(
          { orderId, itemId, item: { id: 'otro' } as Item, name: 'X' } as OrderConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de pedido no encontrado',
      });
    });

    it('lanza 404 si el artículo es de otra empresa', async () => {
      itemRepository.findById.mockResolvedValue(
        buildItem({ itemCategory: { enterpriseId: 'otra' } as ItemCategory }),
      );

      await expect(
        service.create({ orderId, itemId, name: 'X' } as OrderConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de pedido no encontrado',
      });
    });

    it('rechaza un precio que no es convertible a número', async () => {
      await expect(
        service.create(
          { orderId, itemId, name: 'Hora', basePrice: '  ' as unknown as number } as OrderConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        message: 'El precio base debe ser un número mayor o igual que 0',
      });
    });

    it('rechaza precio, enteros, suplido y EAN inválidos', async () => {
      await expect(
        service.create(
          { orderId, itemId, name: 'Hora', basePrice: -1 } as OrderConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        message: 'El precio base debe ser un número mayor o igual que 0',
      });
      await expect(
        service.create(
          { orderId, itemId, name: 'Hora', vat: 'x' as unknown as number } as OrderConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        message: 'El IVA debe ser un número entero mayor o igual que 0',
      });
      await expect(
        service.create(
          {
            orderId,
            itemId,
            name: 'Hora',
            quantity: Number.POSITIVE_INFINITY,
          } as OrderConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        message: 'La cantidad debe ser un número entero mayor o igual que 0',
      });
      await expect(
        service.create(
          { orderId, itemId, name: 'Hora', irpf: true as unknown as number } as OrderConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        message: 'El IRPF debe ser un número entero mayor o igual que 0',
      });
      await expect(
        service.create(
          { orderId, itemId, name: 'Hora', ean: 1 as unknown as string } as OrderConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        message: 'El código EAN debe ser una cadena de texto',
      });
    });

    it('propaga el error del repositorio', async () => {
      const unexpectedError = new Error('db');
      orderConceptRepository.create.mockRejectedValue(unexpectedError);

      await expect(
        service.create({ orderId, itemId, name: 'Hora' } as OrderConcept, enterpriseId),
      ).rejects.toBe(unexpectedError);
    });
  });

  describe('findAll', () => {
    it('delega al repositorio', async () => {
      await expect(
        service.findAll(1, 10, 'position', 'ASC', { 'client.enterpriseId': enterpriseId }, [
          'order',
        ]),
      ).resolves.toEqual(emptyPaginatedResponse);
    });
  });

  describe('findById', () => {
    it('devuelve la línea', async () => {
      const existing = buildOrderConcept();
      orderConceptRepository.findById.mockResolvedValue(existing);

      await expect(service.findById(orderConceptId, ['item'])).resolves.toEqual(existing);
      expect(orderConceptRepository.findById).toHaveBeenCalledWith(orderConceptId, [
        'item',
        'order',
        'order.client',
      ]);
    });

    it('lanza 404 si no existe', async () => {
      orderConceptRepository.findById.mockResolvedValue(null);

      await expect(service.findById(orderConceptId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de pedido no encontrado',
      });
    });
  });

  describe('updateById', () => {
    it('lanza 404 si no existe', async () => {
      orderConceptRepository.findById.mockResolvedValue(null);

      await expect(
        service.updateById(orderConceptId, { name: 'X' } as OrderConcept),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de pedido no encontrado',
      });
    });

    it('rechaza mutar un pedido emitido', async () => {
      orderConceptRepository.findById.mockResolvedValue(
        buildOrderConcept({ order: buildOrder({ status: OrderStatus.RECEIVED }) }),
      );

      await expect(
        service.updateById(orderConceptId, { name: 'X' } as OrderConcept),
      ).rejects.toMatchObject({
        message: 'No se pueden modificar los conceptos de un pedido que ya no está pendiente de recepción',
      });
    });

    it('congela orderId, desvincula el artículo y actualiza campos', async () => {
      orderConceptRepository.findById.mockResolvedValue(buildOrderConcept({ itemId }));
      orderConceptRepository.updateById.mockResolvedValue(buildOrderConcept());

      await service.updateById(orderConceptId, {
        orderId: 'hackeada',
        itemId: null,
        name: 'Nuevo',
        position: 3,
        basePrice: '8.5' as unknown as number,
        ean: '   ',
      } as OrderConcept);

      expect(orderConceptRepository.updateById).toHaveBeenCalledWith(
        orderConceptId,
        expect.objectContaining({
          itemId: null,
          name: 'Nuevo',
          position: 3,
          basePrice: 8.5,
          ean: null,
        }),
      );
      expect(orderConceptRepository.updateById.mock.calls[0][1].orderId).toBeUndefined();
    });

    it('vincula un artículo en la actualización sin tocar campos omitidos', async () => {
      orderConceptRepository.findById.mockResolvedValue(buildOrderConcept());
      orderConceptRepository.updateById.mockResolvedValue(buildOrderConcept());

      await service.updateById(orderConceptId, { itemId } as OrderConcept);

      expect(orderConceptRepository.updateById).toHaveBeenCalledWith(
        orderConceptId,
        expect.objectContaining({ itemId }),
      );
      expect(orderConceptRepository.updateById.mock.calls[0][1].name).toBeUndefined();
    });

    it('conserva el itemId existente cuando el cuerpo no lo toca', async () => {
      orderConceptRepository.findById.mockResolvedValue(buildOrderConcept({ itemId }));
      orderConceptRepository.updateById.mockResolvedValue(buildOrderConcept());

      await service.updateById(orderConceptId, { name: 'Solo nombre' } as OrderConcept);

      expect(itemRepository.findById).not.toHaveBeenCalled();
      expect(orderConceptRepository.updateById.mock.calls[0][1].itemId).toBeUndefined();
    });

    it('conserva el itemId si el cuerpo trae un item vacío', async () => {
      orderConceptRepository.findById.mockResolvedValue(buildOrderConcept({ itemId }));
      orderConceptRepository.updateById.mockResolvedValue(buildOrderConcept());

      await service.updateById(orderConceptId, {
        item: {} as Item,
        vat: 10,
        irpf: 5,
        quantity: 2,
      } as OrderConcept);

      expect(orderConceptRepository.updateById).toHaveBeenCalledWith(
        orderConceptId,
        expect.objectContaining({
          itemId,
          vat: 10,
          irpf: 5,
          quantity: 2,
        }),
      );
    });

    it('propaga el error del repositorio', async () => {
      const unexpectedError = new Error('db');
      orderConceptRepository.findById.mockResolvedValue(buildOrderConcept());
      orderConceptRepository.updateById.mockRejectedValue(unexpectedError);

      await expect(
        service.updateById(orderConceptId, { name: 'X' } as OrderConcept),
      ).rejects.toBe(unexpectedError);
    });
  });

  describe('deleteById', () => {
    it('lanza 404 si no existe', async () => {
      orderConceptRepository.findById.mockResolvedValue(null);

      await expect(service.deleteById(orderConceptId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });

    it('rechaza borrar líneas de un pedido emitido', async () => {
      orderConceptRepository.findById.mockResolvedValue(
        buildOrderConcept({ order: buildOrder({ status: OrderStatus.RECEIVED }) }),
      );

      await expect(service.deleteById(orderConceptId)).rejects.toMatchObject({
        message: 'No se pueden modificar los conceptos de un pedido que ya no está pendiente de recepción',
      });
    });

    it('elimina la línea', async () => {
      orderConceptRepository.findById.mockResolvedValue(buildOrderConcept());
      orderConceptRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.deleteById(orderConceptId)).resolves.toEqual({
        affected: 1,
        raw: [],
      });
    });

    it('propaga el error del repositorio', async () => {
      const unexpectedError = new Error('db');
      orderConceptRepository.findById.mockResolvedValue(buildOrderConcept());
      orderConceptRepository.deleteById.mockRejectedValue(unexpectedError);

      await expect(service.deleteById(orderConceptId)).rejects.toBe(unexpectedError);
    });
  });
});
