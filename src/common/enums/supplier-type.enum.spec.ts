import { SupplierType } from './supplier-type.enum';

describe('SupplierType', () => {
  it('expone los tipos de proveedor', () => {
    expect(SupplierType.COMPANY).toBe('company');
    expect(SupplierType.INDIVIDUAL).toBe('individual');
  });
});
