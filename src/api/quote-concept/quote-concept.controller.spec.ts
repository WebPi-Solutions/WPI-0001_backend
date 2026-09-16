import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { QuoteConcept } from 'src/entities/quote-concept/quote-concept.entity';
import { QuoteConceptController } from './quote-concept.controller';
import { QuoteConceptService } from './quote-concept.service';

describe('QuoteConceptController', () => {
  let controller: QuoteConceptController;
  let quoteConceptService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const quoteConceptId = 'ic-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  beforeEach(async () => {
    quoteConceptService = {
      create: jest.fn().mockResolvedValue({ id: quoteConceptId }),
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [QuoteConceptController],
      providers: [{ provide: QuoteConceptService, useValue: quoteConceptService }],
    }).compile();

    controller = testingModule.get(QuoteConceptController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('exige enterpriseId', async () => {
      await expect(
        controller.create('', { name: 'Hora', quoteId: 'quote' } as QuoteConcept),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
    });

    it('delega al servicio', async () => {
      const payload = { name: 'Hora', quoteId: 'quote' } as QuoteConcept;

      await expect(controller.create(enterpriseId, payload)).resolves.toEqual({
        id: quoteConceptId,
      });
      expect(quoteConceptService.create).toHaveBeenCalledWith(payload, enterpriseId);
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
        JSON.stringify({ 'client.enterpriseId': 'atacante', quoteId: 'quote' }),
        'quote,item',
      );

      expect(quoteConceptService.findAll).toHaveBeenCalledWith(
        2,
        20,
        'name',
        'DESC',
        { quoteId: 'quote', 'client.enterpriseId': enterpriseId },
        ['quote', 'item', 'quote.client'],
      );
    });

    it('añade quote y quote.client si no se piden', async () => {
      await controller.findAll(enterpriseId);

      expect(quoteConceptService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'position',
        'ASC',
        { 'client.enterpriseId': enterpriseId },
        ['quote', 'quote.client'],
      );
    });

    it('conserva el tenant si el filtro JSON es inválido', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await controller.findAll(enterpriseId, 1, 10, 'position', 'ASC', '{no-es-json');

      expect(console.error).toHaveBeenCalled();
      expect(quoteConceptService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'position',
        'ASC',
        { 'client.enterpriseId': enterpriseId },
        ['quote', 'quote.client'],
      );
    });
  });

  describe('findById', () => {
    it('parsea relaciones', async () => {
      quoteConceptService.findById.mockResolvedValue({ id: quoteConceptId });

      await expect(controller.findById(quoteConceptId, 'item')).resolves.toEqual({
        id: quoteConceptId,
      });
      expect(quoteConceptService.findById).toHaveBeenCalledWith(quoteConceptId, [
        'item',
      ]);
    });

    it('busca sin relaciones cuando no se informan', async () => {
      quoteConceptService.findById.mockResolvedValue({ id: quoteConceptId });

      await controller.findById(quoteConceptId);

      expect(quoteConceptService.findById).toHaveBeenCalledWith(quoteConceptId, []);
    });
  });

  describe('updateById', () => {
    it('delega al servicio', async () => {
      const payload = { name: 'Nuevo' } as QuoteConcept;
      quoteConceptService.updateById.mockResolvedValue({ id: quoteConceptId, ...payload });

      await expect(controller.updateById(quoteConceptId, payload)).resolves.toEqual({
        id: quoteConceptId,
        name: 'Nuevo',
      });
    });
  });

  describe('delete', () => {
    it('delega al servicio', async () => {
      quoteConceptService.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(controller.delete(quoteConceptId)).resolves.toEqual({
        affected: 1,
        raw: [],
      });
    });
  });
});
