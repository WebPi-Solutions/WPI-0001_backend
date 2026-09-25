jest.mock('src/common/helpers/query-builder/query-builder.service', () => ({
  QueryBuilderService: { getPaginatedResults: jest.fn() },
}));

import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryBuilderService } from 'src/common/helpers/query-builder/query-builder.service';
import { SpentCategory } from './spent-category.entity';
import { SpentCategoryRepository } from './spent-category-repository.service';

describe('SpentCategoryRepository', () => {
  let service: SpentCategoryRepository;
  let repository: { save: jest.Mock; findOne: jest.Mock; delete: jest.Mock };

  beforeEach(async () => {
    repository = { save: jest.fn(), findOne: jest.fn(), delete: jest.fn() };
    (QueryBuilderService.getPaginatedResults as jest.Mock).mockResolvedValue({ items: [], total: 0 });
    const module = await Test.createTestingModule({
      providers: [
        SpentCategoryRepository,
        { provide: getRepositoryToken(SpentCategory), useValue: repository },
      ],
    }).compile();
    service = module.get(SpentCategoryRepository);
  });

  it('crea, lista y busca con y sin relaciones', async () => {
    repository.save.mockResolvedValue({ id: 'category-1' });
    await expect(service.create({ name: 'Material' })).resolves.toEqual({ id: 'category-1' });
    await service.findAll(2, 5, 'name', 'DESC', { enterpriseId: 'ent-1' }, ['enterprise']);
    expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalled();
    await service.findAll();
    repository.findOne.mockResolvedValue({ id: 'category-1' });
    await expect(service.findById('category-1')).resolves.toEqual({ id: 'category-1' });
    await service.findById('category-1', ['enterprise']);
  });

  it('actualiza, devuelve 404 y elimina', async () => {
    repository.findOne.mockResolvedValueOnce(null);
    await expect(service.updateById('missing', {})).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    const current = { id: 'category-1', name: 'Old' };
    const updated = { ...current, name: 'New' };
    repository.findOne.mockResolvedValueOnce(current).mockResolvedValueOnce(updated);
    repository.save.mockResolvedValue(updated);
    await expect(service.updateById('category-1', { name: 'New' })).resolves.toEqual(updated);
    repository.delete.mockResolvedValue({ affected: 1, raw: [] });
    await expect(service.deleteById('category-1')).resolves.toEqual({ affected: 1, raw: [] });
  });
});
