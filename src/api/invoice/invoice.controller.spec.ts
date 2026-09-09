import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
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

  beforeEach(async () => {
    invoiceService = {
      create: jest.fn(),
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0, currentPage: 1, totalPages: 0 }),
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

  describe('findAll', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findAll('')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(invoiceService.findAll).not.toHaveBeenCalled();
    });

    it('impide que el filtro JSON sustituya el client.enterpriseId de la query', async () => {
      jest.spyOn(console, 'log').mockImplementation(() => undefined);

      await controller.findAll(
        enterpriseId,
        1,
        10,
        'issuedDate',
        'DESC',
        JSON.stringify({ 'client.enterpriseId': 'empresa-atacante', status: 'draft' }),
      );

      expect(invoiceService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'issuedDate',
        'DESC',
        { 'client.enterpriseId': enterpriseId, status: 'draft' },
        [],
      );
    });

    it('conserva el client.enterpriseId de la query si el filtro JSON es inválido', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      jest.spyOn(console, 'log').mockImplementation(() => undefined);

      await controller.findAll(enterpriseId, 3, 20, 'name', 'ASC', '{no-es-json');

      expect(invoiceService.findAll).toHaveBeenCalledWith(
        3,
        20,
        'name',
        'ASC',
        { 'client.enterpriseId': enterpriseId },
        [],
      );
    });
  });
});
