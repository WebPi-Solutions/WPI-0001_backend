import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AiRequestRepository } from 'src/entities/ai-request/ai-request-repository.service';
import { AiRequestType } from 'src/entities/ai-request/ai-request.entity';
import { AiRequestService } from './ai-request.service';
import { CreateAiRequestDto } from './dto/create-ai-request.dto';

describe('AiRequestService', () => {
  let service: AiRequestService;
  let aiRequestRepository: {
    create: jest.Mock;
    findAll: jest.Mock;
    findByIdOrFail: jest.Mock;
  };

  /**
   * Construye un DTO válido de petición de IA.
   * @param overrides - Campos a sobrescribir
   * @returns DTO de creación
   */
  const buildCreateDto = (overrides: Partial<CreateAiRequestDto> = {}): CreateAiRequestDto => ({
    promptTokens: 80,
    completionTokens: 20,
    totalTokens: 100,
    type: AiRequestType.GET_SPENT_ISSUER,
    message: 'Texto OCR de prueba',
    response: { name: 'Proveedor S.L.' },
    ...overrides,
  });

  beforeEach(async () => {
    aiRequestRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findByIdOrFail: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiRequestService,
        {
          provide: AiRequestRepository,
          useValue: aiRequestRepository,
        },
      ],
    }).compile();

    service = module.get<AiRequestService>(AiRequestService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('debe persistir una petición de IA válida', async () => {
    const createDto = buildCreateDto({ correlationId: 'correlation-1' });
    aiRequestRepository.create.mockImplementation((payload) =>
      Promise.resolve({ ...payload, id: 'ai-request-1' }),
    );

    const createdAiRequest = await service.create('enterprise-1', createDto);

    expect(aiRequestRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        enterpriseId: 'enterprise-1',
        correlationId: 'correlation-1',
        type: AiRequestType.GET_SPENT_ISSUER,
        promptTokens: 80,
        completionTokens: 20,
        totalTokens: 100,
      }),
    );
    expect(createdAiRequest.id).toBe('ai-request-1');
  });

  it('debe rechazar un tipo de petición no válido', async () => {
    await expect(
      service.create('enterprise-1', buildCreateDto({ type: 'unknown' as AiRequestType })),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
    expect(aiRequestRepository.create).not.toHaveBeenCalled();
  });

  it('debe rechazar un total de tokens menor que la suma de prompt y completion', async () => {
    await expect(
      service.create('enterprise-1', buildCreateDto({ totalTokens: 10 })),
    ).rejects.toBeInstanceOf(HttpException);
    expect(aiRequestRepository.create).not.toHaveBeenCalled();
  });

  it('debe obtener una petición por ID', async () => {
    aiRequestRepository.findByIdOrFail.mockResolvedValue({ id: 'ai-request-1' });

    const aiRequest = await service.findById('ai-request-1', ['enterprise']);

    expect(aiRequestRepository.findByIdOrFail).toHaveBeenCalledWith('ai-request-1', ['enterprise']);
    expect(aiRequest.id).toBe('ai-request-1');
  });
});
