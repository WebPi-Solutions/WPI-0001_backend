import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SpentCategory } from 'src/entities/spent-category/spent-category.entity';
import { SpentCategoryController } from './spent-category.controller';
import { SpentCategoryService } from './spent-category.service';

describe('SpentCategoryController', () => {
  let controller: SpentCategoryController;
  let service: { create: jest.Mock; findAll: jest.Mock; findById: jest.Mock; updateById: jest.Mock; deleteById: jest.Mock };
  beforeEach(async () => {
    service = { create: jest.fn(), findAll: jest.fn(), findById: jest.fn(), updateById: jest.fn(), deleteById: jest.fn() };
    const module = await Test.createTestingModule({ controllers: [SpentCategoryController], providers: [{ provide: SpentCategoryService, useValue: service }] }).compile();
    controller = module.get(SpentCategoryController);
  });

  it('exige empresa y crea forzando el tenant', async () => {
    await expect(controller.create('', {} as SpentCategory)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    const payload = { name: 'Material', enterpriseId: 'attacker' } as SpentCategory;
    service.create.mockResolvedValue(payload);
    await expect(controller.create('ent-1', payload)).resolves.toBe(payload);
    expect(payload.enterpriseId).toBe('ent-1');
  });

  it('lista, obtiene, actualiza y elimina', async () => {
    service.findAll.mockResolvedValue({ items: [], total: 0 });
    await expect(controller.findAll('ent-1', 2, 5, 'name', 'DESC', JSON.stringify({ name: 'x' }), 'enterprise')).resolves.toEqual({ items: [], total: 0 });
    expect(service.findAll).toHaveBeenCalledWith(2, 5, 'name', 'DESC', { name: 'x', enterpriseId: 'ent-1' }, ['enterprise']);
    await controller.findAll('ent-1', 1, 10, 'name', 'ASC', '{invalid');
    await expect(controller.findById('id', 'enterprise')).resolves.toBeUndefined();
    await controller.findById('id');
    await controller.updateById('id', {} as SpentCategory);
    await controller.delete('id');
    expect(service.findById).toHaveBeenCalledWith('id', []);
    expect(service.updateById).toHaveBeenCalledWith('id', {});
    expect(service.deleteById).toHaveBeenCalledWith('id');
  });

  it('exige enterpriseId al listar', async () => {
    await expect(controller.findAll('')).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
  });
});
