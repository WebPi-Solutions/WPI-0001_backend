import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceConceptSerial } from 'src/entities/invoice-concept-serial/invoice-concept-serial.entity';
import { InvoiceConceptSerialController } from './invoice-concept-serial.controller';
import { InvoiceConceptSerialService } from './invoice-concept-serial.service';

describe('InvoiceConceptSerialController', () => {
  let controller: InvoiceConceptSerialController;
  let invoiceConceptSerialService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
    assertInvoiceConceptAccessibleForList: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const invoiceConceptId = 'ic-uuid';
  const serialId = 'ics-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  beforeEach(async () => {
    invoiceConceptSerialService = {
      create: jest.fn().mockResolvedValue({ id: serialId }),
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
      assertInvoiceConceptAccessibleForList: jest.fn().mockResolvedValue(undefined),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [InvoiceConceptSerialController],
      providers: [{ provide: InvoiceConceptSerialService, useValue: invoiceConceptSerialService }],
    }).compile();

    controller = testingModule.get(InvoiceConceptSerialController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('exige enterpriseId', async () => {
      await expect(
        controller.create('', {
          invoiceConceptId,
          serialNumber: 'SN-1',
        } as InvoiceConceptSerial),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
    });

    it('delega al servicio', async () => {
      const payload = {
        invoiceConceptId,
        serialNumber: 'SN-1',
      } as InvoiceConceptSerial;

      await expect(controller.create(enterpriseId, payload)).resolves.toEqual({ id: serialId });
      expect(invoiceConceptSerialService.create).toHaveBeenCalledWith(payload, enterpriseId);
    });
  });

  describe('findAll', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findAll('', invoiceConceptId)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
    });

    it('exige invoiceConceptId', async () => {
      await expect(controller.findAll(enterpriseId, '')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID del concepto de factura',
      });
    });

    it('parsea el filtro y fuerza invoiceConceptId', async () => {
      await controller.findAll(
        enterpriseId,
        invoiceConceptId,
        2,
        20,
        'serialNumber',
        'DESC',
        JSON.stringify({ invoiceConceptId: 'atacante', serialNumber: 'SN' }),
        'invoiceConcept,invoiceConcept.invoice',
      );

      expect(
        invoiceConceptSerialService.assertInvoiceConceptAccessibleForList,
      ).toHaveBeenCalledWith(invoiceConceptId, enterpriseId);
      expect(invoiceConceptSerialService.findAll).toHaveBeenCalledWith(
        2,
        20,
        'serialNumber',
        'DESC',
        { serialNumber: 'SN', invoiceConceptId },
        ['invoiceConcept', 'invoiceConcept.invoice'],
      );
    });

    it('añade invoiceConcept si no se pide y usa defaults', async () => {
      await controller.findAll(enterpriseId, invoiceConceptId);

      expect(invoiceConceptSerialService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'createdAt',
        'ASC',
        { invoiceConceptId },
        ['invoiceConcept'],
      );
    });

    it('conserva invoiceConceptId si el filtro JSON es inválido', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await controller.findAll(
        enterpriseId,
        invoiceConceptId,
        1,
        10,
        'createdAt',
        'ASC',
        '{no-es-json',
      );

      expect(console.error).toHaveBeenCalled();
      expect(invoiceConceptSerialService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'createdAt',
        'ASC',
        { invoiceConceptId },
        ['invoiceConcept'],
      );
    });
  });

  describe('findById', () => {
    it('parsea relaciones', async () => {
      invoiceConceptSerialService.findById.mockResolvedValue({ id: serialId });

      await expect(controller.findById(serialId, 'invoiceConcept')).resolves.toEqual({
        id: serialId,
      });
      expect(invoiceConceptSerialService.findById).toHaveBeenCalledWith(serialId, [
        'invoiceConcept',
      ]);
    });

    it('busca sin relaciones cuando no se informan', async () => {
      invoiceConceptSerialService.findById.mockResolvedValue({ id: serialId });

      await controller.findById(serialId);

      expect(invoiceConceptSerialService.findById).toHaveBeenCalledWith(serialId, []);
    });
  });

  describe('updateById', () => {
    it('delega al servicio', async () => {
      const payload = { serialNumber: 'SN-2' } as InvoiceConceptSerial;
      invoiceConceptSerialService.updateById.mockResolvedValue({ id: serialId, ...payload });

      await expect(controller.updateById(serialId, payload)).resolves.toEqual({
        id: serialId,
        serialNumber: 'SN-2',
      });
    });
  });

  describe('delete', () => {
    it('delega al servicio', async () => {
      invoiceConceptSerialService.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(controller.delete(serialId)).resolves.toEqual({ affected: 1, raw: [] });
    });
  });
});
