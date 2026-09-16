import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceConcept } from 'src/entities/invoice-concept/invoice-concept.entity';
import { InvoiceConceptController } from './invoice-concept.controller';
import { InvoiceConceptService } from './invoice-concept.service';

describe('InvoiceConceptController', () => {
  let controller: InvoiceConceptController;
  let invoiceConceptService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const invoiceConceptId = 'ic-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  beforeEach(async () => {
    invoiceConceptService = {
      create: jest.fn().mockResolvedValue({ id: invoiceConceptId }),
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [InvoiceConceptController],
      providers: [{ provide: InvoiceConceptService, useValue: invoiceConceptService }],
    }).compile();

    controller = testingModule.get(InvoiceConceptController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('exige enterpriseId', async () => {
      await expect(
        controller.create('', { name: 'Hora', invoiceId: 'inv' } as InvoiceConcept),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
    });

    it('delega al servicio', async () => {
      const payload = { name: 'Hora', invoiceId: 'inv' } as InvoiceConcept;

      await expect(controller.create(enterpriseId, payload)).resolves.toEqual({
        id: invoiceConceptId,
      });
      expect(invoiceConceptService.create).toHaveBeenCalledWith(payload, enterpriseId);
    });
  });

  describe('findAll', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findAll('')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
    });

    it('parsea el filtro y fuerza el tenant vía client.enterpriseId', async () => {
      await controller.findAll(
        enterpriseId,
        2,
        20,
        'name',
        'DESC',
        JSON.stringify({ 'client.enterpriseId': 'atacante', invoiceId: 'inv' }),
        'invoice,item',
      );

      expect(invoiceConceptService.findAll).toHaveBeenCalledWith(
        2,
        20,
        'name',
        'DESC',
        { invoiceId: 'inv', 'client.enterpriseId': enterpriseId },
        ['invoice', 'item', 'invoice.client'],
      );
    });

    it('añade invoice e invoice.client si no se piden', async () => {
      await controller.findAll(enterpriseId);

      expect(invoiceConceptService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'position',
        'ASC',
        { 'client.enterpriseId': enterpriseId },
        ['invoice', 'invoice.client'],
      );
    });

    it('conserva el tenant si el filtro JSON es inválido', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await controller.findAll(enterpriseId, 1, 10, 'position', 'ASC', '{no-es-json');

      expect(console.error).toHaveBeenCalled();
      expect(invoiceConceptService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'position',
        'ASC',
        { 'client.enterpriseId': enterpriseId },
        ['invoice', 'invoice.client'],
      );
    });
  });

  describe('findById', () => {
    it('parsea relaciones', async () => {
      invoiceConceptService.findById.mockResolvedValue({ id: invoiceConceptId });

      await expect(controller.findById(invoiceConceptId, 'item,serials')).resolves.toEqual({
        id: invoiceConceptId,
      });
      expect(invoiceConceptService.findById).toHaveBeenCalledWith(invoiceConceptId, [
        'item',
        'serials',
      ]);
    });

    it('busca sin relaciones cuando no se informan', async () => {
      invoiceConceptService.findById.mockResolvedValue({ id: invoiceConceptId });

      await controller.findById(invoiceConceptId);

      expect(invoiceConceptService.findById).toHaveBeenCalledWith(invoiceConceptId, []);
    });
  });

  describe('updateById', () => {
    it('delega al servicio', async () => {
      const payload = { name: 'Nuevo' } as InvoiceConcept;
      invoiceConceptService.updateById.mockResolvedValue({ id: invoiceConceptId, ...payload });

      await expect(controller.updateById(invoiceConceptId, payload)).resolves.toEqual({
        id: invoiceConceptId,
        name: 'Nuevo',
      });
    });
  });

  describe('delete', () => {
    it('delega al servicio', async () => {
      invoiceConceptService.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(controller.delete(invoiceConceptId)).resolves.toEqual({
        affected: 1,
        raw: [],
      });
    });
  });
});
