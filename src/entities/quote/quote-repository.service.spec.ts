jest.mock('src/helpers/query-builder/query-builder.service', () => ({
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
import { QueryBuilderService } from 'src/helpers/query-builder/query-builder.service';
import { Quote, QuoteStatus } from './quote.entity';
import { QuoteRepository } from './quote-repository.service';

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

describe('QuoteRepository', () => {
  let quoteRepositoryService: QuoteRepository;
  let queryMock: jest.Mock;
  let queryBuilder: {
    where: jest.Mock;
    andWhere: jest.Mock;
    leftJoin: jest.Mock;
    innerJoin: jest.Mock;
    innerJoinAndSelect: jest.Mock;
    select: jest.Mock;
    distinct: jest.Mock;
    getMany: jest.Mock;
    getOne: jest.Mock;
    getCount: jest.Mock;
    getRawOne: jest.Mock;
  };
  let typeOrmRepositoryMock: {
    save: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: { query: jest.Mock };
  };

  /**
   * Crea el módulo de pruebas con repositorio TypeORM simulado.
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
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
      getOne: jest.fn(),
      getCount: jest.fn(),
      getRawOne: jest.fn(),
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
        QuoteRepository,
        {
          provide: getRepositoryToken(Quote),
          useValue: typeOrmRepositoryMock,
        },
      ],
    }).compile();

    quoteRepositoryService = testingModule.get(QuoteRepository);
  });

  it('debería estar definido', () => {
    expect(quoteRepositoryService).toBeDefined();
  });

  describe('create', () => {
    it('persiste la cotización mediante save', async () => {
      const quoteToCreate = { name: 'Presupuesto', status: QuoteStatus.DRAFT } as Quote;
      typeOrmRepositoryMock.save.mockResolvedValue({ id: 'quote-uuid', ...quoteToCreate });

      const result = await quoteRepositoryService.create(quoteToCreate);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith(quoteToCreate);
      expect(result.id).toBe('quote-uuid');
    });
  });

  describe('findAll', () => {
    it('lista cotizaciones paginadas usando QueryBuilderService', async () => {
      const paginatedResponse = {
        items: [],
        total: 0,
        currentPage: 1,
        totalPages: 0,
      };

      const result = await quoteRepositoryService.findAll(
        1,
        10,
        'issuedDate',
        'DESC',
        { status: QuoteStatus.ISSUED },
        ['client'],
      );

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'quote',
        expect.objectContaining({
          page: 1,
          pageSize: 10,
          sort: 'issuedDate',
          order: 'DESC',
          filter: { status: QuoteStatus.ISSUED },
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

    it('lista cotizaciones con valores por defecto y sin relaciones', async () => {
      await quoteRepositoryService.findAll();

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'quote',
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
  });

  describe('findById', () => {
    it('busca una cotización por identificador', async () => {
      const foundQuote = { id: 'quote-uuid', status: QuoteStatus.ISSUED } as Quote;
      typeOrmRepositoryMock.findOne.mockResolvedValue(foundQuote);

      const result = await quoteRepositoryService.findById('quote-uuid', ['client']);

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'quote-uuid' },
        relations: ['client'],
      });
      expect(result).toEqual(foundQuote);
    });

    it('busca una cotización sin relaciones opcionales', async () => {
      await quoteRepositoryService.findById('quote-uuid');

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'quote-uuid' },
        relations: undefined,
      });
    });
  });

  describe('updateById', () => {
    it('lanza 404 si la cotización no existe', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue(null);

      const thrownError = await expectHttpException(
        quoteRepositoryService.updateById('missing-id', {
          status: QuoteStatus.ISSUED,
          concepts: [],
        } as Quote),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(typeOrmRepositoryMock.save).not.toHaveBeenCalled();
    });

    it('lanza 400 si el estado de la cotización no es válido', async () => {
      const thrownError = await expectHttpException(
        quoteRepositoryService.updateById('quote-uuid', {
          status: 'invalid' as QuoteStatus,
          concepts: [],
        } as Quote),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(typeOrmRepositoryMock.findOne).not.toHaveBeenCalled();
    });

    it('actualiza la cotización y la recarga con cliente y facturas', async () => {
      const existingQuote = {
        id: 'quote-uuid',
        status: QuoteStatus.DRAFT,
        name: 'Antiguo',
      } as Quote;
      const payload = {
        status: QuoteStatus.ISSUED,
        name: 'Nuevo',
        concepts: [],
      } as Quote;
      const reloadedQuote = { ...existingQuote, ...payload } as Quote;

      typeOrmRepositoryMock.findOne
        .mockResolvedValueOnce(existingQuote)
        .mockResolvedValueOnce(reloadedQuote);
      typeOrmRepositoryMock.save.mockResolvedValue(reloadedQuote);

      const result = await quoteRepositoryService.updateById('quote-uuid', payload);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith({
        ...existingQuote,
        ...payload,
      });
      expect(typeOrmRepositoryMock.findOne).toHaveBeenLastCalledWith({
        where: { id: 'quote-uuid' },
        relations: ['client', 'invoices'],
      });
      expect(result).toEqual(reloadedQuote);
    });
  });

  describe('deleteById', () => {
    it('elimina la cotización por identificador', async () => {
      const deleteResult = { affected: 1, raw: [] };
      typeOrmRepositoryMock.delete.mockResolvedValue(deleteResult);

      const result = await quoteRepositoryService.deleteById('quote-uuid');

      expect(typeOrmRepositoryMock.delete).toHaveBeenCalledWith('quote-uuid');
      expect(result).toEqual(deleteResult);
    });
  });

  describe('getNonDraftQuotesForMetrics', () => {
    it('consulta cotizaciones no borrador en el rango de fechas de la empresa', async () => {
      const startDate = new Date('2026-01-01T00:00:00.000Z');
      const endDate = new Date('2026-01-31T00:00:00.000Z');
      const quotes = [{ id: 'quote-uuid', status: QuoteStatus.ISSUED }] as Quote[];
      queryBuilder.getMany.mockResolvedValue(quotes);

      const result = await quoteRepositoryService.getNonDraftQuotesForMetrics(
        startDate,
        endDate,
        'enterprise-uuid',
      );

      expect(typeOrmRepositoryMock.createQueryBuilder).toHaveBeenCalledWith('quote');
      expect(queryBuilder.leftJoin).toHaveBeenCalledWith('quote.client', 'client');
      expect(queryBuilder.where).toHaveBeenCalledWith('quote.status != :status', {
        status: QuoteStatus.DRAFT,
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('quote.issuedDate >= :startDate', {
        startDate,
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('quote.issuedDate <= :endDate', {
        endDate,
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('client.enterpriseId = :enterpriseId', {
        enterpriseId: 'enterprise-uuid',
      });
      expect(result).toEqual(quotes);
    });
  });

  describe('getQuoteSubtotalsByStatus', () => {
    const enterpriseId = 'enterprise-uuid';

    /**
     * Obtiene el SQL y los parámetros de la última consulta ejecutada.
     * @returns Tupla con la sentencia SQL y el array de parámetros
     */
    const getLastQueryCall = (): [string, unknown[]] => {
      const [sql, parameters] = queryMock.mock.calls[0];
      return [sql as string, parameters as unknown[]];
    };

    it('siempre filtra por empresa y no añade estado si el filtro no viene', async () => {
      await quoteRepositoryService.getQuoteSubtotalsByStatus(enterpriseId, {});

      const [sql, parameters] = getLastQueryCall();
      expect(sql).toContain('c.enterprise_id = $1');
      expect(sql).not.toContain('q.status IN');
      expect(parameters).toEqual([enterpriseId]);
    });

    it('aplica IN con un único status y placeholder $2', async () => {
      await quoteRepositoryService.getQuoteSubtotalsByStatus(enterpriseId, {
        status: QuoteStatus.ISSUED,
      });

      const [sql, parameters] = getLastQueryCall();
      expect(sql).toContain('q.status IN ($2)');
      expect(parameters).toEqual([enterpriseId, QuoteStatus.ISSUED]);
    });

    it('aplica IN con varios estados y placeholders consecutivos', async () => {
      await quoteRepositoryService.getQuoteSubtotalsByStatus(enterpriseId, {
        status: [QuoteStatus.ISSUED, QuoteStatus.CONVERTED],
      });

      const [sql, parameters] = getLastQueryCall();
      expect(sql).toContain('q.status IN ($2, $3)');
      expect(parameters).toEqual([
        enterpriseId,
        QuoteStatus.ISSUED,
        QuoteStatus.CONVERTED,
      ]);
    });

    it('coloca los parámetros de cliente detrás de status y antes de fechas', async () => {
      await quoteRepositoryService.getQuoteSubtotalsByStatus(enterpriseId, {
        status: [QuoteStatus.ISSUED, QuoteStatus.REJECTED],
        'client.id': 'client-uuid',
        issuedDate_from: '2026-01-01',
      });

      const [sql, parameters] = getLastQueryCall();
      expect(sql).toContain('q.status IN ($2, $3)');
      expect(sql).toContain('q.client_id IN ($4)');
      expect(sql).toContain('q.issued_date >= $5');
      expect(parameters).toEqual([
        enterpriseId,
        QuoteStatus.ISSUED,
        QuoteStatus.REJECTED,
        'client-uuid',
        '2026-01-01',
      ]);
    });

    it('agrega conteos y subtotales por estado, redondea a 2 decimales y acumula estados desconocidos en el total', async () => {
      queryMock.mockResolvedValue([
        { status: QuoteStatus.ISSUED, count: '2', subtotal: '10.125' },
        { status: QuoteStatus.CONVERTED, count: 1, subtotal: '5.125' },
        { status: 'unknown', count: 3, subtotal: '1' },
        { status: null, count: 1, subtotal: '2.004' },
        { status: 'unknown', count: null, subtotal: undefined },
        { status: 'also-unknown', count: 'no-num', subtotal: 'no-num' },
      ]);

      const metrics = await quoteRepositoryService.getQuoteSubtotalsByStatus(enterpriseId);

      expect(metrics.issued).toEqual({ count: 2, subtotal: 10.13 });
      expect(metrics.converted).toEqual({ count: 1, subtotal: 5.13 });
      expect(metrics.draft).toEqual({ count: 1, subtotal: 2 });
      expect(metrics.rejected).toEqual({ count: 0, subtotal: 0 });
      expect(metrics.total.count).toBe(7);
      expect(metrics.total.subtotal).toBe(18.25);
    });

    it('devuelve métricas a cero cuando la consulta no retorna filas', async () => {
      const metrics = await quoteRepositoryService.getQuoteSubtotalsByStatus(enterpriseId);

      expect(metrics).toEqual({
        total: { count: 0, subtotal: 0 },
        draft: { count: 0, subtotal: 0 },
        issued: { count: 0, subtotal: 0 },
        converted: { count: 0, subtotal: 0 },
        rejected: { count: 0, subtotal: 0 },
      });
    });

    it('no añade IN si status o client.id llegan como arrays vacíos', async () => {
      await quoteRepositoryService.getQuoteSubtotalsByStatus(enterpriseId, {
        status: [],
        'client.id': [],
      });

      const [sql, parameters] = getLastQueryCall();
      expect(sql).not.toContain('q.status IN');
      expect(sql).not.toContain('q.client_id IN');
      expect(parameters).toEqual([enterpriseId]);
    });

    it('aplica el resto de fechas, name_ilike y client.name_ilike', async () => {
      await quoteRepositoryService.getQuoteSubtotalsByStatus(enterpriseId, {
        issuedDate_to: '2026-01-31',
        formalizationDate_from: '2026-01-01',
        formalizationDate_to: '2026-01-15',
        createdAt_from: '2026-01-01',
        createdAt_to: '2026-01-31',
        updatedAt_from: '2026-02-01',
        updatedAt_to: '2026-02-28',
        name_ilike: 'presupuesto',
        'client.name_ilike': 'cliente',
      });

      const [sql, parameters] = getLastQueryCall();
      expect(sql).toContain('q.issued_date <= $2');
      expect(sql).toContain('q.formalization_date >= $3');
      expect(sql).toContain('q.formalization_date <= $4');
      expect(sql).toContain('q.created_at >= $5');
      expect(sql).toContain('q.created_at <= $6');
      expect(sql).toContain('q.updated_at >= $7');
      expect(sql).toContain('q.updated_at <= $8');
      expect(sql).toContain('LOWER(q.name) LIKE LOWER($9)');
      expect(sql).toContain('LOWER(c.name) LIKE LOWER($10)');
      expect(parameters).toEqual([
        enterpriseId,
        '2026-01-31',
        '2026-01-01',
        '2026-01-15',
        '2026-01-01',
        '2026-01-31',
        '2026-02-01',
        '2026-02-28',
        '%presupuesto%',
        '%cliente%',
      ]);
    });

    it('aplica un único client.id', async () => {
      await quoteRepositoryService.getQuoteSubtotalsByStatus(enterpriseId, {
        'client.id': ['client-a', 'client-b'],
      });

      const [sql, parameters] = getLastQueryCall();
      expect(sql).toContain('q.client_id IN ($2, $3)');
      expect(parameters).toEqual([enterpriseId, 'client-a', 'client-b']);
    });
  });
});
