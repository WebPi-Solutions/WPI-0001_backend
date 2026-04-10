import { Test, TestingModule } from '@nestjs/testing';
import { SpentController } from './spent.controller';

describe('SpentController', () => {
  let controller: SpentController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SpentController],
    }).compile();

    controller = module.get<SpentController>(SpentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
