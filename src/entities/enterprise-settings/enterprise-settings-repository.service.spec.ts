jest.mock('src/common/helpers/query-builder/query-builder.service', () => ({
  QueryBuilderService: { getPaginatedResults: jest.fn() },
}));

import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryBuilderService } from 'src/common/helpers/query-builder/query-builder.service';
import { EnterpriseSettings } from './enterprise-settings.entity';
import { EnterpriseSettingsRepository } from './enterprise-settings-repository.service';
import { DEFAULT_ENTERPRISE_SETTINGS } from './default-settings';

describe('EnterpriseSettingsRepository', () => {
  let service: EnterpriseSettingsRepository;
  let repository: { save: jest.Mock; findOne: jest.Mock };

  beforeEach(async () => {
    repository = { save: jest.fn(), findOne: jest.fn() };
    (QueryBuilderService.getPaginatedResults as jest.Mock).mockResolvedValue({
      items: [],
      total: 0,
      currentPage: 1,
      totalPages: 0,
    });
    const module = await Test.createTestingModule({
      providers: [
        EnterpriseSettingsRepository,
        {
          provide: getRepositoryToken(EnterpriseSettings),
          useValue: repository,
        },
      ],
    }).compile();
    service = module.get(EnterpriseSettingsRepository);
  });

  it('está definido', () => expect(service).toBeDefined());

  it('registra la configuración por defecto de una empresa', async () => {
    repository.save.mockResolvedValue([]);
    await service.seedDefaultsForEnterprise('ent-1');
    expect(repository.save).toHaveBeenCalledWith(
      DEFAULT_ENTERPRISE_SETTINGS.map((setting) => ({
        enterpriseId: 'ent-1',
        ...setting,
      })),
    );
  });

  it('lista y busca configuraciones', async () => {
    const entity = { id: 'setting-1' } as EnterpriseSettings;
    await service.findAll(2, 5, 'key', 'DESC', { enterpriseId: 'ent-1' }, [
      'enterprise',
    ]);
    expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
      repository,
      'enterpriseSettings',
      expect.objectContaining({
        page: 2,
        pageSize: 5,
        sort: 'key',
        order: 'DESC',
      }),
    );
    repository.findOne.mockResolvedValue(entity);
    await expect(service.findById('setting-1')).resolves.toBe(entity);
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 'setting-1' },
      relations: undefined,
    });
    await expect(service.findByKey('theme', 'ent-1')).resolves.toBe(entity);
    expect(repository.findOne).toHaveBeenLastCalledWith({
      where: { key: 'theme', enterpriseId: 'ent-1' },
      relations: undefined,
    });
  });

  it('usa valores por defecto y relaciones en findAll/findById', async () => {
    await service.findAll();
    expect(QueryBuilderService.getPaginatedResults).toHaveBeenLastCalledWith(
      repository,
      'enterpriseSettings',
      expect.objectContaining({
        page: 1,
        pageSize: 10,
        sort: 'key',
        order: 'ASC',
        filter: {},
        relations: [],
      }),
    );
    await service.findById('setting-1', ['enterprise']);
    expect(repository.findOne).toHaveBeenLastCalledWith({
      where: { id: 'setting-1' },
      relations: ['enterprise'],
    });
  });

  it('devuelve el valor por defecto cuando falta la key para la empresa', async () => {
    repository.findOne.mockResolvedValue(null);
    await expect(
      service.findByKey('document.footer', 'ent-1'),
    ).resolves.toMatchObject({
      enterpriseId: 'ent-1',
      key: 'document.footer',
      value: '',
      editable: true,
    });
    await expect(service.findByKey('unknown.key', 'ent-1')).resolves.toBeNull();
  });

  it('actualiza y devuelve la configuración recargada', async () => {
    const current = { id: 'setting-1', key: 'old' } as EnterpriseSettings;
    const updated = { ...current, key: 'new' } as EnterpriseSettings;
    repository.findOne
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(updated);
    repository.save.mockResolvedValue(updated);
    await expect(
      service.updateByKey('old', { value: 'new' }, 'ent-1'),
    ).resolves.toBe(updated);
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { key: 'old', enterpriseId: 'ent-1' },
    });
    expect(repository.save).toHaveBeenCalledWith({ ...current, value: 'new' });
    expect(repository.findOne).toHaveBeenLastCalledWith({
      where: { key: 'old', enterpriseId: 'ent-1' },
      relations: ['enterprise'],
    });
  });

  it('lanza 404 al actualizar una configuración inexistente', async () => {
    repository.findOne.mockResolvedValue(null);
    await expect(
      service.updateByKey('missing', {}, 'ent-1'),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
  });

  it('materializa un valor por defecto al actualizar una key aún no persistida', async () => {
    repository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'generated-setting-id',
        enterpriseId: 'ent-1',
        key: 'document.footer',
        value: 'Nuevo footer',
        editable: true,
      });
    repository.save.mockResolvedValue({
      id: 'generated-setting-id',
      enterpriseId: 'ent-1',
      key: 'document.footer',
      value: 'Nuevo footer',
      editable: true,
    });

    await expect(
      service.updateByKey(
        'document.footer',
        { value: 'Nuevo footer' },
        'ent-1',
      ),
    ).resolves.toMatchObject({ id: 'generated-setting-id' });
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        enterpriseId: 'ent-1',
        key: 'document.footer',
        value: 'Nuevo footer',
      }),
    );
  });

  it('usa el valor por defecto y devuelve la entidad creada si no puede recargarla', async () => {
    repository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    repository.save.mockResolvedValue({
      enterpriseId: 'ent-1', key: 'document.footer', value: '', editable: true,
    });

    await expect(service.updateByKey('document.footer', {}, 'ent-1')).resolves.toMatchObject({
      key: 'document.footer', value: '', editable: true,
    });
  });
});
