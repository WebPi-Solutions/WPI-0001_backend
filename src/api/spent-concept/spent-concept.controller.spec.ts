import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SpentConcept } from 'src/entities/spent-concept/spent-concept.entity';
import { SpentConceptController } from './spent-concept.controller';
import { SpentConceptService } from './spent-concept.service';

describe('SpentConceptController', () => {
  let controller: SpentConceptController;
  let spentConceptService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const spentConceptId = 'ic-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  beforeEach(async () => {
    spentConceptService = {
      create: jest.fn().mockResolvedValue({ id: spentConceptId }),
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [SpentConceptController],
      providers: [{ provide: SpentConceptService, useValue: spentConceptService }],
    }).compile();

    controller = testingModule.get(SpentConceptController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('exige enterpriseId', async () => {
      await expect(
        controller.create('', { name: 'Hora', spentId: 'inv' } as SpentConcept),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
    });

    it('delega al servicio', async () => {
      const payload = { name: 'Hora', spentId: 'inv' } as SpentConcept;

      await expect(controller.create(enterpriseId, payload)).resolves.toEqual({
        id: spentConceptId,
      });
      expect(spentConceptService.create).toHaveBeenCalledWith(payload, enterpriseId);
    });
  });

  describe('findAll', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findAll('')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
    });

    it('parsea el filtro y fuerza el tenant vía supplier.enterpriseId', async () => {
      await controller.findAll(
        enterpriseId,
        2,
        20,
        'name',
        'DESC',
        JSON.stringify({ 'supplier.enterpriseId': 'atacante', spentId: 'inv' }),
        'spent,item',
      );

      expect(spentConceptService.findAll).toHaveBeenCalledWith(
        2,
        20,
        'name',
        'DESC',
        { spentId: 'inv', 'supplier.enterpriseId': enterpriseId },
        ['spent', 'item', 'spent.supplier'],
      );
    });

    it('añade spent e spent.supplier si no se piden', async () => {
      await controller.findAll(enterpriseId);

      expect(spentConceptService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'position',
        'ASC',
        { 'supplier.enterpriseId': enterpriseId },
        ['spent', 'spent.supplier'],
      );
    });

    it('conserva el tenant si el filtro JSON es inválido', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await controller.findAll(enterpriseId, 1, 10, 'position', 'ASC', '{no-es-json');

      expect(console.error).toHaveBeenCalled();
      expect(spentConceptService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'position',
        'ASC',
        { 'supplier.enterpriseId': enterpriseId },
        ['spent', 'spent.supplier'],
      );
    });
  });

  describe('findById', () => {
    it('parsea relaciones', async () => {
      spentConceptService.findById.mockResolvedValue({ id: spentConceptId });

      await expect(controller.findById(spentConceptId, 'item,serials')).resolves.toEqual({
        id: spentConceptId,
      });
      expect(spentConceptService.findById).toHaveBeenCalledWith(spentConceptId, [
        'item',
        'serials',
      ]);
    });

    it('busca sin relaciones cuando no se informan', async () => {
      spentConceptService.findById.mockResolvedValue({ id: spentConceptId });

      await controller.findById(spentConceptId);

      expect(spentConceptService.findById).toHaveBeenCalledWith(spentConceptId, []);
    });
  });

  describe('updateById', () => {
    it('delega al servicio', async () => {
      const payload = { name: 'Nuevo' } as SpentConcept;
      spentConceptService.updateById.mockResolvedValue({ id: spentConceptId, ...payload });

      await expect(controller.updateById(spentConceptId, payload)).resolves.toEqual({
        id: spentConceptId,
        name: 'Nuevo',
      });
    });
  });

  describe('delete', () => {
    it('delega al servicio', async () => {
      spentConceptService.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(controller.delete(spentConceptId)).resolves.toEqual({
        affected: 1,
        raw: [],
      });
    });
  });
});
