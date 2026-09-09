import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClientRepository } from 'src/entities/client/client-repository.service';
import { EnterpriseRepository } from 'src/entities/enterprise/enterprise-repository.service';
import { QuoteRepository } from 'src/entities/quote/quote-repository.service';
import { Quote, QuoteStatus } from 'src/entities/quote/quote.entity';
import { QuoteService } from './quote.service';

describe('QuoteService', () => {
  let service: QuoteService;
  let quoteRepository: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };
  let clientRepository: { findById: jest.Mock };
  let enterpriseRepository: { findById: jest.Mock };

  const quoteId = 'quote-uuid';
  const clientId = 'client-uuid';
  const enterpriseId = 'enterprise-uuid';

  /**
   * Construye una cotización de prueba.
   * @param overrides - Campos a sobrescribir
   * @returns Entidad Quote simulada
   */
  const buildQuote = (overrides: Partial<Quote> = {}): Quote =>
    ({
      id: quoteId,
      clientId,
      status: QuoteStatus.DRAFT,
      name: 'Presupuesto de prueba',
      ...overrides,
    }) as Quote;

  beforeEach(async () => {
    quoteRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };
    clientRepository = { findById: jest.fn() };
    enterpriseRepository = { findById: jest.fn() };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        QuoteService,
        { provide: QuoteRepository, useValue: quoteRepository },
        { provide: ClientRepository, useValue: clientRepository },
        { provide: EnterpriseRepository, useValue: enterpriseRepository },
      ],
    }).compile();

    service = testingModule.get(QuoteService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateById', () => {
    it('impide editar una cotización que ya no está en borrador', async () => {
      quoteRepository.findById.mockResolvedValue(buildQuote({ status: QuoteStatus.ISSUED }));

      await expect(
        service.updateById(quoteId, buildQuote({ name: 'Nuevo nombre' })),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: `No se puede actualizar la cotización ${quoteId} porque ya ha sido emitida`,
      });
      expect(quoteRepository.updateById).not.toHaveBeenCalled();
    });
  });

  describe('updateStatusById', () => {
    it('rechaza un estado que no pertenece al enumerado', async () => {
      await expect(
        service.updateStatusById(quoteId, 'unknown' as QuoteStatus),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
      expect(quoteRepository.findById).not.toHaveBeenCalled();
    });

    it('rechaza volver a borrador una cotización ya emitida', async () => {
      quoteRepository.findById.mockResolvedValue(buildQuote({ status: QuoteStatus.ISSUED }));

      await expect(service.updateStatusById(quoteId, QuoteStatus.DRAFT)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'No se puede establecer como borrador una cotización que ya ha sido emitida',
      });
      expect(quoteRepository.updateById).not.toHaveBeenCalled();
    });

    it('congela cliente y emisor al emitir un borrador', async () => {
      quoteRepository.findById.mockResolvedValue(buildQuote({ status: QuoteStatus.DRAFT }));
      clientRepository.findById.mockResolvedValue({
        id: clientId,
        name: 'Cliente SA',
        nif: 'B12345678',
        address: 'Calle Cliente 1',
        enterpriseId,
      });
      enterpriseRepository.findById.mockResolvedValue({
        id: enterpriseId,
        name: 'Empresa SA',
        nif: 'A87654321',
        address: 'Calle Emisor 2',
      });
      quoteRepository.updateById.mockImplementation(async (_id: string, quote: Quote) => quote);

      const updatedQuote = await service.updateStatusById(quoteId, QuoteStatus.ISSUED);

      expect(clientRepository.findById).toHaveBeenCalledWith(clientId);
      expect(enterpriseRepository.findById).toHaveBeenCalledWith(enterpriseId);
      expect(updatedQuote).toEqual(
        expect.objectContaining({
          status: QuoteStatus.ISSUED,
          clientName: 'Cliente SA',
          clientNif: 'B12345678',
          clientAddress: 'Calle Cliente 1',
          issuerName: 'Empresa SA',
          issuerNif: 'A87654321',
          issuerAddress: 'Calle Emisor 2',
        }),
      );
    });
  });

  describe('deleteById', () => {
    it('solo permite borrar cotizaciones en borrador', async () => {
      quoteRepository.findById.mockResolvedValue(buildQuote({ status: QuoteStatus.CONVERTED }));

      await expect(service.deleteById(quoteId)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: `No se puede eliminar la cotización ${quoteId} porque ya ha sido emitida`,
      });
      expect(quoteRepository.deleteById).not.toHaveBeenCalled();
    });

    it('elimina una cotización en borrador', async () => {
      quoteRepository.findById.mockResolvedValue(buildQuote({ status: QuoteStatus.DRAFT }));
      quoteRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.deleteById(quoteId)).resolves.toEqual({ affected: 1, raw: [] });
    });
  });

  describe('setQuotePersistentData', () => {
    it('exige un cliente aunque la cotización esté en borrador', async () => {
      await expect(
        service.setQuotePersistentData(buildQuote({ clientId: undefined })),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'La cotización debe tener un cliente',
      });
    });

    it('no congela cliente ni emisor mientras está en borrador', async () => {
      const draftQuote = buildQuote({ status: QuoteStatus.DRAFT });

      await expect(service.setQuotePersistentData(draftQuote)).resolves.toBe(draftQuote);
      expect(clientRepository.findById).not.toHaveBeenCalled();
    });
  });
});
