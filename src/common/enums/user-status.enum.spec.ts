import { UserStatusTypes } from './user-status.enum';

describe('UserStatusTypes', () => {
  it('expone los estados de usuario', () => {
    expect(UserStatusTypes.ACTIVE).toBe('active');
    expect(UserStatusTypes.INACTIVE).toBe('inactive');
    expect(UserStatusTypes.PENDING).toBe('pending');
  });
});
