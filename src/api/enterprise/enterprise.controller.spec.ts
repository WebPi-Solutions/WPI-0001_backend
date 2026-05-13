import { Test, TestingModule } from '@nestjs/testing';
import { EnterpriseController } from './enterprise.controller';
import { EnterpriseService } from './enterprise.service';

describe('EnterpriseController', () => {
  let controller: EnterpriseController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EnterpriseController],
      providers: [{ provide: EnterpriseService, useValue: {} }],
    }).compile();

    controller = module.get<EnterpriseController>(EnterpriseController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
