import { SpentStatus } from './spent-status.enum';

describe('SpentStatus', () => {
  it('expone los estados de gasto', () => {
    expect(SpentStatus.PENDING).toBe('pending');
    expect(SpentStatus.PAID).toBe('paid');
    expect(SpentStatus.PARTIALLY_PAID).toBe('partially_paid');
    expect(SpentStatus.CANCELLED).toBe('cancelled');
  });
});
