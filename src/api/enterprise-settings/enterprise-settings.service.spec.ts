import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { EnterpriseSettingsRepository } from 'src/entities/enterprise-settings/enterprise-settings-repository.service';
import { EnterpriseSettings } from 'src/entities/enterprise-settings/enterprise-settings.entity';
import { EnterpriseSettingsService } from './enterprise-settings.service';

describe('EnterpriseSettingsService', () => {
  let service: EnterpriseSettingsService;
  let repository: {
    findAll: jest.Mock;
    findById: jest.Mock;
    findByKey: jest.Mock;
    updateByKey: jest.Mock;
  };
  let access: { assertCurrentEntityAccessible: jest.Mock };
  const enterpriseId = 'ent-1';
  const settingId = 'setting-1';
  const build = (overrides: Partial<EnterpriseSettings> = {}) =>
    ({
      id: settingId,
      enterpriseId,
      editable: true,
      key: 'theme',
      value: 'dark',
      ...overrides,
    }) as EnterpriseSettings;

  beforeEach(async () => {
    repository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByKey: jest.fn(),
      updateByKey: jest.fn(),
    };
    access = { assertCurrentEntityAccessible: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        EnterpriseSettingsService,
        { provide: EnterpriseSettingsRepository, useValue: repository },
        { provide: EnterpriseAccessService, useValue: access },
      ],
    }).compile();
    service = module.get(EnterpriseSettingsService);
  });

  it('está definido', () => expect(service).toBeDefined());

  it('lista y obtiene una configuración propia', async () => {
    const entity = build();
    repository.findAll.mockResolvedValue({ items: [entity], total: 1 });
    await expect(
      service.findAll(1, 10, 'key', 'ASC', { enterpriseId }),
    ).resolves.toEqual({ items: [entity], total: 1 });
    repository.findById.mockResolvedValue(entity);
    await expect(service.findById(settingId, enterpriseId)).resolves.toBe(
      entity,
    );
    expect(access.assertCurrentEntityAccessible).toHaveBeenCalledWith(
      entity.enterpriseId,
      'Configuración de empresa no encontrada',
      { resource: 'enterpriseSettings', action: 'read' },
    );
  });

  it('obtiene una configuración por key y empresa', async () => {
    const entity = build({ key: 'invoice.footer' });
    repository.findByKey = jest.fn().mockResolvedValue(entity);
    await expect(
      service.findByKey('invoice.footer', enterpriseId, ['enterprise']),
    ).resolves.toBe(entity);
    expect(repository.findByKey).toHaveBeenCalledWith(
      'invoice.footer',
      enterpriseId,
      ['enterprise'],
    );
  });

  it('rechaza una configuración por key que pertenece a otra empresa', async () => {
    repository.findByKey.mockResolvedValue(build({ enterpriseId: 'ent-2' }));
    await expect(service.findByKey('theme', enterpriseId)).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
    });
  });

  it('devuelve 404 si la key no existe', async () => {
    repository.findByKey = jest.fn().mockResolvedValue(null);
    await expect(
      service.findByKey('missing.key', enterpriseId),
    ).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
    });
  });

  it('rechaza configuraciones inexistentes o de otra empresa', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(
      service.findById(settingId, enterpriseId),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    repository.findById.mockResolvedValue(build({ enterpriseId: 'ent-2' }));
    await expect(
      service.findById(settingId, enterpriseId),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
  });

  it('actualiza únicamente el valor por key', async () => {
    repository.findByKey.mockResolvedValue(build({ key: 'theme' }));
    repository.updateByKey.mockResolvedValue(build({ value: 'light' }));
    await service.updateByKey('theme', enterpriseId, { value: ' light ' });
    expect(repository.updateByKey).toHaveBeenCalledWith(
      'theme',
      { value: 'light' },
      enterpriseId,
    );
  });

  it('rechaza actualizar una key no editable', async () => {
    repository.findByKey.mockResolvedValue(
      build({ editable: false, key: 'system.locked' }),
    );
    await expect(
      service.updateByKey('system.locked', enterpriseId, { value: 'hack' }),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      message: 'La key "system.locked" no es editable por el usuario',
    });
    expect(repository.updateByKey).not.toHaveBeenCalled();
  });

  it('propaga errores del update', async () => {
    repository.findByKey.mockResolvedValue(build());
    repository.updateByKey.mockRejectedValue(new Error('update error'));
    await expect(
      service.updateByKey('theme', enterpriseId, { value: 'x' }),
    ).rejects.toThrow('update error');
  });
});
