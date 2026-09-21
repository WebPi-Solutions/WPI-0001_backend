import { InvoiceStatus } from './invoice-status.enum';

describe('InvoiceStatus', () => {
  it('expone los estados de factura', () => {
    expect(InvoiceStatus.DRAFT).toBe('draft');
    expect(InvoiceStatus.ISSUED).toBe('issued');
    expect(InvoiceStatus.PAID).toBe('paid');
    expect(InvoiceStatus.PARTIALLY_PAID).toBe('partially_paid');
    expect(InvoiceStatus.CANCELLED).toBe('cancelled');
  });
});
