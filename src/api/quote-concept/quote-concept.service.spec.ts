import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { QuoteConceptRepository } from 'src/entities/quote-concept/quote-concept-repository.service';
import { QuoteConcept } from 'src/entities/quote-concept/quote-concept.entity';
import { QuoteRepository } from 'src/entities/quote/quote-repository.service';
import { Quote } from 'src/entities/quote/quote.entity';
import { ItemRepository } from 'src/entities/item/item-repository.service';
import { Item } from 'src/entities/item/item.entity';
import { ItemCategory } from 'src/entities/item-category/item-category.entity';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { QuoteConceptService } from './quote-concept.service';

import { QuoteStatus } from 'src/common/enums';

describe('QuoteConceptService', () => {
  let service: QuoteConceptService;
  let quoteConceptRepository: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    findMaxPositionByQuoteId: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };
  let quoteRepository: { findById: jest.Mock };
  let itemRepository: { findById: jest.Mock };
  let enterpriseAccessService: {
    assertCurrentEntityAccessible: jest.Mock;
    mergeRelationNames: (relations: string[] | undefined, required: string[]) => string[];
  };

  const quoteConceptId = 'qc-uuid';
  const quoteId = 'quote-uuid';
  const itemId = 'item-uuid';
  const enterpriseId = 'enterprise-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  /**
   * Construye un presupuesto de prueba.
   * @param overrides - Campos a sobrescribir
   * @returns Entidad Quote simulada
   */
  const buildQuote = (overrides: Partial<Quote> = {}): Quote =>
    ({
      id: quoteId,
      status: QuoteStatus.DRAFT,
      client: { enterpriseId },
      ...overrides,
    }) as Quote;

  /**
   * Construye un artículo de prueba.
   * @param overrides - Campos a sobrescribir
   * @returns Entidad Item simulada
   */
  const buildItem = (overrides: Partial<Item> = {}): Item =>
    ({
      id: itemId,
      name: 'Tornillo',
      pricePvp: 1.5,
      ean: '8412345678901',
      itemCategory: { enterpriseId } as ItemCategory,
      ...overrides,
    }) as Item;

  /**
   * Construye una línea de presupuesto de prueba.
   * @param overrides - Campos a sobrescribir
   * @returns Entidad QuoteConcept simulada
   */
  const buildQuoteConcept = (overrides: Partial<QuoteConcept> = {}): QuoteConcept =>
    ({
      id: quoteConceptId,
      quoteId,
      itemId,
      name: 'Hora de consultoría',
      quote: buildQuote(),
      ...overrides,
    }) as QuoteConcept;

  beforeEach(async () => {
    quoteConceptRepository = {
      create: jest.fn(),
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
      findById: jest.fn(),
      findMaxPositionByQuoteId: jest.fn().mockResolvedValue(null),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };
    quoteRepository = { findById: jest.fn().mockResolvedValue(buildQuote()) };
    itemRepository = { findById: jest.fn().mockResolvedValue(buildItem()) };
    enterpriseAccessService = {
      assertCurrentEntityAccessible: jest.fn(),
      mergeRelationNames: (relations?: string[], required: string[] = []) =>
        [...new Set([...(relations ?? []), ...required])],
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        QuoteConceptService,
        { provide: QuoteConceptRepository, useValue: quoteConceptRepository },
        { provide: QuoteRepository, useValue: quoteRepository },
        { provide: ItemRepository, useValue: itemRepository },
        { provide: EnterpriseAccessService, useValue: enterpriseAccessService },
      ],
    }).compile();

    service = testingModule.get(QuoteConceptService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('exige un presupuesto', async () => {
      await expect(
        service.create({ itemId, name: 'Hora' } as QuoteConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El concepto debe pertenecer a un presupuesto',
      });
    });

    it('persiste una línea manual con defaults y posición 0', async () => {
      const created = buildQuoteConcept();
      quoteConceptRepository.create.mockResolvedValue(created);

      await expect(
        service.create({ quoteId, name: '  Hora  ' } as QuoteConcept, enterpriseId),
      ).resolves.toEqual(created);

      expect(quoteConceptRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          quoteId,
          itemId: null,
          position: 0,
          name: 'Hora',
          basePrice: 0,
          vat: 21,
          irpf: 0,
          quantity: 1,
          ean: null,
        }),
      );
    });

    it('lanza 404 si quoteId y quote.id no coinciden', async () => {
      await expect(
        service.create(
          { quoteId, quote: { id: 'otra' } as Quote, itemId } as QuoteConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de presupuesto no encontrado',
      });
    });

    it('lanza 404 si el presupuesto no existe', async () => {
      quoteRepository.findById.mockResolvedValue(null);

      await expect(
        service.create({ quoteId, itemId, name: 'Hora' } as QuoteConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de presupuesto no encontrado',
      });
    });

    it('lanza 404 si el presupuesto es de otra empresa', async () => {
      quoteRepository.findById.mockResolvedValue(
        buildQuote({ client: { enterpriseId: 'otra' } as Quote['client'] }),
      );

      await expect(
        service.create({ quoteId, itemId, name: 'Hora' } as QuoteConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de presupuesto no encontrado',
      });
    });

    it('propaga 403 si el caller no tiene quotes.write', async () => {
      enterpriseAccessService.assertCurrentEntityAccessible.mockImplementation(() => {
        throw new HttpException(
          'No tiene permiso para realizar la acción quotes.write',
          HttpStatus.FORBIDDEN,
        );
      });

      await expect(
        service.create({ quoteId, itemId, name: 'Hora' } as QuoteConcept, enterpriseId),
      ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    });

    it('permite crear líneas en un presupuesto emitido', async () => {
      quoteRepository.findById.mockResolvedValue(buildQuote({ status: QuoteStatus.ISSUED }));
      quoteConceptRepository.create.mockResolvedValue(buildQuoteConcept());

      await expect(
        service.create({ quoteId, itemId, name: 'Hora' } as QuoteConcept, enterpriseId),
      ).resolves.toEqual(buildQuoteConcept());
      expect(quoteConceptRepository.create).toHaveBeenCalled();
    });

    it('rechaza un nombre que no es texto', async () => {
      await expect(
        service.create(
          { quoteId, itemId, name: 12 as unknown as string } as QuoteConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El nombre del concepto debe ser una cadena de texto',
      });
    });

    it('exige nombre en una línea manual', async () => {
      await expect(
        service.create({ quoteId } as QuoteConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El concepto debe tener un nombre',
      });
    });

    it('rechaza un nombre vacío', async () => {
      await expect(
        service.create({ quoteId, itemId, name: '   ' } as QuoteConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El nombre del concepto no puede estar vacío',
      });
    });

    it('acepta el presupuesto anidado sin quoteId escalar', async () => {
      quoteConceptRepository.create.mockResolvedValue(buildQuoteConcept());

      await service.create(
        { quote: { id: quoteId } as Quote, itemId, name: 'Hora' } as QuoteConcept,
        enterpriseId,
      );

      expect(quoteRepository.findById).toHaveBeenCalledWith(quoteId, ['client']);
    });

    it('instantánea el artículo y usa posición 0', async () => {
      const created = buildQuoteConcept();
      quoteConceptRepository.create.mockResolvedValue(created);

      await expect(
        service.create({ quoteId, itemId } as QuoteConcept, enterpriseId),
      ).resolves.toEqual(created);

      expect(quoteConceptRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          quoteId,
          itemId,
          position: 0,
          name: 'Tornillo',
          basePrice: 1.5,
          vat: 21,
          irpf: 0,
          quantity: 1,
          ean: '8412345678901',
        }),
      );
    });

    it('usa precio 0 si el artículo no tiene PVP', async () => {
      itemRepository.findById.mockResolvedValue(buildItem({ pricePvp: undefined }));
      quoteConceptRepository.create.mockResolvedValue(buildQuoteConcept());

      await service.create({ quoteId, itemId, name: 'Hora' } as QuoteConcept, enterpriseId);

      expect(quoteConceptRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ basePrice: 0 }),
      );
    });

    it('usa MAX(position)+1 cuando hay líneas previas', async () => {
      quoteConceptRepository.findMaxPositionByQuoteId.mockResolvedValue(4);
      quoteConceptRepository.create.mockResolvedValue(buildQuoteConcept());

      await service.create({ quoteId, itemId, name: 'Hora' } as QuoteConcept, enterpriseId);

      expect(quoteConceptRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ position: 5 }),
      );
    });

    it('respeta la posición informada y recorta el EAN', async () => {
      quoteConceptRepository.create.mockResolvedValue(buildQuoteConcept());

      await service.create(
        {
          quoteId,
          itemId,
          name: '  Hora  ',
          position: '2' as unknown as number,
          ean: '  123  ',
          basePrice: null as unknown as number,
          vat: null as unknown as number,
          irpf: null as unknown as number,
          quantity: null as unknown as number,
        } as QuoteConcept,
        enterpriseId,
      );

      expect(quoteConceptRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          position: 2,
          name: 'Hora',
          ean: '123',
          basePrice: 0,
          vat: 21,
          irpf: 0,
          quantity: 1,
        }),
      );
    });

    it('usa el EAN nulo del catálogo cuando el artículo no lo tiene', async () => {
      itemRepository.findById.mockResolvedValue(buildItem({ ean: null }));
      quoteConceptRepository.create.mockResolvedValue(buildQuoteConcept());

      await service.create(
        { quoteId, item: { id: itemId } as Item } as QuoteConcept,
        enterpriseId,
      );

      expect(itemRepository.findById).toHaveBeenCalledWith(itemId, ['itemCategory']);
      expect(quoteConceptRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId,
          name: 'Tornillo',
          ean: null,
        }),
      );
    });

    it('persiste ean nulo cuando el cuerpo lo informa explícitamente', async () => {
      quoteConceptRepository.create.mockResolvedValue(buildQuoteConcept());

      await service.create(
        { quoteId, itemId, name: 'Hora', ean: null } as QuoteConcept,
        enterpriseId,
      );

      expect(quoteConceptRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ ean: null }),
      );
    });

    it('propaga 403 si el caller no puede escribir el artículo vinculado', async () => {
      enterpriseAccessService.assertCurrentEntityAccessible
        .mockImplementationOnce(() => undefined)
        .mockImplementationOnce(() => {
          throw new HttpException(
            'No tiene permiso para realizar la acción quotes.write',
            HttpStatus.FORBIDDEN,
          );
        });

      await expect(
        service.create({ quoteId, itemId, name: 'X' } as QuoteConcept, enterpriseId),
      ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    });

    it('lanza 404 si el artículo no existe', async () => {
      itemRepository.findById.mockResolvedValue(null);

      await expect(
        service.create({ quoteId, itemId, name: 'X' } as QuoteConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de presupuesto no encontrado',
      });
    });

    it('lanza 404 si itemId e item.id no coinciden', async () => {
      await expect(
        service.create(
          { quoteId, itemId, item: { id: 'otro' } as Item, name: 'X' } as QuoteConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de presupuesto no encontrado',
      });
    });

    it('lanza 404 si el artículo es de otra empresa', async () => {
      itemRepository.findById.mockResolvedValue(
        buildItem({ itemCategory: { enterpriseId: 'otra' } as ItemCategory }),
      );

      await expect(
        service.create({ quoteId, itemId, name: 'X' } as QuoteConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de presupuesto no encontrado',
      });
    });

    it('rechaza un precio que no es convertible a número', async () => {
      await expect(
        service.create(
          { quoteId, itemId, name: 'Hora', basePrice: '  ' as unknown as number } as QuoteConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        message: 'El precio base debe ser un número mayor o igual que 0',
      });
    });

    it('rechaza precio, enteros, suplido y EAN inválidos', async () => {
      await expect(
        service.create(
          { quoteId, itemId, name: 'Hora', basePrice: -1 } as QuoteConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        message: 'El precio base debe ser un número mayor o igual que 0',
      });
      await expect(
        service.create(
          { quoteId, itemId, name: 'Hora', vat: 'x' as unknown as number } as QuoteConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        message: 'El IVA debe ser un número entero mayor o igual que 0',
      });
      await expect(
        service.create(
          {
            quoteId,
            itemId,
            name: 'Hora',
            quantity: Number.POSITIVE_INFINITY,
          } as QuoteConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        message: 'La cantidad debe ser un número entero mayor o igual que 0',
      });
      await expect(
        service.create(
          { quoteId, itemId, name: 'Hora', irpf: true as unknown as number } as QuoteConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        message: 'El IRPF debe ser un número entero mayor o igual que 0',
      });
      await expect(
        service.create(
          { quoteId, itemId, name: 'Hora', ean: 1 as unknown as string } as QuoteConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        message: 'El código EAN debe ser una cadena de texto',
      });
    });

    it('propaga el error del repositorio', async () => {
      const unexpectedError = new Error('db');
      quoteConceptRepository.create.mockRejectedValue(unexpectedError);

      await expect(
        service.create({ quoteId, itemId, name: 'Hora' } as QuoteConcept, enterpriseId),
      ).rejects.toBe(unexpectedError);
    });
  });

  describe('findAll', () => {
    it('delega al repositorio', async () => {
      await expect(
        service.findAll(1, 10, 'position', 'ASC', { 'client.enterpriseId': enterpriseId }, [
          'quote',
        ]),
      ).resolves.toEqual(emptyPaginatedResponse);
    });
  });

  describe('findById', () => {
    it('devuelve la línea', async () => {
      const existing = buildQuoteConcept();
      quoteConceptRepository.findById.mockResolvedValue(existing);

      await expect(service.findById(quoteConceptId, ['item'])).resolves.toEqual(existing);
      expect(quoteConceptRepository.findById).toHaveBeenCalledWith(quoteConceptId, [
        'item',
        'quote',
        'quote.client',
      ]);
    });

    it('lanza 404 si no existe', async () => {
      quoteConceptRepository.findById.mockResolvedValue(null);

      await expect(service.findById(quoteConceptId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de presupuesto no encontrado',
      });
    });
  });

  describe('updateById', () => {
    it('lanza 404 si no existe', async () => {
      quoteConceptRepository.findById.mockResolvedValue(null);

      await expect(
        service.updateById(quoteConceptId, { name: 'X' } as QuoteConcept),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de presupuesto no encontrado',
      });
    });

    it('permite actualizar líneas de un presupuesto emitido', async () => {
      quoteConceptRepository.findById.mockResolvedValue(
        buildQuoteConcept({ quote: buildQuote({ status: QuoteStatus.ISSUED }) }),
      );
      quoteConceptRepository.updateById.mockResolvedValue(buildQuoteConcept({ name: 'X' }));

      await expect(
        service.updateById(quoteConceptId, { name: 'X' } as QuoteConcept),
      ).resolves.toEqual(buildQuoteConcept({ name: 'X' }));
      expect(quoteConceptRepository.updateById).toHaveBeenCalled();
    });

    it('congela quoteId, desvincula el artículo y actualiza campos', async () => {
      quoteConceptRepository.findById.mockResolvedValue(buildQuoteConcept({ itemId }));
      quoteConceptRepository.updateById.mockResolvedValue(buildQuoteConcept());

      await service.updateById(quoteConceptId, {
        quoteId: 'hackeada',
        itemId: null,
        name: 'Nuevo',
        position: 3,
        basePrice: '8.5' as unknown as number,
        ean: '   ',
      } as QuoteConcept);

      expect(quoteConceptRepository.updateById).toHaveBeenCalledWith(
        quoteConceptId,
        expect.objectContaining({
          itemId: null,
          name: 'Nuevo',
          position: 3,
          basePrice: 8.5,
          ean: null,
        }),
      );
      expect(quoteConceptRepository.updateById.mock.calls[0][1].quoteId).toBeUndefined();
    });

    it('vincula un artículo en la actualización sin tocar campos omitidos', async () => {
      quoteConceptRepository.findById.mockResolvedValue(buildQuoteConcept());
      quoteConceptRepository.updateById.mockResolvedValue(buildQuoteConcept());

      await service.updateById(quoteConceptId, { itemId } as QuoteConcept);

      expect(quoteConceptRepository.updateById).toHaveBeenCalledWith(
        quoteConceptId,
        expect.objectContaining({ itemId }),
      );
      expect(quoteConceptRepository.updateById.mock.calls[0][1].name).toBeUndefined();
    });

    it('conserva el itemId existente cuando el cuerpo no lo toca', async () => {
      quoteConceptRepository.findById.mockResolvedValue(buildQuoteConcept({ itemId }));
      quoteConceptRepository.updateById.mockResolvedValue(buildQuoteConcept());

      await service.updateById(quoteConceptId, { name: 'Solo nombre' } as QuoteConcept);

      expect(itemRepository.findById).not.toHaveBeenCalled();
      expect(quoteConceptRepository.updateById.mock.calls[0][1].itemId).toBeUndefined();
    });

    it('conserva el itemId si el cuerpo trae un item vacío', async () => {
      quoteConceptRepository.findById.mockResolvedValue(buildQuoteConcept({ itemId }));
      quoteConceptRepository.updateById.mockResolvedValue(buildQuoteConcept());

      await service.updateById(quoteConceptId, {
        item: {} as Item,
        vat: 10,
        irpf: 5,
        quantity: 2,
      } as QuoteConcept);

      expect(quoteConceptRepository.updateById).toHaveBeenCalledWith(
        quoteConceptId,
        expect.objectContaining({
          itemId,
          vat: 10,
          irpf: 5,
          quantity: 2,
        }),
      );
    });

    it('propaga el error del repositorio', async () => {
      const unexpectedError = new Error('db');
      quoteConceptRepository.findById.mockResolvedValue(buildQuoteConcept());
      quoteConceptRepository.updateById.mockRejectedValue(unexpectedError);

      await expect(
        service.updateById(quoteConceptId, { name: 'X' } as QuoteConcept),
      ).rejects.toBe(unexpectedError);
    });
  });

  describe('deleteById', () => {
    it('lanza 404 si no existe', async () => {
      quoteConceptRepository.findById.mockResolvedValue(null);

      await expect(service.deleteById(quoteConceptId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });

    it('permite borrar líneas de un presupuesto emitido', async () => {
      quoteConceptRepository.findById.mockResolvedValue(
        buildQuoteConcept({ quote: buildQuote({ status: QuoteStatus.ISSUED }) }),
      );
      quoteConceptRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.deleteById(quoteConceptId)).resolves.toEqual({
        affected: 1,
        raw: [],
      });
      expect(quoteConceptRepository.deleteById).toHaveBeenCalledWith(quoteConceptId);
    });

    it('elimina la línea', async () => {
      quoteConceptRepository.findById.mockResolvedValue(buildQuoteConcept());
      quoteConceptRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.deleteById(quoteConceptId)).resolves.toEqual({
        affected: 1,
        raw: [],
      });
    });

    it('propaga el error del repositorio', async () => {
      const unexpectedError = new Error('db');
      quoteConceptRepository.findById.mockResolvedValue(buildQuoteConcept());
      quoteConceptRepository.deleteById.mockRejectedValue(unexpectedError);

      await expect(service.deleteById(quoteConceptId)).rejects.toBe(unexpectedError);
    });
  });
});
