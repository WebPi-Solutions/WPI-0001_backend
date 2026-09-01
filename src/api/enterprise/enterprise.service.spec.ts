import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EnterpriseRepository } from 'src/entities/enterprise/enterprise-repository.service';
import { Enterprise } from 'src/entities/enterprise/enterprise.entity';
import { DropboxService } from 'src/services/dropbox/dropbox.service';
import { EnterpriseService } from './enterprise.service';

describe('EnterpriseService', () => {
  let service: EnterpriseService;
  let enterpriseRepository: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
    findByNif: jest.Mock;
    getEnterpriseFolderPath: jest.Mock;
  };
  let dropboxService: {
    checkFolderExists: jest.Mock;
    deleteFile: jest.Mock;
    uploadFile: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';

  /**
   * Construye una empresa de prueba.
   * @param overrides - Campos a sobrescribir
   * @returns Entidad Enterprise simulada
   */
  const buildEnterprise = (overrides: Partial<Enterprise> = {}): Enterprise =>
    ({
      id: enterpriseId,
      name: 'Empresa Demo',
      nif: 'B00000000',
      stripeId: 'cus_original',
      recurrentEarnings: [],
      ...overrides,
    }) as Enterprise;

  beforeEach(async () => {
    enterpriseRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
      findByNif: jest.fn(),
      getEnterpriseFolderPath: jest.fn().mockReturnValue('/empresas/enterprise-uuid'),
    };
    dropboxService = {
      checkFolderExists: jest.fn().mockResolvedValue(false),
      deleteFile: jest.fn(),
      uploadFile: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        EnterpriseService,
        { provide: EnterpriseRepository, useValue: enterpriseRepository },
        { provide: DropboxService, useValue: dropboxService },
      ],
    }).compile();

    service = testingModule.get(EnterpriseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('no persiste stripeId ni relaciones enviadas por el cliente', async () => {
      enterpriseRepository.findByNif.mockResolvedValue(null);
      enterpriseRepository.create.mockImplementation((payload: Enterprise) =>
        Promise.resolve({ ...payload, id: enterpriseId }),
      );

      await service.create({
        name: 'Empresa Demo',
        nif: 'B00000000',
        stripeId: 'cus_forzado',
        clients: [{ id: 'client-uuid' }],
      } as unknown as Enterprise);

      expect(enterpriseRepository.create).toHaveBeenCalledWith(
        expect.not.objectContaining({
          stripeId: 'cus_forzado',
          clients: expect.anything(),
        }),
      );
      const persistedPayload = enterpriseRepository.create.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(persistedPayload.stripeId).toBeUndefined();
      expect(persistedPayload.clients).toBeUndefined();
      expect(persistedPayload.name).toBe('Empresa Demo');
    });
  });

  describe('updateById', () => {
    it('elimina stripeId del payload de actualización', async () => {
      enterpriseRepository.findById.mockResolvedValue(buildEnterprise());
      enterpriseRepository.updateById.mockResolvedValue(buildEnterprise());

      await service.updateById(enterpriseId, {
        name: 'Nuevo nombre',
        stripeId: 'cus_inyectado',
      } as Enterprise);

      const persistedPayload = enterpriseRepository.updateById.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(persistedPayload.stripeId).toBeUndefined();
      expect(persistedPayload.name).toBe('Nuevo nombre');
    });
  });

  describe('deleteById', () => {
    it('bloquea el borrado cuando hay ingresos recurrentes asociados', async () => {
      enterpriseRepository.findById.mockResolvedValue(
        buildEnterprise({
          recurrentEarnings: [{ id: 'recurrent-uuid' }] as Enterprise['recurrentEarnings'],
        }),
      );

      await expect(service.deleteById(enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'No se puede eliminar la empresa porque tiene ingresos recurrentes asociados',
      });
      expect(enterpriseRepository.deleteById).not.toHaveBeenCalled();
    });

    it('elimina la carpeta de Dropbox si la empresa se borra y la carpeta existe', async () => {
      enterpriseRepository.findById.mockResolvedValue(buildEnterprise());
      enterpriseRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });
      dropboxService.checkFolderExists.mockResolvedValue(true);

      await expect(service.deleteById(enterpriseId)).resolves.toEqual({ affected: 1, raw: [] });
      expect(dropboxService.deleteFile).toHaveBeenCalledWith('/empresas/enterprise-uuid');
    });

    it('no intenta borrar Dropbox si la carpeta no existe', async () => {
      enterpriseRepository.findById.mockResolvedValue(buildEnterprise());
      enterpriseRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });
      dropboxService.checkFolderExists.mockResolvedValue(false);

      await service.deleteById(enterpriseId);

      expect(dropboxService.deleteFile).not.toHaveBeenCalled();
    });
  });
});
