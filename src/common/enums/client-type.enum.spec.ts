import { ClientType } from './client-type.enum';

describe('ClientType', () => {
  it('expone los tipos de cliente', () => {
    expect(ClientType.COMPANY).toBe('company');
    expect(ClientType.PARTICULAR).toBe('particular');
  });
});
