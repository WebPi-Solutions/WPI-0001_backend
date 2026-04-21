import { Test, TestingModule } from '@nestjs/testing';
import { SupplierRepository } from './supplier-repository.service';

describe('SupplierService', () => {
  let service: SupplierRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SupplierRepository],
    }).compile();

    service = module.get<SupplierRepository>(SupplierRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
