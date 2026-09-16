import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SpentConceptSerial } from 'src/entities/spent-concept-serial/spent-concept-serial.entity';
import { SpentConceptSerialController } from './spent-concept-serial.controller';
import { SpentConceptSerialService } from './spent-concept-serial.service';

describe('SpentConceptSerialController', () => {
  let controller: SpentConceptSerialController;
  let spentConceptSerialService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
    assertSpentConceptAccessibleForList: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const spentConceptId = 'ic-uuid';
  const serialId = 'ics-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  beforeEach(async () => {
    spentConceptSerialService = {
      create: jest.fn().mockResolvedValue({ id: serialId }),
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
      assertSpentConceptAccessibleForList: jest.fn().mockResolvedValue(undefined),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [SpentConceptSerialController],
      providers: [{ provide: SpentConceptSerialService, useValue: spentConceptSerialService }],
    }).compile();

    controller = testingModule.get(SpentConceptSerialController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('exige enterpriseId', async () => {
      await expect(
        controller.create('', {
          spentConceptId,
          serialNumber: 'SN-1',
        } as SpentConceptSerial),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
    });

    it('delega al servicio', async () => {
      const payload = {
        spentConceptId,
        serialNumber: 'SN-1',
      } as SpentConceptSerial;

      await expect(controller.create(enterpriseId, payload)).resolves.toEqual({ id: serialId });
      expect(spentConceptSerialService.create).toHaveBeenCalledWith(payload, enterpriseId);
    });
  });

  describe('findAll', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findAll('', spentConceptId)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
    });

    it('exige spentConceptId', async () => {
      await expect(controller.findAll(enterpriseId, '')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID del concepto de gasto',
      });
    });

    it('parsea el filtro y fuerza spentConceptId', async () => {
      await controller.findAll(
        enterpriseId,
        spentConceptId,
        2,
        20,
        'serialNumber',
        'DESC',
        JSON.stringify({ spentConceptId: 'atacante', serialNumber: 'SN' }),
        'spentConcept,spentConcept.invoice',
      );

      expect(
        spentConceptSerialService.assertSpentConceptAccessibleForList,
      ).toHaveBeenCalledWith(spentConceptId, enterpriseId);
      expect(spentConceptSerialService.findAll).toHaveBeenCalledWith(
        2,
        20,
        'serialNumber',
        'DESC',
        { serialNumber: 'SN', spentConceptId },
        ['spentConcept', 'spentConcept.invoice'],
      );
    });

    it('añade spentConcept si no se pide y usa defaults', async () => {
      await controller.findAll(enterpriseId, spentConceptId);

      expect(spentConceptSerialService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'createdAt',
        'ASC',
        { spentConceptId },
        ['spentConcept'],
      );
    });

    it('conserva spentConceptId si el filtro JSON es inválido', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await controller.findAll(
        enterpriseId,
        spentConceptId,
        1,
        10,
        'createdAt',
        'ASC',
        '{no-es-json',
      );

      expect(console.error).toHaveBeenCalled();
      expect(spentConceptSerialService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'createdAt',
        'ASC',
        { spentConceptId },
        ['spentConcept'],
      );
    });
  });

  describe('findById', () => {
    it('parsea relaciones', async () => {
      spentConceptSerialService.findById.mockResolvedValue({ id: serialId });

      await expect(controller.findById(serialId, 'spentConcept')).resolves.toEqual({
        id: serialId,
      });
      expect(spentConceptSerialService.findById).toHaveBeenCalledWith(serialId, [
        'spentConcept',
      ]);
    });

    it('busca sin relaciones cuando no se informan', async () => {
      spentConceptSerialService.findById.mockResolvedValue({ id: serialId });

      await controller.findById(serialId);

      expect(spentConceptSerialService.findById).toHaveBeenCalledWith(serialId, []);
    });
  });

  describe('updateById', () => {
    it('delega al servicio', async () => {
      const payload = { serialNumber: 'SN-2' } as SpentConceptSerial;
      spentConceptSerialService.updateById.mockResolvedValue({ id: serialId, ...payload });

      await expect(controller.updateById(serialId, payload)).resolves.toEqual({
        id: serialId,
        serialNumber: 'SN-2',
      });
    });
  });

  describe('delete', () => {
    it('delega al servicio', async () => {
      spentConceptSerialService.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(controller.delete(serialId)).resolves.toEqual({ affected: 1, raw: [] });
    });
  });
});
