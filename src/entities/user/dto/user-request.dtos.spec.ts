import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { coverDtoClass } from 'src/test-utils/cover-data-classes';
import { UserEnterprise } from '../user-enterprise.entity';
import { UserRoleTypes, UserStatusTypes } from '../user.entity';
import { CreateUserDto } from './create-user.dto';
import { CreateUserEnterpriseDto } from './create-user-enterprise.dto';
import { UpdateUserDto } from './update-user.dto';

const SAMPLE_UUID = '123e4567-e89b-12d3-a456-426614174000';

/**
 * Cubre constructores y las ramas de `@ValidateIf` de los DTO de alta/edición de usuario.
 */
describe('DTO de petición de usuario', () => {
  it('debe instanciar CreateUserDto y validar defaultScheduleId en todas las ramas', async () => {
    const userEnterprise = new UserEnterprise();
    userEnterprise.id = SAMPLE_UUID;
    const basePayload = {
      name: 'Juan Pérez',
      email: 'juan.perez@example.com',
      phone: '666666666',
      status: UserStatusTypes.ACTIVE,
      userEnterprises: [userEnterprise],
      password: '123456',
    };

    const withUuid = coverDtoClass(CreateUserDto, {
      ...basePayload,
      defaultScheduleId: SAMPLE_UUID,
    });
    const withNull = coverDtoClass(CreateUserDto, {
      ...basePayload,
      defaultScheduleId: null,
    });
    const withEmpty = coverDtoClass(CreateUserDto, {
      ...basePayload,
      defaultScheduleId: '',
    });
    const withUndefined = coverDtoClass(CreateUserDto, {
      ...basePayload,
    });

    const validationOptions = { forbidUnknownValues: false };
    const uuidErrors = await validate(plainToInstance(CreateUserDto, withUuid), validationOptions);
    const nullErrors = await validate(plainToInstance(CreateUserDto, withNull), validationOptions);
    const emptyErrors = await validate(plainToInstance(CreateUserDto, withEmpty), validationOptions);
    const undefinedErrors = await validate(
      plainToInstance(CreateUserDto, withUndefined),
      validationOptions,
    );

    expect(withUuid.defaultScheduleId).toBe(SAMPLE_UUID);
    expect(withNull.defaultScheduleId).toBeNull();
    expect(withEmpty.defaultScheduleId).toBe('');
    expect(withUndefined.defaultScheduleId).toBeUndefined();
    expect(uuidErrors).toHaveLength(0);
    expect(nullErrors).toHaveLength(0);
    expect(emptyErrors).toHaveLength(0);
    expect(undefinedErrors).toHaveLength(0);
  });

  it('debe instanciar CreateUserEnterpriseDto y cubrir ValidateIf', async () => {
    const withUuid = coverDtoClass(CreateUserEnterpriseDto, {
      enterpriseId: SAMPLE_UUID,
      userId: SAMPLE_UUID,
      role: UserRoleTypes.USER,
      cardId: 1,
      defaultScheduleId: SAMPLE_UUID,
    });
    const withNull = coverDtoClass(CreateUserEnterpriseDto, {
      enterpriseId: SAMPLE_UUID,
      userId: SAMPLE_UUID,
      role: UserRoleTypes.ADMIN,
      cardId: 2,
      defaultScheduleId: null,
    });
    const withEmpty = coverDtoClass(CreateUserEnterpriseDto, {
      enterpriseId: SAMPLE_UUID,
      userId: SAMPLE_UUID,
      role: UserRoleTypes.USER,
      cardId: 3,
      defaultScheduleId: '',
    });
    const withUndefined = coverDtoClass(CreateUserEnterpriseDto, {
      enterpriseId: SAMPLE_UUID,
      userId: SAMPLE_UUID,
      role: UserRoleTypes.USER,
      cardId: 4,
    });

    expect((await validate(plainToInstance(CreateUserEnterpriseDto, withUuid))).length).toBe(0);
    expect((await validate(plainToInstance(CreateUserEnterpriseDto, withNull))).length).toBe(0);
    expect((await validate(plainToInstance(CreateUserEnterpriseDto, withEmpty))).length).toBe(0);
    expect((await validate(plainToInstance(CreateUserEnterpriseDto, withUndefined))).length).toBe(0);
    expect(withUuid.cardId).toBe(1);
  });

  it('debe instanciar UpdateUserDto como partial de CreateUserDto', async () => {
    const dto = coverDtoClass(UpdateUserDto, {
      name: 'Ana',
      email: 'ana@example.com',
      defaultScheduleId: null,
    });
    const emptyUpdate = new UpdateUserDto();
    const errors = await validate(plainToInstance(UpdateUserDto, dto), {
      forbidUnknownValues: false,
    });

    expect(dto.name).toBe('Ana');
    expect(emptyUpdate.email).toBeUndefined();
    expect(errors).toHaveLength(0);
  });
});
