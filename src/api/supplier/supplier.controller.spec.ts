import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Supplier } from 'src/entities/supplier/supplier.entity';
import { SupplierController } from './supplier.controller';
import { SupplierService } from './supplier.service';

describe('SupplierController', () => {
  let controller: SupplierController;
  let supplierService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const supplierId = 'supplier-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  beforeEach(async () => {
    supplierService = {
      create: jest.fn().mockResolvedValue({ id: supplierId }),
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [SupplierController],
      providers: [{ provide: SupplierService, useValue: supplierService }],
    }).compile();

    controller = testingModule.get(SupplierController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('exige enterpriseId', async () => {
      await expect(
        controller.create('', { name: 'Proveedor' } as Supplier),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(supplierService.create).not.toHaveBeenCalled();
    });

    it('asigna el enterpriseId de la query al proveedor', async () => {
      const supplier = { name: 'Proveedor Demo', enterpriseId: 'empresa-atacante' } as Supplier;

      await expect(controller.create(enterpriseId, supplier)).resolves.toEqual({
        id: supplierId,
      });
      expect(supplier.enterpriseId).toBe(enterpriseId);
      expect(supplierService.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Proveedor Demo', enterpriseId }),
      );
    });
  });

  describe('findAll', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findAll('')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(supplierService.findAll).not.toHaveBeenCalled();
    });

    it('parsea el filtro JSON y fuerza el enterpriseId de la query', async () => {
      await controller.findAll(
        enterpriseId,
        2,
        20,
        'name',
        'DESC',
        JSON.stringify({ enterpriseId: 'empresa-atacante', type: 'company' }),
        'enterprise,spents',
      );

      expect(supplierService.findAll).toHaveBeenCalledWith(
        2,
        20,
        'name',
        'DESC',
        { type: 'company', enterpriseId },
        ['enterprise', 'spents'],
      );
    });

    it('conserva el enterpriseId si el filtro JSON es inválido', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await controller.findAll(enterpriseId, 1, 10, 'name', 'ASC', '{no-es-json');

      expect(console.error).toHaveBeenCalled();
      expect(supplierService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'name',
        'ASC',
        { enterpriseId },
        [],
      );
    });

    it('usa valores por defecto al omitir query opcionales', async () => {
      await controller.findAll(enterpriseId);

      expect(supplierService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'name',
        'ASC',
        { enterpriseId },
        [],
      );
    });
  });

  describe('findById', () => {
    it('delega al servicio parseando las relaciones', async () => {
      supplierService.findById.mockResolvedValue({ id: supplierId });

      await expect(controller.findById(supplierId, 'enterprise,spents')).resolves.toEqual({
        id: supplierId,
      });
      expect(supplierService.findById).toHaveBeenCalledWith(supplierId, [
        'enterprise',
        'spents',
      ]);
    });

    it('busca sin relaciones cuando no se informan', async () => {
      supplierService.findById.mockResolvedValue({ id: supplierId });

      await controller.findById(supplierId);

      expect(supplierService.findById).toHaveBeenCalledWith(supplierId, []);
    });
  });

  describe('updateById', () => {
    it('delega la actualización al servicio', async () => {
      const payload = { name: 'Proveedor Actualizado' } as Supplier;
      supplierService.updateById.mockResolvedValue({ id: supplierId, ...payload });

      await expect(controller.updateById(supplierId, payload)).resolves.toEqual({
        id: supplierId,
        name: 'Proveedor Actualizado',
      });
      expect(supplierService.updateById).toHaveBeenCalledWith(supplierId, payload);
    });
  });

  describe('delete', () => {
    it('delega la eliminación al servicio', async () => {
      supplierService.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(controller.delete(supplierId)).resolves.toEqual({ affected: 1, raw: [] });
      expect(supplierService.deleteById).toHaveBeenCalledWith(supplierId);
    });
  });
});
