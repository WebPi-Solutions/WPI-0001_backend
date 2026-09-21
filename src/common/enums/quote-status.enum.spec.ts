import { QuoteStatus } from './quote-status.enum';

describe('QuoteStatus', () => {
  it('expone los estados de presupuesto', () => {
    expect(QuoteStatus.DRAFT).toBe('draft');
    expect(QuoteStatus.ISSUED).toBe('issued');
    expect(QuoteStatus.ORDERED).toBe('ordered');
    expect(QuoteStatus.CONVERTED).toBe('converted');
    expect(QuoteStatus.REJECTED).toBe('rejected');
  });
});
