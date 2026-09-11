import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClientRepository } from 'src/entities/client/client-repository.service';
import { Client } from 'src/entities/client/client.entity';
import { ClientService } from './client.service';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';

describe('ClientService', () => {
  let service: ClientService;
  let clientRepository: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
    findByNifAndEnterpriseId: jest.Mock;
  };

  const clientId = 'client-uuid';
  const enterpriseId = 'enterprise-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  /**
   * Construye un cliente de prueba.
   * @param overrides - Campos a sobrescribir
   * @returns Entidad Client simulada
   */
  const buildClient = (overrides: Partial<Client> = {}): Client =>
    ({
      id: clientId,
      name: 'Cliente Demo',
      nif: 'B12345678',
      enterpriseId,
      recurrentEarnings: [],
      ...overrides,
    }) as Client;

  beforeEach(async () => {
    clientRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
      findByNifAndEnterpriseId: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        ClientService,
        { provide: ClientRepository, useValue: clientRepository },
        {
          provide: EnterpriseAccessService,
          useValue: {
            assertCurrentEntityAccessible: jest.fn(),
          },
        },
      ],
    }).compile();

    service = testingModule.get(ClientService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('rechaza un NIF duplicado en la misma empresa', async () => {
      clientRepository.findByNifAndEnterpriseId.mockResolvedValue(buildClient());

      await expect(service.create(buildClient())).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        message: 'Ya existe un cliente con el NIF',
      });
      expect(clientRepository.create).not.toHaveBeenCalled();
    });

    it('persiste el cliente cuando el NIF es único en la empresa', async () => {
      const createdClient = buildClient();
      clientRepository.findByNifAndEnterpriseId.mockResolvedValue(null);
      clientRepository.create.mockResolvedValue(createdClient);

      await expect(service.create(buildClient())).resolves.toEqual(createdClient);
      expect(clientRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ nif: 'B12345678', enterpriseId }),
      );
    });

    it('relanza el error del repositorio', async () => {
      const repositoryError = new Error('fallo al persistir');
      clientRepository.findByNifAndEnterpriseId.mockResolvedValue(null);
      clientRepository.create.mockRejectedValue(repositoryError);

      await expect(service.create(buildClient())).rejects.toBe(repositoryError);
    });
  });

  describe('findAll', () => {
    it('delega la consulta paginada al repositorio', async () => {
      clientRepository.findAll.mockResolvedValue(emptyPaginatedResponse);
      const filter = { enterpriseId };

      await expect(service.findAll(1, 10, 'name', 'ASC', filter)).resolves.toEqual(
        emptyPaginatedResponse,
      );
      expect(clientRepository.findAll).toHaveBeenCalledWith(
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
        items: [buildClient()],
        total: 1,
        currentPage: 1,
        totalPages: 1,
      };
      clientRepository.findAll.mockResolvedValue(paginatedWithItems);

      await expect(
        service.findAll(2, 20, 'name', 'DESC', {}, ['enterprise', 'invoices']),
      ).resolves.toEqual(paginatedWithItems);
      expect(clientRepository.findAll).toHaveBeenCalledWith(
        2,
        20,
        'name',
        'DESC',
        {},
        ['enterprise', 'invoices'],
      );
    });
  });

  describe('findById', () => {
    it('devuelve el cliente cuando existe', async () => {
      const existingClient = buildClient();
      clientRepository.findById.mockResolvedValue(existingClient);

      await expect(service.findById(clientId, ['enterprise'])).resolves.toEqual(existingClient);
      expect(clientRepository.findById).toHaveBeenCalledWith(clientId, ['enterprise']);
    });

    it('consulta sin relaciones cuando no se informan', async () => {
      const existingClient = buildClient();
      clientRepository.findById.mockResolvedValue(existingClient);

      await expect(service.findById(clientId)).resolves.toEqual(existingClient);
      expect(clientRepository.findById).toHaveBeenCalledWith(clientId, undefined);
    });

    it('lanza 404 si el cliente no existe', async () => {
      clientRepository.findById.mockResolvedValue(null);

      await expect(service.findById(clientId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Cliente no encontrado',
      });
    });
  });

  describe('updateById', () => {
    it('lanza 404 si el cliente no existe', async () => {
      clientRepository.findById.mockResolvedValue(null);

      await expect(service.updateById(clientId, buildClient())).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Cliente no encontrado',
      });
      expect(clientRepository.updateById).not.toHaveBeenCalled();
    });

    it('actualiza el cliente cuando existe', async () => {
      const updatedClient = buildClient({ name: 'Cliente Actualizado' });
      clientRepository.findById.mockResolvedValue(buildClient());
      clientRepository.updateById.mockResolvedValue(updatedClient);

      await expect(service.updateById(clientId, updatedClient)).resolves.toEqual(updatedClient);
      expect(clientRepository.updateById).toHaveBeenCalledWith(clientId, updatedClient);
    });

    it('conserva el enterpriseId original aunque el cuerpo intente cambiarlo', async () => {
      const existingClient = buildClient();
      const relocatedClient = buildClient({
        name: 'Relocado',
        enterpriseId: 'otra-empresa',
      });
      clientRepository.findById.mockResolvedValue(existingClient);
      clientRepository.updateById.mockResolvedValue(existingClient);

      await service.updateById(clientId, relocatedClient);

      expect(clientRepository.updateById).toHaveBeenCalledWith(
        clientId,
        expect.objectContaining({
          name: 'Relocado',
          enterpriseId,
        }),
      );
    });

    it('relanza el error del repositorio', async () => {
      const repositoryError = new Error('fallo al actualizar');
      clientRepository.findById.mockResolvedValue(buildClient());
      clientRepository.updateById.mockRejectedValue(repositoryError);

      await expect(service.updateById(clientId, buildClient())).rejects.toBe(repositoryError);
    });
  });

  describe('deleteById', () => {
    it('lanza 404 si el cliente no existe', async () => {
      clientRepository.findById.mockResolvedValue(null);

      await expect(service.deleteById(clientId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Cliente no encontrado',
      });
    });

    it('bloquea el borrado cuando hay ingresos recurrentes asociados', async () => {
      clientRepository.findById.mockResolvedValue(
        buildClient({
          recurrentEarnings: [{ id: 'recurrent-uuid' }] as Client['recurrentEarnings'],
        }),
      );

      await expect(service.deleteById(clientId)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'No se puede eliminar el cliente porque tiene ingresos recurrentes asociados',
      });
      expect(clientRepository.deleteById).not.toHaveBeenCalled();
    });

    it('elimina el cliente cuando no tiene ingresos recurrentes', async () => {
      clientRepository.findById.mockResolvedValue(buildClient({ recurrentEarnings: [] }));
      clientRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.deleteById(clientId)).resolves.toEqual({ affected: 1, raw: [] });
      expect(clientRepository.findById).toHaveBeenCalledWith(clientId, ['recurrentEarnings']);
      expect(clientRepository.deleteById).toHaveBeenCalledWith(clientId);
    });

    it('permite el borrado si recurrentEarnings no está cargado', async () => {
      clientRepository.findById.mockResolvedValue(buildClient({ recurrentEarnings: undefined }));
      clientRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.deleteById(clientId)).resolves.toEqual({ affected: 1, raw: [] });
    });

    it('relanza el error del repositorio', async () => {
      const repositoryError = new Error('fallo al borrar');
      clientRepository.findById.mockResolvedValue(buildClient());
      clientRepository.deleteById.mockRejectedValue(repositoryError);

      await expect(service.deleteById(clientId)).rejects.toBe(repositoryError);
    });
  });

  describe('verifyClientExistsByNif', () => {
    it('devuelve el cliente cuando el NIF existe en la empresa', async () => {
      const existingClient = buildClient();
      clientRepository.findByNifAndEnterpriseId.mockResolvedValue(existingClient);

      await expect(service.verifyClientExistsByNif('B12345678', enterpriseId)).resolves.toEqual(
        existingClient,
      );
    });

    it('devuelve null cuando el NIF no existe en la empresa', async () => {
      clientRepository.findByNifAndEnterpriseId.mockResolvedValue(null);

      await expect(service.verifyClientExistsByNif('X00000000', enterpriseId)).resolves.toBeNull();
    });
  });

  describe('verifyClientExistsById', () => {
    it('devuelve el cliente cuando el ID existe', async () => {
      const existingClient = buildClient();
      clientRepository.findById.mockResolvedValue(existingClient);

      await expect(service.verifyClientExistsById(clientId)).resolves.toEqual(existingClient);
    });

    it('devuelve null cuando el ID no existe', async () => {
      clientRepository.findById.mockResolvedValue(null);

      await expect(service.verifyClientExistsById(clientId)).resolves.toBeNull();
    });
  });
});
