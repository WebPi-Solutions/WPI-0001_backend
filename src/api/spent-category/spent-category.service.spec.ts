import { HttpException, HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { SpentRepository } from 'src/entities/spent/spent-repository.service';
import { SpentCategoryRepository } from 'src/entities/spent-category/spent-category-repository.service';
import { SpentCategory } from 'src/entities/spent-category/spent-category.entity';
import { SpentCategoryService } from './spent-category.service';

describe('SpentCategoryService', () => {
  let service: SpentCategoryService;
  let category: { create: jest.Mock; findAll: jest.Mock; findById: jest.Mock; updateById: jest.Mock; deleteById: jest.Mock };
  let spent: { findAll: jest.Mock };
  let access: { assertCurrentEntityAccessible: jest.Mock };
  const build = (extra: Partial<SpentCategory> = {}) => ({ id: 'category-1', enterpriseId: 'ent-1', name: 'Material', ...extra }) as SpentCategory;

  beforeEach(async () => {
    category = { create: jest.fn(), findAll: jest.fn(), findById: jest.fn(), updateById: jest.fn(), deleteById: jest.fn() };
    spent = { findAll: jest.fn() };
    access = { assertCurrentEntityAccessible: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        SpentCategoryService,
        { provide: SpentCategoryRepository, useValue: category },
        { provide: SpentRepository, useValue: spent },
        { provide: EnterpriseAccessService, useValue: access },
      ],
    }).compile();
    service = module.get(SpentCategoryService);
  });

  it('crea, lista y obtiene categorías', async () => {
    const entity = build();
    category.create.mockResolvedValue(entity);
    category.findAll.mockResolvedValue({ items: [entity], total: 1 });
    category.findById.mockResolvedValue(entity);
    const payload = { ...entity, enterprise: { id: 'attacker' } } as SpentCategory;
    await expect(service.create(payload)).resolves.toBe(entity);
    expect(payload.enterprise).toBeUndefined();
    await expect(service.findAll(1, 10, 'name', 'ASC', { enterpriseId: 'ent-1' })).resolves.toEqual({ items: [entity], total: 1 });
    await expect(service.findById(entity.id, ['enterprise'])).resolves.toBe(entity);
    expect(access.assertCurrentEntityAccessible).toHaveBeenCalledWith('ent-1', 'Categoría de gastos no encontrada', { resource: 'spentCategories', action: 'read' });
  });

  it('relanza el error de creación y devuelve 404 al actualizar o eliminar una categoría inexistente', async () => {
    const error = new Error('create failed');
    category.create.mockRejectedValue(error);
    await expect(service.create(build())).rejects.toBe(error);
    category.findById.mockResolvedValue(null);
    await expect(service.updateById('missing', build())).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    await expect(service.deleteById('missing')).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
  });

  it('protege el acceso y actualiza congelando la empresa', async () => {
    category.findById.mockResolvedValueOnce(null);
    await expect(service.findById('missing')).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    category.findById.mockResolvedValueOnce(build());
    category.updateById.mockResolvedValue(build({ name: 'New' }));
    await expect(service.updateById('category-1', { name: 'New', enterpriseId: 'attacker', enterprise: {} } as SpentCategory)).resolves.toMatchObject({ name: 'New' });
    expect(category.updateById).toHaveBeenCalledWith('category-1', expect.objectContaining({ enterpriseId: 'ent-1' }));
    expect(category.updateById.mock.calls[0][1]).not.toHaveProperty('enterprise');
    access.assertCurrentEntityAccessible.mockImplementation(() => { throw new HttpException('forbidden', HttpStatus.FORBIDDEN); });
    category.findById.mockResolvedValue(build());
    await expect(service.updateById('category-1', build())).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
  });

  it('elimina solo categorías sin gastos', async () => {
    category.findById.mockResolvedValue(build());
    spent.findAll.mockResolvedValue({ items: [{ id: 'spent-1' }], total: 1 });
    await expect(service.deleteById('category-1')).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    spent.findAll.mockResolvedValue({ items: [], total: 0 });
    category.deleteById.mockResolvedValue({ affected: 1 });
    await expect(service.deleteById('category-1')).resolves.toEqual({ affected: 1 });
    access.assertCurrentEntityAccessible.mockImplementation(() => { throw new HttpException('forbidden', HttpStatus.FORBIDDEN); });
    await expect(service.deleteById('category-1')).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
  });
});
