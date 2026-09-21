import { UserRoleTypes } from './user-role.enum';

describe('UserRoleTypes', () => {
  it('expone los roles globales de usuario', () => {
    expect(UserRoleTypes.USER).toBe('user');
    expect(UserRoleTypes.ADMIN).toBe('administrator');
  });
});
