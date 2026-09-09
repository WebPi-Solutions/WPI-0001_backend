import { Test, TestingModule } from '@nestjs/testing';
import { AiRequestType } from 'src/entities/ai-request/ai-request.entity';
import { AiRequestController } from './ai-request.controller';
import { AiRequestService } from './ai-request.service';

describe('AiRequestController', () => {
  let controller: AiRequestController;
  let aiRequestService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
  };

  beforeEach(async () => {
    aiRequestService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiRequestController],
      providers: [
        {
          provide: AiRequestService,
          useValue: aiRequestService,
        },
      ],
    }).compile();

    controller = module.get<AiRequestController>(AiRequestController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('debe exigir enterpriseId al crear', async () => {
    await expect(
      controller.create('', {
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
        type: AiRequestType.GET_SPENT_ISSUER,
        message: 'prompt',
      }),
    ).rejects.toMatchObject({
      status: 400,
    });
    expect(aiRequestService.create).not.toHaveBeenCalled();
  });

  it('debe exigir enterpriseId al listar', async () => {
    await expect(controller.findAll('')).rejects.toMatchObject({
      status: 400,
    });
    expect(aiRequestService.findAll).not.toHaveBeenCalled();
  });
});
