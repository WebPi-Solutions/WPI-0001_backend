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
import { QuoteConcept } from './quote-concept.entity';
import { QuoteConceptRepository } from './quote-concept-repository.service';

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

describe('QuoteConceptRepository', () => {
  let quoteConceptRepositoryService: QuoteConceptRepository;
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
        QuoteConceptRepository,
        {
          provide: getRepositoryToken(QuoteConcept),
          useValue: typeOrmRepositoryMock,
        },
      ],
    }).compile();

    quoteConceptRepositoryService = testingModule.get(QuoteConceptRepository);
  });

  it('debería estar definido', () => {
    expect(quoteConceptRepositoryService).toBeDefined();
  });

  describe('create', () => {
    it('persiste la línea', async () => {
      const payload = { name: 'Hora' } as Partial<QuoteConcept>;
      typeOrmRepositoryMock.save.mockResolvedValue({ id: 'ic-uuid', ...payload });

      const result = await quoteConceptRepositoryService.create(payload);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith(payload);
      expect(result.id).toBe('ic-uuid');
    });

    it('traduce el 23505 de PostgreSQL a 409', async () => {
      typeOrmRepositoryMock.save.mockRejectedValue({ code: '23505' });

      const thrownError = await expectHttpException(
        quoteConceptRepositoryService.create({ name: 'Hora' }),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.CONFLICT);
    });

    it('relanza errores que no son de unicidad', async () => {
      const unexpectedError = new Error('fallo');
      typeOrmRepositoryMock.save.mockRejectedValue(unexpectedError);

      await expect(quoteConceptRepositoryService.create({ name: 'Hora' })).rejects.toBe(
        unexpectedError,
      );
    });
  });

  describe('findAll', () => {
    it('lista líneas paginadas con relaciones', async () => {
      const result = await quoteConceptRepositoryService.findAll(
        1,
        10,
        'position',
        'ASC',
        {},
        ['quote'],
      );

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'quoteConcept',
        expect.objectContaining({
          relations: [
            { property: 'quote', alias: 'quote', isLeftJoinAndSelect: true },
          ],
        }),
      );
      expect(result.total).toBe(0);
    });

    it('lista líneas con valores por defecto', async () => {
      await quoteConceptRepositoryService.findAll();

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'quoteConcept',
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
      const found = { id: 'ic-uuid' } as QuoteConcept;
      typeOrmRepositoryMock.findOne.mockResolvedValue(found);

      await expect(quoteConceptRepositoryService.findById('ic-uuid')).resolves.toEqual(found);
      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'ic-uuid' },
        relations: undefined,
      });
    });

    it('incluye relaciones', async () => {
      await quoteConceptRepositoryService.findById('ic-uuid', ['quote']);

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'ic-uuid' },
        relations: ['quote'],
      });
    });
  });

  describe('findMaxPositionByQuoteId', () => {
    it('devuelve null si no hay líneas', async () => {
      queryBuilder.getRawOne.mockResolvedValue({ maxPosition: null });

      await expect(
        quoteConceptRepositoryService.findMaxPositionByQuoteId('quote-1'),
      ).resolves.toBeNull();
    });

    it('devuelve null si no hay fila raw', async () => {
      queryBuilder.getRawOne.mockResolvedValue(undefined);

      await expect(
        quoteConceptRepositoryService.findMaxPositionByQuoteId('quote-1'),
      ).resolves.toBeNull();
    });

    it('convierte la posición máxima a número', async () => {
      queryBuilder.getRawOne.mockResolvedValue({ maxPosition: '4' });

      await expect(
        quoteConceptRepositoryService.findMaxPositionByQuoteId('quote-1'),
      ).resolves.toBe(4);
    });
  });

  describe('updateById', () => {
    it('lanza 404 si no existe', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue(null);

      const thrownError = await expectHttpException(
        quoteConceptRepositoryService.updateById('missing', {}),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('traduce el 23505 anidado a 409', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue({ id: 'ic-uuid' });
      typeOrmRepositoryMock.save.mockRejectedValue({ driverError: { code: '23505' } });

      const thrownError = await expectHttpException(
        quoteConceptRepositoryService.updateById('ic-uuid', { position: 1 }),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.CONFLICT);
    });

    it('relanza errores de guardado que no son de unicidad', async () => {
      const unexpectedError = new Error('fallo');
      typeOrmRepositoryMock.findOne.mockResolvedValue({ id: 'ic-uuid' });
      typeOrmRepositoryMock.save.mockRejectedValue(unexpectedError);

      await expect(
        quoteConceptRepositoryService.updateById('ic-uuid', { name: 'X' }),
      ).rejects.toBe(unexpectedError);
    });

    it('fusiona y recarga la línea', async () => {
      const existing = { id: 'ic-uuid', name: 'Antiguo' } as QuoteConcept;
      const payload = { name: 'Nuevo' } as Partial<QuoteConcept>;
      const reloaded = { ...existing, ...payload } as QuoteConcept;
      typeOrmRepositoryMock.findOne
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(reloaded);
      typeOrmRepositoryMock.save.mockResolvedValue(reloaded);

      const result = await quoteConceptRepositoryService.updateById('ic-uuid', payload);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith({ ...existing, ...payload });
      expect(typeOrmRepositoryMock.findOne).toHaveBeenLastCalledWith({
        where: { id: 'ic-uuid' },
        relations: ['quote', 'item'],
      });
      expect(result).toEqual(reloaded);
    });
  });

  describe('deleteById', () => {
    it('elimina la línea', async () => {
      const deleteResult = { affected: 1, raw: [] };
      typeOrmRepositoryMock.delete.mockResolvedValue(deleteResult);

      await expect(quoteConceptRepositoryService.deleteById('ic-uuid')).resolves.toEqual(
        deleteResult,
      );
    });
  });
});
