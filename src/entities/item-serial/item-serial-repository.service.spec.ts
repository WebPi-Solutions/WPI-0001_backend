jest.mock('src/common/helpers/query-builder/query-builder.service', () => ({
  QueryBuilderService: {
    getCount: jest.fn().mockResolvedValue(0),
    getPaginatedResults: jest.fn().mockResolvedValue({
      items: [],
      total: 0,
      currentPage: 1,
      totalPages: 0,
    }),
  },
}));

import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryBuilderService } from 'src/common/helpers/query-builder/query-builder.service';
import { ItemSerialStatus } from 'src/common/enums';
import { ItemSerial } from './item-serial.entity';
import { ItemSerialRepository } from './item-serial-repository.service';

async function expectHttpException(
  rejectedPromise: Promise<unknown>,
): Promise<HttpException> {
  try {
    await rejectedPromise;
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(HttpException);
    return error as HttpException;
  }
  throw new Error('Se esperaba una HttpException');
}

describe('ItemSerialRepository', () => {
  let itemSerialRepositoryService: ItemSerialRepository;
  let typeOrmRepositoryMock: {
    save: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    (QueryBuilderService.getPaginatedResults as jest.Mock).mockResolvedValue({
      items: [],
      total: 0,
      currentPage: 1,
      totalPages: 0,
    });
    typeOrmRepositoryMock = {
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      delete: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        ItemSerialRepository,
        {
          provide: getRepositoryToken(ItemSerial),
          useValue: typeOrmRepositoryMock,
        },
      ],
    }).compile();

    itemSerialRepositoryService = testingModule.get(ItemSerialRepository);
  });

  it('debería estar definido', () => {
    expect(itemSerialRepositoryService).toBeDefined();
  });

  describe('create', () => {
    it('persiste el número de serie', async () => {
      const payload = { serialNumber: 'SN-1' } as Partial<ItemSerial>;
      typeOrmRepositoryMock.save.mockResolvedValue({ id: 'is-uuid', ...payload });

      const result = await itemSerialRepositoryService.create(payload);
      expect(result.id).toBe('is-uuid');
    });

    it('traduce el 23505 a 409 indicando el número de serie', async () => {
      typeOrmRepositoryMock.save.mockRejectedValue({ code: '23505' });
      const thrownError = await expectHttpException(
        itemSerialRepositoryService.create({ serialNumber: 'SN-1' }),
      );
      expect(thrownError.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(thrownError.getResponse()).toBe(
        'El número de serie SN-1 ya existe para este artículo',
      );
    });

    it('traduce el 23505 a un mensaje genérico si no hay número de serie', async () => {
      typeOrmRepositoryMock.save.mockRejectedValue({ code: '23505' });
      const thrownError = await expectHttpException(
        itemSerialRepositoryService.create({}),
      );
      expect(thrownError.getResponse()).toBe(
        'El número de serie ya existe para este artículo',
      );
    });

    it('relanza errores que no son de unicidad', async () => {
      const unexpectedError = new Error('fallo');
      typeOrmRepositoryMock.save.mockRejectedValue(unexpectedError);
      await expect(
        itemSerialRepositoryService.create({ serialNumber: 'SN-1' }),
      ).rejects.toBe(unexpectedError);
    });
  });

  describe('findAll', () => {
    it('lista con relaciones', async () => {
      await itemSerialRepositoryService.findAll(2, 5, 'serialNumber', 'DESC', { itemId: 'item-1' }, [
        'item',
      ]);
      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalled();
    });

    it('lista con valores por defecto', async () => {
      await itemSerialRepositoryService.findAll();
      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'itemSerial',
        expect.objectContaining({ page: 1, pageSize: 10, sort: 'serialNumber' }),
      );
    });
  });

  describe('findById', () => {
    it('busca por identificador', async () => {
      const found = { id: 'is-uuid' } as ItemSerial;
      typeOrmRepositoryMock.findOne.mockResolvedValue(found);
      await expect(itemSerialRepositoryService.findById('is-uuid')).resolves.toEqual(found);
    });
  });

  describe('findByItemIdAndSerialNumber', () => {
    it('busca por artículo y número', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue({ id: 'is-uuid' });
      await itemSerialRepositoryService.findByItemIdAndSerialNumber('item-1', 'SN-1');
      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { itemId: 'item-1', serialNumber: 'SN-1' },
        relations: undefined,
      });
    });
  });

  describe('findByItemId', () => {
    it('filtra por estados cuando se informan', async () => {
      typeOrmRepositoryMock.find.mockResolvedValue([]);
      await itemSerialRepositoryService.findByItemId('item-1', [ItemSerialStatus.IN_STOCK]);
      expect(typeOrmRepositoryMock.find).toHaveBeenCalled();
    });

    it('lista todos si no hay estados', async () => {
      typeOrmRepositoryMock.find.mockResolvedValue([]);
      await itemSerialRepositoryService.findByItemId('item-1');
      expect(typeOrmRepositoryMock.find).toHaveBeenCalledWith({
        where: { itemId: 'item-1' },
        order: { serialNumber: 'ASC' },
      });
    });
  });

  describe('updateById', () => {
    it('lanza 404 si no existe', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue(null);
      const thrownError = await expectHttpException(
        itemSerialRepositoryService.updateById('missing', { serialNumber: 'SN-2' }),
      );
      expect(thrownError.getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('actualiza y recarga', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue({ id: 'is-uuid', serialNumber: 'SN-1' });
      typeOrmRepositoryMock.save.mockResolvedValue({});
      typeOrmRepositoryMock.findOne.mockResolvedValueOnce({ id: 'is-uuid' }).mockResolvedValueOnce({
        id: 'is-uuid',
        serialNumber: 'SN-2',
      });
      await itemSerialRepositoryService.updateById('is-uuid', { serialNumber: 'SN-2' });
      expect(typeOrmRepositoryMock.save).toHaveBeenCalled();
    });

    it('traduce 23505 en update indicando el número de serie', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue({ id: 'is-uuid' });
      typeOrmRepositoryMock.save.mockRejectedValue({ driverError: { code: '23505' } });
      const thrownError = await expectHttpException(
        itemSerialRepositoryService.updateById('is-uuid', { serialNumber: 'DUP' }),
      );
      expect(thrownError.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(thrownError.getResponse()).toBe(
        'El número de serie DUP ya existe para este artículo',
      );
    });

    it('usa el número de serie persistido si el parche no lo envía', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue({
        id: 'is-uuid',
        serialNumber: 'SN-PERSISTIDO',
      });
      typeOrmRepositoryMock.save.mockRejectedValue({ code: '23505' });
      const thrownError = await expectHttpException(
        itemSerialRepositoryService.updateById('is-uuid', { status: 'in_stock' } as never),
      );
      expect(thrownError.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(thrownError.getResponse()).toBe(
        'El número de serie SN-PERSISTIDO ya existe para este artículo',
      );
    });

    it('relanza otros errores en update', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue({ id: 'is-uuid' });
      const unexpectedError = new Error('db');
      typeOrmRepositoryMock.save.mockRejectedValue(unexpectedError);
      await expect(
        itemSerialRepositoryService.updateById('is-uuid', { serialNumber: 'SN-2' }),
      ).rejects.toBe(unexpectedError);
    });
  });

  describe('deleteById', () => {
    it('elimina por identificador', async () => {
      typeOrmRepositoryMock.delete.mockResolvedValue({ affected: 1 });
      await itemSerialRepositoryService.deleteById('is-uuid');
      expect(typeOrmRepositoryMock.delete).toHaveBeenCalledWith('is-uuid');
    });
  });
});
