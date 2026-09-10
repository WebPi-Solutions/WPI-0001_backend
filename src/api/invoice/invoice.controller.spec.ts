import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Invoice, InvoiceStatus } from 'src/entities/invoice/invoice.entity';
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';

describe('InvoiceController', () => {
  let controller: InvoiceController;
  let invoiceService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    updateStatusById: jest.Mock;
    deleteById: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const invoiceId = 'invoice-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  beforeEach(async () => {
    invoiceService = {
      create: jest.fn().mockResolvedValue({ id: invoiceId }),
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
      findById: jest.fn(),
      updateById: jest.fn(),
      updateStatusById: jest.fn(),
      deleteById: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [InvoiceController],
      providers: [{ provide: InvoiceService, useValue: invoiceService }],
    }).compile();

    controller = testingModule.get(InvoiceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('delega la creación al servicio', async () => {
      const invoice = { name: 'Factura Demo' } as Invoice;

      await expect(controller.create(invoice)).resolves.toEqual({ id: invoiceId });
      expect(invoiceService.create).toHaveBeenCalledWith(invoice);
    });
  });

  describe('findAll', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findAll('')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(invoiceService.findAll).not.toHaveBeenCalled();
    });

    it('parsea el filtro JSON y fuerza client.enterpriseId', async () => {
      jest.spyOn(console, 'log').mockImplementation(() => undefined);

      await controller.findAll(
        enterpriseId,
        2,
        25,
        'issuedDate',
        'ASC',
        JSON.stringify({ 'client.enterpriseId': 'empresa-atacante', status: 'issued' }),
        'client,invoiceSeries',
      );

      expect(invoiceService.findAll).toHaveBeenCalledWith(
        2,
        25,
        'issuedDate',
        'ASC',
        { status: 'issued', 'client.enterpriseId': enterpriseId },
        ['client', 'invoiceSeries'],
      );
    });

    it('conserva client.enterpriseId si el filtro JSON es inválido', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      jest.spyOn(console, 'log').mockImplementation(() => undefined);

      await controller.findAll(enterpriseId, 1, 10, 'issuedDate', 'DESC', '{no-es-json');

      expect(console.error).toHaveBeenCalled();
      expect(invoiceService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'issuedDate',
        'DESC',
        { 'client.enterpriseId': enterpriseId },
        ['client'],
      );
    });

    it('usa valores por defecto de paginación y filtro al omitir opcionales', async () => {
      jest.spyOn(console, 'log').mockImplementation(() => undefined);

      await controller.findAll(enterpriseId);

      expect(invoiceService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'issuedDate',
        'DESC',
        { 'client.enterpriseId': enterpriseId },
        ['client'],
      );
    });
  });

  describe('findById', () => {
    it('delega al servicio parseando las relaciones', async () => {
      invoiceService.findById.mockResolvedValue({ id: invoiceId });

      await expect(controller.findById(invoiceId, 'client,concepts')).resolves.toEqual({
        id: invoiceId,
      });
      expect(invoiceService.findById).toHaveBeenCalledWith(invoiceId, ['client', 'concepts']);
    });

    it('busca sin relaciones cuando no se informan', async () => {
      invoiceService.findById.mockResolvedValue({ id: invoiceId });

      await controller.findById(invoiceId);

      expect(invoiceService.findById).toHaveBeenCalledWith(invoiceId, []);
    });
  });

  describe('updateById', () => {
    it('delega la actualización al servicio', async () => {
      const payload = { name: 'Factura Actualizada' } as Invoice;
      invoiceService.updateById.mockResolvedValue({ id: invoiceId, ...payload });

      await expect(controller.updateById(invoiceId, payload)).resolves.toEqual({
        id: invoiceId,
        name: 'Factura Actualizada',
      });
      expect(invoiceService.updateById).toHaveBeenCalledWith(invoiceId, payload);
    });
  });

  describe('updateStatusById', () => {
    it('delega el cambio de estado al servicio', async () => {
      invoiceService.updateStatusById.mockResolvedValue({
        id: invoiceId,
        status: InvoiceStatus.ISSUED,
      });

      await expect(
        controller.updateStatusById(invoiceId, InvoiceStatus.ISSUED),
      ).resolves.toEqual({ id: invoiceId, status: InvoiceStatus.ISSUED });
      expect(invoiceService.updateStatusById).toHaveBeenCalledWith(invoiceId, InvoiceStatus.ISSUED);
    });
  });

  describe('delete', () => {
    it('delega la eliminación al servicio', async () => {
      invoiceService.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(controller.delete(invoiceId)).resolves.toEqual({ affected: 1, raw: [] });
      expect(invoiceService.deleteById).toHaveBeenCalledWith(invoiceId);
    });
  });
});
