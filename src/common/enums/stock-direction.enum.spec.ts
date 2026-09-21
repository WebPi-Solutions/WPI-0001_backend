import { isValidStockDirection, StockDirection } from './stock-direction.enum';

describe('StockDirection', () => {
  it('reconoce las dos direcciones persistidas en PostgreSQL', () => {
    expect(isValidStockDirection(StockDirection.IN)).toBe(true);
    expect(isValidStockDirection(StockDirection.OUT)).toBe(true);
  });

  it('rechaza valores ajenos al enumerado', () => {
    expect(isValidStockDirection(null)).toBe(false);
    expect(isValidStockDirection(undefined)).toBe(false);
    expect(isValidStockDirection('purchase')).toBe(false);
  });
});
