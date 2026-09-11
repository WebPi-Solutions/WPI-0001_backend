import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { coverDtoClass } from 'src/test-utils/cover-data-classes';
import { CreateEnterpriseRoleDto } from './create-enterprise-role.dto';

/**
 * Cubre el DTO de alta/edición de rol de empresa.
 */
describe('CreateEnterpriseRoleDto', () => {
  it('acepta nombre y permisos válidos', async () => {
    const dto = coverDtoClass(CreateEnterpriseRoleDto, {
      role: 'Contabilidad',
      permissions: { invoices: { read: true, write: true } },
    });
    const errors = await validate(plainToInstance(CreateEnterpriseRoleDto, dto));

    expect(dto.role).toBe('Contabilidad');
    expect(errors).toHaveLength(0);
  });

  it('rechaza un nombre vacío', async () => {
    const dto = coverDtoClass(CreateEnterpriseRoleDto, { role: '' });
    const errors = await validate(plainToInstance(CreateEnterpriseRoleDto, dto));

    expect(errors.length).toBeGreaterThan(0);
  });
});
