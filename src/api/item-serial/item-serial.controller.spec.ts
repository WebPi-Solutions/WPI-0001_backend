import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ItemSerialController } from './item-serial.controller';
import { ItemSerialService } from './item-serial.service';
import { ItemSerialStatus } from 'src/common/enums';

describe('ItemSerialController', () => {
  let controller: ItemSerialController;
  let itemSerialService: {
    findAll: jest.Mock;
    findById: jest.Mock;
    assertItemAccessibleForList: jest.Mock;
    parseStatusFilter: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const itemId = 'item-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  beforeEach(async () => {
    itemSerialService = {
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
      findById: jest.fn(),
      assertItemAccessibleForList: jest.fn().mockResolvedValue(undefined),
      parseStatusFilter: jest.fn().mockReturnValue(undefined),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [ItemSerialController],
      providers: [{ provide: ItemSerialService, useValue: itemSerialService }],
    }).compile();

    controller = testingModule.get(ItemSerialController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('exige enterpriseId e itemId', async () => {
      await expect(controller.findAll('', itemId)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
      await expect(controller.findAll(enterpriseId, '')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('delega al servicio con filtro de estado', async () => {
      itemSerialService.parseStatusFilter.mockReturnValue(ItemSerialStatus.IN_STOCK);
      await controller.findAll(
        enterpriseId,
        itemId,
        'in_stock',
        1,
        10,
        'serialNumber',
        'ASC',
        '{"foo":1}',
        'item',
      );
      expect(itemSerialService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'serialNumber',
        'ASC',
        expect.objectContaining({ itemId, status: ItemSerialStatus.IN_STOCK, foo: 1 }),
        ['item'],
      );
    });

    it('ignora un filtro JSON inválido', async () => {
      await controller.findAll(
        enterpriseId,
        itemId,
        undefined,
        1,
        10,
        'serialNumber',
        'ASC',
        '{invalido',
      );
      expect(itemSerialService.findAll).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('delega al servicio', async () => {
      itemSerialService.findById.mockResolvedValue({ id: 'is-1' });
      await expect(controller.findById('is-1', 'item')).resolves.toEqual({ id: 'is-1' });
    });

    it('usa relaciones vacías si no se informan', async () => {
      itemSerialService.findById.mockResolvedValue({ id: 'is-1' });
      await controller.findById('is-1');
      expect(itemSerialService.findById).toHaveBeenCalledWith('is-1', []);
    });
  });
});
