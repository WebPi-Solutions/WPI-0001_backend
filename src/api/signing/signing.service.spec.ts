import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EnterpriseAccessService } from 'src/helpers/enterprise-access/enterprise-access.service';
import { SigningRepository } from 'src/entities/signing/signing-repository.service';
import { SigningUpdateRepository } from 'src/entities/signing/signing-update-repository.service';
import { Signing, SigningAction } from 'src/entities/signing/signing.entity';
import { SigningService } from './signing.service';
import { CreateSigningDto } from './dto/create-signing.dto';

describe('SigningService', () => {
  let service: SigningService;
  let signingRepository: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
    findLatestOpenStartSigningForUser: jest.Mock;
    findByUserEnterpriseIdOrderedByMoment: jest.Mock;
    markCancelledEntity: jest.Mock;
    getEntityManager: jest.Mock;
  };
  let signingUpdateRepository: {
    createRecord: jest.Mock;
    findBySigningsIdChronological: jest.Mock;
  };
  let enterpriseAccessService: {
    assertUserEnterpriseBelongsToEnterprise: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const userEnterpriseId = 'user-enterprise-uuid';
  const signingId = 'signing-uuid';
  /** Reloj fijo posterior a las jornadas de prueba (08:00–16:00) para no disparar la validación de futuro. */
  const fixedNowEpochMs = Date.parse('2026-04-13T18:00:00.000Z');

  /**
   * Construye un fichaje de prueba con valores por defecto deterministas.
   * @param overrides - Campos a sobrescribir
   * @returns Entidad Signing simulada
   */
  const buildSigning = (overrides: Partial<Signing> = {}): Signing =>
    ({
      id: signingId,
      userEnterpriseId,
      action: SigningAction.START,
      moment: new Date('2026-04-13T08:00:00.000Z'),
      durationInSeconds: null,
      cancelled: false,
      createdAt: new Date('2026-04-13T08:00:00.000Z'),
      updatedAt: new Date('2026-04-13T08:00:00.000Z'),
      ...overrides,
    }) as Signing;

  beforeEach(async () => {
    jest.spyOn(Date, 'now').mockReturnValue(fixedNowEpochMs);

    signingRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
      findLatestOpenStartSigningForUser: jest.fn(),
      findByUserEnterpriseIdOrderedByMoment: jest.fn(),
      markCancelledEntity: jest.fn(),
      getEntityManager: jest.fn(),
    };
    signingUpdateRepository = {
      createRecord: jest.fn().mockResolvedValue({}),
      findBySigningsIdChronological: jest.fn().mockResolvedValue([]),
    };
    enterpriseAccessService = {
      assertUserEnterpriseBelongsToEnterprise: jest.fn().mockResolvedValue({
        id: userEnterpriseId,
        userId: 'user-uuid',
        enterpriseId,
      }),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        SigningService,
        { provide: SigningRepository, useValue: signingRepository },
        { provide: SigningUpdateRepository, useValue: signingUpdateRepository },
        { provide: EnterpriseAccessService, useValue: enterpriseAccessService },
      ],
    }).compile();

    service = testingModule.get(SigningService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('rechaza un momento con formato inválido', async () => {
      const dto: CreateSigningDto = {
        userEnterpriseId,
        action: SigningAction.START,
        moment: 'fecha-invalida',
      };

      await expect(service.create(enterpriseId, dto)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'La fecha y hora indicada no es válida.',
      });
      expect(signingRepository.create).not.toHaveBeenCalled();
    });

    it('rechaza un momento posterior a ahora más la tolerancia', async () => {
      const dto: CreateSigningDto = {
        userEnterpriseId,
        action: SigningAction.START,
        moment: new Date(fixedNowEpochMs + 2000).toISOString(),
      };

      await expect(service.create(enterpriseId, dto)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message:
          'No se puede crear o editar un fichaje con una fecha y hora posterior a la actual.',
      });
      expect(signingRepository.create).not.toHaveBeenCalled();
    });

    it('acepta un momento ligeramente adelantado dentro de la tolerancia', async () => {
      const momentIso = new Date(fixedNowEpochMs + 1000).toISOString();
      const created = buildSigning({
        moment: new Date(momentIso),
        action: SigningAction.START,
      });
      signingRepository.create.mockResolvedValue(created);

      await expect(
        service.create(enterpriseId, {
          userEnterpriseId,
          action: SigningAction.START,
          moment: momentIso,
        }),
      ).resolves.toEqual(created);
      expect(signingRepository.findLatestOpenStartSigningForUser).not.toHaveBeenCalled();
    });

    it('asigna duración al último START abierto al registrar un END', async () => {
      const endMoment = new Date('2026-04-13T16:00:00.000Z');
      const openStart = buildSigning({
        id: 'start-uuid',
        action: SigningAction.START,
        moment: new Date('2026-04-13T08:00:00.000Z'),
        durationInSeconds: null,
      });
      const createdEnd = buildSigning({
        id: 'end-uuid',
        action: SigningAction.END,
        moment: endMoment,
      });
      signingRepository.create.mockResolvedValue(createdEnd);
      signingRepository.findLatestOpenStartSigningForUser.mockResolvedValue(openStart);
      signingRepository.updateById.mockResolvedValue({
        ...openStart,
        durationInSeconds: 28800,
      });

      await expect(
        service.create(enterpriseId, {
          userEnterpriseId,
          action: SigningAction.END,
          moment: endMoment.toISOString(),
        }),
      ).resolves.toEqual(createdEnd);

      expect(signingRepository.findLatestOpenStartSigningForUser).toHaveBeenCalledWith(
        userEnterpriseId,
        endMoment,
      );
      expect(signingRepository.updateById).toHaveBeenCalledWith('start-uuid', {
        durationInSeconds: 28800,
      });
    });

    it('no falla la creación del END si no hay START pendiente', async () => {
      const createdEnd = buildSigning({
        id: 'end-uuid',
        action: SigningAction.END,
        moment: new Date('2026-04-13T16:00:00.000Z'),
      });
      signingRepository.create.mockResolvedValue(createdEnd);
      signingRepository.findLatestOpenStartSigningForUser.mockResolvedValue(null);

      await expect(
        service.create(enterpriseId, {
          userEnterpriseId,
          action: SigningAction.END,
          moment: '2026-04-13T16:00:00.000Z',
        }),
      ).resolves.toEqual(createdEnd);
      expect(signingRepository.updateById).not.toHaveBeenCalled();
    });

    it('no propaga el error si falla el cálculo de duración tras un END', async () => {
      const createdEnd = buildSigning({
        id: 'end-uuid',
        action: SigningAction.END,
        moment: new Date('2026-04-13T16:00:00.000Z'),
      });
      signingRepository.create.mockResolvedValue(createdEnd);
      signingRepository.findLatestOpenStartSigningForUser.mockRejectedValue(
        new Error('fallo de repositorio'),
      );

      await expect(
        service.create(enterpriseId, {
          userEnterpriseId,
          action: SigningAction.END,
          moment: '2026-04-13T16:00:00.000Z',
        }),
      ).resolves.toEqual(createdEnd);
    });
  });

  describe('findById', () => {
    it('oculta un fichaje anulado con 404', async () => {
      signingRepository.findById.mockResolvedValue(buildSigning({ cancelled: true }));

      await expect(service.findById(signingId, enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Fichaje no encontrado',
      });
    });

    it('lanza 404 si el fichaje no existe', async () => {
      signingRepository.findById.mockResolvedValue(null);

      await expect(service.findById(signingId, enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });
  });

  describe('deleteById', () => {
    it('es idempotente si el fichaje ya estaba anulado', async () => {
      signingRepository.findById.mockResolvedValue(buildSigning({ cancelled: true }));

      await expect(service.deleteById(signingId, enterpriseId)).resolves.toEqual({
        affected: 0,
        raw: [],
        generatedMaps: [],
      });
      expect(signingRepository.markCancelledEntity).not.toHaveBeenCalled();
    });

    it('marca como anulado un fichaje activo', async () => {
      const current = buildSigning({ cancelled: false });
      signingRepository.findById.mockResolvedValue(current);
      signingRepository.markCancelledEntity.mockResolvedValue(undefined);

      await expect(service.deleteById(signingId, enterpriseId)).resolves.toEqual({
        affected: 1,
        raw: [],
        generatedMaps: [],
      });
      expect(signingRepository.markCancelledEntity).toHaveBeenCalledWith(current);
    });
  });

  describe('updateById', () => {
    it('rechaza mover un fichaje a un momento futuro', async () => {
      signingRepository.findById.mockResolvedValue(buildSigning());

      await expect(
        service.updateById(
          signingId,
          enterpriseId,
          { moment: new Date(fixedNowEpochMs + 5000).toISOString() },
          'actor-uuid',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('registra histórico al actualizar solo la duración sin recalcular secuencia', async () => {
      const current = buildSigning({ durationInSeconds: null });
      const updated = buildSigning({ durationInSeconds: 3600 });
      signingRepository.findById.mockResolvedValue(current);
      signingRepository.updateById.mockResolvedValue(updated);

      await expect(
        service.updateById(signingId, enterpriseId, { durationInSeconds: 3600 }, 'actor-uuid'),
      ).resolves.toEqual(updated);

      expect(signingRepository.findByUserEnterpriseIdOrderedByMoment).not.toHaveBeenCalled();
      expect(signingUpdateRepository.createRecord).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          signingsId: signingId,
          previousAction: SigningAction.START,
          updatedAction: SigningAction.START,
        }),
      );
    });

    it('rechaza una secuencia que deja una salida al inicio del historial', async () => {
      const startSigning = buildSigning({
        id: 'start-uuid',
        action: SigningAction.START,
        moment: new Date('2026-04-13T08:00:00.000Z'),
      });
      const endSigning = buildSigning({
        id: 'end-uuid',
        action: SigningAction.END,
        moment: new Date('2026-04-13T16:00:00.000Z'),
      });
      signingRepository.findById.mockResolvedValue(endSigning);
      signingRepository.findByUserEnterpriseIdOrderedByMoment.mockResolvedValue([
        startSigning,
        endSigning,
      ]);

      await expect(
        service.updateById(
          'end-uuid',
          enterpriseId,
          { moment: '2026-04-13T07:00:00.000Z' },
          'actor-uuid',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: expect.stringContaining('siempre debe existir una entrada previa'),
      });
      expect(signingRepository.getEntityManager).not.toHaveBeenCalled();
    });

    it('recalcula duraciones en transacción cuando el movimiento de momento es válido', async () => {
      const startSigning = buildSigning({
        id: 'start-uuid',
        action: SigningAction.START,
        moment: new Date('2026-04-13T08:00:00.000Z'),
      });
      const endSigning = buildSigning({
        id: 'end-uuid',
        action: SigningAction.END,
        moment: new Date('2026-04-13T16:00:00.000Z'),
      });
      const repositoryUpdate = jest.fn().mockResolvedValue(undefined);
      signingRepository.findById
        .mockResolvedValueOnce(startSigning)
        .mockResolvedValueOnce({
          ...startSigning,
          moment: new Date('2026-04-13T09:00:00.000Z'),
        });
      signingRepository.findByUserEnterpriseIdOrderedByMoment.mockResolvedValue([
        startSigning,
        endSigning,
      ]);
      signingRepository.getEntityManager.mockReturnValue({
        transaction: jest.fn(async (callback: (manager: unknown) => Promise<void>) => {
          await callback({
            getRepository: () => ({ update: repositoryUpdate }),
          });
        }),
      });

      await service.updateById(
        'start-uuid',
        enterpriseId,
        { moment: '2026-04-13T09:00:00.000Z' },
        'actor-uuid',
      );

      expect(repositoryUpdate).toHaveBeenCalledWith(
        { id: 'start-uuid' },
        {
          moment: new Date('2026-04-13T09:00:00.000Z'),
          action: SigningAction.START,
        },
      );
      expect(repositoryUpdate).toHaveBeenCalledWith(
        { id: 'start-uuid' },
        { durationInSeconds: 25200 },
      );
      expect(signingUpdateRepository.createRecord).toHaveBeenCalled();
    });
  });
});
