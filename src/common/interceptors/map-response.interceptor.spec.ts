import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';
import { InvoiceResponseDto } from 'src/entities/invoice/dto/invoice-response.dto';
import { SpentResponseDto } from 'src/entities/spent/dto/spent-response.dto';
import { MAP_RESPONSE_KEY } from '../decorators/map-response.decorator';
import { MapResponseInterceptor } from './map-response.interceptor';

/**
 * Construye un ExecutionContext mínimo para las pruebas del interceptor.
 * @param dto - Clase DTO asociada al handler, o undefined si no hay mapeo
 * @returns Contexto de ejecución simulado
 */
function createExecutionContext(dto?: new (...args: unknown[]) => unknown): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
  } as ExecutionContext;
}

describe('MapResponseInterceptor', () => {
  let reflector: Reflector;
  let interceptor: MapResponseInterceptor;

  beforeEach(() => {
    reflector = new Reflector();
    interceptor = new MapResponseInterceptor(reflector);
  });

  /**
   * Comprueba que una factura se serializa sin `quoteId` ni relaciones internas de TypeORM.
   */
  it('debe exponer solo los campos públicos de factura y omitir quoteId', (done) => {
    jest.spyOn(reflector, 'get').mockReturnValue(InvoiceResponseDto);

    const rawInvoice = {
      id: 'inv-1',
      clientId: 'cli-1',
      seriesId: 'ser-1',
      quoteId: 'quote-should-be-hidden',
      recurrentEarningId: 'rec-1',
      seriesNumber: 12,
      name: 'Factura test',
      issuedDate: new Date('2026-01-01'),
      collectionDate: new Date('2026-01-15'),
      concepts: [{ name: 'Horas', base_price: 100, vat: 21, irpf: 15, quantity: 1, supplied: false }],
      status: 'issued',
      clientName: 'Cliente SA',
      clientNif: 'B12345678',
      clientAddress: 'Calle 1',
      issuerName: 'Emisor SL',
      issuerNif: 'B87654321',
      issuerAddress: 'Calle 2',
      issuerBankAccount: 'ES00',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      quote: { id: 'quote-should-be-hidden' },
      client: {
        id: 'cli-1',
        enterpriseId: 'ent-1',
        name: 'Cliente SA',
        nif: 'B12345678',
        invoices: [{ id: 'should-not-leak' }],
      },
      series: {
        id: 'ser-1',
        enterpriseId: 'ent-1',
        series: 'A',
        description: 'Serie A',
        invoices: [{ id: 'should-not-leak' }],
      },
    };

    interceptor.intercept(createExecutionContext(InvoiceResponseDto), { handle: () => of(rawInvoice) }).subscribe({
      next: (mapped) => {
        const invoice = mapped as InvoiceResponseDto;
        expect(invoice.id).toBe('inv-1');
        expect(invoice.seriesId).toBe('ser-1');
        expect(invoice.clientId).toBe('cli-1');
        expect(invoice.recurrentEarningId).toBe('rec-1');
        expect(invoice.concepts[0].base_price).toBe(100);
        expect(invoice.client?.name).toBe('Cliente SA');
        expect(invoice.series?.enterpriseId).toBe('ent-1');
        expect((invoice as unknown as { quoteId?: string }).quoteId).toBeUndefined();
        expect((invoice as unknown as { quote?: unknown }).quote).toBeUndefined();
        expect((invoice.client as unknown as { invoices?: unknown }).invoices).toBeUndefined();
        expect((invoice.series as unknown as { invoices?: unknown }).invoices).toBeUndefined();
        done();
      },
      error: done.fail,
    });
  });

  /**
   * Comprueba que un gasto paginado conserva `supplierId` y el proveedor anidado.
   */
  it('debe mapear items paginados de gasto incluyendo supplierId', (done) => {
    jest.spyOn(reflector, 'get').mockImplementation((key: string) =>
      key === MAP_RESPONSE_KEY ? SpentResponseDto : undefined,
    );

    const paginated = {
      items: [
        {
          id: 'spent-1',
          supplierId: 'sup-1',
          name: 'Gasto test',
          issuedDate: new Date('2026-02-01'),
          collectionDate: new Date('2026-02-01'),
          declarationDate: new Date('2026-02-01'),
          concepts: [
            {
              name: 'Luz',
              base_price: 50,
              vat: 21,
              irpf: 0,
              quantity: 1,
              supplied: false,
              percentage: 100,
            },
          ],
          status: 'paid',
          file: true,
          createdAt: new Date('2026-02-01'),
          updatedAt: new Date('2026-02-01'),
          supplier: {
            id: 'sup-1',
            enterpriseId: 'ent-1',
            name: 'Proveedor SL',
            nif: 'B11111111',
            spents: [{ id: 'should-not-leak' }],
          },
        },
      ],
      total: 1,
      page: 1,
    };

    interceptor.intercept(createExecutionContext(SpentResponseDto), { handle: () => of(paginated) }).subscribe({
      next: (mapped) => {
        const response = mapped as { items: SpentResponseDto[]; total: number };
        expect(response.total).toBe(1);
        expect(response.items[0].supplierId).toBe('sup-1');
        expect(response.items[0].file).toBe(true);
        expect(response.items[0].concepts[0].percentage).toBe(100);
        expect(response.items[0].supplier?.name).toBe('Proveedor SL');
        expect((response.items[0].supplier as unknown as { spents?: unknown }).spents).toBeUndefined();
        done();
      },
      error: done.fail,
    });
  });

  /**
   * Sin DTO asociado el interceptor no transforma el cuerpo.
   */
  it('debe devolver la respuesta original cuando el handler no tiene DTO', (done) => {
    jest.spyOn(reflector, 'get').mockReturnValue(undefined);
    const originalPayload = { secret: 'no-mapear' };

    interceptor.intercept(createExecutionContext(), { handle: () => of(originalPayload) }).subscribe({
      next: (mapped) => {
        expect(mapped).toBe(originalPayload);
        done();
      },
      error: done.fail,
    });
  });

  /**
   * Primitivos, nulos y undefined no pasan por class-transformer.
   */
  it.each([
    ['texto', 'ok'],
    ['número', 42],
    ['booleano', true],
    ['nulo', null],
    ['indefinido', undefined],
  ])('debe dejar pasar un valor %s sin mapear', async (_label: string, primitiveValue: unknown) => {
    jest.spyOn(reflector, 'get').mockReturnValue(InvoiceResponseDto);

    const mapped = await firstValueFrom(
      interceptor.intercept(createExecutionContext(InvoiceResponseDto), {
        handle: () => of(primitiveValue),
      }),
    );

    expect(mapped).toBe(primitiveValue);
  });

  /**
   * Un array plano se serializa elemento a elemento.
   */
  it('debe mapear un array de facturas omitiendo campos internos', (done) => {
    jest.spyOn(reflector, 'get').mockReturnValue(InvoiceResponseDto);

    interceptor
      .intercept(createExecutionContext(InvoiceResponseDto), {
        handle: () =>
          of([
            {
              id: 'inv-array-1',
              clientId: 'cli-1',
              seriesId: 'ser-1',
              quoteId: 'quote-hidden',
              seriesNumber: 1,
              name: 'Factura array',
              issuedDate: new Date('2026-03-01'),
              collectionDate: new Date('2026-03-01'),
              concepts: [],
              status: 'issued',
              clientName: 'Cliente',
              clientNif: 'B1',
              issuerName: 'Emisor',
              issuerNif: 'B2',
              createdAt: new Date('2026-03-01'),
              updatedAt: new Date('2026-03-01'),
            },
          ]),
      })
      .subscribe({
        next: (mapped) => {
          const invoices = mapped as InvoiceResponseDto[];
          expect(Array.isArray(invoices)).toBe(true);
          expect(invoices[0].id).toBe('inv-array-1');
          expect((invoices[0] as unknown as { quoteId?: string }).quoteId).toBeUndefined();
          done();
        },
        error: done.fail,
      });
  });
});
