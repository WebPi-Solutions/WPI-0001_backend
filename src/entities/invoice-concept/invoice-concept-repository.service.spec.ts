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
import { InvoiceConcept } from './invoice-concept.entity';
import { InvoiceConceptRepository } from './invoice-concept-repository.service';

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

describe('InvoiceConceptRepository', () => {
  let invoiceConceptRepositoryService: InvoiceConceptRepository;
  let queryBuilder: {
    select: jest.Mock;
    where: jest.Mock;
    getRawOne: jest.Mock;
  };
  let typeOrmRepositoryMock: {
    save: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    (QueryBuilderService.getPaginatedResults as jest.Mock).mockResolvedValue({
      items: [],
      total: 0,
      currentPage: 1,
      totalPages: 0,
    });
    queryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ maxPosition: null }),
    };
    typeOrmRepositoryMock = {
      save: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceConceptRepository,
        {
          provide: getRepositoryToken(InvoiceConcept),
          useValue: typeOrmRepositoryMock,
        },
      ],
    }).compile();

    invoiceConceptRepositoryService = testingModule.get(InvoiceConceptRepository);
  });

  it('debería estar definido', () => {
    expect(invoiceConceptRepositoryService).toBeDefined();
  });

  describe('create', () => {
    it('persiste la línea', async () => {
      const payload = { name: 'Hora' } as Partial<InvoiceConcept>;
      typeOrmRepositoryMock.save.mockResolvedValue({ id: 'ic-uuid', ...payload });

      const result = await invoiceConceptRepositoryService.create(payload);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith(payload);
      expect(result.id).toBe('ic-uuid');
    });

    it('traduce el 23505 de PostgreSQL a 409', async () => {
      typeOrmRepositoryMock.save.mockRejectedValue({ code: '23505' });

      const thrownError = await expectHttpException(
        invoiceConceptRepositoryService.create({ name: 'Hora' }),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.CONFLICT);
    });

    it('relanza errores que no son de unicidad', async () => {
      const unexpectedError = new Error('fallo');
      typeOrmRepositoryMock.save.mockRejectedValue(unexpectedError);

      await expect(invoiceConceptRepositoryService.create({ name: 'Hora' })).rejects.toBe(
        unexpectedError,
      );
    });
  });

  describe('findAll', () => {
    it('lista líneas paginadas con relaciones', async () => {
      const result = await invoiceConceptRepositoryService.findAll(
        1,
        10,
        'position',
        'ASC',
        {},
        ['invoice'],
      );

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'invoiceConcept',
        expect.objectContaining({
          relations: [
            { property: 'invoice', alias: 'invoice', isLeftJoinAndSelect: true },
          ],
        }),
      );
      expect(result.total).toBe(0);
    });

    it('lista líneas con valores por defecto', async () => {
      await invoiceConceptRepositoryService.findAll();

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'invoiceConcept',
        expect.objectContaining({
          page: 1,
          pageSize: 10,
          sort: 'position',
          order: 'ASC',
          filter: {},
          relations: [],
        }),
      );
    });
  });

  describe('findById', () => {
    it('busca por identificador', async () => {
      const found = { id: 'ic-uuid' } as InvoiceConcept;
      typeOrmRepositoryMock.findOne.mockResolvedValue(found);

      await expect(invoiceConceptRepositoryService.findById('ic-uuid')).resolves.toEqual(found);
      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'ic-uuid' },
        relations: undefined,
      });
    });

    it('incluye relaciones', async () => {
      await invoiceConceptRepositoryService.findById('ic-uuid', ['invoice']);

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'ic-uuid' },
        relations: ['invoice'],
      });
    });
  });

  describe('findMaxPositionByInvoiceId', () => {
    it('devuelve null si no hay líneas', async () => {
      queryBuilder.getRawOne.mockResolvedValue({ maxPosition: null });

      await expect(
        invoiceConceptRepositoryService.findMaxPositionByInvoiceId('inv-1'),
      ).resolves.toBeNull();
    });

    it('devuelve null si no hay fila raw', async () => {
      queryBuilder.getRawOne.mockResolvedValue(undefined);

      await expect(
        invoiceConceptRepositoryService.findMaxPositionByInvoiceId('inv-1'),
      ).resolves.toBeNull();
    });

    it('convierte la posición máxima a número', async () => {
      queryBuilder.getRawOne.mockResolvedValue({ maxPosition: '4' });

      await expect(
        invoiceConceptRepositoryService.findMaxPositionByInvoiceId('inv-1'),
      ).resolves.toBe(4);
    });
  });

  describe('updateById', () => {
    it('lanza 404 si no existe', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue(null);

      const thrownError = await expectHttpException(
        invoiceConceptRepositoryService.updateById('missing', {}),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('traduce el 23505 anidado a 409', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue({ id: 'ic-uuid' });
      typeOrmRepositoryMock.save.mockRejectedValue({ driverError: { code: '23505' } });

      const thrownError = await expectHttpException(
        invoiceConceptRepositoryService.updateById('ic-uuid', { position: 1 }),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.CONFLICT);
    });

    it('relanza errores de guardado que no son de unicidad', async () => {
      const unexpectedError = new Error('fallo');
      typeOrmRepositoryMock.findOne.mockResolvedValue({ id: 'ic-uuid' });
      typeOrmRepositoryMock.save.mockRejectedValue(unexpectedError);

      await expect(
        invoiceConceptRepositoryService.updateById('ic-uuid', { name: 'X' }),
      ).rejects.toBe(unexpectedError);
    });

    it('fusiona y recarga la línea', async () => {
      const existing = { id: 'ic-uuid', name: 'Antiguo' } as InvoiceConcept;
      const payload = { name: 'Nuevo' } as Partial<InvoiceConcept>;
      const reloaded = { ...existing, ...payload } as InvoiceConcept;
      typeOrmRepositoryMock.findOne
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(reloaded);
      typeOrmRepositoryMock.save.mockResolvedValue(reloaded);

      const result = await invoiceConceptRepositoryService.updateById('ic-uuid', payload);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith({ ...existing, ...payload });
      expect(typeOrmRepositoryMock.findOne).toHaveBeenLastCalledWith({
        where: { id: 'ic-uuid' },
        relations: ['invoice', 'item', 'serials'],
      });
      expect(result).toEqual(reloaded);
    });
  });

  describe('deleteById', () => {
    it('elimina la línea', async () => {
      const deleteResult = { affected: 1, raw: [] };
      typeOrmRepositoryMock.delete.mockResolvedValue(deleteResult);

      await expect(invoiceConceptRepositoryService.deleteById('ic-uuid')).resolves.toEqual(
        deleteResult,
      );
    });
  });
});
