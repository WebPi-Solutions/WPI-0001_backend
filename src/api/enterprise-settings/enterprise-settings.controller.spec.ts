import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EnterpriseSettingsController } from './enterprise-settings.controller';
import { EnterpriseSettingsService } from './enterprise-settings.service';

describe('EnterpriseSettingsController', () => {
  let controller: EnterpriseSettingsController;
  let service: {
    findAll: jest.Mock;
    findById: jest.Mock;
    findByKey: jest.Mock;
    updateByKey: jest.Mock;
  };
  const enterpriseId = 'ent-1';
  const settingId = 'setting-1';

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        currentPage: 1,
        totalPages: 0,
      }),
      findById: jest.fn().mockResolvedValue({ id: settingId }),
      findByKey: jest.fn().mockResolvedValue({ id: settingId, key: 'theme' }),
      updateByKey: jest.fn().mockResolvedValue({ id: settingId }),
    };
    const module = await Test.createTestingModule({
      controllers: [EnterpriseSettingsController],
      providers: [{ provide: EnterpriseSettingsService, useValue: service }],
    }).compile();
    controller = module.get(EnterpriseSettingsController);
  });

  it('está definido y exige enterpriseId', async () => {
    expect(controller).toBeDefined();
    await expect(controller.findAll('')).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
    await expect(controller.findById(settingId, '')).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
    await expect(controller.findByKey('theme', '')).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
    await expect(
      controller.updateByKey('theme', '', { value: 'x' }),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
  });

  it('delega el listado con filtros seguros', async () => {
    await controller.findAll(
      enterpriseId,
      2,
      20,
      'key',
      'DESC',
      JSON.stringify({ enterpriseId: 'other', key: 'theme' }),
      'enterprise',
    );
    expect(service.findAll).toHaveBeenCalledWith(
      2,
      20,
      'key',
      'DESC',
      { key: 'theme', enterpriseId },
      ['enterprise'],
    );
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await controller.findAll(enterpriseId, 1, 10, 'key', 'ASC', '{invalid');
    expect(service.findAll).toHaveBeenLastCalledWith(
      1,
      10,
      'key',
      'ASC',
      { enterpriseId },
      [],
    );
  });

  it('rechaza cuerpos que intentan modificar más campos que value', async () => {
    await expect(
      controller.updateByKey('theme', enterpriseId, {
        value: 'light',
        key: 'other.key',
      } as never),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      message: 'El body solo puede contener un value de tipo texto',
    });
    expect(service.updateByKey).not.toHaveBeenCalled();
  });

  it('permite actualizar una key con value vacío', async () => {
    await controller.updateByKey('document.footer', enterpriseId, { value: '' });
    expect(service.updateByKey).toHaveBeenCalledWith(
      'document.footer',
      enterpriseId,
      { value: '' },
    );
  });

  it('delega detalle y actualización', async () => {
    await controller.findByKey('invoice.footer', enterpriseId, 'enterprise');
    expect(service.findByKey).toHaveBeenCalledWith(
      'invoice.footer',
      enterpriseId,
      ['enterprise'],
    );
    await controller.findById(settingId, enterpriseId, 'enterprise');
    expect(service.findById).toHaveBeenCalledWith(settingId, enterpriseId, [
      'enterprise',
    ]);
    await controller.findById(settingId, enterpriseId);
    expect(service.findById).toHaveBeenLastCalledWith(
      settingId,
      enterpriseId,
      [],
    );
    await controller.updateByKey('theme', enterpriseId, { value: 'light' });
    expect(service.updateByKey).toHaveBeenCalledWith('theme', enterpriseId, {
      value: 'light',
    });
  });

  it('usa valores opcionales vacíos y rechaza un body ausente', async () => {
    await controller.findByKey('theme', enterpriseId);
    expect(service.findByKey).toHaveBeenLastCalledWith('theme', enterpriseId, []);
    await expect(controller.updateByKey('theme', enterpriseId, undefined as never))
      .rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
  });
});
