import { SigningAction } from './signing-action.enum';

describe('SigningAction', () => {
  it('expone las acciones de fichaje', () => {
    expect(SigningAction.START).toBe('start');
    expect(SigningAction.END).toBe('end');
  });
});
