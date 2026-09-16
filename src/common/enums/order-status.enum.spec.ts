import { DEFAULT_ORDER_STATUS, isValidOrderStatus, OrderStatus } from './order-status.enum';

describe('OrderStatus', () => {
  it('reconoce los tres estados persistidos en PostgreSQL', () => {
    expect(isValidOrderStatus(OrderStatus.AWAITING_RECEIPT)).toBe(true);
    expect(isValidOrderStatus(OrderStatus.RECEIVED)).toBe(true);
    expect(isValidOrderStatus(OrderStatus.INVOICED)).toBe(true);
  });

  it('rechaza valores ajenos al enumerado', () => {
    expect(isValidOrderStatus(null)).toBe(false);
    expect(isValidOrderStatus(undefined)).toBe(false);
    expect(isValidOrderStatus('draft')).toBe(false);
  });

  it('usa pendiente de recepción como estado por defecto', () => {
    expect(DEFAULT_ORDER_STATUS).toBe(OrderStatus.AWAITING_RECEIPT);
  });
});
