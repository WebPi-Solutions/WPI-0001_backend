import { Test, TestingModule } from '@nestjs/testing';
import { SpentController } from './spent.controller';
import { SpentService } from './spent.service';

describe('SpentController', () => {
  let controller: SpentController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SpentController],
      providers: [
        {
          provide: SpentService,
          useValue: {
            previewAiSpentFile: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<SpentController>(SpentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
