import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
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

  beforeEach(async () => {
    quoteService = {
      create: jest.fn(),
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0, currentPage: 1, totalPages: 0 }),
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

  describe('findAll', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findAll('')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(quoteService.findAll).not.toHaveBeenCalled();
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

      expect(quoteService.findAll).toHaveBeenCalledWith(
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

      await controller.findAll(enterpriseId, 2, 25, 'name', 'ASC', '{no-es-json');

      expect(quoteService.findAll).toHaveBeenCalledWith(
        2,
        25,
        'name',
        'ASC',
        { 'client.enterpriseId': enterpriseId },
        [],
      );
    });
  });
});
