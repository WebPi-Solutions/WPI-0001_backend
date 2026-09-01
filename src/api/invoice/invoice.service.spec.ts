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
      recurrentEarningsId: null,
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
    recurrentEarningRepository = { findById: jest.fn() };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceService,
        { provide: InvoiceRepository, useValue: invoiceRepository },
        { provide: ClientRepository, useValue: { findById: jest.fn() } },
        { provide: InvoiceSeriesRepository, useValue: { findById: jest.fn() } },
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
      const invoice = buildInvoice({ recurrentEarningsId: undefined });

      await service.validateRecurrentEarningLink(invoice);

      expect(invoice.recurrentEarningsId).toBeNull();
      expect(recurrentEarningRepository.findById).not.toHaveBeenCalled();
    });

    it('lanza 404 si el ingreso recurrente no existe', async () => {
      recurrentEarningRepository.findById.mockResolvedValue(null);

      await expect(
        service.validateRecurrentEarningLink(
          buildInvoice({ recurrentEarningsId: 'recurrent-missing' }),
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
            recurrentEarningsId: 'recurrent-uuid',
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
      const invoice = buildInvoice({ recurrentEarningsId: 'recurrent-uuid' });

      await expect(service.validateRecurrentEarningLink(invoice)).resolves.toBeUndefined();
      expect(invoice.recurrentEarningsId).toBe('recurrent-uuid');
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
});
