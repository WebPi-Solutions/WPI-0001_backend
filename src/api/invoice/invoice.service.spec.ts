import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClientRepository } from 'src/entities/client/client-repository.service';
import { InvoiceSeriesRepository } from 'src/entities/invoice-series/invoice-series-repository.service';
import { InvoiceRepository } from 'src/entities/invoice/invoice-repository.service';
import { Invoice, InvoiceStatus } from 'src/entities/invoice/invoice.entity';
import { RecurrentEarningRepository } from 'src/entities/recurrent-earning/recurrent-earning-repository.service';
import { InvoiceService } from './invoice.service';

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

  /**
   * Construye una factura de prueba.
   * @param overrides - Campos a sobrescribir
   * @returns Entidad Invoice simulada
   */
  const buildInvoice = (overrides: Partial<Invoice> = {}): Invoice =>
    ({
      id: invoiceId,
      clientId: 'client-uuid',
      status: InvoiceStatus.DRAFT,
      recurrentEarningId: null,
      ...overrides,
    }) as Invoice;

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
      ],
    }).compile();

    service = testingModule.get(InvoiceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateRecurrentEarningLink', () => {
    it('deja el vínculo a nulo cuando no se informa ingreso recurrente', async () => {
      const invoice = buildInvoice({ recurrentEarningId: undefined });

      await service.validateRecurrentEarningLink(invoice);

      expect(invoice.recurrentEarningId).toBeNull();
      expect(recurrentEarningRepository.findById).not.toHaveBeenCalled();
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
            clientId: 'client-uuid',
            recurrentEarningId: 'recurrent-uuid',
          }),
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El ingreso recurrente no pertenece al cliente de la factura',
      });
    });

    it('acepta el vínculo cuando el ingreso pertenece al mismo cliente', async () => {
      recurrentEarningRepository.findById.mockResolvedValue({
        id: 'recurrent-uuid',
        clientId: 'client-uuid',
      });
      const invoice = buildInvoice({ recurrentEarningId: 'recurrent-uuid' });

      await expect(service.validateRecurrentEarningLink(invoice)).resolves.toBeUndefined();
      expect(invoice.recurrentEarningId).toBe('recurrent-uuid');
    });
  });

  describe('updateById', () => {
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
  });

  describe('updateStatusById', () => {
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

    it('rechaza un estado que no pertenece al enumerado', async () => {
      await expect(
        service.updateStatusById(invoiceId, 'unknown' as InvoiceStatus),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
      expect(invoiceRepository.findById).not.toHaveBeenCalled();
    });
  });

  describe('deleteById', () => {
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
        service.setInvoiceSeriesNumber(
          buildInvoice({ series: { id: 'series-uuid' } as Invoice['series'] }),
        ),
      ).resolves.toBe(1);
      expect(invoiceRepository.findAll).toHaveBeenCalledWith(1, null, 'seriesNumber', 'ASC', {
        seriesId: 'series-uuid',
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

      await expect(
        service.setInvoiceSeriesNumber(
          buildInvoice({ series: { id: 'series-uuid' } as Invoice['series'] }),
        ),
      ).resolves.toBe(8);
    });
  });

  describe('setInvoicePersistentData', () => {
    it('exige cliente y serie', async () => {
      await expect(service.setInvoicePersistentData(buildInvoice({ clientId: undefined }))).rejects.toMatchObject({
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

    it('deja el número de serie nulo en borrador', async () => {
      const invoice = buildInvoice({
        status: InvoiceStatus.DRAFT,
        seriesId: 'series-uuid',
        seriesNumber: 9,
      });

      const result = await service.setInvoicePersistentData(invoice);

      expect(result.seriesNumber).toBeNull();
      expect(invoiceRepository.findAll).not.toHaveBeenCalled();
      expect(clientRepository.findById).not.toHaveBeenCalled();
    });

    it('numera y copia datos persistentes al emitir', async () => {
      invoiceRepository.findAll.mockResolvedValue({
        items: [{ id: 'invoice-a', seriesNumber: 4 }],
        total: 1,
        currentPage: 1,
        totalPages: 1,
      });
      clientRepository.findById.mockResolvedValue({
        name: 'Cliente S.L.',
        nif: 'B12345678',
        address: 'Calle 1',
      });
      invoiceSeriesRepository.findById.mockResolvedValue({
        id: 'series-uuid',
        enterprise: {
          name: 'Emisor S.L.',
          nif: 'A11111111',
          address: 'Calle 2',
          bankAccount: 'ES1200000000000000000000',
        },
      });

      const invoice = buildInvoice({
        status: InvoiceStatus.ISSUED,
        seriesId: 'series-uuid',
        series: { id: 'series-uuid' } as Invoice['series'],
      });

      const result = await service.setInvoicePersistentData(invoice);

      expect(result.seriesNumber).toBe(5);
      expect(result.clientName).toBe('Cliente S.L.');
      expect(result.clientNif).toBe('B12345678');
      expect(result.clientAddress).toBe('Calle 1');
      expect(result.issuerName).toBe('Emisor S.L.');
      expect(result.issuerNif).toBe('A11111111');
      expect(result.issuerAddress).toBe('Calle 2');
      expect(result.issuerBankAccount).toBe('ES1200000000000000000000');
      expect(invoiceSeriesRepository.findById).toHaveBeenCalledWith('series-uuid', ['enterprise']);
    });
  });
});
