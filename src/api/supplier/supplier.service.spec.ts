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
    it('persiste el proveedor y lo devuelve', async () => {
      const createdSupplier = buildSupplier();
      supplierRepository.create.mockResolvedValue(createdSupplier);

      await expect(service.create(buildSupplier())).resolves.toEqual(createdSupplier);
      expect(supplierRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Proveedor Demo' }),
      );
    });

    it('relanza el error del repositorio', async () => {
      const repositoryError = new Error('fallo al crear');
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
      supplierRepository.updateById.mockResolvedValue(updatedSupplier);

      await expect(service.updateById(supplierId, updatedSupplier)).resolves.toEqual(
        updatedSupplier,
      );
      expect(supplierRepository.updateById).toHaveBeenCalledWith(supplierId, updatedSupplier);
    });

    it('relanza el error del repositorio', async () => {
      const repositoryError = new Error('fallo al actualizar');
      supplierRepository.findById.mockResolvedValue(buildSupplier());
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
});
