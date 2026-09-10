import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClientRepository } from 'src/entities/client/client-repository.service';
import { Client } from 'src/entities/client/client.entity';
import { InvoiceSeriesRepository } from 'src/entities/invoice-series/invoice-series-repository.service';
import { InvoiceSeries } from 'src/entities/invoice-series/invoice-series.entity';
import { InvoiceRepository } from 'src/entities/invoice/invoice-repository.service';
import { Invoice, InvoiceStatus } from 'src/entities/invoice/invoice.entity';
import { RecurrentEarningRepository } from 'src/entities/recurrent-earning/recurrent-earning-repository.service';
import { InvoiceService } from './invoice.service';
import { EnterpriseAccessService } from 'src/helpers/enterprise-access/enterprise-access.service';

describe('InvoiceService', () => {
  let service: InvoiceService;
  let invoiceRepository: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };
  let clientRepository: { findById: jest.Mock };
  let invoiceSeriesRepository: { findById: jest.Mock };
  let recurrentEarningRepository: { findById: jest.Mock };

  const invoiceId = 'invoice-uuid';
  const clientId = 'client-uuid';
  const seriesId = 'series-uuid';
  const enterpriseId = 'enterprise-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  /**
   * Construye una factura de prueba.
   * @param overrides - Campos a sobrescribir
   * @returns Entidad Invoice simulada
   */
  const buildInvoice = (overrides: Partial<Invoice> = {}): Invoice =>
    ({
      id: invoiceId,
      clientId,
      seriesId,
      series: { id: seriesId } as Invoice['series'],
      name: 'Factura Demo',
      status: InvoiceStatus.DRAFT,
      recurrentEarningId: null,
      ...overrides,
    }) as Invoice;

  /**
   * Construye un cliente de prueba con datos persistibles.
   * @param overrides - Campos a sobrescribir
   * @returns Entidad Client simulada
   */
  const buildClient = (overrides: Partial<Client> = {}): Client =>
    ({
      id: clientId,
      enterpriseId,
      name: 'Cliente S.L.',
      nif: 'B12345678',
      address: 'Calle 1',
      ...overrides,
    }) as Client;

  /**
   * Construye una serie de factura con empresa emisora.
   * @param overrides - Campos a sobrescribir
   * @returns Entidad InvoiceSeries simulada
   */
  const buildInvoiceSeries = (overrides: Partial<InvoiceSeries> = {}): InvoiceSeries =>
    ({
      id: seriesId,
      enterpriseId,
      enterprise: {
        name: 'Emisor S.L.',
        nif: 'A11111111',
        address: 'Calle 2',
        bankAccount: 'ES1200000000000000000000',
      },
      ...overrides,
    }) as InvoiceSeries;

  /**
   * Prepara repositorios para numerar y copiar datos persistentes al emitir.
   * @returns void
   */
  const mockIssuedPersistentDataSources = (): void => {
    invoiceRepository.findAll.mockResolvedValue({
      items: [{ id: 'invoice-a', seriesNumber: 4 }],
      total: 1,
      currentPage: 1,
      totalPages: 1,
    });
    clientRepository.findById.mockResolvedValue(buildClient());
    invoiceSeriesRepository.findById.mockResolvedValue(buildInvoiceSeries());
  };

  /**
   * Prepara cliente y serie de la misma empresa para las comprobaciones de tenant.
   * @returns void
   */
  const mockTenantAccessibleSources = (): void => {
    clientRepository.findById.mockResolvedValue(buildClient());
    invoiceSeriesRepository.findById.mockResolvedValue(buildInvoiceSeries());
  };

  beforeEach(async () => {
    invoiceRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };
    clientRepository = { findById: jest.fn() };
    invoiceSeriesRepository = { findById: jest.fn() };
    recurrentEarningRepository = { findById: jest.fn() };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceService,
        { provide: InvoiceRepository, useValue: invoiceRepository },
        { provide: ClientRepository, useValue: clientRepository },
        { provide: InvoiceSeriesRepository, useValue: invoiceSeriesRepository },
        { provide: RecurrentEarningRepository, useValue: recurrentEarningRepository },
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

    service = testingModule.get(InvoiceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('crea un borrador sin numerar ni copiar datos persistentes', async () => {
      const draftInvoice = buildInvoice({ status: InvoiceStatus.DRAFT });
      mockTenantAccessibleSources();
      invoiceRepository.create.mockResolvedValue(draftInvoice);

      await expect(service.create(draftInvoice)).resolves.toEqual(draftInvoice);
      expect(clientRepository.findById).toHaveBeenCalledWith(clientId);
      expect(invoiceSeriesRepository.findById).toHaveBeenCalledWith(seriesId);
      expect(invoiceRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ seriesNumber: null }),
      );
    });

    it('rechaza una serie de otra empresa aunque el cliente sea accesible', async () => {
      clientRepository.findById.mockResolvedValue(buildClient({ enterpriseId }));
      invoiceSeriesRepository.findById.mockResolvedValue(
        buildInvoiceSeries({ enterpriseId: 'otra-empresa' }),
      );

      await expect(service.create(buildInvoice())).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'La serie de factura no pertenece a la misma empresa que el cliente',
      });
      expect(invoiceRepository.create).not.toHaveBeenCalled();
    });

    it('rechaza clientId y client.id de empresas distintas en el mismo payload', async () => {
      const nestedClientId = 'client-otra-empresa';
      clientRepository.findById.mockImplementation(async (requestedClientId: string) => {
        if (requestedClientId === clientId) {
          return buildClient({ enterpriseId });
        }
        return buildClient({ id: nestedClientId, enterpriseId: 'otra-empresa' });
      });
      invoiceSeriesRepository.findById.mockResolvedValue(buildInvoiceSeries());

      await expect(
        service.create(
          buildInvoice({
            client: { id: nestedClientId } as Invoice['client'],
          }),
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'La serie de factura no pertenece a la misma empresa que el cliente',
      });
      expect(invoiceRepository.create).not.toHaveBeenCalled();
    });

    it('rechaza seriesId y series.id de empresas distintas en el mismo payload', async () => {
      const nestedSeriesId = 'series-otra-empresa';
      clientRepository.findById.mockResolvedValue(buildClient());
      invoiceSeriesRepository.findById.mockImplementation(async (requestedSeriesId: string) => {
        if (requestedSeriesId === seriesId) {
          return buildInvoiceSeries({ enterpriseId });
        }
        return buildInvoiceSeries({ id: nestedSeriesId, enterpriseId: 'otra-empresa' });
      });

      await expect(
        service.create(
          buildInvoice({
            series: { id: nestedSeriesId } as Invoice['series'],
          }),
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'La serie de factura no pertenece a la misma empresa que el cliente',
      });
      expect(invoiceRepository.create).not.toHaveBeenCalled();
    });

    it('lanza 400 si faltan cliente o serie en la comprobación de tenant', async () => {
      await expect(
        service.create(buildInvoice({ clientId: undefined, client: undefined })),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'La factura debe tener un cliente',
      });

      clientRepository.findById.mockResolvedValue(buildClient());
      await expect(
        service.create(buildInvoice({ seriesId: undefined, series: undefined })),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'La factura debe tener una serie',
      });
      expect(invoiceRepository.create).not.toHaveBeenCalled();
    });

    it('lanza 404 si el cliente o la serie no existen al validar el tenant', async () => {
      clientRepository.findById.mockResolvedValue(null);

      await expect(service.create(buildInvoice())).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: `Cliente no encontrado con ID: ${clientId}`,
      });

      clientRepository.findById.mockResolvedValue(buildClient());
      invoiceSeriesRepository.findById.mockResolvedValue(null);

      await expect(service.create(buildInvoice())).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Serie de factura no encontrada',
      });
      expect(invoiceRepository.create).not.toHaveBeenCalled();
    });

    it('usa el client.id anidado cuando clientId llega en blanco', async () => {
      const nestedClientId = 'client-anidado';
      clientRepository.findById.mockResolvedValue(buildClient({ id: nestedClientId }));
      invoiceSeriesRepository.findById.mockResolvedValue(buildInvoiceSeries());
      invoiceRepository.create.mockResolvedValue(buildInvoice({ clientId: nestedClientId }));

      await expect(
        service.create(
          buildInvoice({
            clientId: '   ',
            client: { id: nestedClientId } as Invoice['client'],
          }),
        ),
      ).resolves.toBeDefined();
      expect(clientRepository.findById).toHaveBeenCalledWith(nestedClientId);
    });

    it('numera y copia datos persistentes al crear una factura emitida', async () => {
      mockIssuedPersistentDataSources();
      invoiceRepository.create.mockImplementation(async (invoice: Invoice) => invoice);

      const createdInvoice = await service.create(
        buildInvoice({ status: InvoiceStatus.ISSUED }),
      );

      expect(createdInvoice.seriesNumber).toBe(5);
      expect(createdInvoice.clientName).toBe('Cliente S.L.');
      expect(createdInvoice.issuerName).toBe('Emisor S.L.');
      expect(invoiceRepository.create).toHaveBeenCalled();
    });

    it('relanza el error del repositorio', async () => {
      const repositoryError = new Error('fallo al persistir');
      mockTenantAccessibleSources();
      invoiceRepository.create.mockRejectedValue(repositoryError);

      await expect(service.create(buildInvoice())).rejects.toBe(repositoryError);
    });
  });

  describe('findAll', () => {
    it('delega la consulta paginada al repositorio', async () => {
      invoiceRepository.findAll.mockResolvedValue(emptyPaginatedResponse);
      const filter = { seriesId };

      await expect(
        service.findAll(1, 10, 'issuedDate', 'DESC', filter),
      ).resolves.toEqual(emptyPaginatedResponse);
      expect(invoiceRepository.findAll).toHaveBeenCalledWith(
        1,
        10,
        'issuedDate',
        'DESC',
        filter,
        undefined,
      );
    });

    it('incluye relaciones cuando se informan', async () => {
      const paginatedWithItems = {
        items: [buildInvoice()],
        total: 1,
        currentPage: 1,
        totalPages: 1,
      };
      invoiceRepository.findAll.mockResolvedValue(paginatedWithItems);

      await expect(
        service.findAll(2, 20, 'name', 'ASC', {}, ['client', 'series']),
      ).resolves.toEqual(paginatedWithItems);
    });
  });

  describe('findById', () => {
    it('devuelve la factura cuando existe', async () => {
      const existingInvoice = buildInvoice();
      invoiceRepository.findById.mockResolvedValue(existingInvoice);

      await expect(service.findById(invoiceId, ['client'])).resolves.toEqual(existingInvoice);
      expect(invoiceRepository.findById).toHaveBeenCalledWith(invoiceId, ['client']);
    });

    it('consulta sin relaciones cuando no se informan', async () => {
      const existingInvoice = buildInvoice();
      invoiceRepository.findById.mockResolvedValue(existingInvoice);

      await expect(service.findById(invoiceId)).resolves.toEqual(existingInvoice);
      expect(invoiceRepository.findById).toHaveBeenCalledWith(invoiceId, ['client']);
    });

    it('lanza 404 si la factura no existe', async () => {
      invoiceRepository.findById.mockResolvedValue(null);

      await expect(service.findById(invoiceId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: `Factura con ID: ${invoiceId} no encontrada`,
      });
    });
  });

  describe('updateById', () => {
    it('lanza 404 si la factura no existe', async () => {
      invoiceRepository.findById.mockResolvedValue(null);

      await expect(service.updateById(invoiceId, buildInvoice())).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Factura no encontrada',
      });
      expect(invoiceRepository.updateById).not.toHaveBeenCalled();
    });

    it('impide editar una factura que ya no está en borrador', async () => {
      invoiceRepository.findById.mockResolvedValue(
        buildInvoice({ status: InvoiceStatus.ISSUED }),
      );

      await expect(
        service.updateById(invoiceId, buildInvoice({ name: 'Nueva' })),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: `No se puede actualizar la factura ${invoiceId} porque ya ha sido emitida`,
      });
    });

    it('actualiza un borrador mezclando datos persistentes y el payload', async () => {
      const draftInvoice = buildInvoice({ status: InvoiceStatus.DRAFT, name: 'Antigua' });
      const updatedInvoice = buildInvoice({ name: 'Actualizada' });
      invoiceRepository.findById.mockResolvedValue(draftInvoice);
      mockTenantAccessibleSources();
      invoiceRepository.updateById.mockResolvedValue(updatedInvoice);

      await expect(
        service.updateById(invoiceId, { name: 'Actualizada' } as Invoice),
      ).resolves.toEqual(updatedInvoice);
      expect(invoiceRepository.updateById).toHaveBeenCalledWith(
        invoiceId,
        expect.objectContaining({
          id: invoiceId,
          name: 'Actualizada',
          seriesNumber: null,
        }),
      );
    });

    it('no retargetea la factura a un cliente de otra empresa vía relación anidada', async () => {
      const nestedClientId = 'client-otra-empresa';
      invoiceRepository.findById.mockResolvedValue(buildInvoice({ status: InvoiceStatus.DRAFT }));
      clientRepository.findById.mockImplementation(async (requestedClientId: string) => {
        if (requestedClientId === clientId) {
          return buildClient({ enterpriseId });
        }
        return buildClient({ id: nestedClientId, enterpriseId: 'otra-empresa' });
      });
      invoiceSeriesRepository.findById.mockResolvedValue(buildInvoiceSeries());

      await expect(
        service.updateById(invoiceId, {
          client: { id: nestedClientId },
        } as Invoice),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'La serie de factura no pertenece a la misma empresa que el cliente',
      });
      expect(invoiceRepository.updateById).not.toHaveBeenCalled();
    });

    it('relanza el error del repositorio', async () => {
      const repositoryError = new Error('fallo al actualizar');
      invoiceRepository.findById.mockResolvedValue(buildInvoice({ status: InvoiceStatus.DRAFT }));
      mockTenantAccessibleSources();
      invoiceRepository.updateById.mockRejectedValue(repositoryError);

      await expect(
        service.updateById(invoiceId, { name: 'Actualizada' } as Invoice),
      ).rejects.toBe(repositoryError);
    });
  });

  describe('updateStatusById', () => {
    it('rechaza un estado que no pertenece al enumerado', async () => {
      await expect(
        service.updateStatusById(invoiceId, 'unknown' as InvoiceStatus),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El nuevo estado de la factura no es válido: unknown',
      });
      expect(invoiceRepository.findById).not.toHaveBeenCalled();
    });

    it('lanza 404 si la factura no existe', async () => {
      invoiceRepository.findById.mockResolvedValue(null);

      await expect(
        service.updateStatusById(invoiceId, InvoiceStatus.ISSUED),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: `Factura no encontrada con ID: ${invoiceId}`,
      });
    });

    it('rechaza volver a borrador una factura ya emitida', async () => {
      invoiceRepository.findById.mockResolvedValue(
        buildInvoice({ status: InvoiceStatus.ISSUED }),
      );

      await expect(
        service.updateStatusById(invoiceId, InvoiceStatus.DRAFT),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'No se puede establecer como borrador una factura que ya ha sido emitida',
      });
    });

    it('copia datos persistentes al pasar de borrador a emitida', async () => {
      mockIssuedPersistentDataSources();
      const draftInvoice = buildInvoice({ status: InvoiceStatus.DRAFT });
      invoiceRepository.findById
        .mockResolvedValueOnce(draftInvoice)
        .mockResolvedValueOnce({ ...draftInvoice, status: InvoiceStatus.ISSUED, seriesNumber: 5 });
      invoiceRepository.updateById.mockResolvedValue({});

      const result = await service.updateStatusById(invoiceId, InvoiceStatus.ISSUED);

      expect(invoiceRepository.updateById).toHaveBeenCalledWith(
        invoiceId,
        expect.objectContaining({
          status: InvoiceStatus.ISSUED,
          seriesNumber: 5,
          clientName: 'Cliente S.L.',
          issuerName: 'Emisor S.L.',
        }),
      );
      expect(invoiceRepository.findById).toHaveBeenLastCalledWith(invoiceId, [
        'client',
        'series',
        'recurrentEarning',
      ]);
      expect(result.status).toBe(InvoiceStatus.ISSUED);
    });

    it('solo actualiza el estado al pasar de emitida a pagada', async () => {
      const issuedInvoice = buildInvoice({ status: InvoiceStatus.ISSUED, seriesNumber: 3 });
      invoiceRepository.findById
        .mockResolvedValueOnce(issuedInvoice)
        .mockResolvedValueOnce({ ...issuedInvoice, status: InvoiceStatus.PAID });
      invoiceRepository.updateById.mockResolvedValue({});

      await expect(
        service.updateStatusById(invoiceId, InvoiceStatus.PAID),
      ).resolves.toEqual(expect.objectContaining({ status: InvoiceStatus.PAID }));
      expect(clientRepository.findById).not.toHaveBeenCalled();
      expect(invoiceRepository.updateById).toHaveBeenCalledWith(invoiceId, {
        ...issuedInvoice,
        status: InvoiceStatus.PAID,
      });
    });
  });

  describe('deleteById', () => {
    it('lanza 404 si la factura no existe', async () => {
      invoiceRepository.findById.mockResolvedValue(null);

      await expect(service.deleteById(invoiceId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: `Factura con ID ${invoiceId} no encontrada`,
      });
      expect(invoiceRepository.deleteById).not.toHaveBeenCalled();
    });

    it('solo permite borrar facturas en borrador', async () => {
      invoiceRepository.findById.mockResolvedValue(
        buildInvoice({ status: InvoiceStatus.PAID }),
      );

      await expect(service.deleteById(invoiceId)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: `No se puede eliminar la factura ${invoiceId} porque ya ha sido emitida`,
      });
      expect(invoiceRepository.deleteById).not.toHaveBeenCalled();
    });

    it('elimina una factura en borrador', async () => {
      invoiceRepository.findById.mockResolvedValue(buildInvoice({ status: InvoiceStatus.DRAFT }));
      invoiceRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.deleteById(invoiceId)).resolves.toEqual({ affected: 1, raw: [] });
    });

    it('relanza el error del repositorio', async () => {
      const repositoryError = new Error('fallo al borrar');
      invoiceRepository.findById.mockResolvedValue(buildInvoice({ status: InvoiceStatus.DRAFT }));
      invoiceRepository.deleteById.mockRejectedValue(repositoryError);

      await expect(service.deleteById(invoiceId)).rejects.toBe(repositoryError);
    });
  });

  describe('validateRecurrentEarningLink', () => {
    it('deja el vínculo a nulo cuando no se informa ingreso recurrente', async () => {
      const invoice = buildInvoice({ recurrentEarningId: undefined });

      await service.validateRecurrentEarningLink(invoice);

      expect(invoice.recurrentEarningId).toBeNull();
      expect(recurrentEarningRepository.findById).not.toHaveBeenCalled();
    });

    it('resuelve el identificador desde la relación anidada', async () => {
      recurrentEarningRepository.findById.mockResolvedValue({
        id: 'recurrent-uuid',
        clientId,
      });
      const invoice = buildInvoice({
        recurrentEarningId: undefined,
        recurrentEarning: { id: 'recurrent-uuid' } as Invoice['recurrentEarning'],
      });

      await service.validateRecurrentEarningLink(invoice);

      expect(invoice.recurrentEarningId).toBe('recurrent-uuid');
      expect(recurrentEarningRepository.findById).toHaveBeenCalledWith('recurrent-uuid');
    });

    it('lanza 404 si el ingreso recurrente no existe', async () => {
      recurrentEarningRepository.findById.mockResolvedValue(null);

      await expect(
        service.validateRecurrentEarningLink(
          buildInvoice({ recurrentEarningId: 'recurrent-missing' }),
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Ingreso recurrente no encontrado',
      });
    });

    it('rechaza un ingreso recurrente de otro cliente', async () => {
      recurrentEarningRepository.findById.mockResolvedValue({
        id: 'recurrent-uuid',
        clientId: 'otro-cliente',
      });

      await expect(
        service.validateRecurrentEarningLink(
          buildInvoice({
            clientId,
            recurrentEarningId: 'recurrent-uuid',
          }),
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El ingreso recurrente no pertenece al cliente de la factura',
      });
    });

    it('acepta el vínculo cuando no hay cliente en la factura', async () => {
      recurrentEarningRepository.findById.mockResolvedValue({
        id: 'recurrent-uuid',
        clientId: 'otro-cliente',
      });
      const invoice = buildInvoice({
        clientId: undefined,
        client: undefined,
        recurrentEarningId: 'recurrent-uuid',
      });

      await expect(service.validateRecurrentEarningLink(invoice)).resolves.toBeUndefined();
      expect(invoice.recurrentEarningId).toBe('recurrent-uuid');
    });

    it('acepta el vínculo cuando el ingreso pertenece al mismo cliente', async () => {
      recurrentEarningRepository.findById.mockResolvedValue({
        id: 'recurrent-uuid',
        clientId,
      });
      const invoice = buildInvoice({ recurrentEarningId: 'recurrent-uuid' });

      await expect(service.validateRecurrentEarningLink(invoice)).resolves.toBeUndefined();
      expect(invoice.recurrentEarningId).toBe('recurrent-uuid');
    });
  });

  describe('setInvoiceSeriesNumber', () => {
    it('asigna el 1 cuando la serie aún no tiene facturas numeradas', async () => {
      invoiceRepository.findAll.mockResolvedValue({
        items: [{ id: 'draft-invoice', seriesNumber: null }],
        total: 1,
        currentPage: 1,
        totalPages: 1,
      });

      await expect(
        service.setInvoiceSeriesNumber(buildInvoice()),
      ).resolves.toBe(1);
      expect(invoiceRepository.findAll).toHaveBeenCalledWith(1, null, 'seriesNumber', 'ASC', {
        seriesId,
      });
    });

    it('incrementa a partir del número de serie más alto', async () => {
      invoiceRepository.findAll.mockResolvedValue({
        items: [
          { id: 'invoice-a', seriesNumber: 3 },
          { id: 'invoice-b', seriesNumber: 7 },
          { id: 'invoice-c', seriesNumber: 2 },
        ],
        total: 3,
        currentPage: 1,
        totalPages: 1,
      });

      await expect(service.setInvoiceSeriesNumber(buildInvoice())).resolves.toBe(8);
    });
  });

  describe('setInvoicePersistentData', () => {
    it('exige cliente y serie', async () => {
      await expect(
        service.setInvoicePersistentData(buildInvoice({ clientId: undefined, client: undefined })),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'La factura debe tener un cliente',
      });
      await expect(
        service.setInvoicePersistentData(buildInvoice({ seriesId: undefined, series: undefined })),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'La factura debe tener una serie',
      });
    });

    it('resuelve el cliente y la serie desde las relaciones anidadas', async () => {
      const invoice = buildInvoice({
        status: InvoiceStatus.DRAFT,
        clientId: undefined,
        seriesId: undefined,
        client: { id: clientId } as Invoice['client'],
        series: { id: seriesId } as Invoice['series'],
      });

      const result = await service.setInvoicePersistentData(invoice);

      expect(result.seriesId).toBe(seriesId);
      expect(result.seriesNumber).toBeNull();
    });

    it('deja el número de serie nulo en borrador', async () => {
      const invoice = buildInvoice({
        status: InvoiceStatus.DRAFT,
        seriesNumber: 9,
      });

      const result = await service.setInvoicePersistentData(invoice);

      expect(result.seriesNumber).toBeNull();
      expect(invoiceRepository.findAll).not.toHaveBeenCalled();
      expect(clientRepository.findById).not.toHaveBeenCalled();
    });

    it('lanza 404 si el cliente no existe al emitir', async () => {
      invoiceRepository.findAll.mockResolvedValue({ items: [], total: 0, currentPage: 1, totalPages: 0 });
      clientRepository.findById.mockResolvedValue(null);

      await expect(
        service.setInvoicePersistentData(buildInvoice({ status: InvoiceStatus.ISSUED })),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: `Cliente no encontrado con ID: ${clientId}`,
      });
    });

    it('lanza 404 si la serie no existe al emitir', async () => {
      invoiceRepository.findAll.mockResolvedValue({ items: [], total: 0, currentPage: 1, totalPages: 0 });
      clientRepository.findById.mockResolvedValue(buildClient());
      invoiceSeriesRepository.findById.mockResolvedValue(null);

      await expect(
        service.setInvoicePersistentData(buildInvoice({ status: InvoiceStatus.ISSUED })),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: `Serie de factura no encontrada con ID: ${seriesId}`,
      });
    });

    it('omite dirección y cuenta si el cliente o el emisor no las tienen', async () => {
      invoiceRepository.findAll.mockResolvedValue({ items: [], total: 0, currentPage: 1, totalPages: 0 });
      clientRepository.findById.mockResolvedValue(buildClient({ address: undefined }));
      invoiceSeriesRepository.findById.mockResolvedValue(
        buildInvoiceSeries({
          enterprise: {
            name: 'Emisor S.L.',
            nif: 'A11111111',
          },
        } as Partial<InvoiceSeries>),
      );

      const invoice = buildInvoice({
        status: InvoiceStatus.ISSUED,
        clientAddress: undefined,
        issuerAddress: undefined,
        issuerBankAccount: undefined,
      });

      const result = await service.setInvoicePersistentData(invoice);

      expect(result.clientName).toBe('Cliente S.L.');
      expect(result.clientAddress).toBeUndefined();
      expect(result.issuerAddress).toBeUndefined();
      expect(result.issuerBankAccount).toBeUndefined();
    });

    it('numera y copia datos persistentes al emitir', async () => {
      mockIssuedPersistentDataSources();

      const invoice = buildInvoice({ status: InvoiceStatus.ISSUED });
      const result = await service.setInvoicePersistentData(invoice);

      expect(result.seriesNumber).toBe(5);
      expect(result.clientName).toBe('Cliente S.L.');
      expect(result.clientNif).toBe('B12345678');
      expect(result.clientAddress).toBe('Calle 1');
      expect(result.issuerName).toBe('Emisor S.L.');
      expect(result.issuerNif).toBe('A11111111');
      expect(result.issuerAddress).toBe('Calle 2');
      expect(result.issuerBankAccount).toBe('ES1200000000000000000000');
      expect(invoiceSeriesRepository.findById).toHaveBeenCalledWith(seriesId, ['enterprise']);
    });
  });
});
