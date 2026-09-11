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
import { QueryBuilderService } from 'src/common/helpers/query-builder/query-builder.service';
import { InvoiceRepository } from './invoice-repository.service';
import { Invoice, InvoiceStatus } from './invoice.entity';

/**
 * Extrae la HttpException lanzada por una promesa rechazada.
 * @param rejectedPromise - Promesa que debe fallar
 * @returns La excepción HTTP capturada
 */
async function expectHttpException(
  rejectedPromise: Promise<unknown>,
): Promise<HttpException> {
  try {
    await rejectedPromise;
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(HttpException);
    return error as HttpException;
  }
  throw new Error('Se esperaba una HttpException');
}

describe('InvoiceRepository', () => {
  let invoiceRepositoryService: InvoiceRepository;
  let queryMock: jest.Mock;
  let queryBuilder: {
    leftJoin: jest.Mock;
    select: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    getMany: jest.Mock;
  };
  let typeOrmRepositoryMock: {
    save: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: { query: jest.Mock };
  };

  /**
   * Crea el módulo de pruebas con un repositorio TypeORM simulado.
   * El método de subtotales ejecuta SQL crudo vía `manager.query`.
   */
  beforeEach(async () => {
    jest.clearAllMocks();
    (QueryBuilderService.getPaginatedResults as jest.Mock).mockResolvedValue({
      items: [],
      total: 0,
      currentPage: 1,
      totalPages: 0,
    });
    queryMock = jest.fn().mockResolvedValue([]);
    queryBuilder = {
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    typeOrmRepositoryMock = {
      save: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      manager: {
        query: queryMock,
      },
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceRepository,
        {
          provide: getRepositoryToken(Invoice),
          useValue: typeOrmRepositoryMock,
        },
      ],
    }).compile();

    invoiceRepositoryService = testingModule.get(InvoiceRepository);
  });

  it('should be defined', () => {
    expect(invoiceRepositoryService).toBeDefined();
  });

  describe('create', () => {
    it('persiste la factura cuando el estado es válido', async () => {
      const invoiceToCreate = {
        status: InvoiceStatus.DRAFT,
        concepts: [],
      } as Invoice;
      typeOrmRepositoryMock.save.mockResolvedValue({ id: 'invoice-uuid', ...invoiceToCreate });

      const result = await invoiceRepositoryService.create(invoiceToCreate);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith(invoiceToCreate);
      expect(result.id).toBe('invoice-uuid');
    });

    it('lanza 400 si el estado de la factura no es válido', async () => {
      const thrownError = await expectHttpException(
        Promise.resolve().then(() =>
          invoiceRepositoryService.create({
            status: 'invalid' as InvoiceStatus,
            concepts: [],
          } as Invoice),
        ),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(typeOrmRepositoryMock.save).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('lista facturas con valores por defecto y sin relaciones', async () => {
      await invoiceRepositoryService.findAll();

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'invoice',
        expect.objectContaining({
          page: 1,
          pageSize: 10,
          sort: 'issuedDate',
          order: 'DESC',
          filter: {},
          relations: [],
        }),
      );
    });

    it('lista facturas paginadas con relaciones', async () => {
      await invoiceRepositoryService.findAll(
        2,
        20,
        'name',
        'ASC',
        { status: InvoiceStatus.ISSUED },
        ['client'],
      );

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'invoice',
        expect.objectContaining({
          page: 2,
          pageSize: 20,
          sort: 'name',
          order: 'ASC',
          filter: { status: InvoiceStatus.ISSUED },
          relations: [
            {
              property: 'client',
              alias: 'client',
              isLeftJoinAndSelect: true,
            },
          ],
        }),
      );
    });
  });

  describe('findById', () => {
    it('busca una factura por identificador sin relaciones', async () => {
      const foundInvoice = { id: 'invoice-uuid' } as Invoice;
      typeOrmRepositoryMock.findOne.mockResolvedValue(foundInvoice);

      const result = await invoiceRepositoryService.findById('invoice-uuid');

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'invoice-uuid' },
        relations: undefined,
      });
      expect(result).toEqual(foundInvoice);
    });

    it('busca una factura incluyendo relaciones', async () => {
      await invoiceRepositoryService.findById('invoice-uuid', ['client']);

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'invoice-uuid' },
        relations: ['client'],
      });
    });
  });

  describe('updateById', () => {
    it('lanza 404 si la factura no existe', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue(null);

      const thrownError = await expectHttpException(
        invoiceRepositoryService.updateById('missing-id', {
          status: InvoiceStatus.ISSUED,
          concepts: [],
        } as Invoice),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(typeOrmRepositoryMock.save).not.toHaveBeenCalled();
    });

    it('lanza 400 si el estado no es válido', async () => {
      const thrownError = await expectHttpException(
        invoiceRepositoryService.updateById('invoice-uuid', {
          status: 'invalid' as InvoiceStatus,
          concepts: [],
        } as Invoice),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(typeOrmRepositoryMock.findOne).not.toHaveBeenCalled();
    });

    it('actualiza la factura y la recarga con relaciones', async () => {
      const existingInvoice = { id: 'invoice-uuid', status: InvoiceStatus.DRAFT } as Invoice;
      const payload = { status: InvoiceStatus.ISSUED, concepts: [] } as Invoice;
      const reloadedInvoice = { ...existingInvoice, ...payload } as Invoice;

      typeOrmRepositoryMock.findOne
        .mockResolvedValueOnce(existingInvoice)
        .mockResolvedValueOnce(reloadedInvoice);
      typeOrmRepositoryMock.save.mockResolvedValue(reloadedInvoice);

      const result = await invoiceRepositoryService.updateById('invoice-uuid', payload);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith({
        ...existingInvoice,
        ...payload,
      });
      expect(typeOrmRepositoryMock.findOne).toHaveBeenLastCalledWith({
        where: { id: 'invoice-uuid' },
        relations: ['client', 'series', 'recurrentEarning'],
      });
      expect(result).toEqual(reloadedInvoice);
    });
  });

  describe('deleteById', () => {
    it('elimina la factura por identificador', async () => {
      const deleteResult = { affected: 1, raw: [] };
      typeOrmRepositoryMock.delete.mockResolvedValue(deleteResult);

      const result = await invoiceRepositoryService.deleteById('invoice-uuid');

      expect(typeOrmRepositoryMock.delete).toHaveBeenCalledWith('invoice-uuid');
      expect(result).toEqual(deleteResult);
    });
  });

  describe('getNonDraftInvoicesForMetrics', () => {
    it('consulta facturas no borrador en el rango de fechas de la empresa', async () => {
      const startDate = new Date('2026-01-01T00:00:00.000Z');
      const endDate = new Date('2026-01-31T00:00:00.000Z');
      const invoices = [{ id: 'invoice-uuid', status: InvoiceStatus.ISSUED }] as Invoice[];
      queryBuilder.getMany.mockResolvedValue(invoices);

      const result = await invoiceRepositoryService.getNonDraftInvoicesForMetrics(
        startDate,
        endDate,
        'enterprise-uuid',
      );

      expect(typeOrmRepositoryMock.createQueryBuilder).toHaveBeenCalledWith('invoice');
      expect(queryBuilder.leftJoin).toHaveBeenCalledWith('invoice.client', 'client');
      expect(queryBuilder.where).toHaveBeenCalledWith('invoice.status != :status', {
        status: InvoiceStatus.DRAFT,
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('invoice.issuedDate >= :startDate', {
        startDate,
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('invoice.issuedDate <= :endDate', {
        endDate,
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('client.enterpriseId = :enterpriseId', {
        enterpriseId: 'enterprise-uuid',
      });
      expect(result).toEqual(invoices);
    });
  });

  describe('getInvoiceSubtotalsByStatus', () => {
    const enterpriseId = 'enterprise-uuid';

    /**
     * Obtiene el SQL y los parámetros de la última consulta ejecutada.
     * @returns Tupla con la sentencia SQL y el array de parámetros
     */
    const getLastQueryCall = (): [string, unknown[]] => {
      const [sql, parameters] = queryMock.mock.calls[0];
      return [sql as string, parameters as unknown[]];
    };

    it('siempre filtra por empresa y no añade ingreso recurrente si el filtro no viene', async () => {
      await invoiceRepositoryService.getInvoiceSubtotalsByStatus(
        enterpriseId,
        {},
      );

      const [sql, parameters] = getLastQueryCall();
      expect(sql).toContain('c.enterprise_id = $1');
      expect(sql).not.toContain('recurrent_earning_id');
      expect(parameters).toEqual([enterpriseId]);
    });

    it('aplica IN con un único recurrentEarningId y placeholder $2', async () => {
      await invoiceRepositoryService.getInvoiceSubtotalsByStatus(enterpriseId, {
        recurrentEarningId: 'recurrent-uuid',
      });

      const [sql, parameters] = getLastQueryCall();
      expect(sql).toContain('i.recurrent_earning_id IN ($2)');
      expect(parameters).toEqual([enterpriseId, 'recurrent-uuid']);
    });

    it('aplica IN con varios ingresos recurrentes y placeholders consecutivos', async () => {
      await invoiceRepositoryService.getInvoiceSubtotalsByStatus(enterpriseId, {
        recurrentEarningId: ['recurrent-a', 'recurrent-b'],
      });

      const [sql, parameters] = getLastQueryCall();
      expect(sql).toContain('i.recurrent_earning_id IN ($2, $3)');
      expect(parameters).toEqual([enterpriseId, 'recurrent-a', 'recurrent-b']);
    });

    it('no añade la condición si recurrentEarningId es un array vacío', async () => {
      await invoiceRepositoryService.getInvoiceSubtotalsByStatus(enterpriseId, {
        recurrentEarningId: [],
      });

      const [sql, parameters] = getLastQueryCall();
      expect(sql).not.toContain('recurrent_earning_id');
      expect(parameters).toEqual([enterpriseId]);
    });

    it('coloca los parámetros de ingreso recurrente detrás de status y cliente y antes de fechas', async () => {
      await invoiceRepositoryService.getInvoiceSubtotalsByStatus(enterpriseId, {
        status: ['issued', 'paid'],
        'client.id': 'client-uuid',
        recurrentEarningId: 'recurrent-uuid',
        issuedDate_from: '2026-01-01',
      });

      const [sql, parameters] = getLastQueryCall();
      expect(sql).toContain('i.status IN ($2, $3)');
      expect(sql).toContain('i.client_id IN ($4)');
      expect(sql).toContain('i.recurrent_earning_id IN ($5)');
      expect(sql).toContain('i.issued_date >= $6');
      expect(parameters).toEqual([
        enterpriseId,
        'issued',
        'paid',
        'client-uuid',
        'recurrent-uuid',
        '2026-01-01',
      ]);
    });

    it('agrega conteos y subtotales por estado, redondea a 2 decimales y acumula estados desconocidos en el total', async () => {
      queryMock.mockResolvedValue([
        { status: 'issued', count: '2', subtotal: '10.125' },
        { status: 'paid', count: 1, subtotal: '5.125' },
        { status: 'unknown', count: 3, subtotal: '1' },
        { status: null, count: 1, subtotal: '2.004' },
        { status: 'unknown', count: null, subtotal: undefined },
        { status: 'also-unknown', count: 'no-num', subtotal: 'no-num' },
      ]);

      const metrics =
        await invoiceRepositoryService.getInvoiceSubtotalsByStatus(
          enterpriseId,
        );

      expect(metrics.issued).toEqual({ count: 2, subtotal: 10.13 });
      expect(metrics.paid).toEqual({ count: 1, subtotal: 5.13 });
      expect(metrics.draft).toEqual({ count: 1, subtotal: 2 });
      expect(metrics.partially_paid).toEqual({ count: 0, subtotal: 0 });
      expect(metrics.cancelled).toEqual({ count: 0, subtotal: 0 });
      expect(metrics.total.count).toBe(7);
      expect(metrics.total.subtotal).toBe(18.25);
    });

    it('devuelve métricas a cero cuando la consulta no retorna filas', async () => {
      const metrics =
        await invoiceRepositoryService.getInvoiceSubtotalsByStatus(
          enterpriseId,
        );

      expect(metrics).toEqual({
        total: { count: 0, subtotal: 0 },
        draft: { count: 0, subtotal: 0 },
        issued: { count: 0, subtotal: 0 },
        paid: { count: 0, subtotal: 0 },
        partially_paid: { count: 0, subtotal: 0 },
        cancelled: { count: 0, subtotal: 0 },
      });
    });

    it('aplica status, serie y cliente como valor único o array vacío', async () => {
      await invoiceRepositoryService.getInvoiceSubtotalsByStatus(enterpriseId, {
        status: InvoiceStatus.PAID,
        'series.id': 'series-uuid',
        'client.id': [],
      });

      const [sql, parameters] = getLastQueryCall();
      expect(sql).toContain('i.status IN ($2)');
      expect(sql).toContain('i.series_id IN ($3)');
      expect(sql).not.toContain('i.client_id IN');
      expect(parameters).toEqual([enterpriseId, InvoiceStatus.PAID, 'series-uuid']);
    });

    it('no añade IN si status o series llegan como arrays vacíos', async () => {
      await invoiceRepositoryService.getInvoiceSubtotalsByStatus(enterpriseId, {
        status: [],
        'series.id': [],
        'client.id': 'client-uuid',
      });

      const [sql, parameters] = getLastQueryCall();
      expect(sql).not.toContain('i.status IN');
      expect(sql).not.toContain('i.series_id IN');
      expect(sql).toContain('i.client_id IN ($2)');
      expect(parameters).toEqual([enterpriseId, 'client-uuid']);
    });

    it('aplica el resto de fechas, name_ilike y client.name_ilike', async () => {
      await invoiceRepositoryService.getInvoiceSubtotalsByStatus(enterpriseId, {
        issuedDate_to: '2026-01-31',
        createdAt_from: '2026-01-01',
        createdAt_to: '2026-01-31',
        updatedAt_from: '2026-02-01',
        updatedAt_to: '2026-02-28',
        name_ilike: 'acme',
        'client.name_ilike': 'cliente',
      });

      const [sql, parameters] = getLastQueryCall();
      expect(sql).toContain('i.issued_date <= $2');
      expect(sql).toContain('i.created_at >= $3');
      expect(sql).toContain('i.created_at <= $4');
      expect(sql).toContain('i.updated_at >= $5');
      expect(sql).toContain('i.updated_at <= $6');
      expect(sql).toContain('LOWER(i.name) LIKE LOWER($7)');
      expect(sql).toContain('LOWER(c.name) LIKE LOWER($8)');
      expect(parameters).toEqual([
        enterpriseId,
        '2026-01-31',
        '2026-01-01',
        '2026-01-31',
        '2026-02-01',
        '2026-02-28',
        '%acme%',
        '%cliente%',
      ]);
    });

    it('aplica varias series y un único client.id', async () => {
      await invoiceRepositoryService.getInvoiceSubtotalsByStatus(enterpriseId, {
        'series.id': ['series-a', 'series-b'],
        'client.id': 'client-uuid',
      });

      const [sql, parameters] = getLastQueryCall();
      expect(sql).toContain('i.series_id IN ($2, $3)');
      expect(sql).toContain('i.client_id IN ($4)');
      expect(parameters).toEqual([
        enterpriseId,
        'series-a',
        'series-b',
        'client-uuid',
      ]);
    });
  });
});
