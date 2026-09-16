import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SupplierRepository } from 'src/entities/supplier/supplier-repository.service';
import { Supplier } from 'src/entities/supplier/supplier.entity';
import { SupplierService } from './supplier.service';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';

describe('SupplierService', () => {
  let service: SupplierService;
  let supplierRepository: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
    findByNifAndEnterpriseId: jest.Mock;
  };

  const supplierId = 'supplier-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  /**
   * Construye un proveedor de prueba.
   * @param overrides - Campos a sobrescribir
   * @returns Entidad Supplier simulada
   */
  const buildSupplier = (overrides: Partial<Supplier> = {}): Supplier =>
    ({
      id: supplierId,
      name: 'Proveedor Demo',
      nif: 'B11111111',
      enterpriseId: 'enterprise-uuid',
      ...overrides,
    }) as Supplier;

  beforeEach(async () => {
    supplierRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
      findByNifAndEnterpriseId: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        SupplierService,
        { provide: SupplierRepository, useValue: supplierRepository },
        {
          provide: EnterpriseAccessService,
          useValue: { assertCurrentEntityAccessible: jest.fn() },
        },
      ],
    }).compile();

    service = testingModule.get(SupplierService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('rechaza un NIF duplicado en la misma empresa', async () => {
      supplierRepository.findByNifAndEnterpriseId.mockResolvedValue(buildSupplier());

      await expect(service.create(buildSupplier())).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        message: 'Ya existe un proveedor con el NIF B11111111',
      });
      expect(supplierRepository.create).not.toHaveBeenCalled();
    });

    it('persiste el proveedor y lo devuelve', async () => {
      const createdSupplier = buildSupplier();
      supplierRepository.findByNifAndEnterpriseId.mockResolvedValue(null);
      supplierRepository.create.mockResolvedValue(createdSupplier);

      await expect(service.create(buildSupplier())).resolves.toEqual(createdSupplier);
      expect(supplierRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Proveedor Demo' }),
      );
    });

    it('relanza el error del repositorio', async () => {
      const repositoryError = new Error('fallo al crear');
      supplierRepository.findByNifAndEnterpriseId.mockResolvedValue(null);
      supplierRepository.create.mockRejectedValue(repositoryError);

      await expect(service.create(buildSupplier())).rejects.toBe(repositoryError);
    });
  });

  describe('findAll', () => {
    it('delega la consulta paginada al repositorio', async () => {
      supplierRepository.findAll.mockResolvedValue(emptyPaginatedResponse);
      const filter = { enterpriseId: 'enterprise-uuid' };

      await expect(
        service.findAll(1, 10, 'name', 'ASC', filter, ['enterprise']),
      ).resolves.toEqual(emptyPaginatedResponse);
      expect(supplierRepository.findAll).toHaveBeenCalledWith(
        1,
        10,
        'name',
        'ASC',
        filter,
        ['enterprise'],
      );
    });
  });

  describe('findById', () => {
    it('devuelve el proveedor cuando existe', async () => {
      const existingSupplier = buildSupplier();
      supplierRepository.findById.mockResolvedValue(existingSupplier);

      await expect(service.findById(supplierId, ['enterprise'])).resolves.toEqual(
        existingSupplier,
      );
      expect(supplierRepository.findById).toHaveBeenCalledWith(supplierId, ['enterprise']);
    });

    it('lanza 404 cuando el proveedor no existe', async () => {
      supplierRepository.findById.mockResolvedValue(null);

      await expect(service.findById(supplierId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Proveedor no encontrado',
      });
    });
  });

  describe('updateById', () => {
    it('lanza 404 si el proveedor no existe', async () => {
      supplierRepository.findById.mockResolvedValue(null);

      await expect(service.updateById(supplierId, buildSupplier())).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Proveedor no encontrado',
      });
    });

    it('actualiza el proveedor y lo devuelve', async () => {
      const updatedSupplier = buildSupplier({ name: 'Proveedor Actualizado' });
      supplierRepository.findById.mockResolvedValue(buildSupplier());
      supplierRepository.findByNifAndEnterpriseId.mockResolvedValue(null);
      supplierRepository.updateById.mockResolvedValue(updatedSupplier);

      await expect(service.updateById(supplierId, updatedSupplier)).resolves.toEqual(
        updatedSupplier,
      );
      expect(supplierRepository.updateById).toHaveBeenCalledWith(supplierId, updatedSupplier);
    });

    it('rechaza un NIF duplicado de otro proveedor de la misma empresa', async () => {
      supplierRepository.findById.mockResolvedValue(buildSupplier());
      supplierRepository.findByNifAndEnterpriseId.mockResolvedValue(
        buildSupplier({ id: 'otro-proveedor', nif: 'B99999999' }),
      );

      await expect(
        service.updateById(supplierId, buildSupplier({ nif: 'B99999999' })),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        message: 'Ya existe un proveedor con el NIF B99999999',
      });
      expect(supplierRepository.updateById).not.toHaveBeenCalled();
    });

    it('permite conservar el NIF del propio proveedor', async () => {
      const existingSupplier = buildSupplier();
      supplierRepository.findById.mockResolvedValue(existingSupplier);
      supplierRepository.findByNifAndEnterpriseId.mockResolvedValue(existingSupplier);
      supplierRepository.updateById.mockResolvedValue(
        buildSupplier({ name: 'Mismo NIF' }),
      );

      await expect(
        service.updateById(supplierId, buildSupplier({ name: 'Mismo NIF' })),
      ).resolves.toEqual(buildSupplier({ name: 'Mismo NIF' }));
      expect(supplierRepository.updateById).toHaveBeenCalled();
    });

    it('no comprueba el NIF si el cuerpo no lo informa', async () => {
      supplierRepository.findById.mockResolvedValue(buildSupplier());
      supplierRepository.updateById.mockResolvedValue(buildSupplier({ name: 'Sin NIF' }));

      await expect(
        service.updateById(supplierId, { name: 'Sin NIF' } as Supplier),
      ).resolves.toEqual(buildSupplier({ name: 'Sin NIF' }));
      expect(supplierRepository.findByNifAndEnterpriseId).not.toHaveBeenCalled();
    });

    it('relanza el error del repositorio', async () => {
      const repositoryError = new Error('fallo al actualizar');
      supplierRepository.findById.mockResolvedValue(buildSupplier());
      supplierRepository.findByNifAndEnterpriseId.mockResolvedValue(null);
      supplierRepository.updateById.mockRejectedValue(repositoryError);

      await expect(service.updateById(supplierId, buildSupplier())).rejects.toBe(
        repositoryError,
      );
    });
  });

  describe('deleteById', () => {
    it('lanza 404 si el proveedor no existe', async () => {
      supplierRepository.findById.mockResolvedValue(null);

      await expect(service.deleteById(supplierId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Proveedor no encontrado',
      });
    });

    it('elimina el proveedor y devuelve el resultado', async () => {
      supplierRepository.findById.mockResolvedValue(buildSupplier());
      supplierRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.deleteById(supplierId)).resolves.toEqual({ affected: 1, raw: [] });
      expect(supplierRepository.deleteById).toHaveBeenCalledWith(supplierId);
    });

    it('relanza el error del repositorio', async () => {
      const repositoryError = new Error('fallo al eliminar');
      supplierRepository.findById.mockResolvedValue(buildSupplier());
      supplierRepository.deleteById.mockRejectedValue(repositoryError);

      await expect(service.deleteById(supplierId)).rejects.toBe(repositoryError);
    });
  });

  describe('verifySupplierExistsByNif', () => {
    it('devuelve el proveedor cuando el NIF existe en la empresa', async () => {
      const existingSupplier = buildSupplier();
      supplierRepository.findByNifAndEnterpriseId.mockResolvedValue(existingSupplier);

      await expect(
        service.verifySupplierExistsByNif('B11111111', 'enterprise-uuid'),
      ).resolves.toEqual(existingSupplier);
    });

    it('devuelve null cuando el NIF no existe en la empresa', async () => {
      supplierRepository.findByNifAndEnterpriseId.mockResolvedValue(null);

      await expect(
        service.verifySupplierExistsByNif('X00000000', 'enterprise-uuid'),
      ).resolves.toBeNull();
    });
  });
});
