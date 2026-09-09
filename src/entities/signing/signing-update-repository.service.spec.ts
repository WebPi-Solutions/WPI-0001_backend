import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { SigningAction } from './signing.entity';
import { SigningUpdate } from './signing-update.entity';
import { SigningUpdateRepository } from './signing-update-repository.service';

describe('SigningUpdateRepository', () => {
  let signingUpdateRepositoryService: SigningUpdateRepository;
  let typeOrmRepository: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
  };
  let transactionalRepository: {
    create: jest.Mock;
    save: jest.Mock;
  };

  const payload = {
    userEnterpriseId: 'user-enterprise-uuid',
    signingsId: 'signing-uuid',
    previousMoment: new Date('2026-04-13T08:00:00.000Z'),
    updatedMoment: new Date('2026-04-13T09:00:00.000Z'),
    previousAction: SigningAction.START,
    updatedAction: SigningAction.START,
  };

  beforeEach(async () => {
    typeOrmRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
    };
    transactionalRepository = {
      create: jest.fn(),
      save: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        SigningUpdateRepository,
        {
          provide: getRepositoryToken(SigningUpdate),
          useValue: typeOrmRepository,
        },
      ],
    }).compile();

    signingUpdateRepositoryService = testingModule.get(SigningUpdateRepository);
  });

  it('should be defined', () => {
    expect(signingUpdateRepositoryService).toBeDefined();
  });

  describe('createRecord', () => {
    it('usa el repositorio inyectado cuando no hay transacción', async () => {
      const savedRow = { id: 'update-uuid', ...payload };
      typeOrmRepository.create.mockReturnValue(savedRow);
      typeOrmRepository.save.mockResolvedValue(savedRow);

      await expect(signingUpdateRepositoryService.createRecord(null, payload)).resolves.toEqual(
        savedRow,
      );
      expect(typeOrmRepository.create).toHaveBeenCalledWith(payload);
      expect(typeOrmRepository.save).toHaveBeenCalledWith(savedRow);
    });

    it('usa el EntityManager de la transacción cuando se informa', async () => {
      const savedRow = { id: 'tx-update-uuid', ...payload };
      transactionalRepository.create.mockReturnValue(savedRow);
      transactionalRepository.save.mockResolvedValue(savedRow);
      const entityManager = {
        getRepository: jest.fn().mockReturnValue(transactionalRepository),
      } as unknown as EntityManager;

      await expect(
        signingUpdateRepositoryService.createRecord(entityManager, payload),
      ).resolves.toEqual(savedRow);
      expect(entityManager.getRepository).toHaveBeenCalledWith(SigningUpdate);
      expect(transactionalRepository.save).toHaveBeenCalledWith(savedRow);
      expect(typeOrmRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('findBySigningsIdChronological', () => {
    it('lista el histórico en orden cronológico con relaciones de usuario', async () => {
      typeOrmRepository.find.mockResolvedValue([]);

      await signingUpdateRepositoryService.findBySigningsIdChronological(payload.signingsId);

      expect(typeOrmRepository.find).toHaveBeenCalledWith({
        where: { signingsId: payload.signingsId },
        relations: ['userEnterprise', 'userEnterprise.user'],
        order: { createdAt: 'ASC' },
      });
    });
  });
});
