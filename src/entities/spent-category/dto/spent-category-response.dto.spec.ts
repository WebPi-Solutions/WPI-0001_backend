import { SpentCategoryResponseDto } from './spent-category-response.dto';
import { coverDtoClass } from 'src/test-utils/cover-data-classes';

describe('SpentCategoryResponseDto', () => {
  it('está definido y cubre la empresa relacionada', () => {
    expect(coverDtoClass(SpentCategoryResponseDto, {
      id: 'category-1',
      enterpriseId: 'ent-1',
      name: 'Material',
      description: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      enterprise: { id: 'ent-1', name: 'Empresa' } as never,
    })).toBeDefined();
  });
});
