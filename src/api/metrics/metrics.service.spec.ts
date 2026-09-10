import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceRepository } from '../../entities/invoice/invoice-repository.service';
import { QuoteRepository } from '../../entities/quote/quote-repository.service';
import { SpentRepository } from '../../entities/spent/spent-repository.service';
import { UserRepository } from '../../entities/user/user-repository.service';
import { ClientRepository } from '../../entities/client/client-repository.service';
import { SupplierRepository } from '../../entities/supplier/supplier-repository.service';
import { InvoiceSeriesRepository } from '../../entities/invoice-series/invoice-series-repository.service';
import { Invoice } from '../../entities/invoice/invoice.entity';
import { Spent } from '../../entities/spent/spent.entity';
import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;
  let invoiceRepository: {
    getInvoiceSubtotalsByStatus: jest.Mock;
    getNonDraftInvoicesForMetrics: jest.Mock;
  };
  let quoteRepository: { getQuoteSubtotalsByStatus: jest.Mock };
  let spentRepository: {
    getSpentSubtotalsByStatus: jest.Mock;
    getSpentsForMetrics: jest.Mock;
  };
  let userRepository: { getListViewCounts: jest.Mock };
  let clientRepository: { getListViewCounts: jest.Mock };
  let supplierRepository: { getListViewCounts: jest.Mock };
  let invoiceSeriesRepository: { getListViewCounts: jest.Mock };

  const enterpriseId = 'enterprise-uuid';
  const periodStart = new Date('2026-01-01T00:00:00.000Z');
  const periodEnd = new Date('2026-01-31T00:00:00.000Z');

  /**
   * Construye una factura de métricas con conceptos deterministas.
   * @param overrides - Campos a sobrescribir
   * @returns Factura simulada para el cálculo de importes
   */
  const buildInvoice = (overrides: Partial<Invoice> = {}): Invoice =>
    ({
      id: 'invoice-uuid',
      name: 'Factura de prueba',
      issuedDate: new Date('2026-01-15T00:00:00.000Z'),
      concepts: [
        {
          name: 'Servicio',
          base_price: 100,
          quantity: 2,
          vat: 21,
          irpf: 15,
          supplied: false,
        },
      ],
      ...overrides,
    }) as Invoice;

  /**
   * Construye un gasto de métricas con conceptos deterministas.
   * @param overrides - Campos a sobrescribir
   * @returns Gasto simulado para el cálculo de importes
   */
  const buildSpent = (overrides: Partial<Spent> = {}): Spent =>
    ({
      id: 'spent-uuid',
      name: 'Gasto de prueba',
      issuedDate: new Date('2026-01-15T00:00:00.000Z'),
      concepts: [
        {
          name: 'Hosting',
          base_price: 100,
          quantity: 1,
          vat: 21,
          irpf: 0,
          supplied: false,
          percentage: 50,
        },
      ],
      ...overrides,
    }) as Spent;

  beforeEach(async () => {
    invoiceRepository = {
      getInvoiceSubtotalsByStatus: jest.fn().mockResolvedValue({ total: { count: 0 } }),
      getNonDraftInvoicesForMetrics: jest.fn().mockResolvedValue([]),
    };
    quoteRepository = {
      getQuoteSubtotalsByStatus: jest.fn().mockResolvedValue({ total: { count: 0 } }),
    };
    spentRepository = {
      getSpentSubtotalsByStatus: jest.fn().mockResolvedValue({ total: { count: 0 } }),
      getSpentsForMetrics: jest.fn().mockResolvedValue([]),
    };
    userRepository = { getListViewCounts: jest.fn().mockResolvedValue({ total: 0 }) };
    clientRepository = { getListViewCounts: jest.fn().mockResolvedValue({ total: 0 }) };
    supplierRepository = { getListViewCounts: jest.fn().mockResolvedValue({ total: 0 }) };
    invoiceSeriesRepository = { getListViewCounts: jest.fn().mockResolvedValue({ total: 0 }) };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsService,
        { provide: InvoiceRepository, useValue: invoiceRepository },
        { provide: QuoteRepository, useValue: quoteRepository },
        { provide: SpentRepository, useValue: spentRepository },
        { provide: UserRepository, useValue: userRepository },
        { provide: ClientRepository, useValue: clientRepository },
        { provide: SupplierRepository, useValue: supplierRepository },
        { provide: InvoiceSeriesRepository, useValue: invoiceSeriesRepository },
      ],
    }).compile();

    service = testingModule.get(MetricsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('delegación a repositorios de listado', () => {
    it('getInvoiceSubtotalsByStatus reenvía empresa y filtro', async () => {
      const filter = { status: 'issued' };
      const expected = { total: { count: 2, subtotal: 100 } };
      invoiceRepository.getInvoiceSubtotalsByStatus.mockResolvedValue(expected);

      await expect(service.getInvoiceSubtotalsByStatus(enterpriseId, filter)).resolves.toEqual(
        expected,
      );
      expect(invoiceRepository.getInvoiceSubtotalsByStatus).toHaveBeenCalledWith(
        enterpriseId,
        filter,
      );
    });

    it('getInvoiceSubtotalsByStatus usa filtro vacío por defecto', async () => {
      await service.getInvoiceSubtotalsByStatus(enterpriseId);

      expect(invoiceRepository.getInvoiceSubtotalsByStatus).toHaveBeenCalledWith(enterpriseId, {});
    });

    it('getQuoteSubtotalsByStatus reenvía empresa y filtro', async () => {
      const filter = { status: 'draft' };
      await service.getQuoteSubtotalsByStatus(enterpriseId, filter);

      expect(quoteRepository.getQuoteSubtotalsByStatus).toHaveBeenCalledWith(enterpriseId, filter);
    });

    it('getQuoteSubtotalsByStatus usa filtro vacío por defecto', async () => {
      await service.getQuoteSubtotalsByStatus(enterpriseId);

      expect(quoteRepository.getQuoteSubtotalsByStatus).toHaveBeenCalledWith(enterpriseId, {});
    });

    it('getSpentSubtotalsByStatus reenvía empresa y filtro', async () => {
      const filter = { status: 'paid' };
      await service.getSpentSubtotalsByStatus(enterpriseId, filter);

      expect(spentRepository.getSpentSubtotalsByStatus).toHaveBeenCalledWith(enterpriseId, filter);
    });

    it('getSpentSubtotalsByStatus usa filtro vacío por defecto', async () => {
      await service.getSpentSubtotalsByStatus(enterpriseId);

      expect(spentRepository.getSpentSubtotalsByStatus).toHaveBeenCalledWith(enterpriseId, {});
    });

    it('getUserCountsByStatus reenvía empresa y filtro', async () => {
      const filter = { name_ilike: 'ana' };
      await service.getUserCountsByStatus(enterpriseId, filter);

      expect(userRepository.getListViewCounts).toHaveBeenCalledWith(enterpriseId, filter);
    });

    it('getUserCountsByStatus usa filtro vacío por defecto', async () => {
      await service.getUserCountsByStatus(enterpriseId);

      expect(userRepository.getListViewCounts).toHaveBeenCalledWith(enterpriseId, {});
    });

    it('getClientCountsByType reenvía empresa y filtro', async () => {
      const filter = { type: 'company' };
      await service.getClientCountsByType(enterpriseId, filter);

      expect(clientRepository.getListViewCounts).toHaveBeenCalledWith(enterpriseId, filter);
    });

    it('getClientCountsByType usa filtro vacío por defecto', async () => {
      await service.getClientCountsByType(enterpriseId);

      expect(clientRepository.getListViewCounts).toHaveBeenCalledWith(enterpriseId, {});
    });

    it('getSupplierCountsByType reenvía empresa y filtro', async () => {
      const filter = { type: 'individual' };
      await service.getSupplierCountsByType(enterpriseId, filter);

      expect(supplierRepository.getListViewCounts).toHaveBeenCalledWith(enterpriseId, filter);
    });

    it('getSupplierCountsByType usa filtro vacío por defecto', async () => {
      await service.getSupplierCountsByType(enterpriseId);

      expect(supplierRepository.getListViewCounts).toHaveBeenCalledWith(enterpriseId, {});
    });

    it('getInvoiceSeriesListCounts reenvía empresa, filtro y rangos', async () => {
      const filter = { series_ilike: 'A' };
      const monthRange = { from: '2026-09-01', to: '2026-09-30' };
      const weekRange = { from: '2026-09-01', to: '2026-09-07' };

      await service.getInvoiceSeriesListCounts(enterpriseId, filter, monthRange, weekRange);

      expect(invoiceSeriesRepository.getListViewCounts).toHaveBeenCalledWith(
        enterpriseId,
        filter,
        monthRange,
        weekRange,
      );
    });

    it('getInvoiceSeriesListCounts usa filtro vacío por defecto', async () => {
      const monthRange = { from: '2026-09-01', to: '2026-09-30' };
      const weekRange = { from: '2026-09-01', to: '2026-09-07' };

      await service.getInvoiceSeriesListCounts(enterpriseId, undefined, monthRange, weekRange);

      expect(invoiceSeriesRepository.getListViewCounts).toHaveBeenCalledWith(
        enterpriseId,
        {},
        monthRange,
        weekRange,
      );
    });
  });

  describe('getInvoicesMetrics', () => {
    it('rechaza un rango cuya fecha de inicio es posterior a la de fin', async () => {
      await expect(
        service.getInvoicesMetrics(periodEnd, periodStart, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'La fecha de inicio no puede ser posterior a la fecha de fin',
      });
      expect(invoiceRepository.getNonDraftInvoicesForMetrics).not.toHaveBeenCalled();
    });

    it('acumula subtotal, IVA e IRPF y redondea a dos decimales', async () => {
      invoiceRepository.getNonDraftInvoicesForMetrics.mockResolvedValue([
        buildInvoice({
          concepts: [
            {
              name: 'Concepto con decimales',
              base_price: 10.125,
              quantity: 1,
              vat: 10,
              irpf: 0,
              supplied: false,
            },
          ],
        }),
      ]);

      const metrics = await service.getInvoicesMetrics(periodStart, periodEnd, enterpriseId);

      expect(invoiceRepository.getNonDraftInvoicesForMetrics).toHaveBeenCalledWith(
        periodStart,
        periodEnd,
        enterpriseId,
      );
      expect(metrics.subtotal).toBe(10.13);
      expect(metrics.vat).toBe(1.01);
      expect(metrics.irpf).toBe(0);
      expect(metrics.total).toBe(11.14);
      expect(metrics.invoiceCount).toBe(1);
      expect(metrics.period).toEqual({
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      });
    });

    it('usa quantity 1 y precios 0 cuando faltan en el concepto', async () => {
      invoiceRepository.getNonDraftInvoicesForMetrics.mockResolvedValue([
        buildInvoice({
          concepts: [
            {
              name: 'Sin cantidad',
              base_price: 40,
              vat: 21,
              irpf: 0,
              supplied: false,
            } as Invoice['concepts'][number],
          ],
        }),
      ]);

      const metrics = await service.getInvoicesMetrics(periodStart, periodEnd, enterpriseId);

      expect(metrics.subtotal).toBe(40);
      expect(metrics.vat).toBe(8.4);
      expect(metrics.total).toBe(48.4);
    });

    it('usa base_price, vat e irpf 0 cuando el concepto no los informa', async () => {
      invoiceRepository.getNonDraftInvoicesForMetrics.mockResolvedValue([
        buildInvoice({
          concepts: [
            {
              name: 'Vacío',
              quantity: 2,
              supplied: false,
            } as Invoice['concepts'][number],
          ],
        }),
      ]);

      const metrics = await service.getInvoicesMetrics(periodStart, periodEnd, enterpriseId);

      expect(metrics.subtotal).toBe(0);
      expect(metrics.vat).toBe(0);
      expect(metrics.irpf).toBe(0);
      expect(metrics.total).toBe(0);
    });

    it('cuenta facturas sin conceptos y no altera los importes', async () => {
      invoiceRepository.getNonDraftInvoicesForMetrics.mockResolvedValue([
        buildInvoice({
          id: 'later',
          issuedDate: new Date('2026-01-20T00:00:00.000Z'),
        }),
        buildInvoice({
          id: 'earlier',
          issuedDate: new Date('2026-01-10T00:00:00.000Z'),
          concepts: undefined,
        }),
        buildInvoice({
          id: 'not-array',
          issuedDate: new Date('2026-01-12T00:00:00.000Z'),
          concepts: 'invalido' as unknown as Invoice['concepts'],
        }),
      ]);

      const metrics = await service.getInvoicesMetrics(periodStart, periodEnd, enterpriseId);

      expect(metrics.invoiceCount).toBe(3);
      expect(metrics.subtotal).toBe(200);
      expect(metrics.vat).toBe(42);
      expect(metrics.irpf).toBe(30);
      expect(metrics.total).toBe(212);
    });
  });

  describe('getSpentMetrics', () => {
    it('rechaza un rango cuya fecha de inicio es posterior a la de fin', async () => {
      await expect(
        service.getSpentMetrics(periodEnd, periodStart, enterpriseId),
      ).rejects.toBeInstanceOf(HttpException);
      expect(spentRepository.getSpentsForMetrics).not.toHaveBeenCalled();
    });

    it('aplica el percentage del concepto al subtotal, IVA e IRPF', async () => {
      spentRepository.getSpentsForMetrics.mockResolvedValue([buildSpent()]);

      const metrics = await service.getSpentMetrics(periodStart, periodEnd, enterpriseId);

      expect(spentRepository.getSpentsForMetrics).toHaveBeenCalledWith(
        periodStart,
        periodEnd,
        enterpriseId,
      );
      expect(metrics.subtotal).toBe(50);
      expect(metrics.vat).toBe(10.5);
      expect(metrics.irpf).toBe(0);
      expect(metrics.total).toBe(60.5);
      expect(metrics.spentCount).toBe(1);
    });

    it('usa percentage 100 cuando el concepto no lo informa', async () => {
      spentRepository.getSpentsForMetrics.mockResolvedValue([
        buildSpent({
          concepts: [
            {
              name: 'Sin percentage',
              base_price: 80,
              quantity: 1,
              vat: 10,
              irpf: 0,
              supplied: false,
            } as Spent['concepts'][number],
          ],
        }),
      ]);

      const metrics = await service.getSpentMetrics(periodStart, periodEnd, enterpriseId);

      expect(metrics.subtotal).toBe(80);
      expect(metrics.vat).toBe(8);
      expect(metrics.total).toBe(88);
    });

    it('usa quantity 1 y precios 0 cuando faltan en el concepto', async () => {
      spentRepository.getSpentsForMetrics.mockResolvedValue([
        buildSpent({
          concepts: [
            {
              name: 'Incompleto',
              supplied: false,
            } as Spent['concepts'][number],
          ],
        }),
      ]);

      const metrics = await service.getSpentMetrics(periodStart, periodEnd, enterpriseId);

      expect(metrics.subtotal).toBe(0);
      expect(metrics.vat).toBe(0);
      expect(metrics.irpf).toBe(0);
    });

    it('cuenta gastos sin conceptos y no altera los importes', async () => {
      spentRepository.getSpentsForMetrics.mockResolvedValue([
        buildSpent(),
        buildSpent({ id: 'sin-conceptos', concepts: undefined }),
        buildSpent({ id: 'no-array', concepts: 'invalido' as unknown as Spent['concepts'] }),
      ]);

      const metrics = await service.getSpentMetrics(periodStart, periodEnd, enterpriseId);

      expect(metrics.spentCount).toBe(3);
      expect(metrics.subtotal).toBe(50);
    });
  });

  describe('getYearlyInvoiceMetrics', () => {
    it('devuelve doce meses con totales a cero cuando no hay facturas', async () => {
      const yearlyMetrics = await service.getYearlyInvoiceMetrics(2026, enterpriseId);

      expect(invoiceRepository.getNonDraftInvoicesForMetrics).toHaveBeenCalledTimes(12);
      expect(yearlyMetrics.year).toBe(2026);
      expect(yearlyMetrics.months).toHaveLength(12);
      expect(yearlyMetrics.months[0].monthName).toBe('Enero');
      expect(yearlyMetrics.months[11].monthName).toBe('Diciembre');
      expect(yearlyMetrics.totals).toEqual({
        subtotal: 0,
        vat: 0,
        irpf: 0,
        total: 0,
        count: 0,
      });
    });

    it('acumula conceptos, defaults y facturas sin conceptos en el mes correspondiente', async () => {
      invoiceRepository.getNonDraftInvoicesForMetrics.mockImplementation(
        (startDate: Date) => {
          if (startDate.getMonth() !== 0) {
            return Promise.resolve([]);
          }
          return Promise.resolve([
            buildInvoice(),
            buildInvoice({
              id: 'defaults',
              concepts: [
                {
                  name: 'Defaults',
                  supplied: false,
                } as Invoice['concepts'][number],
              ],
            }),
            buildInvoice({ id: 'sin-conceptos', concepts: undefined }),
          ]);
        },
      );

      const yearlyMetrics = await service.getYearlyInvoiceMetrics(2026, enterpriseId);

      expect(yearlyMetrics.months[0].count).toBe(3);
      expect(yearlyMetrics.months[0].subtotal).toBe(200);
      expect(yearlyMetrics.months[0].vat).toBe(42);
      expect(yearlyMetrics.months[0].irpf).toBe(30);
      expect(yearlyMetrics.months[0].total).toBe(212);
      expect(yearlyMetrics.totals.count).toBe(3);
      expect(yearlyMetrics.totals.subtotal).toBe(200);
      expect(yearlyMetrics.months[1].count).toBe(0);
    });
  });

  describe('getYearlySpentMetrics', () => {
    it('devuelve doce meses con totales a cero cuando no hay gastos', async () => {
      const yearlyMetrics = await service.getYearlySpentMetrics(2026, enterpriseId);

      expect(spentRepository.getSpentsForMetrics).toHaveBeenCalledTimes(12);
      expect(yearlyMetrics.year).toBe(2026);
      expect(yearlyMetrics.months).toHaveLength(12);
      expect(yearlyMetrics.months[0].monthName).toBe('Enero');
      expect(yearlyMetrics.months[11].monthName).toBe('Diciembre');
      expect(yearlyMetrics.totals).toEqual({
        subtotal: 0,
        vat: 0,
        irpf: 0,
        total: 0,
        count: 0,
      });
    });

    it('acumula percentage, defaults y gastos sin conceptos en el mes correspondiente', async () => {
      spentRepository.getSpentsForMetrics.mockImplementation((startDate: Date) => {
        if (startDate.getMonth() !== 1) {
          return Promise.resolve([]);
        }
        return Promise.resolve([
          buildSpent(),
          buildSpent({
            id: 'sin-percentage',
            concepts: [
              {
                name: 'Sin percentage',
                base_price: 80,
                quantity: 1,
                vat: 10,
                irpf: 15,
                supplied: false,
              } as Spent['concepts'][number],
            ],
          }),
          buildSpent({
            id: 'defaults',
            concepts: [
              {
                name: 'Defaults',
                supplied: false,
              } as Spent['concepts'][number],
            ],
          }),
          buildSpent({ id: 'sin-conceptos', concepts: undefined }),
        ]);
      });

      const yearlyMetrics = await service.getYearlySpentMetrics(2026, enterpriseId);

      expect(yearlyMetrics.months[1].monthName).toBe('Febrero');
      expect(yearlyMetrics.months[1].count).toBe(4);
      expect(yearlyMetrics.months[1].subtotal).toBe(130);
      expect(yearlyMetrics.months[1].vat).toBe(18.5);
      expect(yearlyMetrics.months[1].irpf).toBe(12);
      expect(yearlyMetrics.months[1].total).toBe(136.5);
      expect(yearlyMetrics.totals.count).toBe(4);
      expect(yearlyMetrics.totals.subtotal).toBe(130);
    });
  });
});
