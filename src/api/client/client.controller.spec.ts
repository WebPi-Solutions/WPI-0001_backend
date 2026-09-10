import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Client } from 'src/entities/client/client.entity';
import { ClientController } from './client.controller';
import { ClientService } from './client.service';

describe('ClientController', () => {
  let controller: ClientController;
  let clientService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const clientId = 'client-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  beforeEach(async () => {
    clientService = {
      create: jest.fn().mockResolvedValue({ id: clientId }),
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [ClientController],
      providers: [{ provide: ClientService, useValue: clientService }],
    }).compile();

    controller = testingModule.get(ClientController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.create('', { name: 'Cliente' } as Client)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(clientService.create).not.toHaveBeenCalled();
    });

    it('asigna el enterpriseId de la query al cliente', async () => {
      const client = { name: 'Cliente Demo', enterpriseId: 'empresa-atacante' } as Client;

      await expect(controller.create(enterpriseId, client)).resolves.toEqual({ id: clientId });
      expect(client.enterpriseId).toBe(enterpriseId);
      expect(clientService.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Cliente Demo', enterpriseId }),
      );
    });
  });

  describe('findAll', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findAll('')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(clientService.findAll).not.toHaveBeenCalled();
    });

    it('parsea el filtro JSON y fuerza el enterpriseId de la query', async () => {
      await controller.findAll(
        enterpriseId,
        2,
        20,
        'name',
        'DESC',
        JSON.stringify({ enterpriseId: 'empresa-atacante', type: 'company' }),
        'enterprise,invoices',
      );

      expect(clientService.findAll).toHaveBeenCalledWith(
        2,
        20,
        'name',
        'DESC',
        { type: 'company', enterpriseId },
        ['enterprise', 'invoices'],
      );
    });

    it('conserva el enterpriseId si el filtro JSON es inválido', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await controller.findAll(enterpriseId, 1, 10, 'name', 'ASC', '{no-es-json');

      expect(console.error).toHaveBeenCalled();
      expect(clientService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'name',
        'ASC',
        { enterpriseId },
        [],
      );
    });

    it('usa valores por defecto al omitir query opcionales', async () => {
      await controller.findAll(enterpriseId);

      expect(clientService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'name',
        'ASC',
        { enterpriseId },
        [],
      );
    });
  });

  describe('findById', () => {
    it('delega al servicio parseando las relaciones', async () => {
      clientService.findById.mockResolvedValue({ id: clientId });

      await expect(controller.findById(clientId, 'enterprise,quotes')).resolves.toEqual({
        id: clientId,
      });
      expect(clientService.findById).toHaveBeenCalledWith(clientId, ['enterprise', 'quotes']);
    });

    it('busca sin relaciones cuando no se informan', async () => {
      clientService.findById.mockResolvedValue({ id: clientId });

      await controller.findById(clientId);

      expect(clientService.findById).toHaveBeenCalledWith(clientId, []);
    });
  });

  describe('updateById', () => {
    it('delega la actualización al servicio', async () => {
      const payload = { name: 'Cliente Actualizado' } as Client;
      clientService.updateById.mockResolvedValue({ id: clientId, ...payload });

      await expect(controller.updateById(clientId, payload)).resolves.toEqual({
        id: clientId,
        name: 'Cliente Actualizado',
      });
      expect(clientService.updateById).toHaveBeenCalledWith(clientId, payload);
    });
  });

  describe('delete', () => {
    it('delega la eliminación al servicio', async () => {
      clientService.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(controller.delete(clientId)).resolves.toEqual({ affected: 1, raw: [] });
      expect(clientService.deleteById).toHaveBeenCalledWith(clientId);
    });
  });
});
