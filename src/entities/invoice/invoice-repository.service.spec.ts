import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InvoiceRepository } from './invoice-repository.service';
import { Invoice } from './invoice.entity';

describe('InvoiceRepository', () => {
  let invoiceRepositoryService: InvoiceRepository;
  let queryMock: jest.Mock;

  /**
   * Crea el módulo de pruebas con un repositorio TypeORM simulado.
   * El método de subtotales ejecuta SQL crudo vía `manager.query`.
   */
  beforeEach(async () => {
    queryMock = jest.fn().mockResolvedValue([]);

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceRepository,
        {
          provide: getRepositoryToken(Invoice),
          useValue: {
            manager: {
              query: queryMock,
            },
          },
        },
      ],
    }).compile();

    invoiceRepositoryService = testingModule.get(InvoiceRepository);
  });

  it('should be defined', () => {
    expect(invoiceRepositoryService).toBeDefined();
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
  });
});
