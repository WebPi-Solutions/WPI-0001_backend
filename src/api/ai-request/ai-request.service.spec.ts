import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import { AiRequestRepository } from 'src/entities/ai-request/ai-request-repository.service';
import { AiRequestType } from 'src/entities/ai-request/ai-request.entity';
import { AiRequestService } from './ai-request.service';
import { CreateAiRequestDto } from './dto/create-ai-request.dto';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';

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
        {
          provide: EnterpriseAccessService,
          useValue: { assertCurrentEntityAccessible: jest.fn() },
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
        response: { name: 'Proveedor S.L.' },
      }),
    );
    expect(createdAiRequest.id).toBe('ai-request-1');
  });

  it('debe generar un correlationId cuando no se informa', async () => {
    const generatedCorrelationId = '11111111-1111-4111-8111-111111111111';
    jest.spyOn(crypto, 'randomUUID').mockReturnValue(generatedCorrelationId);
    aiRequestRepository.create.mockImplementation((payload) =>
      Promise.resolve({ ...payload, id: 'ai-request-1' }),
    );

    await service.create('enterprise-1', buildCreateDto({ correlationId: undefined }));

    expect(aiRequestRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: generatedCorrelationId,
        response: { name: 'Proveedor S.L.' },
      }),
    );
  });

  it('debe persistir response nula cuando no se informa', async () => {
    aiRequestRepository.create.mockImplementation((payload) =>
      Promise.resolve({ ...payload, id: 'ai-request-1' }),
    );

    await service.create(
      'enterprise-1',
      buildCreateDto({ correlationId: 'correlation-1', response: undefined }),
    );

    expect(aiRequestRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        response: null,
      }),
    );
  });

  it('debe rechazar un tipo de petición no válido', async () => {
    await expect(
      service.create('enterprise-1', buildCreateDto({ type: 'unknown' as AiRequestType })),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      message: 'El tipo de petición de IA no es válido',
    });
    expect(aiRequestRepository.create).not.toHaveBeenCalled();
  });

  it('debe exigir el ID de empresa al registrar', async () => {
    await expect(service.create('', buildCreateDto())).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      message: 'Es obligatorio especificar el ID de la empresa',
    });
    expect(aiRequestRepository.create).not.toHaveBeenCalled();
  });

  it('debe rechazar tokens negativos', async () => {
    await expect(
      service.create('enterprise-1', buildCreateDto({ promptTokens: -1, totalTokens: 19 })),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      message: 'Los tokens de la petición de IA no pueden ser negativos',
    });
    expect(aiRequestRepository.create).not.toHaveBeenCalled();
  });

  it('debe rechazar un total de tokens menor que la suma de prompt y completion', async () => {
    await expect(
      service.create('enterprise-1', buildCreateDto({ totalTokens: 10 })),
    ).rejects.toBeInstanceOf(HttpException);
    expect(aiRequestRepository.create).not.toHaveBeenCalled();
  });

  it('debe aceptar un total de tokens igual o mayor que la suma de prompt y completion', async () => {
    aiRequestRepository.create.mockImplementation((payload) =>
      Promise.resolve({ ...payload, id: 'ai-request-1' }),
    );

    await expect(
      service.create('enterprise-1', buildCreateDto({ totalTokens: 100 })),
    ).resolves.toMatchObject({ id: 'ai-request-1' });
    await expect(
      service.create('enterprise-1', buildCreateDto({ totalTokens: 130 })),
    ).resolves.toMatchObject({ id: 'ai-request-1' });
    expect(aiRequestRepository.create).toHaveBeenCalledTimes(2);
  });

  it('debe propagar el error de persistencia', async () => {
    const persistenceError = new Error('fallo de base de datos');
    aiRequestRepository.create.mockRejectedValue(persistenceError);

    await expect(service.create('enterprise-1', buildCreateDto())).rejects.toBe(persistenceError);
  });

  it('debe listar peticiones paginadas con el filtro recibido', async () => {
    const paginatedResponse = { items: [{ id: 'ai-request-1' }], total: 1, currentPage: 1, totalPages: 1 };
    aiRequestRepository.findAll.mockResolvedValue(paginatedResponse);

    const result = await service.findAll(1, 10, 'createdAt', 'DESC', { enterpriseId: 'enterprise-1' }, [
      'enterprise',
    ]);

    expect(aiRequestRepository.findAll).toHaveBeenCalledWith(
      1,
      10,
      'createdAt',
      'DESC',
      { enterpriseId: 'enterprise-1' },
      ['enterprise'],
    );
    expect(result).toEqual(paginatedResponse);
  });

  it('debe obtener una petición por ID', async () => {
    aiRequestRepository.findByIdOrFail.mockResolvedValue({ id: 'ai-request-1' });

    const aiRequest = await service.findById('ai-request-1', ['enterprise']);

    expect(aiRequestRepository.findByIdOrFail).toHaveBeenCalledWith('ai-request-1', ['enterprise']);
    expect(aiRequest.id).toBe('ai-request-1');
  });

  it('debe consultar por ID sin relaciones en el mensaje de log', async () => {
    aiRequestRepository.findByIdOrFail.mockResolvedValue({ id: 'ai-request-1' });

    await expect(service.findById('ai-request-1')).resolves.toEqual({ id: 'ai-request-1' });
    expect(aiRequestRepository.findByIdOrFail).toHaveBeenCalledWith('ai-request-1', undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
