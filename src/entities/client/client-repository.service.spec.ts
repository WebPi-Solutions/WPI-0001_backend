import { Test, TestingModule } from '@nestjs/testing';
import { ClientRepository } from './client-repository.service';

describe('ClientService', () => {
  let service: ClientRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClientRepository],
    }).compile();

    service = module.get<ClientRepository>(ClientRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
