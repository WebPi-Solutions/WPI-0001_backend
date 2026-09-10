import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClientRepository } from 'src/entities/client/client-repository.service';
import { Client } from 'src/entities/client/client.entity';
import { EnterpriseRepository } from 'src/entities/enterprise/enterprise-repository.service';
import { Enterprise } from 'src/entities/enterprise/enterprise.entity';
import { QuoteRepository } from 'src/entities/quote/quote-repository.service';
import { Quote, QuoteStatus } from 'src/entities/quote/quote.entity';
import { QuoteService } from './quote.service';
import { EnterpriseAccessService } from 'src/helpers/enterprise-access/enterprise-access.service';

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
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  /**
   * Construye una cotización de prueba.
   * @param overrides - Campos a sobrescribir
   * @returns Entidad Quote simulada
   */
  const buildQuote = (overrides: Partial<Quote> = {}): Quote =>
    ({
      id: quoteId,
      clientId,
      name: 'Cotización Demo',
      status: QuoteStatus.DRAFT,
      ...overrides,
    }) as Quote;

  /**
   * Construye un cliente de prueba con datos persistibles.
   * @param overrides - Campos a sobrescribir
   * @returns Entidad Client simulada
   */
  const buildClient = (overrides: Partial<Client> = {}): Client =>
    ({
      id: clientId,
      enterpriseId,
      name: 'Cliente Demo',
      nif: 'B12345678',
      address: 'Calle Cliente 1',
      ...overrides,
    }) as Client;

  /**
   * Construye una empresa de prueba con datos de emisor.
   * @param overrides - Campos a sobrescribir
   * @returns Entidad Enterprise simulada
   */
  const buildEnterprise = (overrides: Partial<Enterprise> = {}): Enterprise =>
    ({
      id: enterpriseId,
      name: 'Empresa Demo',
      nif: 'A87654321',
      address: 'Calle Emisor 9',
      ...overrides,
    }) as Enterprise;

  /**
   * Prepara los repositorios de cliente y empresa para copiar datos persistentes.
   * @returns void
   */
  const mockPersistentDataSources = (): void => {
    clientRepository.findById.mockResolvedValue(buildClient());
    enterpriseRepository.findById.mockResolvedValue(buildEnterprise());
  };

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
        {
          provide: EnterpriseAccessService,
          useValue: {
            assertCurrentEntityAccessible: jest.fn(),
            mergeRelationNames: (relations?: string[], required: string[] = []) =>
              [...new Set([...(relations ?? []), ...required])],
          },
        },
      ],
    }).compile();

    service = testingModule.get(QuoteService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('omite los datos persistentes cuando la cotización está en borrador', async () => {
      const draftQuote = buildQuote({ status: QuoteStatus.DRAFT });
      clientRepository.findById.mockResolvedValue(buildClient());
      quoteRepository.create.mockResolvedValue(draftQuote);

      await expect(service.create(draftQuote)).resolves.toEqual(draftQuote);
      expect(clientRepository.findById).toHaveBeenCalledWith(clientId);
      expect(enterpriseRepository.findById).not.toHaveBeenCalled();
      expect(quoteRepository.create).toHaveBeenCalledWith(draftQuote);
    });

    it('copia los datos de cliente y emisor cuando no está en borrador', async () => {
      mockPersistentDataSources();
      const issuedQuote = buildQuote({ status: QuoteStatus.ISSUED });
      quoteRepository.create.mockImplementation(async (quote: Quote) => quote);

      const createdQuote = await service.create(issuedQuote);

      expect(clientRepository.findById).toHaveBeenCalledWith(clientId);
      expect(enterpriseRepository.findById).toHaveBeenCalledWith(enterpriseId);
      expect(createdQuote.clientName).toBe('Cliente Demo');
      expect(createdQuote.clientNif).toBe('B12345678');
      expect(createdQuote.clientAddress).toBe('Calle Cliente 1');
      expect(createdQuote.issuerName).toBe('Empresa Demo');
      expect(createdQuote.issuerNif).toBe('A87654321');
      expect(createdQuote.issuerAddress).toBe('Calle Emisor 9');
    });

    it('lanza 400 si falta clientId', async () => {
      await expect(
        service.create(buildQuote({ clientId: undefined })),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'La cotización debe tener un cliente',
      });
      expect(quoteRepository.create).not.toHaveBeenCalled();
    });

    it('lanza 404 si el cliente no existe al emitir', async () => {
      clientRepository.findById.mockResolvedValue(null);

      await expect(
        service.create(buildQuote({ status: QuoteStatus.ISSUED })),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: `Cliente no encontrado con ID: ${clientId}`,
      });
      expect(quoteRepository.create).not.toHaveBeenCalled();
    });

    it('lanza 404 si la empresa del cliente no existe al emitir', async () => {
      clientRepository.findById.mockResolvedValue(buildClient());
      enterpriseRepository.findById.mockResolvedValue(null);

      await expect(
        service.create(buildQuote({ status: QuoteStatus.ISSUED })),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: `Empresa no encontrada con ID: ${enterpriseId}`,
      });
      expect(quoteRepository.create).not.toHaveBeenCalled();
    });

    it('relanza el error del repositorio', async () => {
      const repositoryError = new Error('fallo al persistir');
      clientRepository.findById.mockResolvedValue(buildClient());
      quoteRepository.create.mockRejectedValue(repositoryError);

      await expect(service.create(buildQuote())).rejects.toBe(repositoryError);
    });
  });

  describe('findAll', () => {
    it('delega la consulta paginada al repositorio', async () => {
      quoteRepository.findAll.mockResolvedValue(emptyPaginatedResponse);
      const filter = { 'client.enterpriseId': enterpriseId };

      await expect(
        service.findAll(1, 10, 'issuedDate', 'DESC', filter, ['client']),
      ).resolves.toEqual(emptyPaginatedResponse);
      expect(quoteRepository.findAll).toHaveBeenCalledWith(
        1,
        10,
        'issuedDate',
        'DESC',
        filter,
        ['client'],
      );
    });
  });

  describe('findById', () => {
    it('devuelve la cotización cuando existe', async () => {
      const existingQuote = buildQuote();
      quoteRepository.findById.mockResolvedValue(existingQuote);

      await expect(service.findById(quoteId, ['client'])).resolves.toEqual(existingQuote);
      expect(quoteRepository.findById).toHaveBeenCalledWith(quoteId, ['client']);
    });

    it('lanza 404 si la cotización no existe', async () => {
      quoteRepository.findById.mockResolvedValue(null);

      await expect(service.findById(quoteId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: `Cotización con ID: ${quoteId} no encontrada`,
      });
    });
  });

  describe('updateById', () => {
    it('lanza 404 si la cotización no existe', async () => {
      quoteRepository.findById.mockResolvedValue(null);

      await expect(service.updateById(quoteId, buildQuote())).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Cotización no encontrada',
      });
      expect(quoteRepository.updateById).not.toHaveBeenCalled();
    });

    it('impide editar una cotización que ya ha sido emitida', async () => {
      quoteRepository.findById.mockResolvedValue(buildQuote({ status: QuoteStatus.ISSUED }));

      await expect(
        service.updateById(quoteId, buildQuote({ name: 'Nueva' })),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: `No se puede actualizar la cotización ${quoteId} porque ya ha sido emitida`,
      });
      expect(quoteRepository.updateById).not.toHaveBeenCalled();
    });

    it('actualiza un borrador llamando a setQuotePersistentData y al repositorio', async () => {
      const draftQuote = buildQuote({ status: QuoteStatus.DRAFT });
      const updatedQuote = buildQuote({ name: 'Actualizada' });
      quoteRepository.findById.mockResolvedValue(draftQuote);
      quoteRepository.updateById.mockResolvedValue(updatedQuote);
      const setQuotePersistentDataSpy = jest.spyOn(service, 'setQuotePersistentData');

      clientRepository.findById.mockResolvedValue(buildClient());
      await expect(
        service.updateById(quoteId, { name: 'Actualizada' } as Quote),
      ).resolves.toEqual(updatedQuote);
      expect(setQuotePersistentDataSpy).toHaveBeenCalled();
      expect(quoteRepository.updateById).toHaveBeenCalledWith(
        quoteId,
        expect.objectContaining({ id: quoteId, name: 'Actualizada' }),
      );
    });

    it('propaga el error del repositorio al actualizar un borrador', async () => {
      const persistenceError = new Error('fallo al persistir la cotización');
      quoteRepository.findById.mockResolvedValue(buildQuote({ status: QuoteStatus.DRAFT }));
      clientRepository.findById.mockResolvedValue(buildClient());
      quoteRepository.updateById.mockRejectedValue(persistenceError);

      await expect(service.updateById(quoteId, { name: 'Actualizada' } as Quote)).rejects.toBe(
        persistenceError,
      );
    });
  });

  describe('updateStatusById', () => {
    it('rechaza un estado que no pertenece al enumerado', async () => {
      await expect(
        service.updateStatusById(quoteId, 'invalido' as QuoteStatus),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El estado de la cotización no es válido: invalido',
      });
      expect(quoteRepository.findById).not.toHaveBeenCalled();
    });

    it('lanza 404 si la cotización no existe', async () => {
      quoteRepository.findById.mockResolvedValue(null);

      await expect(service.updateStatusById(quoteId, QuoteStatus.ISSUED)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: `Cotización no encontrada con ID: ${quoteId}`,
      });
    });

    it('impide volver a borrador una cotización ya emitida', async () => {
      quoteRepository.findById.mockResolvedValue(buildQuote({ status: QuoteStatus.ISSUED }));

      await expect(
        service.updateStatusById(quoteId, QuoteStatus.DRAFT),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'No se puede establecer como borrador una cotización que ya ha sido emitida',
      });
      expect(quoteRepository.updateById).not.toHaveBeenCalled();
    });

    it('copia datos persistentes al pasar de borrador a emitida', async () => {
      mockPersistentDataSources();
      quoteRepository.findById.mockResolvedValue(buildQuote({ status: QuoteStatus.DRAFT }));
      quoteRepository.updateById.mockImplementation(async (_id: string, quote: Quote) => quote);

      const updatedQuote = await service.updateStatusById(quoteId, QuoteStatus.ISSUED);

      expect(clientRepository.findById).toHaveBeenCalledWith(clientId);
      expect(enterpriseRepository.findById).toHaveBeenCalledWith(enterpriseId);
      expect(quoteRepository.updateById).toHaveBeenCalledWith(
        quoteId,
        expect.objectContaining({
          status: QuoteStatus.ISSUED,
          clientName: 'Cliente Demo',
          issuerName: 'Empresa Demo',
        }),
      );
      expect(updatedQuote.status).toBe(QuoteStatus.ISSUED);
    });

    it('solo actualiza el estado al pasar de emitida a convertida', async () => {
      const issuedQuote = buildQuote({ status: QuoteStatus.ISSUED });
      quoteRepository.findById.mockResolvedValue(issuedQuote);
      quoteRepository.updateById.mockResolvedValue({
        ...issuedQuote,
        status: QuoteStatus.CONVERTED,
      });

      await expect(
        service.updateStatusById(quoteId, QuoteStatus.CONVERTED),
      ).resolves.toEqual(expect.objectContaining({ status: QuoteStatus.CONVERTED }));
      expect(clientRepository.findById).not.toHaveBeenCalled();
      expect(quoteRepository.updateById).toHaveBeenCalledWith(quoteId, {
        ...issuedQuote,
        status: QuoteStatus.CONVERTED,
      });
    });
  });

  describe('deleteById', () => {
    it('lanza 404 si la cotización no existe', async () => {
      quoteRepository.findById.mockResolvedValue(null);

      await expect(service.deleteById(quoteId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: `Cotización con ID ${quoteId} no encontrada`,
      });
      expect(quoteRepository.deleteById).not.toHaveBeenCalled();
    });

    it('impide eliminar una cotización ya emitida', async () => {
      quoteRepository.findById.mockResolvedValue(buildQuote({ status: QuoteStatus.ISSUED }));

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
      expect(quoteRepository.deleteById).toHaveBeenCalledWith(quoteId);
    });

    it('relanza el error del repositorio', async () => {
      const repositoryError = new Error('fallo al borrar');
      quoteRepository.findById.mockResolvedValue(buildQuote({ status: QuoteStatus.DRAFT }));
      quoteRepository.deleteById.mockRejectedValue(repositoryError);

      await expect(service.deleteById(quoteId)).rejects.toBe(repositoryError);
    });
  });

  describe('setQuotePersistentData', () => {
    it('copia nombre, NIF y dirección del cliente y del emisor', async () => {
      mockPersistentDataSources();
      const quote = buildQuote({ status: QuoteStatus.ISSUED });

      const result = await service.setQuotePersistentData(quote);

      expect(result.clientName).toBe('Cliente Demo');
      expect(result.clientNif).toBe('B12345678');
      expect(result.clientAddress).toBe('Calle Cliente 1');
      expect(result.issuerName).toBe('Empresa Demo');
      expect(result.issuerNif).toBe('A87654321');
      expect(result.issuerAddress).toBe('Calle Emisor 9');
    });
  });
});
