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

  it('debe registrar la petición cuando hay enterpriseId', async () => {
    const createDto = {
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      type: AiRequestType.GET_SPENT_ISSUER,
      message: 'prompt',
    };
    aiRequestService.create.mockResolvedValue({ id: 'ai-request-1' });

    await expect(controller.create('enterprise-1', createDto)).resolves.toEqual({
      id: 'ai-request-1',
    });
    expect(aiRequestService.create).toHaveBeenCalledWith('enterprise-1', createDto);
  });

  it('debe forzar enterpriseId aunque el filtro JSON intente sustituirlo', async () => {
    aiRequestService.findAll.mockResolvedValue({ items: [], total: 0, currentPage: 1, totalPages: 0 });

    await controller.findAll(
      'enterprise-1',
      2,
      20,
      'createdAt',
      'ASC',
      JSON.stringify({ enterpriseId: 'otra-empresa', type: AiRequestType.GET_SPENT_CONCEPTS }),
      'enterprise',
    );

    expect(aiRequestService.findAll).toHaveBeenCalledWith(
      2,
      20,
      'createdAt',
      'ASC',
      {
        type: AiRequestType.GET_SPENT_CONCEPTS,
        enterpriseId: 'enterprise-1',
      },
      ['enterprise'],
    );
  });

  it('debe rechazar un filtro JSON inválido', async () => {
    await expect(
      controller.findAll('enterprise-1', 1, 10, 'createdAt', 'DESC', '{no-json'),
    ).rejects.toMatchObject({
      status: 400,
      message: 'El filtro JSON no es válido',
    });
    expect(aiRequestService.findAll).not.toHaveBeenCalled();
  });

  it('debe consultar por ID parseando las relaciones', async () => {
    aiRequestService.findById.mockResolvedValue({ id: 'ai-request-1' });

    await expect(controller.findById('ai-request-1', 'enterprise,user')).resolves.toEqual({
      id: 'ai-request-1',
    });
    expect(aiRequestService.findById).toHaveBeenCalledWith('ai-request-1', ['enterprise', 'user']);
  });
});
