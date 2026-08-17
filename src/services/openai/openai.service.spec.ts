import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import OpenAI from 'openai';
import { OpenaiService } from './openai.service';

const mockCreateChatCompletion = jest.fn();

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: (...argumentsList: unknown[]) => mockCreateChatCompletion(...argumentsList),
        },
      },
    })),
  };
});

describe('OpenaiService', () => {
  let service: OpenaiService;

  /**
   * Crea el servicio con las variables de entorno de OpenAI indicadas.
   * @param environmentValues Clave y organización a inyectar en process.env
   * @returns Instancia de OpenaiService
   */
  const createService = async (environmentValues: {
    apiKey?: string;
    organizationId?: string;
    spentConceptsModel?: string;
  }): Promise<OpenaiService> => {
    process.env.OPENAI_API_KEY = environmentValues.apiKey ?? 'test-api-key';
    process.env.OPENAI_ORG_ID = environmentValues.organizationId ?? 'test-org-id';
    process.env.OPENAI_SPENTS_PROCESSING_MODEL =
      environmentValues.spentConceptsModel ?? 'gpt-5.6-luna';

    const module: TestingModule = await Test.createTestingModule({
      providers: [OpenaiService],
    }).compile();

    return module.get<OpenaiService>(OpenaiService);
  };

  beforeEach(async () => {
    mockCreateChatCompletion.mockReset();
    (OpenAI as unknown as jest.Mock).mockClear();
    service = await createService({});
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_ORG_ID;
    delete process.env.OPENAI_SPENTS_PROCESSING_MODEL;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('extractSpentIssuerFromText', () => {
    it('debe devolver el nombre y el NIF del emisor', async () => {
      mockCreateChatCompletion.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: 'Proveedor Ejemplo S.L.',
                nifWithoutCountryPrefix: 'b-12345678',
                nifWithCountryPrefix: 'esb-12345678',
              }),
            },
          },
        ],
        usage: {
          prompt_tokens: 80,
          completion_tokens: 20,
          total_tokens: 100,
        },
      });

      const result = await service.extractSpentIssuerFromText('Factura emitida por Proveedor Ejemplo');

      expect(result.name).toBe('Proveedor Ejemplo S.L.');
      expect(result.nifWithoutCountryPrefix).toBe('B12345678');
      expect(result.nifWithCountryPrefix).toBe('ESB12345678');
      expect(result.totalTokens).toBe(100);
      expect(mockCreateChatCompletion).toHaveBeenCalledTimes(1);

      const completionRequest = mockCreateChatCompletion.mock.calls[0][0] as {
        messages: Array<{ role: string; content: string }>;
      };
      const systemPrompt = completionRequest.messages.find((message) => message.role === 'system')?.content ?? '';
      expect(systemPrompt).toContain('nombre FISCAL');
      expect(systemPrompt).toContain('Nunca uses la marca comercial');
      expect(systemPrompt).toContain('Galaonia Energía S.L.');

      expect(mockCreateChatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-5.6-luna',
          messages: [
            expect.objectContaining({ role: 'system' }),
            expect.objectContaining({
              role: 'user',
              content: 'Factura emitida por Proveedor Ejemplo',
            }),
          ],
        }),
      );
    });

    it('debe rechazar un texto OCR vacío', async () => {
      await expect(service.extractSpentIssuerFromText('   ')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
      expect(mockCreateChatCompletion).not.toHaveBeenCalled();
    });
  });

  describe('extractSpentConceptsFromText', () => {
    it('debe devolver los conceptos extraídos y los tokens empleados', async () => {
      mockCreateChatCompletion.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: 'Hosting mensual',
                issuedDate: '2026-06-27',
                concepts: [
                  {
                    name: 'Hosting mensual',
                    base_price: 50,
                    vat: 21,
                    irpf: 0,
                    quantity: 1,
                    supplied: false,
                    percentage: 100,
                  },
                ],
                totalSubtotal: 50,
                totalVAT: 10.5,
                totalIRPF: 0,
                total: 60.5,
              }),
            },
          },
        ],
        usage: {
          prompt_tokens: 120,
          completion_tokens: 40,
          total_tokens: 160,
        },
      });

      const result = await service.extractSpentConceptsFromText('Factura de hosting 50€ + IVA');

      expect(result.concepts).toHaveLength(1);
      expect(result.concepts[0].name).toBe('Hosting mensual');
      expect(result.concepts[0].base_price).toBe(50);
      expect(result.concepts[0].vat).toBe(21);
      expect(result.concepts[0].percentage).toBe(100);
      expect(result.name).toBe('Hosting mensual');
      expect(result.issuedDate).toBe('2026-06-27');
      expect(result.totalSubtotal).toBe(50);
      expect(result.totalVAT).toBe(10.5);
      expect(result.totalIRPF).toBe(0);
      expect(result.total).toBe(60.5);
      expect(result.promptTokens).toBe(120);
      expect(result.completionTokens).toBe(40);
      expect(result.totalTokens).toBe(160);
      expect(mockCreateChatCompletion).toHaveBeenCalledTimes(1);
      expect(mockCreateChatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-5.6-luna',
          reasoning_effort: 'none',
          messages: [
            expect.objectContaining({
              role: 'system',
              content: expect.stringContaining('issuedDate'),
            }),
            expect.objectContaining({
              role: 'user',
              content: 'Factura de hosting 50€ + IVA',
            }),
          ],
        }),
      );
    });

    it('debe fijar la imputación a 100 aunque OpenAI devuelva otro porcentaje', async () => {
      mockCreateChatCompletion.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: 'Dietas',
                issuedDate: '2026-06-27',
                concepts: [
                  {
                    name: 'Comida',
                    base_price: 20,
                    vat: 10,
                    irpf: 0,
                    quantity: 1,
                    supplied: false,
                    percentage: 50,
                  },
                ],
                totalSubtotal: 20,
                totalVAT: 2,
                totalIRPF: 0,
                total: 22,
              }),
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

      const result = await service.extractSpentConceptsFromText('Ticket de comida');

      expect(result.concepts[0].percentage).toBe(100);
    });

    it('debe incluir el CIF y los conceptos históricos completos en el mensaje de usuario', async () => {
      mockCreateChatCompletion.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ concepts: [] }) } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
      const historicalConcepts = [
        {
          name: '58.5360 kWh',
          base_price: 19.84,
          vat: 21,
          irpf: 0,
          quantity: 1,
          supplied: true,
          percentage: 100,
        },
      ];

      await service.extractSpentConceptsFromText('Factura de recarga', {
        historicalConcepts,
        historicalSpentNames: ['Recarga Tesla', 'Combustible'],
        issuerNifWithCountryPrefix: 'ESB66855701',
      });

      const requestPayload = mockCreateChatCompletion.mock.calls[0][0];
      const systemPrompt = requestPayload.messages[0].content as string;
      const userMessage = requestPayload.messages[1].content as string;

      expect(systemPrompt).toContain('copia EXACTAMENTE el `name` histórico');
      expect(systemPrompt).toContain('copia el estilo del `name` histórico');
      expect(systemPrompt).toContain('Si el prefijo es ES');
      expect(systemPrompt).toContain('gasto suplido');
      expect(systemPrompt).toContain('No copies el valor de supplied');
      expect(systemPrompt).toContain('totalSubtotal - totalIRPF + totalVAT');
      expect(systemPrompt).toContain('más de 2 decimales');
      expect(systemPrompt).toContain('5.884');
      expect(systemPrompt).toContain('5.885 se vería 5.89');
      expect(systemPrompt).toContain('1,24');
      expect(systemPrompt).not.toContain('porcentaje imputable');
      expect(userMessage).toContain('CIF del emisor con prefijo de país: ESB66855701');
      expect(userMessage).toContain('Recarga Tesla');
      expect(userMessage).toContain('Combustible');
      expect(userMessage).toContain('58.5360 kWh');
      expect(userMessage).toContain('19.84');
      expect(userMessage).toContain('Texto OCR de la factura:');
      expect(userMessage).toContain('Factura de recarga');
      expect(userMessage).not.toContain('"percentage"');
    });

    it('debe indicar IVA 0 e importe íntegro cuando el CIF del emisor es extranjero', async () => {
      mockCreateChatCompletion.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ concepts: [] }) } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });

      await service.extractSpentConceptsFromText('Invoice line 100 EUR + VAT', {
        issuerNifWithCountryPrefix: 'FR123456789',
      });

      const requestPayload = mockCreateChatCompletion.mock.calls[0][0];
      const systemPrompt = requestPayload.messages[0].content as string;
      const userMessage = requestPayload.messages[1].content as string;

      expect(userMessage).toContain('CIF del emisor con prefijo de país: FR123456789');
      expect(systemPrompt).toContain('vat SIEMPRE 0');
      expect(systemPrompt).toContain('importe íntegro');
      expect(systemPrompt).toContain('SOLO si el CIF del emisor tiene prefijo ES');
    });

    it('debe ajustar la base española con más decimales cuando el IVA impreso no cuadra a 2 decimales', async () => {
      mockCreateChatCompletion.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: 'Servicio',
                issuedDate: '2026-01-15',
                concepts: [
                  {
                    name: 'Servicio',
                    base_price: 5.88,
                    vat: 21,
                    irpf: 0,
                    quantity: 1,
                    supplied: false,
                    percentage: 100,
                  },
                ],
                totalSubtotal: 5.88,
                totalVAT: 1.24,
                totalIRPF: 0,
                total: 7.12,
              }),
            },
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });

      const result = await service.extractSpentConceptsFromText('Base 5,88 IVA 1,24 total 7,12', {
        issuerNifWithCountryPrefix: 'ESB12345678',
      });

      expect(result.concepts[0].base_price).toBeCloseTo(7.12 / 1.21, 5);
      expect(Math.round(result.concepts[0].base_price * 100) / 100).toBe(5.88);
      expect(Math.round(result.concepts[0].base_price * 0.21 * 100) / 100).toBe(1.24);
      expect(result.concepts[0].base_price).toBeLessThan(5.885);
      expect(result.concepts[0].base_price).not.toBe(5.88);
    });

    it('debe corregir 5.885 porque en pantalla se redondearía a 5.89 y no a 5.88', async () => {
      mockCreateChatCompletion.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: 'Servicio',
                issuedDate: '2026-01-15',
                concepts: [
                  {
                    name: 'Servicio',
                    base_price: 5.885,
                    vat: 21,
                    irpf: 0,
                    quantity: 1,
                    supplied: false,
                    percentage: 100,
                  },
                ],
                totalSubtotal: 5.88,
                totalVAT: 1.24,
                totalIRPF: 0,
                total: 7.12,
              }),
            },
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });

      const result = await service.extractSpentConceptsFromText('Base 5,885', {
        issuerNifWithCountryPrefix: 'ESB12345678',
      });

      expect(result.concepts[0].base_price).not.toBe(5.885);
      expect(result.concepts[0].base_price).toBeCloseTo(7.12 / 1.21, 5);
      expect(Math.round(result.concepts[0].base_price * 100) / 100).toBe(5.88);
      expect(Math.round(result.concepts[0].base_price * 0.21 * 100) / 100).toBe(1.24);
    });

    it('no debe ajustar la base si ya cuadra el IVA y el redondeo visual a 2 decimales', async () => {
      mockCreateChatCompletion.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: 'Servicio',
                issuedDate: '2026-01-15',
                concepts: [
                  {
                    name: 'Servicio',
                    base_price: 5.884,
                    vat: 21,
                    irpf: 0,
                    quantity: 1,
                    supplied: false,
                    percentage: 100,
                  },
                ],
                totalSubtotal: 5.88,
                totalVAT: 1.24,
                totalIRPF: 0,
                total: 7.12,
              }),
            },
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });

      const result = await service.extractSpentConceptsFromText('Base 5,884', {
        issuerNifWithCountryPrefix: 'ESB12345678',
      });

      expect(result.concepts[0].base_price).toBe(5.884);
    });

    it('no debe ajustar la base cuando el emisor es extranjero', async () => {
      mockCreateChatCompletion.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: 'Service',
                issuedDate: '2026-01-15',
                concepts: [
                  {
                    name: 'Service',
                    base_price: 5.88,
                    vat: 0,
                    irpf: 0,
                    quantity: 1,
                    supplied: false,
                    percentage: 100,
                  },
                ],
                totalSubtotal: 5.88,
                totalVAT: 0,
                totalIRPF: 0,
                total: 5.88,
              }),
            },
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });

      const result = await service.extractSpentConceptsFromText('Invoice 5.88', {
        issuerNifWithCountryPrefix: 'FR123456789',
      });

      expect(result.concepts[0].base_price).toBe(5.88);
      expect(result.concepts[0].vat).toBe(0);
    });

    it('debe rechazar un texto OCR vacío', async () => {
      await expect(service.extractSpentConceptsFromText('   ')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
      expect(mockCreateChatCompletion).not.toHaveBeenCalled();
    });

    it('debe usar el modelo definido en OPENAI_SPENTS_PROCESSING_MODEL', async () => {
      const serviceWithCustomModel = await createService({
        spentConceptsModel: 'gpt-5.6-terra',
      });
      mockCreateChatCompletion.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ concepts: [] }) } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });

      await serviceWithCustomModel.extractSpentConceptsFromText('Factura');

      expect(mockCreateChatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-5.6-terra',
        }),
      );
    });

    it('debe lanzar un error si falta OPENAI_SPENTS_PROCESSING_MODEL', async () => {
      const serviceWithoutModel = await createService({
        spentConceptsModel: '',
      });

      await expect(serviceWithoutModel.extractSpentConceptsFromText('Factura')).rejects.toMatchObject({
        status: HttpStatus.SERVICE_UNAVAILABLE,
      });
      expect(mockCreateChatCompletion).not.toHaveBeenCalled();
    });

    it('debe lanzar un error si OpenAI no está configurado', async () => {
      const unconfiguredService = await createService({
        apiKey: '',
        organizationId: '',
      });

      await expect(
        unconfiguredService.extractSpentConceptsFromText('Texto de factura'),
      ).rejects.toMatchObject({
        status: HttpStatus.SERVICE_UNAVAILABLE,
      });
    });

    it('debe lanzar un error HTTP si la respuesta no es JSON válido', async () => {
      mockCreateChatCompletion.mockResolvedValue({
        choices: [{ message: { content: 'no-es-json' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

      await expect(service.extractSpentConceptsFromText('Factura')).rejects.toBeInstanceOf(
        HttpException,
      );
    });

    it('debe lanzar un error HTTP si la API de OpenAI falla', async () => {
      mockCreateChatCompletion.mockRejectedValue(new Error('quota exceeded'));

      await expect(service.extractSpentConceptsFromText('Factura')).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      });
    });
  });
});
