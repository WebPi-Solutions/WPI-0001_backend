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
import { InvoiceConceptSerial } from './invoice-concept-serial.entity';
import { InvoiceConceptSerialRepository } from './invoice-concept-serial-repository.service';

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

describe('InvoiceConceptSerialRepository', () => {
  let invoiceConceptSerialRepositoryService: InvoiceConceptSerialRepository;
  let typeOrmRepositoryMock: {
    save: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
    count: jest.Mock;
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
      delete: jest.fn(),
      count: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceConceptSerialRepository,
        {
          provide: getRepositoryToken(InvoiceConceptSerial),
          useValue: typeOrmRepositoryMock,
        },
      ],
    }).compile();

    invoiceConceptSerialRepositoryService = testingModule.get(
      InvoiceConceptSerialRepository,
    );
  });

  it('debería estar definido', () => {
    expect(invoiceConceptSerialRepositoryService).toBeDefined();
  });

  describe('create', () => {
    it('persiste el número de serie', async () => {
      const payload = { serialNumber: 'SN-1' } as Partial<InvoiceConceptSerial>;
      typeOrmRepositoryMock.save.mockResolvedValue({ id: 'ics-uuid', ...payload });

      const result = await invoiceConceptSerialRepositoryService.create(payload);

      expect(result.id).toBe('ics-uuid');
    });

    it('traduce el 23505 a 409', async () => {
      typeOrmRepositoryMock.save.mockRejectedValue({ code: '23505' });

      const thrownError = await expectHttpException(
        invoiceConceptSerialRepositoryService.create({ serialNumber: 'SN-1' }),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.CONFLICT);
    });

    it('relanza errores que no son de unicidad', async () => {
      const unexpectedError = new Error('fallo');
      typeOrmRepositoryMock.save.mockRejectedValue(unexpectedError);

      await expect(
        invoiceConceptSerialRepositoryService.create({ serialNumber: 'SN-1' }),
      ).rejects.toBe(unexpectedError);
    });
  });

  describe('findAll', () => {
    it('lista con relaciones', async () => {
      await invoiceConceptSerialRepositoryService.findAll(
        2,
        5,
        'serialNumber',
        'DESC',
        { invoiceConceptId: 'ic-1' },
        ['invoiceConcept'],
      );

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'invoiceConceptSerial',
        expect.objectContaining({
          page: 2,
          pageSize: 5,
          sort: 'serialNumber',
          order: 'DESC',
          relations: [
            {
              property: 'invoiceConcept',
              alias: 'invoiceConcept',
              isLeftJoinAndSelect: true,
            },
          ],
        }),
      );
    });

    it('lista con valores por defecto', async () => {
      await invoiceConceptSerialRepositoryService.findAll();

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'invoiceConceptSerial',
        expect.objectContaining({
          page: 1,
          pageSize: 10,
          sort: 'createdAt',
          order: 'ASC',
          relations: [],
        }),
      );
    });
  });

  describe('findById', () => {
    it('busca por identificador', async () => {
      const found = { id: 'ics-uuid' } as InvoiceConceptSerial;
      typeOrmRepositoryMock.findOne.mockResolvedValue(found);

      await expect(
        invoiceConceptSerialRepositoryService.findById('ics-uuid'),
      ).resolves.toEqual(found);
    });

    it('incluye relaciones', async () => {
      await invoiceConceptSerialRepositoryService.findById('ics-uuid', ['invoiceConcept']);

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'ics-uuid' },
        relations: ['invoiceConcept'],
      });
    });
  });

  describe('updateById', () => {
    it('lanza 404 si no existe', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue(null);

      const thrownError = await expectHttpException(
        invoiceConceptSerialRepositoryService.updateById('missing', {}),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('traduce el 23505 anidado a 409', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue({ id: 'ics-uuid' });
      typeOrmRepositoryMock.save.mockRejectedValue({ driverError: { code: '23505' } });

      const thrownError = await expectHttpException(
        invoiceConceptSerialRepositoryService.updateById('ics-uuid', {
          serialNumber: 'SN-2',
        }),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.CONFLICT);
    });

    it('relanza errores de guardado que no son de unicidad', async () => {
      const unexpectedError = new Error('fallo');
      typeOrmRepositoryMock.findOne.mockResolvedValue({ id: 'ics-uuid' });
      typeOrmRepositoryMock.save.mockRejectedValue(unexpectedError);

      await expect(
        invoiceConceptSerialRepositoryService.updateById('ics-uuid', {
          serialNumber: 'SN-2',
        }),
      ).rejects.toBe(unexpectedError);
    });

    it('fusiona y recarga', async () => {
      const existing = { id: 'ics-uuid', serialNumber: 'SN-1' } as InvoiceConceptSerial;
      const reloaded = { ...existing, serialNumber: 'SN-2' } as InvoiceConceptSerial;
      typeOrmRepositoryMock.findOne
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(reloaded);
      typeOrmRepositoryMock.save.mockResolvedValue(reloaded);

      const result = await invoiceConceptSerialRepositoryService.updateById('ics-uuid', {
        serialNumber: 'SN-2',
      });

      expect(result).toEqual(reloaded);
      expect(typeOrmRepositoryMock.findOne).toHaveBeenLastCalledWith({
        where: { id: 'ics-uuid' },
        relations: ['invoiceConcept'],
      });
    });
  });

  describe('deleteById', () => {
    it('elimina el registro', async () => {
      const deleteResult = { affected: 1, raw: [] };
      typeOrmRepositoryMock.delete.mockResolvedValue(deleteResult);

      await expect(
        invoiceConceptSerialRepositoryService.deleteById('ics-uuid'),
      ).resolves.toEqual(deleteResult);
    });
  });

  describe('countByInvoiceConceptId', () => {
    it('cuenta las series de la línea', async () => {
      typeOrmRepositoryMock.count.mockResolvedValue(3);

      await expect(
        invoiceConceptSerialRepositoryService.countByInvoiceConceptId('ic-uuid'),
      ).resolves.toBe(3);
      expect(typeOrmRepositoryMock.count).toHaveBeenCalledWith({
        where: { invoiceConceptId: 'ic-uuid' },
      });
    });
  });
});
