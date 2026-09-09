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
  let spentRepository: {
    getSpentSubtotalsByStatus: jest.Mock;
    getSpentsForMetrics: jest.Mock;
  };

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
      getInvoiceSubtotalsByStatus: jest.fn(),
      getNonDraftInvoicesForMetrics: jest.fn().mockResolvedValue([]),
    };
    spentRepository = {
      getSpentSubtotalsByStatus: jest.fn(),
      getSpentsForMetrics: jest.fn().mockResolvedValue([]),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsService,
        { provide: InvoiceRepository, useValue: invoiceRepository },
        { provide: QuoteRepository, useValue: {} },
        { provide: SpentRepository, useValue: spentRepository },
        { provide: UserRepository, useValue: {} },
        { provide: ClientRepository, useValue: {} },
        { provide: SupplierRepository, useValue: {} },
        { provide: InvoiceSeriesRepository, useValue: {} },
      ],
    }).compile();

    service = testingModule.get(MetricsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
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

    it('cuenta facturas sin conceptos y no altera los importes', async () => {
      invoiceRepository.getNonDraftInvoicesForMetrics.mockResolvedValue([
        buildInvoice({ id: 'with-concepts' }),
        buildInvoice({ id: 'without-concepts', concepts: undefined }),
      ]);

      const metrics = await service.getInvoicesMetrics(periodStart, periodEnd, enterpriseId);

      expect(metrics.invoiceCount).toBe(2);
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
  });
});
