import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SigningAction } from 'src/entities/signing/signing.entity';
import { coverDtoClass } from 'src/test-utils/cover-data-classes';
import { CreateSigningDto } from './create-signing.dto';
import { UpdateSigningDto } from './update-signing.dto';

/**
 * Cubre constructores y validadores de los DTO de alta y edición de fichajes.
 */
describe('DTO de petición de fichajes', () => {
  it('debe instanciar CreateSigningDto y validar un cuerpo típico', async () => {
    const dto = coverDtoClass(CreateSigningDto, {
      userEnterpriseId: '123e4567-e89b-12d3-a456-426614174000',
      action: SigningAction.START,
      moment: '2026-04-13T08:15:00.000Z',
      durationInSeconds: 28800,
    });
    const transformed = plainToInstance(CreateSigningDto, {
      userEnterpriseId: dto.userEnterpriseId,
      action: dto.action,
      moment: dto.moment,
      durationInSeconds: '28800',
    });
    const validationErrors = await validate(transformed);

    expect(dto.action).toBe(SigningAction.START);
    expect(transformed.durationInSeconds).toBe(28800);
    expect(validationErrors).toHaveLength(0);
  });

  it('debe instanciar UpdateSigningDto con campos opcionales', async () => {
    const dto = coverDtoClass(UpdateSigningDto, {
      action: SigningAction.END,
      moment: '2026-04-13T17:00:00.000Z',
      durationInSeconds: 0,
    });
    const emptyUpdate = new UpdateSigningDto();
    const validationErrors = await validate(plainToInstance(UpdateSigningDto, dto));
    const emptyErrors = await validate(emptyUpdate);

    expect(dto.durationInSeconds).toBe(0);
    expect(emptyUpdate.action).toBeUndefined();
    expect(validationErrors).toHaveLength(0);
    expect(emptyErrors).toHaveLength(0);
  });
});
