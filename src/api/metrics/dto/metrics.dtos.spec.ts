import { coverDtoClass } from 'src/test-utils/cover-data-classes';
import { AiRequestCountsByTypeDto } from './ai-request-counts-by-type.dto';
import { ClientCountsByTypeDto } from './client-counts-by-type.dto';
import {
  AiRequestCountsByTypeDto as BarrelAiRequestCounts,
  ClientCountsByTypeDto as BarrelClientCounts,
  InvoiceSeriesListCountsDto as BarrelInvoiceSeriesCounts,
  SupplierCountsByTypeDto as BarrelSupplierCounts,
  UserCountsByStatusDto as BarrelUserCounts,
} from './index';
import { InvoiceSeriesListCountsDto } from './invoice-series-list-counts.dto';
import { SupplierCountsByTypeDto } from './supplier-counts-by-type.dto';
import { UserCountsByStatusDto } from './user-counts-by-status.dto';

/**
 * Cubre constructores de los DTO de conteos de métricas y el barrel `index.ts`.
 */
describe('DTO de métricas de listados', () => {
  it('debe instanciar AiRequestCountsByTypeDto', () => {
    const dto = coverDtoClass(AiRequestCountsByTypeDto, {
      total: 24,
      issuer: 12,
      concepts: 12,
    });

    expect(dto.total).toBe(24);
    expect(dto.issuer + dto.concepts).toBe(dto.total);
  });

  it('debe instanciar ClientCountsByTypeDto', () => {
    const dto = coverDtoClass(ClientCountsByTypeDto, {
      total: 120,
      individuals: 80,
      companies: 40,
    });

    expect(dto.total).toBe(120);
    expect(dto.individuals + dto.companies).toBe(dto.total);
  });

  it('debe instanciar InvoiceSeriesListCountsDto', () => {
    const dto = coverDtoClass(InvoiceSeriesListCountsDto, {
      total: 12,
      thisMonth: 3,
      lastWeek: 1,
    });

    expect(dto.thisMonth).toBe(3);
    expect(dto.lastWeek).toBe(1);
  });

  it('debe instanciar SupplierCountsByTypeDto', () => {
    const dto = coverDtoClass(SupplierCountsByTypeDto, {
      total: 45,
      individuals: 20,
      companies: 25,
    });

    expect(dto.companies).toBe(25);
  });

  it('debe instanciar UserCountsByStatusDto', () => {
    const dto = coverDtoClass(UserCountsByStatusDto, {
      total: 42,
      active: 30,
      inactive: 10,
    });

    expect(dto.active).toBe(30);
    expect(dto.inactive).toBe(10);
  });

  it('debe reexportar las clases desde el barrel index', () => {
    expect(BarrelAiRequestCounts).toBe(AiRequestCountsByTypeDto);
    expect(BarrelClientCounts).toBe(ClientCountsByTypeDto);
    expect(BarrelInvoiceSeriesCounts).toBe(InvoiceSeriesListCountsDto);
    expect(BarrelSupplierCounts).toBe(SupplierCountsByTypeDto);
    expect(BarrelUserCounts).toBe(UserCountsByStatusDto);
  });
});
