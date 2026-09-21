import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceConceptRepository } from 'src/entities/invoice-concept/invoice-concept-repository.service';
import { InvoiceConcept } from 'src/entities/invoice-concept/invoice-concept.entity';
import { InvoiceRepository } from 'src/entities/invoice/invoice-repository.service';
import { Invoice } from 'src/entities/invoice/invoice.entity';
import { ItemRepository } from 'src/entities/item/item-repository.service';
import { Item } from 'src/entities/item/item.entity';
import { ItemCategory } from 'src/entities/item-category/item-category.entity';
import { InvoiceConceptSerialRepository } from 'src/entities/invoice-concept-serial/invoice-concept-serial-repository.service';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { InvoiceConceptService } from './invoice-concept.service';
import { InventoryLedgerService } from 'src/common/helpers/inventory/inventory-ledger.service';

import { InvoiceStatus } from 'src/common/enums';

describe('InvoiceConceptService', () => {
  let service: InvoiceConceptService;
  let invoiceConceptRepository: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    findMaxPositionByInvoiceId: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };
  let invoiceRepository: { findById: jest.Mock };
  let itemRepository: { findById: jest.Mock };
  let invoiceConceptSerialRepository: { countByInvoiceConceptId: jest.Mock };
  let enterpriseAccessService: {
    assertCurrentEntityAccessible: jest.Mock;
    mergeRelationNames: (relations: string[] | undefined, required: string[]) => string[];
  };
  let inventoryLedgerService: { releaseInvoiceConceptReservationsById: jest.Mock };

  const invoiceConceptId = 'ic-uuid';
  const invoiceId = 'invoice-uuid';
  const itemId = 'item-uuid';
  const enterpriseId = 'enterprise-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  const buildInvoice = (overrides: Partial<Invoice> = {}): Invoice =>
    ({
      id: invoiceId,
      status: InvoiceStatus.DRAFT,
      client: { enterpriseId },
      ...overrides,
    }) as Invoice;

  const buildItem = (overrides: Partial<Item> = {}): Item =>
    ({
      id: itemId,
      name: 'Tornillo',
      pricePvp: 1.5,
      ean: '8412345678901',
      itemCategory: { enterpriseId } as ItemCategory,
      ...overrides,
    }) as Item;

  const buildInvoiceConcept = (overrides: Partial<InvoiceConcept> = {}): InvoiceConcept =>
    ({
      id: invoiceConceptId,
      invoiceId,
      name: 'Hora de consultoría',
      invoice: buildInvoice(),
      ...overrides,
    }) as InvoiceConcept;

  beforeEach(async () => {
    invoiceConceptRepository = {
      create: jest.fn(),
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
      findById: jest.fn(),
      findMaxPositionByInvoiceId: jest.fn().mockResolvedValue(null),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };
    invoiceRepository = { findById: jest.fn().mockResolvedValue(buildInvoice()) };
    itemRepository = { findById: jest.fn() };
    invoiceConceptSerialRepository = {
      countByInvoiceConceptId: jest.fn().mockResolvedValue(0),
    };
    enterpriseAccessService = {
      assertCurrentEntityAccessible: jest.fn(),
      mergeRelationNames: (relations?: string[], required: string[] = []) =>
        [...new Set([...(relations ?? []), ...required])],
    };
    inventoryLedgerService = {
      releaseInvoiceConceptReservationsById: jest.fn().mockResolvedValue(undefined),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceConceptService,
        { provide: InvoiceConceptRepository, useValue: invoiceConceptRepository },
        { provide: InvoiceRepository, useValue: invoiceRepository },
        { provide: ItemRepository, useValue: itemRepository },
        {
          provide: InvoiceConceptSerialRepository,
          useValue: invoiceConceptSerialRepository,
        },
        { provide: EnterpriseAccessService, useValue: enterpriseAccessService },
        { provide: InventoryLedgerService, useValue: inventoryLedgerService },
      ],
    }).compile();

    service = testingModule.get(InvoiceConceptService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('exige una factura', async () => {
      await expect(
        service.create({ name: 'Hora' } as InvoiceConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El concepto debe pertenecer a una factura',
      });
    });

    it('lanza 404 si invoiceId e invoice.id no coinciden', async () => {
      await expect(
        service.create(
          { invoiceId, invoice: { id: 'otra' } } as InvoiceConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de factura no encontrado',
      });
    });

    it('lanza 404 si la factura no existe', async () => {
      invoiceRepository.findById.mockResolvedValue(null);

      await expect(
        service.create({ invoiceId, name: 'Hora' } as InvoiceConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de factura no encontrado',
      });
    });

    it('lanza 404 si la factura es de otra empresa', async () => {
      invoiceRepository.findById.mockResolvedValue(
        buildInvoice({ client: { enterpriseId: 'otra' } as Invoice['client'] }),
      );

      await expect(
        service.create({ invoiceId, name: 'Hora' } as InvoiceConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de factura no encontrado',
      });
    });

    it('propaga 403 si el caller no tiene invoices.write', async () => {
      enterpriseAccessService.assertCurrentEntityAccessible.mockImplementation(() => {
        throw new HttpException(
          'No tiene permiso para realizar la acción invoices.write',
          HttpStatus.FORBIDDEN,
        );
      });

      await expect(
        service.create({ invoiceId, name: 'Hora' } as InvoiceConcept, enterpriseId),
      ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    });

    it('rechaza mutar una factura emitida', async () => {
      invoiceRepository.findById.mockResolvedValue(
        buildInvoice({ status: InvoiceStatus.ISSUED }),
      );

      await expect(
        service.create({ invoiceId, name: 'Hora' } as InvoiceConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'No se pueden modificar los conceptos de una factura ya emitida',
      });
    });

    it('exige nombre en una línea manual', async () => {
      await expect(
        service.create({ invoiceId } as InvoiceConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El concepto debe tener un nombre',
      });
    });

    it('rechaza un nombre que no es texto', async () => {
      await expect(
        service.create(
          { invoiceId, name: 12 as unknown as string } as InvoiceConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El nombre del concepto debe ser una cadena de texto',
      });
    });

    it('rechaza un nombre vacío', async () => {
      await expect(
        service.create({ invoiceId, name: '   ' } as InvoiceConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El nombre del concepto no puede estar vacío',
      });
    });

    it('acepta la factura anidada sin invoiceId escalar', async () => {
      invoiceConceptRepository.create.mockResolvedValue(buildInvoiceConcept());

      await service.create(
        { invoice: { id: invoiceId } as Invoice, name: 'Hora' } as InvoiceConcept,
        enterpriseId,
      );

      expect(invoiceRepository.findById).toHaveBeenCalledWith(invoiceId, ['client']);
    });

    it('persiste una línea manual con defaults y posición 0', async () => {
      const created = buildInvoiceConcept();
      invoiceConceptRepository.create.mockResolvedValue(created);

      await expect(
        service.create({ invoiceId, name: '  Hora  ' } as InvoiceConcept, enterpriseId),
      ).resolves.toEqual(created);

      expect(invoiceConceptRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          invoiceId,
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

    it('usa MAX(position)+1 cuando hay líneas previas', async () => {
      invoiceConceptRepository.findMaxPositionByInvoiceId.mockResolvedValue(4);
      invoiceConceptRepository.create.mockResolvedValue(buildInvoiceConcept());

      await service.create({ invoiceId, name: 'Hora' } as InvoiceConcept, enterpriseId);

      expect(invoiceConceptRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ position: 5 }),
      );
    });

    it('respeta la posición informada y recorta el EAN', async () => {
      invoiceConceptRepository.create.mockResolvedValue(buildInvoiceConcept());

      await service.create(
        {
          invoiceId,
          name: 'Hora',
          position: '2' as unknown as number,
          ean: '  123  ',
          basePrice: null as unknown as number,
          vat: null as unknown as number,
          irpf: null as unknown as number,
          quantity: null as unknown as number,
        } as InvoiceConcept,
        enterpriseId,
      );

      expect(invoiceConceptRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          position: 2,
          ean: '123',
          basePrice: 0,
          vat: 21,
          irpf: 0,
          quantity: 1,
        }),
      );
    });

    it('instantánea el artículo cuando solo llega item.id y el EAN del catálogo es nulo', async () => {
      itemRepository.findById.mockResolvedValue(buildItem({ ean: null }));
      invoiceConceptRepository.create.mockResolvedValue(buildInvoiceConcept());

      await service.create(
        { invoiceId, item: { id: itemId } as Item } as InvoiceConcept,
        enterpriseId,
      );

      expect(itemRepository.findById).toHaveBeenCalledWith(itemId, ['itemCategory']);
      expect(invoiceConceptRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId,
          name: 'Tornillo',
          ean: null,
        }),
      );
    });

    it('persiste ean nulo cuando el cuerpo lo informa explícitamente', async () => {
      invoiceConceptRepository.create.mockResolvedValue(buildInvoiceConcept());

      await service.create(
        { invoiceId, name: 'Hora', ean: null } as InvoiceConcept,
        enterpriseId,
      );

      expect(invoiceConceptRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ ean: null }),
      );
    });

    it('instantánea el artículo cuando hay itemId', async () => {
      itemRepository.findById.mockResolvedValue(buildItem());
      invoiceConceptRepository.create.mockResolvedValue(buildInvoiceConcept());

      await service.create({ invoiceId, itemId } as InvoiceConcept, enterpriseId);

      expect(invoiceConceptRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId,
          name: 'Tornillo',
          basePrice: 1.5,
          ean: '8412345678901',
        }),
      );
    });

    it('propaga 403 si el caller no puede escribir el artículo vinculado', async () => {
      itemRepository.findById.mockResolvedValue(buildItem());
      enterpriseAccessService.assertCurrentEntityAccessible
        .mockImplementationOnce(() => undefined)
        .mockImplementationOnce(() => {
          throw new HttpException(
            'No tiene permiso para realizar la acción invoices.write',
            HttpStatus.FORBIDDEN,
          );
        });

      await expect(
        service.create({ invoiceId, itemId, name: 'X' } as InvoiceConcept, enterpriseId),
      ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    });

    it('lanza 404 si el artículo no existe', async () => {
      itemRepository.findById.mockResolvedValue(null);

      await expect(
        service.create({ invoiceId, itemId, name: 'X' } as InvoiceConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de factura no encontrado',
      });
    });

    it('lanza 404 si itemId e item.id no coinciden', async () => {
      await expect(
        service.create(
          { invoiceId, itemId, item: { id: 'otro' } as Item, name: 'X' } as InvoiceConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de factura no encontrado',
      });
    });

    it('lanza 404 si el artículo es de otra empresa', async () => {
      itemRepository.findById.mockResolvedValue(
        buildItem({ itemCategory: { enterpriseId: 'otra' } as ItemCategory }),
      );

      await expect(
        service.create({ invoiceId, itemId, name: 'X' } as InvoiceConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de factura no encontrado',
      });
    });

    it('rechaza un precio que no es convertible a número', async () => {
      await expect(
        service.create(
          { invoiceId, name: 'Hora', basePrice: '  ' as unknown as number } as InvoiceConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        message: 'El precio base debe ser un número mayor o igual que 0',
      });
    });

    it('rechaza precio, enteros, suplido y EAN inválidos', async () => {
      await expect(
        service.create(
          { invoiceId, name: 'Hora', basePrice: -1 } as InvoiceConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        message: 'El precio base debe ser un número mayor o igual que 0',
      });
      await expect(
        service.create(
          { invoiceId, name: 'Hora', vat: 'x' as unknown as number } as InvoiceConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        message: 'El IVA debe ser un número entero mayor o igual que 0',
      });
      await expect(
        service.create(
          { invoiceId, name: 'Hora', quantity: Number.POSITIVE_INFINITY } as InvoiceConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        message: 'La cantidad debe ser un número entero mayor o igual que 0',
      });
      await expect(
        service.create(
          { invoiceId, name: 'Hora', irpf: true as unknown as number } as InvoiceConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        message: 'El IRPF debe ser un número entero mayor o igual que 0',
      });
      await expect(
        service.create(
          { invoiceId, name: 'Hora', ean: 1 as unknown as string } as InvoiceConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        message: 'El código EAN debe ser una cadena de texto',
      });
    });

    it('propaga el error del repositorio', async () => {
      const unexpectedError = new Error('db');
      invoiceConceptRepository.create.mockRejectedValue(unexpectedError);

      await expect(
        service.create({ invoiceId, name: 'Hora' } as InvoiceConcept, enterpriseId),
      ).rejects.toBe(unexpectedError);
    });
  });

  describe('findAll', () => {
    it('delega al repositorio', async () => {
      await expect(
        service.findAll(1, 10, 'position', 'ASC', { 'client.enterpriseId': enterpriseId }, [
          'invoice',
        ]),
      ).resolves.toEqual(emptyPaginatedResponse);
    });
  });

  describe('findById', () => {
    it('devuelve la línea', async () => {
      const existing = buildInvoiceConcept();
      invoiceConceptRepository.findById.mockResolvedValue(existing);

      await expect(service.findById(invoiceConceptId, ['item'])).resolves.toEqual(existing);
      expect(invoiceConceptRepository.findById).toHaveBeenCalledWith(invoiceConceptId, [
        'item',
        'invoice',
        'invoice.client',
      ]);
    });

    it('lanza 404 si no existe', async () => {
      invoiceConceptRepository.findById.mockResolvedValue(null);

      await expect(service.findById(invoiceConceptId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de factura no encontrado',
      });
    });
  });

  describe('updateById', () => {
    it('lanza 404 si no existe', async () => {
      invoiceConceptRepository.findById.mockResolvedValue(null);

      await expect(
        service.updateById(invoiceConceptId, { name: 'X' } as InvoiceConcept),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de factura no encontrado',
      });
    });

    it('rechaza mutar una factura emitida', async () => {
      invoiceConceptRepository.findById.mockResolvedValue(
        buildInvoiceConcept({ invoice: buildInvoice({ status: InvoiceStatus.ISSUED }) }),
      );

      await expect(
        service.updateById(invoiceConceptId, { name: 'X' } as InvoiceConcept),
      ).rejects.toMatchObject({
        message: 'No se pueden modificar los conceptos de una factura ya emitida',
      });
    });

    it('congela invoiceId, desvincula el artículo y actualiza campos', async () => {
      invoiceConceptRepository.findById.mockResolvedValue(buildInvoiceConcept({ itemId }));
      invoiceConceptRepository.updateById.mockResolvedValue(buildInvoiceConcept());

      await service.updateById(invoiceConceptId, {
        invoiceId: 'hackeada',
        itemId: null,
        name: 'Nuevo',
        position: 3,
        basePrice: '8.5' as unknown as number,
        ean: '   ',
      } as InvoiceConcept);

      expect(invoiceConceptRepository.updateById).toHaveBeenCalledWith(
        invoiceConceptId,
        expect.objectContaining({
          itemId: null,
          name: 'Nuevo',
          position: 3,
          basePrice: 8.5,
          ean: null,
        }),
      );
      expect(invoiceConceptRepository.updateById.mock.calls[0][1].invoiceId).toBeUndefined();
    });

    it('vincula un artículo en la actualización sin tocar campos omitidos', async () => {
      itemRepository.findById.mockResolvedValue(buildItem());
      invoiceConceptRepository.findById.mockResolvedValue(buildInvoiceConcept());
      invoiceConceptRepository.updateById.mockResolvedValue(buildInvoiceConcept());

      await service.updateById(invoiceConceptId, {
        itemId,
      } as InvoiceConcept);

      expect(invoiceConceptRepository.updateById).toHaveBeenCalledWith(
        invoiceConceptId,
        expect.objectContaining({ itemId }),
      );
      expect(invoiceConceptRepository.updateById.mock.calls[0][1].name).toBeUndefined();
    });

    it('conserva el itemId existente cuando el cuerpo no lo toca', async () => {
      invoiceConceptRepository.findById.mockResolvedValue(buildInvoiceConcept({ itemId }));
      invoiceConceptRepository.updateById.mockResolvedValue(buildInvoiceConcept());

      await service.updateById(invoiceConceptId, { name: 'Solo nombre' } as InvoiceConcept);

      expect(itemRepository.findById).not.toHaveBeenCalled();
      expect(invoiceConceptRepository.updateById.mock.calls[0][1].itemId).toBeUndefined();
    });

    it('conserva el itemId si el cuerpo trae un item vacío', async () => {
      invoiceConceptRepository.findById.mockResolvedValue(buildInvoiceConcept({ itemId }));
      invoiceConceptRepository.updateById.mockResolvedValue(buildInvoiceConcept());

      await service.updateById(invoiceConceptId, {
        item: {} as Item,
        vat: 10,
        irpf: 5,
        quantity: 2,
      } as InvoiceConcept);

      expect(invoiceConceptRepository.updateById).toHaveBeenCalledWith(
        invoiceConceptId,
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
      invoiceConceptRepository.findById.mockResolvedValue(buildInvoiceConcept());
      invoiceConceptRepository.updateById.mockRejectedValue(unexpectedError);

      await expect(
        service.updateById(invoiceConceptId, { name: 'X' } as InvoiceConcept),
      ).rejects.toBe(unexpectedError);
    });

    it('rechaza bajar la cantidad por debajo de las series asignadas', async () => {
      invoiceConceptRepository.findById.mockResolvedValue(
        buildInvoiceConcept({ itemId, quantity: 2 }),
      );
      invoiceConceptSerialRepository.countByInvoiceConceptId.mockResolvedValue(2);

      await expect(
        service.updateById(invoiceConceptId, { quantity: 1 } as InvoiceConcept),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'La cantidad no puede ser menor que el número de series asignadas',
      });
      expect(invoiceConceptRepository.updateById).not.toHaveBeenCalled();
    });

    it('usa cantidad 1 al validar series si la línea no tiene cantidad', async () => {
      invoiceConceptRepository.findById.mockResolvedValue(
        buildInvoiceConcept({ itemId, quantity: undefined }),
      );
      invoiceConceptSerialRepository.countByInvoiceConceptId.mockResolvedValue(2);

      await expect(
        service.updateById(invoiceConceptId, { name: 'Sin toque de cantidad' } as InvoiceConcept),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'La cantidad no puede ser menor que el número de series asignadas',
      });
    });

    it('permite dejar la cantidad igual al número de series', async () => {
      invoiceConceptRepository.findById.mockResolvedValue(
        buildInvoiceConcept({ itemId, quantity: 3 }),
      );
      invoiceConceptSerialRepository.countByInvoiceConceptId.mockResolvedValue(2);
      invoiceConceptRepository.updateById.mockResolvedValue(buildInvoiceConcept());

      await service.updateById(invoiceConceptId, { quantity: 2 } as InvoiceConcept);

      expect(invoiceConceptRepository.updateById).toHaveBeenCalledWith(
        invoiceConceptId,
        expect.objectContaining({ quantity: 2 }),
      );
    });

    it('rechaza desvincular el artículo si hay series asignadas', async () => {
      invoiceConceptRepository.findById.mockResolvedValue(buildInvoiceConcept({ itemId }));
      invoiceConceptSerialRepository.countByInvoiceConceptId.mockResolvedValue(1);

      await expect(
        service.updateById(invoiceConceptId, { itemId: null } as InvoiceConcept),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message:
          'No se puede quitar el artículo con número de serie mientras el concepto tenga series asignadas',
      });
    });

    it('rechaza cambiar a un artículo sin número de serie si hay series asignadas', async () => {
      const itemWithoutSerialId = 'item-sin-serie';
      itemRepository.findById.mockResolvedValue(
        buildItem({ id: itemWithoutSerialId, serialNumber: false }),
      );
      invoiceConceptRepository.findById.mockResolvedValue(buildInvoiceConcept({ itemId }));
      invoiceConceptSerialRepository.countByInvoiceConceptId.mockResolvedValue(1);

      await expect(
        service.updateById(invoiceConceptId, {
          itemId: itemWithoutSerialId,
        } as InvoiceConcept),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message:
          'No se puede quitar el artículo con número de serie mientras el concepto tenga series asignadas',
      });
    });

    it('permite cambiar a otro artículo con número de serie aunque haya series', async () => {
      const serialTrackedItemId = 'item-con-serie';
      itemRepository.findById.mockResolvedValue(
        buildItem({ id: serialTrackedItemId, serialNumber: true }),
      );
      invoiceConceptRepository.findById.mockResolvedValue(buildInvoiceConcept({ itemId }));
      invoiceConceptSerialRepository.countByInvoiceConceptId.mockResolvedValue(1);
      invoiceConceptRepository.updateById.mockResolvedValue(buildInvoiceConcept());

      await service.updateById(invoiceConceptId, {
        itemId: serialTrackedItemId,
      } as InvoiceConcept);

      expect(invoiceConceptRepository.updateById).toHaveBeenCalledWith(
        invoiceConceptId,
        expect.objectContaining({ itemId: serialTrackedItemId }),
      );
    });
  });

  describe('deleteById', () => {
    it('lanza 404 si no existe', async () => {
      invoiceConceptRepository.findById.mockResolvedValue(null);

      await expect(service.deleteById(invoiceConceptId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });

    it('rechaza borrar líneas de una factura emitida', async () => {
      invoiceConceptRepository.findById.mockResolvedValue(
        buildInvoiceConcept({ invoice: buildInvoice({ status: InvoiceStatus.ISSUED }) }),
      );

      await expect(service.deleteById(invoiceConceptId)).rejects.toMatchObject({
        message: 'No se pueden modificar los conceptos de una factura ya emitida',
      });
    });

    it('elimina la línea', async () => {
      invoiceConceptRepository.findById.mockResolvedValue(buildInvoiceConcept());
      invoiceConceptRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.deleteById(invoiceConceptId)).resolves.toEqual({
        affected: 1,
        raw: [],
      });
    });

    it('propaga el error del repositorio', async () => {
      const unexpectedError = new Error('db');
      invoiceConceptRepository.findById.mockResolvedValue(buildInvoiceConcept());
      invoiceConceptRepository.deleteById.mockRejectedValue(unexpectedError);

      await expect(service.deleteById(invoiceConceptId)).rejects.toBe(unexpectedError);
    });
  });
});
