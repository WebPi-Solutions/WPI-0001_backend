import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { SigningAction } from './signing.entity';
import { SigningUpdate } from './signing-update.entity';
import { SigningUpdateRepository } from './signing-update-repository.service';

describe('SigningUpdateRepository', () => {
  let signingUpdateRepositoryService: SigningUpdateRepository;
  let typeOrmRepositoryMock: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
  };

  const auditPayload = {
    userEnterpriseId: 'link-uuid',
    signingsId: 'signing-uuid',
    previousMoment: new Date('2026-09-10T08:00:00.000Z'),
    updatedMoment: new Date('2026-09-10T08:05:00.000Z'),
    previousAction: SigningAction.START,
    updatedAction: SigningAction.END,
  };

  /**
   * Crea el módulo de pruebas con repositorio TypeORM simulado.
   */
  beforeEach(async () => {
    typeOrmRepositoryMock = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        SigningUpdateRepository,
        {
          provide: getRepositoryToken(SigningUpdate),
          useValue: typeOrmRepositoryMock,
        },
      ],
    }).compile();

    signingUpdateRepositoryService = testingModule.get(SigningUpdateRepository);
  });

  it('debería estar definido', () => {
    expect(signingUpdateRepositoryService).toBeDefined();
  });

  describe('createRecord', () => {
    it('usa el repositorio inyectado cuando no hay manager', async () => {
      const createdRow = { ...auditPayload } as SigningUpdate;
      const savedRow = { id: 'update-uuid', ...auditPayload } as SigningUpdate;
      typeOrmRepositoryMock.create.mockReturnValue(createdRow);
      typeOrmRepositoryMock.save.mockResolvedValue(savedRow);

      const result = await signingUpdateRepositoryService.createRecord(null, auditPayload);

      expect(typeOrmRepositoryMock.create).toHaveBeenCalledWith(auditPayload);
      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith(createdRow);
      expect(result).toEqual(savedRow);
    });

    it('usa el repositorio del manager cuando hay transacción', async () => {
      const transactionalRepository = {
        create: jest.fn(),
        save: jest.fn(),
      };
      const createdRow = { ...auditPayload } as SigningUpdate;
      const savedRow = { id: 'update-uuid', ...auditPayload } as SigningUpdate;
      transactionalRepository.create.mockReturnValue(createdRow);
      transactionalRepository.save.mockResolvedValue(savedRow);

      const entityManager = {
        getRepository: jest.fn().mockReturnValue(transactionalRepository),
      } as unknown as EntityManager;

      const result = await signingUpdateRepositoryService.createRecord(
        entityManager,
        auditPayload,
      );

      expect(entityManager.getRepository).toHaveBeenCalledWith(SigningUpdate);
      expect(transactionalRepository.create).toHaveBeenCalledWith(auditPayload);
      expect(transactionalRepository.save).toHaveBeenCalledWith(createdRow);
      expect(typeOrmRepositoryMock.create).not.toHaveBeenCalled();
      expect(result).toEqual(savedRow);
    });
  });

  describe('findBySigningsIdChronological', () => {
    it('lista el histórico del fichaje ordenado por createdAt ASC', async () => {
      const history = [{ id: 'update-uuid' }] as SigningUpdate[];
      typeOrmRepositoryMock.find.mockResolvedValue(history);

      const result =
        await signingUpdateRepositoryService.findBySigningsIdChronological('signing-uuid');

      expect(typeOrmRepositoryMock.find).toHaveBeenCalledWith({
        where: { signingsId: 'signing-uuid' },
        relations: ['userEnterprise', 'userEnterprise.user'],
        order: { createdAt: 'ASC' },
      });
      expect(result).toEqual(history);
    });
  });
});
