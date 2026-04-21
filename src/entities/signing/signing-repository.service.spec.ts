import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SigningRepository } from './signing-repository.service';
import { Signing } from './signing.entity';

describe('SigningRepository', () => {
  let service: SigningRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SigningRepository,
        {
          provide: getRepositoryToken(Signing),
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<SigningRepository>(SigningRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
