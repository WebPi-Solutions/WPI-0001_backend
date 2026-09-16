import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SpentConceptSerialRepository } from 'src/entities/spent-concept-serial/spent-concept-serial-repository.service';
import { SpentConceptSerial } from 'src/entities/spent-concept-serial/spent-concept-serial.entity';
import { SpentConceptRepository } from 'src/entities/spent-concept/spent-concept-repository.service';
import { SpentConcept } from 'src/entities/spent-concept/spent-concept.entity';
import { Spent } from 'src/entities/spent/spent.entity';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { SpentConceptSerialService } from './spent-concept-serial.service';

describe('SpentConceptSerialService', () => {
  let service: SpentConceptSerialService;
  let spentConceptSerialRepository: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
    countBySpentConceptId: jest.Mock;
  };
  let spentConceptRepository: { findById: jest.Mock };
  let enterpriseAccessService: {
    assertCurrentEntityAccessible: jest.Mock;
    mergeRelationNames: (relations: string[] | undefined, required: string[]) => string[];
  };

  const serialId = 'ics-uuid';
  const spentConceptId = 'ic-uuid';
  const enterpriseId = 'enterprise-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  const buildSpentConcept = (overrides: Partial<SpentConcept> = {}): SpentConcept =>
    ({
      id: spentConceptId,
      itemId: 'item-uuid',
      quantity: 2,
      item: { serialNumber: true },
      spent: {
        status: 'paid',
        supplier: { enterpriseId },
      } as Spent,
      ...overrides,
    }) as SpentConcept;

  const buildSerial = (overrides: Partial<SpentConceptSerial> = {}): SpentConceptSerial =>
    ({
      id: serialId,
      spentConceptId,
      serialNumber: 'SN-1',
      spentConcept: buildSpentConcept(),
      ...overrides,
    }) as SpentConceptSerial;

  beforeEach(async () => {
    spentConceptSerialRepository = {
      create: jest.fn(),
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
      countBySpentConceptId: jest.fn().mockResolvedValue(0),
    };
    spentConceptRepository = { findById: jest.fn().mockResolvedValue(buildSpentConcept()) };
    enterpriseAccessService = {
      assertCurrentEntityAccessible: jest.fn(),
      mergeRelationNames: (relations?: string[], required: string[] = []) =>
        [...new Set([...(relations ?? []), ...required])],
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        SpentConceptSerialService,
        { provide: SpentConceptSerialRepository, useValue: spentConceptSerialRepository },
        { provide: SpentConceptRepository, useValue: spentConceptRepository },
        { provide: EnterpriseAccessService, useValue: enterpriseAccessService },
      ],
    }).compile();

    service = testingModule.get(SpentConceptSerialService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('exige una línea', async () => {
      await expect(
        service.create({ serialNumber: 'SN-1' } as SpentConceptSerial, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El número de serie debe pertenecer a un concepto de gasto',
      });
    });

    it('lanza 404 si los UUID de línea no coinciden', async () => {
      await expect(
        service.create(
          {
            spentConceptId,
            spentConcept: { id: 'otra' },
            serialNumber: 'SN-1',
          } as SpentConceptSerial,
          enterpriseId,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it('propaga 403 si el caller no tiene spents.write', async () => {
      enterpriseAccessService.assertCurrentEntityAccessible.mockImplementation(() => {
        throw new HttpException(
          'No tiene permiso para realizar la acción spents.write',
          HttpStatus.FORBIDDEN,
        );
      });

      await expect(
        service.create(
          { spentConceptId, serialNumber: 'SN-1' } as SpentConceptSerial,
          enterpriseId,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    });

    it('lanza 404 si la línea no existe', async () => {
      spentConceptRepository.findById.mockResolvedValue(null);

      await expect(
        service.create(
          { spentConceptId, serialNumber: 'SN-1' } as SpentConceptSerial,
          enterpriseId,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it('lanza 404 si la línea es de otra empresa', async () => {
      spentConceptRepository.findById.mockResolvedValue(
        buildSpentConcept({
          spent: { status: 'paid', supplier: { enterpriseId: 'otra' } } as Spent,
        }),
      );

      await expect(
        service.create(
          { spentConceptId, serialNumber: 'SN-1' } as SpentConceptSerial,
          enterpriseId,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it('rechaza un número de serie que no es texto o está vacío', async () => {
      await expect(
        service.create(
          { spentConceptId, serialNumber: 1 as unknown as string } as SpentConceptSerial,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        message: 'El número de serie debe ser una cadena de texto',
      });
      await expect(
        service.create(
          { spentConceptId, serialNumber: '   ' } as SpentConceptSerial,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        message: 'El número de serie no puede estar vacío',
      });
    });

    it('acepta la línea anidada sin spentConceptId escalar', async () => {
      spentConceptSerialRepository.create.mockResolvedValue(buildSerial());

      await service.create(
        {
          spentConcept: { id: spentConceptId } as SpentConcept,
          serialNumber: 'SN-1',
        } as SpentConceptSerial,
        enterpriseId,
      );

      expect(spentConceptRepository.findById).toHaveBeenCalledWith(spentConceptId, [
        'spent',
        'spent.supplier',
        'item',
      ]);
    });

    it('persiste el número recortado', async () => {
      const created = buildSerial();
      spentConceptSerialRepository.create.mockResolvedValue(created);

      await expect(
        service.create(
          { spentConceptId, serialNumber: '  SN-1  ' } as SpentConceptSerial,
          enterpriseId,
        ),
      ).resolves.toEqual(created);
      expect(spentConceptSerialRepository.create).toHaveBeenCalledWith({
        spentConceptId,
        serialNumber: 'SN-1',
      });
    });

    it('propaga el error del repositorio', async () => {
      const unexpectedError = new Error('db');
      spentConceptSerialRepository.create.mockRejectedValue(unexpectedError);

      await expect(
        service.create(
          { spentConceptId, serialNumber: 'SN-1' } as SpentConceptSerial,
          enterpriseId,
        ),
      ).rejects.toBe(unexpectedError);
    });

    it('rechaza series en una línea sin artículo', async () => {
      spentConceptRepository.findById.mockResolvedValue(
        buildSpentConcept({ itemId: null, item: null }),
      );

      await expect(
        service.create(
          { spentConceptId, serialNumber: 'SN-1' } as SpentConceptSerial,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message:
          'Solo se pueden asignar números de serie a conceptos vinculados a un artículo que se gestiona con número de serie',
      });
    });

    it('rechaza series si el artículo no se gestiona con número de serie', async () => {
      spentConceptRepository.findById.mockResolvedValue(
        buildSpentConcept({ item: { serialNumber: false } as SpentConcept['item'] }),
      );

      await expect(
        service.create(
          { spentConceptId, serialNumber: 'SN-1' } as SpentConceptSerial,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message:
          'Solo se pueden asignar números de serie a conceptos vinculados a un artículo que se gestiona con número de serie',
      });
    });

    it('rechaza una serie extra cuando ya se cubre la cantidad', async () => {
      spentConceptRepository.findById.mockResolvedValue(buildSpentConcept({ quantity: 1 }));
      spentConceptSerialRepository.countBySpentConceptId.mockResolvedValue(1);

      await expect(
        service.create(
          { spentConceptId, serialNumber: 'SN-2' } as SpentConceptSerial,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El número de series no puede superar la cantidad del concepto',
      });
    });

    it('usa cantidad 1 si la línea no informa quantity', async () => {
      spentConceptRepository.findById.mockResolvedValue(
        buildSpentConcept({ quantity: undefined }),
      );
      spentConceptSerialRepository.countBySpentConceptId.mockResolvedValue(1);

      await expect(
        service.create(
          { spentConceptId, serialNumber: 'SN-2' } as SpentConceptSerial,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El número de series no puede superar la cantidad del concepto',
      });
    });
  });

  describe('findAll', () => {
    it('delega al repositorio', async () => {
      await expect(
        service.findAll(1, 10, 'createdAt', 'ASC', { spentConceptId }, ['spentConcept']),
      ).resolves.toEqual(emptyPaginatedResponse);
    });
  });

  describe('assertSpentConceptAccessibleForList', () => {
    it('lanza 404 si la línea no existe', async () => {
      spentConceptRepository.findById.mockResolvedValue(null);

      await expect(
        service.assertSpentConceptAccessibleForList(spentConceptId, enterpriseId),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it('lanza 404 si la línea es de otra empresa', async () => {
      spentConceptRepository.findById.mockResolvedValue(
        buildSpentConcept({
          spent: { status: 'paid', supplier: { enterpriseId: 'otra' } } as Spent,
        }),
      );

      await expect(
        service.assertSpentConceptAccessibleForList(spentConceptId, enterpriseId),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it('acepta una línea de la empresa', async () => {
      await expect(
        service.assertSpentConceptAccessibleForList(spentConceptId, enterpriseId),
      ).resolves.toBeUndefined();
    });
  });

  describe('findById', () => {
    it('devuelve el registro', async () => {
      const existing = buildSerial();
      spentConceptSerialRepository.findById.mockResolvedValue(existing);

      await expect(service.findById(serialId)).resolves.toEqual(existing);
    });

    it('lanza 404 si no existe', async () => {
      spentConceptSerialRepository.findById.mockResolvedValue(null);

      await expect(service.findById(serialId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });
  });

  describe('updateById', () => {
    it('lanza 404 si no existe', async () => {
      spentConceptSerialRepository.findById.mockResolvedValue(null);

      await expect(
        service.updateById(serialId, { serialNumber: 'SN-2' } as SpentConceptSerial),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it('actualiza el número de serie y congela la línea', async () => {
      spentConceptSerialRepository.findById.mockResolvedValue(buildSerial());
      spentConceptSerialRepository.updateById.mockResolvedValue(buildSerial());

      await service.updateById(serialId, {
        spentConceptId: 'hackeada',
        serialNumber: ' SN-2 ',
      } as SpentConceptSerial);

      expect(spentConceptSerialRepository.updateById).toHaveBeenCalledWith(serialId, {
        serialNumber: 'SN-2',
      });
    });

    it('no incluye serialNumber si no viene en el cuerpo', async () => {
      spentConceptSerialRepository.findById.mockResolvedValue(buildSerial());
      spentConceptSerialRepository.updateById.mockResolvedValue(buildSerial());

      await service.updateById(serialId, {} as SpentConceptSerial);

      expect(spentConceptSerialRepository.updateById).toHaveBeenCalledWith(serialId, {});
    });

    it('propaga el error del repositorio', async () => {
      const unexpectedError = new Error('db');
      spentConceptSerialRepository.findById.mockResolvedValue(buildSerial());
      spentConceptSerialRepository.updateById.mockRejectedValue(unexpectedError);

      await expect(
        service.updateById(serialId, { serialNumber: 'SN-2' } as SpentConceptSerial),
      ).rejects.toBe(unexpectedError);
    });
  });

  describe('deleteById', () => {
    it('lanza 404 si no existe', async () => {
      spentConceptSerialRepository.findById.mockResolvedValue(null);

      await expect(service.deleteById(serialId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });

    it('elimina el registro', async () => {
      spentConceptSerialRepository.findById.mockResolvedValue(buildSerial());
      spentConceptSerialRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.deleteById(serialId)).resolves.toEqual({ affected: 1, raw: [] });
    });

    it('propaga el error del repositorio', async () => {
      const unexpectedError = new Error('db');
      spentConceptSerialRepository.findById.mockResolvedValue(buildSerial());
      spentConceptSerialRepository.deleteById.mockRejectedValue(unexpectedError);

      await expect(service.deleteById(serialId)).rejects.toBe(unexpectedError);
    });
  });
});
