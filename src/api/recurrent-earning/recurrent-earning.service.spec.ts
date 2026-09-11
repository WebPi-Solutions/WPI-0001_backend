import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClientRepository } from 'src/entities/client/client-repository.service';
import { InvoiceSeriesRepository } from 'src/entities/invoice-series/invoice-series-repository.service';
import { RecurrentEarningRepository } from 'src/entities/recurrent-earning/recurrent-earning-repository.service';
import { RecurrentEarning, RecurrentEarningType } from 'src/entities/recurrent-earning/recurrent-earning.entity';
import { RecurrentEarningService } from './recurrent-earning.service';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';

describe('RecurrentEarningService', () => {
  let service: RecurrentEarningService;
  let recurrentEarningRepository: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };
  let clientRepository: { findById: jest.Mock };
  let invoiceSeriesRepository: { findById: jest.Mock };

  const recurrentEarningId = 'recurrent-uuid';
  const enterpriseId = 'enterprise-uuid';
  const clientId = 'client-uuid';
  const seriesId = 'series-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  /**
   * Construye un ingreso recurrente de prueba.
   * @param overrides - Campos a sobrescribir
   * @returns Entidad RecurrentEarning simulada
   */
  const buildRecurrentEarning = (overrides: Partial<RecurrentEarning> = {}): RecurrentEarning =>
    ({
      id: recurrentEarningId,
      name: 'Cuota mensual',
      enterpriseId,
      clientId,
      invoiceSerieId: seriesId,
      type: RecurrentEarningType.MONTHLY,
      concepts: [{ name: 'Cuota', base_price: 100 }],
      invoices: [],
      ...overrides,
    }) as RecurrentEarning;

  /**
   * Prepara cliente y serie pertenecientes a la misma empresa.
   * @returns void
   */
  const mockRelatedEntitiesForSameEnterprise = (): void => {
    clientRepository.findById.mockResolvedValue({ id: clientId, enterpriseId });
    invoiceSeriesRepository.findById.mockResolvedValue({ id: seriesId, enterpriseId });
  };

  beforeEach(async () => {
    recurrentEarningRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };
    clientRepository = { findById: jest.fn() };
    invoiceSeriesRepository = { findById: jest.fn() };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        RecurrentEarningService,
        { provide: RecurrentEarningRepository, useValue: recurrentEarningRepository },
        { provide: ClientRepository, useValue: clientRepository },
        { provide: InvoiceSeriesRepository, useValue: invoiceSeriesRepository },
        {
          provide: EnterpriseAccessService,
          useValue: { assertCurrentEntityAccessible: jest.fn() },
        },
      ],
    }).compile();

    service = testingModule.get(RecurrentEarningService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('asigna tipo mensual y conceptos vacíos cuando no se informan', async () => {
      mockRelatedEntitiesForSameEnterprise();
      recurrentEarningRepository.create.mockImplementation((payload: RecurrentEarning) =>
        Promise.resolve({ ...payload, id: recurrentEarningId }),
      );

      await service.create({
        name: 'Cuota',
        enterpriseId,
        clientId,
        invoiceSerieId: seriesId,
      } as RecurrentEarning);

      expect(recurrentEarningRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: RecurrentEarningType.MONTHLY,
          concepts: [],
        }),
      );
    });

    it('normaliza clientId e invoiceSerieId desde las relaciones anidadas', async () => {
      mockRelatedEntitiesForSameEnterprise();
      recurrentEarningRepository.create.mockImplementation((payload: RecurrentEarning) =>
        Promise.resolve({ ...payload, id: recurrentEarningId }),
      );

      await service.create({
        name: 'Cuota',
        enterpriseId,
        type: RecurrentEarningType.YEARLY,
        concepts: [{ name: 'Anual' }],
        client: { id: clientId },
        invoiceSeries: { id: seriesId },
      } as RecurrentEarning);

      expect(recurrentEarningRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId,
          invoiceSerieId: seriesId,
          type: RecurrentEarningType.YEARLY,
          concepts: [{ name: 'Anual' }],
        }),
      );
    });

    it('rechaza un tipo distinto de monthly o yearly', async () => {
      await expect(
        service.create({
          name: 'Cuota',
          enterpriseId,
          clientId,
          invoiceSerieId: seriesId,
          type: 'weekly' as RecurrentEarningType,
        } as RecurrentEarning),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El tipo del ingreso recurrente debe ser monthly o yearly',
      });
      expect(recurrentEarningRepository.create).not.toHaveBeenCalled();
    });

    it('exige nombre, empresa, cliente y serie', async () => {
      await expect(
        service.create({ enterpriseId, clientId, invoiceSerieId: seriesId } as RecurrentEarning),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El ingreso recurrente debe tener un nombre',
      });
      await expect(
        service.create({ name: 'Cuota', clientId, invoiceSerieId: seriesId } as RecurrentEarning),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El ingreso recurrente debe pertenecer a una empresa',
      });
      await expect(
        service.create({ name: 'Cuota', enterpriseId, invoiceSerieId: seriesId } as RecurrentEarning),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El ingreso recurrente debe tener un cliente',
      });
      await expect(
        service.create({ name: 'Cuota', enterpriseId, clientId } as RecurrentEarning),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El ingreso recurrente debe tener una serie de factura',
      });
    });

    it('lanza 404 si el cliente no existe', async () => {
      clientRepository.findById.mockResolvedValue(null);

      await expect(service.create(buildRecurrentEarning())).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Cliente no encontrado',
      });
    });

    it('rechaza un cliente de otra empresa', async () => {
      clientRepository.findById.mockResolvedValue({ id: clientId, enterpriseId: 'otra-empresa' });

      await expect(service.create(buildRecurrentEarning())).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El cliente no pertenece a la empresa del ingreso recurrente',
      });
    });

    it('lanza 404 si la serie no existe', async () => {
      clientRepository.findById.mockResolvedValue({ id: clientId, enterpriseId });
      invoiceSeriesRepository.findById.mockResolvedValue(null);

      await expect(service.create(buildRecurrentEarning())).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Serie de factura no encontrada',
      });
    });

    it('rechaza una serie de otra empresa', async () => {
      clientRepository.findById.mockResolvedValue({ id: clientId, enterpriseId });
      invoiceSeriesRepository.findById.mockResolvedValue({
        id: seriesId,
        enterpriseId: 'otra-empresa',
      });

      await expect(service.create(buildRecurrentEarning())).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'La serie de factura no pertenece a la empresa del ingreso recurrente',
      });
    });

    it('persiste el ingreso cuando las validaciones pasan', async () => {
      mockRelatedEntitiesForSameEnterprise();
      const created = buildRecurrentEarning();
      recurrentEarningRepository.create.mockResolvedValue(created);

      await expect(service.create(buildRecurrentEarning())).resolves.toEqual(created);
    });

    it('relanza el error del repositorio', async () => {
      const repositoryError = new Error('fallo al persistir');
      mockRelatedEntitiesForSameEnterprise();
      recurrentEarningRepository.create.mockRejectedValue(repositoryError);

      await expect(service.create(buildRecurrentEarning())).rejects.toBe(repositoryError);
    });
  });

  describe('findAll', () => {
    it('delega la consulta paginada al repositorio', async () => {
      recurrentEarningRepository.findAll.mockResolvedValue(emptyPaginatedResponse);
      const filter = { enterpriseId };

      await expect(
        service.findAll(1, 10, 'name', 'ASC', filter),
      ).resolves.toEqual(emptyPaginatedResponse);
      expect(recurrentEarningRepository.findAll).toHaveBeenCalledWith(
        1,
        10,
        'name',
        'ASC',
        filter,
        undefined,
      );
    });

    it('incluye relaciones cuando se informan', async () => {
      const paginatedWithItems = {
        items: [buildRecurrentEarning()],
        total: 1,
        currentPage: 1,
        totalPages: 1,
      };
      recurrentEarningRepository.findAll.mockResolvedValue(paginatedWithItems);

      await expect(
        service.findAll(2, 20, 'name', 'DESC', {}, ['client', 'invoices']),
      ).resolves.toEqual(paginatedWithItems);
    });
  });

  describe('findById', () => {
    it('devuelve el ingreso cuando existe', async () => {
      const existing = buildRecurrentEarning();
      recurrentEarningRepository.findById.mockResolvedValue(existing);

      await expect(service.findById(recurrentEarningId, ['client'])).resolves.toEqual(existing);
      expect(recurrentEarningRepository.findById).toHaveBeenCalledWith(recurrentEarningId, [
        'client',
      ]);
    });

    it('consulta sin relaciones cuando no se informan', async () => {
      const existing = buildRecurrentEarning();
      recurrentEarningRepository.findById.mockResolvedValue(existing);

      await expect(service.findById(recurrentEarningId)).resolves.toEqual(existing);
    });

    it('lanza 404 si el ingreso no existe', async () => {
      recurrentEarningRepository.findById.mockResolvedValue(null);

      await expect(service.findById(recurrentEarningId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Ingreso recurrente no encontrado',
      });
    });
  });

  describe('updateById', () => {
    it('lanza 404 si el ingreso no existe', async () => {
      recurrentEarningRepository.findById.mockResolvedValue(null);

      await expect(
        service.updateById(recurrentEarningId, buildRecurrentEarning()),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Ingreso recurrente no encontrado',
      });
      expect(recurrentEarningRepository.updateById).not.toHaveBeenCalled();
    });

    it('valida el tipo solo cuando se informa en el payload', async () => {
      recurrentEarningRepository.findById.mockResolvedValue(buildRecurrentEarning());

      await expect(
        service.updateById(recurrentEarningId, {
          type: 'weekly' as RecurrentEarningType,
        } as RecurrentEarning),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El tipo del ingreso recurrente debe ser monthly o yearly',
      });
    });

    it('conserva el enterpriseId original y actualiza el resto', async () => {
      mockRelatedEntitiesForSameEnterprise();
      const existing = buildRecurrentEarning({ enterpriseId });
      const updated = buildRecurrentEarning({ name: 'Cuota actualizada' });
      recurrentEarningRepository.findById.mockResolvedValue(existing);
      recurrentEarningRepository.updateById.mockResolvedValue(updated);

      await expect(
        service.updateById(recurrentEarningId, {
          name: 'Cuota actualizada',
          enterpriseId: 'empresa-inyectada',
        } as RecurrentEarning),
      ).resolves.toEqual(updated);
      expect(recurrentEarningRepository.updateById).toHaveBeenCalledWith(
        recurrentEarningId,
        expect.objectContaining({
          name: 'Cuota actualizada',
          enterpriseId,
        }),
      );
    });

    it('actualiza sin revalidar el tipo cuando no se informa', async () => {
      mockRelatedEntitiesForSameEnterprise();
      const existing = buildRecurrentEarning();
      const updated = buildRecurrentEarning({ name: 'Nuevo nombre' });
      recurrentEarningRepository.findById.mockResolvedValue(existing);
      recurrentEarningRepository.updateById.mockResolvedValue(updated);

      await expect(
        service.updateById(recurrentEarningId, { name: 'Nuevo nombre' } as RecurrentEarning),
      ).resolves.toEqual(updated);
    });

    it('relanza el error del repositorio', async () => {
      const repositoryError = new Error('fallo al actualizar');
      mockRelatedEntitiesForSameEnterprise();
      recurrentEarningRepository.findById.mockResolvedValue(buildRecurrentEarning());
      recurrentEarningRepository.updateById.mockRejectedValue(repositoryError);

      await expect(
        service.updateById(recurrentEarningId, { name: 'Nuevo' } as RecurrentEarning),
      ).rejects.toBe(repositoryError);
    });
  });

  describe('deleteById', () => {
    it('lanza 404 si el ingreso no existe', async () => {
      recurrentEarningRepository.findById.mockResolvedValue(null);

      await expect(service.deleteById(recurrentEarningId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Ingreso recurrente no encontrado',
      });
      expect(recurrentEarningRepository.deleteById).not.toHaveBeenCalled();
    });

    it('bloquea el borrado cuando hay facturas asociadas', async () => {
      recurrentEarningRepository.findById.mockResolvedValue(
        buildRecurrentEarning({
          invoices: [{ id: 'invoice-uuid' }] as RecurrentEarning['invoices'],
        }),
      );

      await expect(service.deleteById(recurrentEarningId)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'No se puede eliminar el ingreso recurrente porque tiene facturas asociadas',
      });
      expect(recurrentEarningRepository.deleteById).not.toHaveBeenCalled();
    });

    it('elimina el ingreso cuando no tiene facturas', async () => {
      recurrentEarningRepository.findById.mockResolvedValue(
        buildRecurrentEarning({ invoices: [] }),
      );
      recurrentEarningRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.deleteById(recurrentEarningId)).resolves.toEqual({
        affected: 1,
        raw: [],
      });
      expect(recurrentEarningRepository.findById).toHaveBeenCalledWith(recurrentEarningId, [
        'invoices',
      ]);
    });

    it('permite el borrado si invoices no está cargado', async () => {
      recurrentEarningRepository.findById.mockResolvedValue(
        buildRecurrentEarning({ invoices: undefined }),
      );
      recurrentEarningRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.deleteById(recurrentEarningId)).resolves.toEqual({
        affected: 1,
        raw: [],
      });
    });

    it('relanza el error del repositorio', async () => {
      const repositoryError = new Error('fallo al borrar');
      recurrentEarningRepository.findById.mockResolvedValue(buildRecurrentEarning());
      recurrentEarningRepository.deleteById.mockRejectedValue(repositoryError);

      await expect(service.deleteById(recurrentEarningId)).rejects.toBe(repositoryError);
    });
  });
});
