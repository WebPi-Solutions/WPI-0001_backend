import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceConceptSerialRepository } from 'src/entities/invoice-concept-serial/invoice-concept-serial-repository.service';
import { InvoiceConceptSerial } from 'src/entities/invoice-concept-serial/invoice-concept-serial.entity';
import { InvoiceConceptRepository } from 'src/entities/invoice-concept/invoice-concept-repository.service';
import { InvoiceConcept } from 'src/entities/invoice-concept/invoice-concept.entity';
import { Invoice, InvoiceStatus } from 'src/entities/invoice/invoice.entity';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { InvoiceConceptSerialService } from './invoice-concept-serial.service';

describe('InvoiceConceptSerialService', () => {
  let service: InvoiceConceptSerialService;
  let invoiceConceptSerialRepository: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
    countByInvoiceConceptId: jest.Mock;
  };
  let invoiceConceptRepository: { findById: jest.Mock };
  let enterpriseAccessService: {
    assertCurrentEntityAccessible: jest.Mock;
    mergeRelationNames: (relations: string[] | undefined, required: string[]) => string[];
  };

  const serialId = 'ics-uuid';
  const invoiceConceptId = 'ic-uuid';
  const enterpriseId = 'enterprise-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  const buildInvoiceConcept = (overrides: Partial<InvoiceConcept> = {}): InvoiceConcept =>
    ({
      id: invoiceConceptId,
      itemId: 'item-uuid',
      quantity: 2,
      item: { serialNumber: true },
      invoice: {
        status: InvoiceStatus.DRAFT,
        client: { enterpriseId },
      } as Invoice,
      ...overrides,
    }) as InvoiceConcept;

  const buildSerial = (overrides: Partial<InvoiceConceptSerial> = {}): InvoiceConceptSerial =>
    ({
      id: serialId,
      invoiceConceptId,
      serialNumber: 'SN-1',
      invoiceConcept: buildInvoiceConcept(),
      ...overrides,
    }) as InvoiceConceptSerial;

  beforeEach(async () => {
    invoiceConceptSerialRepository = {
      create: jest.fn(),
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
      countByInvoiceConceptId: jest.fn().mockResolvedValue(0),
    };
    invoiceConceptRepository = { findById: jest.fn().mockResolvedValue(buildInvoiceConcept()) };
    enterpriseAccessService = {
      assertCurrentEntityAccessible: jest.fn(),
      mergeRelationNames: (relations?: string[], required: string[] = []) =>
        [...new Set([...(relations ?? []), ...required])],
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceConceptSerialService,
        { provide: InvoiceConceptSerialRepository, useValue: invoiceConceptSerialRepository },
        { provide: InvoiceConceptRepository, useValue: invoiceConceptRepository },
        { provide: EnterpriseAccessService, useValue: enterpriseAccessService },
      ],
    }).compile();

    service = testingModule.get(InvoiceConceptSerialService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('exige una línea', async () => {
      await expect(
        service.create({ serialNumber: 'SN-1' } as InvoiceConceptSerial, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El número de serie debe pertenecer a un concepto de factura',
      });
    });

    it('lanza 404 si los UUID de línea no coinciden', async () => {
      await expect(
        service.create(
          {
            invoiceConceptId,
            invoiceConcept: { id: 'otra' },
            serialNumber: 'SN-1',
          } as InvoiceConceptSerial,
          enterpriseId,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it('propaga 403 si el caller no tiene invoices.write', async () => {
      enterpriseAccessService.assertCurrentEntityAccessible.mockImplementation(() => {
        throw new HttpException(
          'No tiene permiso para realizar la acción invoices.write',
          HttpStatus.FORBIDDEN,
        );
      });

      await expect(
        service.create(
          { invoiceConceptId, serialNumber: 'SN-1' } as InvoiceConceptSerial,
          enterpriseId,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    });

    it('lanza 404 si la línea no existe', async () => {
      invoiceConceptRepository.findById.mockResolvedValue(null);

      await expect(
        service.create(
          { invoiceConceptId, serialNumber: 'SN-1' } as InvoiceConceptSerial,
          enterpriseId,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it('lanza 404 si la línea es de otra empresa', async () => {
      invoiceConceptRepository.findById.mockResolvedValue(
        buildInvoiceConcept({
          invoice: { status: InvoiceStatus.DRAFT, client: { enterpriseId: 'otra' } } as Invoice,
        }),
      );

      await expect(
        service.create(
          { invoiceConceptId, serialNumber: 'SN-1' } as InvoiceConceptSerial,
          enterpriseId,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it('rechaza mutar una factura emitida', async () => {
      invoiceConceptRepository.findById.mockResolvedValue(
        buildInvoiceConcept({
          invoice: { status: InvoiceStatus.ISSUED, client: { enterpriseId } } as Invoice,
        }),
      );

      await expect(
        service.create(
          { invoiceConceptId, serialNumber: 'SN-1' } as InvoiceConceptSerial,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        message: 'No se pueden modificar los números de serie de una factura ya emitida',
      });
    });

    it('rechaza un número de serie que no es texto o está vacío', async () => {
      await expect(
        service.create(
          { invoiceConceptId, serialNumber: 1 as unknown as string } as InvoiceConceptSerial,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        message: 'El número de serie debe ser una cadena de texto',
      });
      await expect(
        service.create(
          { invoiceConceptId, serialNumber: '   ' } as InvoiceConceptSerial,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        message: 'El número de serie no puede estar vacío',
      });
    });

    it('acepta la línea anidada sin invoiceConceptId escalar', async () => {
      invoiceConceptSerialRepository.create.mockResolvedValue(buildSerial());

      await service.create(
        {
          invoiceConcept: { id: invoiceConceptId } as InvoiceConcept,
          serialNumber: 'SN-1',
        } as InvoiceConceptSerial,
        enterpriseId,
      );

      expect(invoiceConceptRepository.findById).toHaveBeenCalledWith(invoiceConceptId, [
        'invoice',
        'invoice.client',
        'item',
      ]);
    });

    it('persiste el número recortado', async () => {
      const created = buildSerial();
      invoiceConceptSerialRepository.create.mockResolvedValue(created);

      await expect(
        service.create(
          { invoiceConceptId, serialNumber: '  SN-1  ' } as InvoiceConceptSerial,
          enterpriseId,
        ),
      ).resolves.toEqual(created);
      expect(invoiceConceptSerialRepository.create).toHaveBeenCalledWith({
        invoiceConceptId,
        serialNumber: 'SN-1',
      });
    });

    it('propaga el error del repositorio', async () => {
      const unexpectedError = new Error('db');
      invoiceConceptSerialRepository.create.mockRejectedValue(unexpectedError);

      await expect(
        service.create(
          { invoiceConceptId, serialNumber: 'SN-1' } as InvoiceConceptSerial,
          enterpriseId,
        ),
      ).rejects.toBe(unexpectedError);
    });

    it('rechaza series en una línea sin artículo', async () => {
      invoiceConceptRepository.findById.mockResolvedValue(
        buildInvoiceConcept({ itemId: null, item: null }),
      );

      await expect(
        service.create(
          { invoiceConceptId, serialNumber: 'SN-1' } as InvoiceConceptSerial,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message:
          'Solo se pueden asignar números de serie a conceptos vinculados a un artículo que se gestiona con número de serie',
      });
    });

    it('rechaza series si el artículo no se gestiona con número de serie', async () => {
      invoiceConceptRepository.findById.mockResolvedValue(
        buildInvoiceConcept({ item: { serialNumber: false } as InvoiceConcept['item'] }),
      );

      await expect(
        service.create(
          { invoiceConceptId, serialNumber: 'SN-1' } as InvoiceConceptSerial,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message:
          'Solo se pueden asignar números de serie a conceptos vinculados a un artículo que se gestiona con número de serie',
      });
    });

    it('rechaza una serie extra cuando ya se cubre la cantidad', async () => {
      invoiceConceptRepository.findById.mockResolvedValue(buildInvoiceConcept({ quantity: 1 }));
      invoiceConceptSerialRepository.countByInvoiceConceptId.mockResolvedValue(1);

      await expect(
        service.create(
          { invoiceConceptId, serialNumber: 'SN-2' } as InvoiceConceptSerial,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El número de series no puede superar la cantidad del concepto',
      });
    });

    it('usa cantidad 1 si la línea no informa quantity', async () => {
      invoiceConceptRepository.findById.mockResolvedValue(
        buildInvoiceConcept({ quantity: undefined }),
      );
      invoiceConceptSerialRepository.countByInvoiceConceptId.mockResolvedValue(1);

      await expect(
        service.create(
          { invoiceConceptId, serialNumber: 'SN-2' } as InvoiceConceptSerial,
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
        service.findAll(1, 10, 'createdAt', 'ASC', { invoiceConceptId }, ['invoiceConcept']),
      ).resolves.toEqual(emptyPaginatedResponse);
    });
  });

  describe('assertInvoiceConceptAccessibleForList', () => {
    it('lanza 404 si la línea no existe', async () => {
      invoiceConceptRepository.findById.mockResolvedValue(null);

      await expect(
        service.assertInvoiceConceptAccessibleForList(invoiceConceptId, enterpriseId),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it('lanza 404 si la línea es de otra empresa', async () => {
      invoiceConceptRepository.findById.mockResolvedValue(
        buildInvoiceConcept({
          invoice: { status: InvoiceStatus.DRAFT, client: { enterpriseId: 'otra' } } as Invoice,
        }),
      );

      await expect(
        service.assertInvoiceConceptAccessibleForList(invoiceConceptId, enterpriseId),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it('acepta una línea de la empresa', async () => {
      await expect(
        service.assertInvoiceConceptAccessibleForList(invoiceConceptId, enterpriseId),
      ).resolves.toBeUndefined();
    });
  });

  describe('findById', () => {
    it('devuelve el registro', async () => {
      const existing = buildSerial();
      invoiceConceptSerialRepository.findById.mockResolvedValue(existing);

      await expect(service.findById(serialId)).resolves.toEqual(existing);
    });

    it('lanza 404 si no existe', async () => {
      invoiceConceptSerialRepository.findById.mockResolvedValue(null);

      await expect(service.findById(serialId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });
  });

  describe('updateById', () => {
    it('lanza 404 si no existe', async () => {
      invoiceConceptSerialRepository.findById.mockResolvedValue(null);

      await expect(
        service.updateById(serialId, { serialNumber: 'SN-2' } as InvoiceConceptSerial),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it('rechaza mutar una factura emitida', async () => {
      invoiceConceptSerialRepository.findById.mockResolvedValue(
        buildSerial({
          invoiceConcept: buildInvoiceConcept({
            invoice: { status: InvoiceStatus.ISSUED, client: { enterpriseId } } as Invoice,
          }),
        }),
      );

      await expect(
        service.updateById(serialId, { serialNumber: 'SN-2' } as InvoiceConceptSerial),
      ).rejects.toMatchObject({
        message: 'No se pueden modificar los números de serie de una factura ya emitida',
      });
    });

    it('actualiza el número de serie y congela la línea', async () => {
      invoiceConceptSerialRepository.findById.mockResolvedValue(buildSerial());
      invoiceConceptSerialRepository.updateById.mockResolvedValue(buildSerial());

      await service.updateById(serialId, {
        invoiceConceptId: 'hackeada',
        serialNumber: ' SN-2 ',
      } as InvoiceConceptSerial);

      expect(invoiceConceptSerialRepository.updateById).toHaveBeenCalledWith(serialId, {
        serialNumber: 'SN-2',
      });
    });

    it('no incluye serialNumber si no viene en el cuerpo', async () => {
      invoiceConceptSerialRepository.findById.mockResolvedValue(buildSerial());
      invoiceConceptSerialRepository.updateById.mockResolvedValue(buildSerial());

      await service.updateById(serialId, {} as InvoiceConceptSerial);

      expect(invoiceConceptSerialRepository.updateById).toHaveBeenCalledWith(serialId, {});
    });

    it('propaga el error del repositorio', async () => {
      const unexpectedError = new Error('db');
      invoiceConceptSerialRepository.findById.mockResolvedValue(buildSerial());
      invoiceConceptSerialRepository.updateById.mockRejectedValue(unexpectedError);

      await expect(
        service.updateById(serialId, { serialNumber: 'SN-2' } as InvoiceConceptSerial),
      ).rejects.toBe(unexpectedError);
    });
  });

  describe('deleteById', () => {
    it('lanza 404 si no existe', async () => {
      invoiceConceptSerialRepository.findById.mockResolvedValue(null);

      await expect(service.deleteById(serialId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });

    it('rechaza borrar series de una factura emitida', async () => {
      invoiceConceptSerialRepository.findById.mockResolvedValue(
        buildSerial({
          invoiceConcept: buildInvoiceConcept({
            invoice: { status: InvoiceStatus.ISSUED, client: { enterpriseId } } as Invoice,
          }),
        }),
      );

      await expect(service.deleteById(serialId)).rejects.toMatchObject({
        message: 'No se pueden modificar los números de serie de una factura ya emitida',
      });
    });

    it('elimina el registro', async () => {
      invoiceConceptSerialRepository.findById.mockResolvedValue(buildSerial());
      invoiceConceptSerialRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.deleteById(serialId)).resolves.toEqual({ affected: 1, raw: [] });
    });

    it('propaga el error del repositorio', async () => {
      const unexpectedError = new Error('db');
      invoiceConceptSerialRepository.findById.mockResolvedValue(buildSerial());
      invoiceConceptSerialRepository.deleteById.mockRejectedValue(unexpectedError);

      await expect(service.deleteById(serialId)).rejects.toBe(unexpectedError);
    });
  });
});
