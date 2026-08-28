import { Test, TestingModule } from '@nestjs/testing';
import { RecurrentEarningController } from './recurrent-earning.controller';
import { RecurrentEarningService } from './recurrent-earning.service';

describe('RecurrentEarningController', () => {
  let controller: RecurrentEarningController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecurrentEarningController],
      providers: [
        {
          provide: RecurrentEarningService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findById: jest.fn(),
            updateById: jest.fn(),
            deleteById: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<RecurrentEarningController>(RecurrentEarningController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
