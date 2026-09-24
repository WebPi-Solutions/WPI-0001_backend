import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus } from 'src/common/enums';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { ClientRepository } from 'src/entities/client/client-repository.service';
import { Client } from 'src/entities/client/client.entity';
import { EnterpriseRepository } from 'src/entities/enterprise/enterprise-repository.service';
import { Enterprise } from 'src/entities/enterprise/enterprise.entity';
import { OrderRepository } from 'src/entities/order/order-repository.service';
import { Order } from 'src/entities/order/order.entity';
import { QuoteRepository } from 'src/entities/quote/quote-repository.service';
import { Quote } from 'src/entities/quote/quote.entity';
import { HtmlPdfService } from 'src/services/html-pdf/html-pdf.service';
import { OrderService } from './order.service';

describe('OrderService', () => {
  let service: OrderService;
  let orderRepository: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
    getHtmlTemplateFilePath: jest.Mock;
  };
  let clientRepository: { findById: jest.Mock };
  let quoteRepository: { findById: jest.Mock };
  let enterpriseRepository: { findById: jest.Mock };
  let htmlPdfService: { generateOrderPdf: jest.Mock };

  const orderId = 'order-uuid';
  const clientId = 'client-uuid';
  const quoteId = 'quote-uuid';
  const enterpriseId = 'enterprise-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  /**
   * Construye un pedido de prueba.
   *
   * @param overrides - Campos a sobrescribir
   * @returns Entidad Order simulada
   */
  const buildOrder = (overrides: Partial<Order> = {}): Order =>
    ({
      id: orderId,
      clientId,
      quoteId,
      name: 'Pedido Demo',
      date: new Date('2026-03-01'),
      status: OrderStatus.AWAITING_RECEIPT,
      ...overrides,
    }) as Order;

  /**
   * Construye un cliente de prueba.
   *
   * @param overrides - Campos a sobrescribir
   * @returns Entidad Client simulada
   */
  const buildClient = (overrides: Partial<Client> = {}): Client =>
    ({
      id: clientId,
      enterpriseId,
      name: 'Cliente Demo',
      nif: 'B12345678',
      address: 'Calle Cliente 1',
      ...overrides,
    }) as Client;

  /**
   * Construye un presupuesto de prueba del cliente canónico.
   *
   * @param overrides - Campos a sobrescribir
   * @returns Entidad Quote simulada
   */
  const buildQuote = (overrides: Partial<Quote> = {}): Quote =>
    ({
      id: quoteId,
      clientId,
      client: buildClient(),
      ...overrides,
    }) as Quote;

  /**
   * Construye una empresa de prueba.
   *
   * @param overrides - Campos a sobrescribir
   * @returns Entidad Enterprise simulada
   */
  const buildEnterprise = (overrides: Partial<Enterprise> = {}): Enterprise =>
    ({
      id: enterpriseId,
      name: 'Empresa Demo',
      nif: 'A87654321',
      address: 'Calle Emisor 9',
      ...overrides,
    }) as Enterprise;

  /**
   * Prepara cliente, presupuesto y empresa para un alta o edición válida.
   */
  const mockAccessibleSources = (): void => {
    clientRepository.findById.mockResolvedValue(buildClient());
    quoteRepository.findById.mockResolvedValue(buildQuote());
    enterpriseRepository.findById.mockResolvedValue(buildEnterprise());
  };

  beforeEach(async () => {
    orderRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
      getHtmlTemplateFilePath: jest.fn().mockReturnValue('/plantillas/order.html'),
    };
    clientRepository = { findById: jest.fn() };
    quoteRepository = { findById: jest.fn() };
    enterpriseRepository = { findById: jest.fn() };
    htmlPdfService = { generateOrderPdf: jest.fn().mockResolvedValue(Buffer.from('documento')) };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: OrderRepository, useValue: orderRepository },
        { provide: ClientRepository, useValue: clientRepository },
        { provide: QuoteRepository, useValue: quoteRepository },
        { provide: EnterpriseRepository, useValue: enterpriseRepository },
        { provide: HtmlPdfService, useValue: htmlPdfService },
        {
          provide: EnterpriseAccessService,
          useValue: {
            assertCurrentEntityAccessible: jest.fn(),
            mergeRelationNames: (relations?: string[], required: string[] = []) =>
              [...new Set([...(relations ?? []), ...required])],
          },
        },
      ],
    }).compile();

    service = testingModule.get(OrderService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('rechaza clientes de empresas distintas en el mismo payload', async () => {
      clientRepository.findById
        .mockResolvedValueOnce(buildClient({ enterpriseId }))
        .mockResolvedValueOnce(buildClient({ id: 'otro-cliente', enterpriseId: 'otra-empresa' }));

      await expect(
        service.create(
          buildOrder({
            clientId,
            client: { id: 'otro-cliente' } as Order['client'],
          }),
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Pedido no encontrado',
      });
      expect(orderRepository.create).not.toHaveBeenCalled();
    });

    it('lanza 400 si falta clientId', async () => {
      await expect(service.create(buildOrder({ clientId: undefined }))).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El pedido debe tener un cliente',
      });
      expect(orderRepository.create).not.toHaveBeenCalled();
    });

    it('lanza 400 si falta quoteId', async () => {
      clientRepository.findById.mockResolvedValue(buildClient());

      await expect(service.create(buildOrder({ quoteId: undefined }))).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El pedido debe tener un presupuesto',
      });
      expect(orderRepository.create).not.toHaveBeenCalled();
    });

    it('lanza 404 si el cliente no existe', async () => {
      clientRepository.findById.mockResolvedValue(null);

      await expect(service.create(buildOrder())).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: `Cliente no encontrado con ID: ${clientId}`,
      });
    });

    it('lanza 404 si el presupuesto no existe', async () => {
      clientRepository.findById.mockResolvedValue(buildClient());
      quoteRepository.findById.mockResolvedValue(null);

      await expect(service.create(buildOrder())).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: `Presupuesto no encontrado con ID: ${quoteId}`,
      });
    });

    it('lanza 400 si el presupuesto pertenece a otro cliente', async () => {
      clientRepository.findById.mockResolvedValue(buildClient());
      quoteRepository.findById.mockResolvedValue(
        buildQuote({
          clientId: 'otro-cliente',
          client: buildClient({ id: 'otro-cliente' }),
        }),
      );

      await expect(service.create(buildOrder())).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El presupuesto no pertenece al cliente del pedido',
      });
    });

    it('copia datos persistentes y usa el estado por defecto si el recibido no es válido', async () => {
      mockAccessibleSources();
      orderRepository.create.mockImplementation(async (order: Order) => order);

      const createdOrder = await service.create(
        buildOrder({
          status: 'draft' as OrderStatus,
          orderConcepts: [{ name: 'Ignorada' }] as Order['orderConcepts'],
        }),
      );

      expect(createdOrder.status).toBe(OrderStatus.AWAITING_RECEIPT);
      expect(createdOrder.clientName).toBe('Cliente Demo');
      expect(createdOrder.issuerName).toBe('Empresa Demo');
      expect(orderRepository.create.mock.calls[0][0]).not.toHaveProperty('orderConcepts');
    });

    it('conserva el estado informado cuando es válido', async () => {
      mockAccessibleSources();
      orderRepository.create.mockImplementation(async (order: Order) => order);

      const createdOrder = await service.create(buildOrder({ status: OrderStatus.RECEIVED }));

      expect(createdOrder.status).toBe(OrderStatus.RECEIVED);
    });

    it('lanza 404 si la empresa del cliente no existe al copiar datos persistentes', async () => {
      clientRepository.findById.mockResolvedValue(buildClient());
      quoteRepository.findById.mockResolvedValue(buildQuote());
      enterpriseRepository.findById.mockResolvedValue(null);

      await expect(service.create(buildOrder())).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: `Empresa no encontrada con ID: ${enterpriseId}`,
      });
    });

    it('relanza el error del repositorio', async () => {
      mockAccessibleSources();
      const repositoryError = new Error('fallo al persistir');
      orderRepository.create.mockRejectedValue(repositoryError);

      await expect(service.create(buildOrder())).rejects.toBe(repositoryError);
    });
  });

  describe('findAll', () => {
    it('delega la consulta paginada al repositorio', async () => {
      orderRepository.findAll.mockResolvedValue(emptyPaginatedResponse);
      const filter = { 'client.enterpriseId': enterpriseId };

      await expect(
        service.findAll(1, 10, 'date', 'DESC', filter, ['client']),
      ).resolves.toEqual(emptyPaginatedResponse);
      expect(orderRepository.findAll).toHaveBeenCalledWith(1, 10, 'date', 'DESC', filter, [
        'client',
      ]);
    });
  });

  describe('findById', () => {
    it('devuelve el pedido cuando existe', async () => {
      const existingOrder = buildOrder({ client: buildClient() });
      orderRepository.findById.mockResolvedValue(existingOrder);

      await expect(service.findById(orderId, ['client'])).resolves.toEqual(existingOrder);
      expect(orderRepository.findById).toHaveBeenCalledWith(orderId, ['client', 'orderConcepts']);
    });

    it('lanza 404 si el pedido no existe', async () => {
      orderRepository.findById.mockResolvedValue(null);

      await expect(service.findById(orderId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: `Pedido con ID: ${orderId} no encontrado`,
      });
    });
  });

  describe('downloadDocumentById', () => {
    it('genera y adjunta el PDF del pedido con la plantilla HTML de su empresa', async () => {
      const order = buildOrder({ client: buildClient(), orderConcepts: [] });
      const enterprise = buildEnterprise();
      const response = { set: jest.fn(), send: jest.fn() };
      orderRepository.findById.mockResolvedValue(order);
      enterpriseRepository.findById.mockResolvedValue(enterprise);

      await service.downloadDocumentById(orderId, response as never);

      expect(orderRepository.findById).toHaveBeenCalledWith(orderId, ['client', 'orderConcepts']);
      expect(orderRepository.getHtmlTemplateFilePath).toHaveBeenCalledWith(enterpriseId);
      expect(htmlPdfService.generateOrderPdf).toHaveBeenCalledWith(
        '/plantillas/order.html',
        order,
        enterprise,
      );
      expect(response.set).toHaveBeenCalledWith(expect.objectContaining({
        'Content-Disposition': expect.stringContaining('Pedido_Demo.pdf'),
        'Content-Length': '9',
      }));
      expect(response.send).toHaveBeenCalledWith(Buffer.from('documento'));
    });

    it('lanza 404 si el pedido no existe', async () => {
      orderRepository.findById.mockResolvedValue(null);

      await expect(
        service.downloadDocumentById(orderId, { set: jest.fn(), send: jest.fn() } as never),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: `Pedido con ID: ${orderId} no encontrado`,
      });
      expect(htmlPdfService.generateOrderPdf).not.toHaveBeenCalled();
    });

    it('lanza 404 si no se encuentra la empresa del pedido', async () => {
      orderRepository.findById.mockResolvedValue(buildOrder({ client: buildClient() }));
      enterpriseRepository.findById.mockResolvedValue(null);

      await expect(
        service.downloadDocumentById(orderId, { set: jest.fn(), send: jest.fn() } as never),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Pedido no encontrado',
      });
      expect(htmlPdfService.generateOrderPdf).not.toHaveBeenCalled();
    });

    it('propaga el error al completar la plantilla', async () => {
      const templateError = new Error('plantilla no disponible');
      orderRepository.findById.mockResolvedValue(buildOrder({ client: buildClient() }));
      enterpriseRepository.findById.mockResolvedValue(buildEnterprise());
      htmlPdfService.generateOrderPdf.mockRejectedValue(templateError);

      await expect(
        service.downloadDocumentById(orderId, { set: jest.fn(), send: jest.fn() } as never),
      ).rejects.toBe(templateError);
    });

    it('usa el nombre de archivo por defecto si el pedido no tiene nombre', async () => {
      const response = { set: jest.fn(), send: jest.fn() };
      orderRepository.findById.mockResolvedValue(buildOrder({ client: buildClient(), name: null }));
      enterpriseRepository.findById.mockResolvedValue(buildEnterprise());

      await service.downloadDocumentById(orderId, response as never);

      expect(response.set).toHaveBeenCalledWith(expect.objectContaining({
        'Content-Disposition': expect.stringContaining('pedido.pdf'),
      }));
    });

    it('usa el nombre de archivo por defecto si el nombre se vacía al sanearlo', async () => {
      const response = { set: jest.fn(), send: jest.fn() };
      orderRepository.findById.mockResolvedValue(buildOrder({ client: buildClient(), name: '' }));
      enterpriseRepository.findById.mockResolvedValue(buildEnterprise());

      await service.downloadDocumentById(orderId, response as never);

      expect(response.set).toHaveBeenCalledWith(expect.objectContaining({
        'Content-Disposition': expect.stringContaining('pedido.pdf'),
      }));
    });
  });

  describe('updateById', () => {
    it('lanza 404 si el pedido no existe', async () => {
      orderRepository.findById.mockResolvedValue(null);

      await expect(service.updateById(orderId, buildOrder())).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Pedido no encontrado',
      });
      expect(orderRepository.updateById).not.toHaveBeenCalled();
    });

    it('fusiona el payload, revalida FKs y persiste', async () => {
      mockAccessibleSources();
      const existingOrder = buildOrder({ client: buildClient() });
      const updatedOrder = buildOrder({ name: 'Nuevo' });
      orderRepository.findById.mockResolvedValue(existingOrder);
      orderRepository.updateById.mockResolvedValue(updatedOrder);

      await expect(service.updateById(orderId, { name: 'Nuevo' } as Order)).resolves.toEqual(
        updatedOrder,
      );
      expect(orderRepository.updateById).toHaveBeenCalledWith(
        orderId,
        expect.objectContaining({
          id: orderId,
          name: 'Nuevo',
          clientName: 'Cliente Demo',
          issuerName: 'Empresa Demo',
        }),
      );
    });

    it('propaga el error del repositorio al actualizar', async () => {
      mockAccessibleSources();
      const persistenceError = new Error('fallo al persistir el pedido');
      orderRepository.findById.mockResolvedValue(buildOrder({ client: buildClient() }));
      orderRepository.updateById.mockRejectedValue(persistenceError);

      await expect(service.updateById(orderId, { name: 'Actualizado' } as Order)).rejects.toBe(
        persistenceError,
      );
    });
  });

  describe('updateStatusById', () => {
    it('rechaza un estado que no pertenece al enumerado', async () => {
      await expect(
        service.updateStatusById(orderId, 'invalido' as OrderStatus),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El estado del pedido no es válido: invalido',
      });
      expect(orderRepository.findById).not.toHaveBeenCalled();
    });

    it('lanza 404 si el pedido no existe', async () => {
      orderRepository.findById.mockResolvedValue(null);

      await expect(service.updateStatusById(orderId, OrderStatus.RECEIVED)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: `Pedido no encontrado con ID: ${orderId}`,
      });
    });

    it('actualiza el estado cuando el pedido existe', async () => {
      const existingOrder = buildOrder({ client: buildClient() });
      orderRepository.findById.mockResolvedValue(existingOrder);
      orderRepository.updateById.mockResolvedValue({
        ...existingOrder,
        status: OrderStatus.RECEIVED,
      });

      await expect(service.updateStatusById(orderId, OrderStatus.RECEIVED)).resolves.toEqual(
        expect.objectContaining({ status: OrderStatus.RECEIVED }),
      );
      expect(orderRepository.updateById).toHaveBeenCalledWith(orderId, {
        ...existingOrder,
        status: OrderStatus.RECEIVED,
      });
    });
  });

  describe('deleteById', () => {
    it('lanza 404 si el pedido no existe', async () => {
      orderRepository.findById.mockResolvedValue(null);

      await expect(service.deleteById(orderId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: `Pedido con ID ${orderId} no encontrado`,
      });
      expect(orderRepository.deleteById).not.toHaveBeenCalled();
    });

    it('impide eliminar un pedido que ya no está pendiente de recepción', async () => {
      orderRepository.findById.mockResolvedValue(
        buildOrder({ status: OrderStatus.RECEIVED, client: buildClient() }),
      );

      await expect(service.deleteById(orderId)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: `No se puede eliminar el pedido ${orderId} porque ya no está pendiente de recepción`,
      });
      expect(orderRepository.deleteById).not.toHaveBeenCalled();
    });

    it('elimina un pedido pendiente de recepción', async () => {
      orderRepository.findById.mockResolvedValue(buildOrder({ client: buildClient() }));
      orderRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.deleteById(orderId)).resolves.toEqual({ affected: 1, raw: [] });
      expect(orderRepository.deleteById).toHaveBeenCalledWith(orderId);
    });

    it('relanza el error del repositorio', async () => {
      const repositoryError = new Error('fallo al borrar');
      orderRepository.findById.mockResolvedValue(buildOrder({ client: buildClient() }));
      orderRepository.deleteById.mockRejectedValue(repositoryError);

      await expect(service.deleteById(orderId)).rejects.toBe(repositoryError);
    });
  });

  describe('setOrderPersistentData', () => {
    it('lanza 400 si se invoca sin clientId', async () => {
      await expect(
        service.setOrderPersistentData(buildOrder({ clientId: undefined })),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El pedido debe tener un cliente',
      });
    });

    it('lanza 404 si el cliente no existe al copiar datos persistentes', async () => {
      clientRepository.findById.mockResolvedValue(null);

      await expect(service.setOrderPersistentData(buildOrder())).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: `Cliente no encontrado con ID: ${clientId}`,
      });
    });

    it('omite dirección si cliente o emisor no la tienen', async () => {
      clientRepository.findById.mockResolvedValue(buildClient({ address: undefined }));
      quoteRepository.findById.mockResolvedValue(buildQuote());
      enterpriseRepository.findById.mockResolvedValue(buildEnterprise({ address: undefined }));

      const result = await service.setOrderPersistentData(buildOrder());

      expect(result.clientName).toBe('Cliente Demo');
      expect(result.clientAddress).toBeUndefined();
      expect(result.issuerName).toBe('Empresa Demo');
      expect(result.issuerAddress).toBeUndefined();
    });
  });
});
