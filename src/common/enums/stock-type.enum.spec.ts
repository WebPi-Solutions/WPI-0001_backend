import { isValidStockType, StockType } from './stock-type.enum';

describe('StockType', () => {
  it('reconoce los tres tipos persistidos en PostgreSQL', () => {
    expect(isValidStockType(StockType.PURCHASE)).toBe(true);
    expect(isValidStockType(StockType.SALE)).toBe(true);
    expect(isValidStockType(StockType.REVERSAL)).toBe(true);
  });

  it('rechaza valores ajenos al enumerado', () => {
    expect(isValidStockType(null)).toBe(false);
    expect(isValidStockType(undefined)).toBe(false);
    expect(isValidStockType('adjustment')).toBe(false);
  });
});
