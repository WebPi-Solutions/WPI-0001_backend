import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClientRepository } from 'src/entities/client/client-repository.service';
import { Client } from 'src/entities/client/client.entity';
import { ClientService } from './client.service';

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
      enterpriseId: 'enterprise-uuid',
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
  });
});
