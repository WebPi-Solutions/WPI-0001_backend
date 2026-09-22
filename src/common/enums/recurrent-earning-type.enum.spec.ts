import { RecurrentEarningType } from './recurrent-earning-type.enum';

describe('RecurrentEarningType', () => {
  it('expone las periodicidades de ingreso recurrente', () => {
    expect(RecurrentEarningType.MONTHLY).toBe('monthly');
    expect(RecurrentEarningType.QUARTERLY).toBe('quarterly');
    expect(RecurrentEarningType.YEARLY).toBe('yearly');
  });
});
