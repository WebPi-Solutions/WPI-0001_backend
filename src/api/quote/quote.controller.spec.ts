import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Quote, QuoteStatus } from 'src/entities/quote/quote.entity';
import { QuoteController } from './quote.controller';
import { QuoteService } from './quote.service';

describe('QuoteController', () => {
  let controller: QuoteController;
  let quoteService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    updateStatusById: jest.Mock;
    deleteById: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const quoteId = 'quote-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  beforeEach(async () => {
    quoteService = {
      create: jest.fn().mockResolvedValue({ id: quoteId }),
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
      findById: jest.fn(),
      updateById: jest.fn(),
      updateStatusById: jest.fn(),
      deleteById: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [QuoteController],
      providers: [{ provide: QuoteService, useValue: quoteService }],
    }).compile();

    controller = testingModule.get(QuoteController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('delega la creación al servicio', async () => {
      const quote = { name: 'Cotización Demo' } as Quote;

      await expect(controller.create(quote)).resolves.toEqual({ id: quoteId });
      expect(quoteService.create).toHaveBeenCalledWith(quote);
    });
  });

  describe('findAll', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findAll('')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(quoteService.findAll).not.toHaveBeenCalled();
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
        'client',
      );

      expect(quoteService.findAll).toHaveBeenCalledWith(
        2,
        25,
        'issuedDate',
        'ASC',
        { status: 'issued', 'client.enterpriseId': enterpriseId },
        ['client'],
      );
    });

    it('conserva client.enterpriseId si el filtro JSON es inválido', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      jest.spyOn(console, 'log').mockImplementation(() => undefined);

      await controller.findAll(enterpriseId, 1, 10, 'issuedDate', 'DESC', '{no-es-json');

      expect(console.error).toHaveBeenCalled();
      expect(quoteService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'issuedDate',
        'DESC',
        { 'client.enterpriseId': enterpriseId },
        ['client'],
      );
    });

    it('usa valores por defecto al omitir query opcionales', async () => {
      jest.spyOn(console, 'log').mockImplementation(() => undefined);

      await controller.findAll(enterpriseId);

      expect(quoteService.findAll).toHaveBeenCalledWith(
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
      quoteService.findById.mockResolvedValue({ id: quoteId });

      await expect(controller.findById(quoteId, 'client,invoices')).resolves.toEqual({
        id: quoteId,
      });
      expect(quoteService.findById).toHaveBeenCalledWith(quoteId, ['client', 'invoices']);
    });

    it('busca sin relaciones cuando no se informan', async () => {
      quoteService.findById.mockResolvedValue({ id: quoteId });

      await controller.findById(quoteId);

      expect(quoteService.findById).toHaveBeenCalledWith(quoteId, []);
    });
  });

  describe('updateById', () => {
    it('delega la actualización al servicio', async () => {
      const payload = { name: 'Cotización Actualizada' } as Quote;
      quoteService.updateById.mockResolvedValue({ id: quoteId, ...payload });

      await expect(controller.updateById(quoteId, payload)).resolves.toEqual({
        id: quoteId,
        name: 'Cotización Actualizada',
      });
      expect(quoteService.updateById).toHaveBeenCalledWith(quoteId, payload);
    });
  });

  describe('updateStatusById', () => {
    it('delega el cambio de estado al servicio', async () => {
      quoteService.updateStatusById.mockResolvedValue({
        id: quoteId,
        status: QuoteStatus.ISSUED,
      });

      await expect(controller.updateStatusById(quoteId, QuoteStatus.ISSUED)).resolves.toEqual({
        id: quoteId,
        status: QuoteStatus.ISSUED,
      });
      expect(quoteService.updateStatusById).toHaveBeenCalledWith(quoteId, QuoteStatus.ISSUED);
    });
  });

  describe('delete', () => {
    it('delega la eliminación al servicio', async () => {
      quoteService.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(controller.delete(quoteId)).resolves.toEqual({ affected: 1, raw: [] });
      expect(quoteService.deleteById).toHaveBeenCalledWith(quoteId);
    });
  });
});
