import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { MulterFile } from 'multer';
import { Spent } from 'src/entities/spent/spent.entity';
import { SpentRepository } from 'src/entities/spent/spent-repository.service';
import { DropboxService } from 'src/services/dropbox/dropbox.service';
import { FileService } from 'src/services/file/file.service';
import { OpenaiService } from 'src/services/openai/openai.service';
import { SupplierRepository } from 'src/entities/supplier/supplier-repository.service';
import { AiRequestService } from 'src/api/ai-request/ai-request.service';
import { AiRequestType } from 'src/entities/ai-request/ai-request.entity';
import { SpentService } from './spent.service';
import { EnterpriseAccessService } from 'src/helpers/enterprise-access/enterprise-access.service';

describe('SpentService', () => {
  let service: SpentService;
  let dropboxService: {
    uploadFile: jest.Mock;
    downloadFile: jest.Mock;
    sanitizeFileName: jest.Mock;
    deleteFile: jest.Mock;
    moveFile: jest.Mock;
  };
  let fileService: { processAiSpentPdf: jest.Mock; validatePdfFile: jest.Mock };
  let openaiService: {
    extractSpentIssuerFromText: jest.Mock;
    extractSpentConceptsFromText: jest.Mock;
  };
  let spentRepository: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
    getSpentFilePath: jest.Mock;
    findLatestBySupplierId: jest.Mock;
    hasEnterpriseAiAccess: jest.Mock;
  };
  let supplierRepository: { findByNifAndEnterpriseId: jest.Mock; findById: jest.Mock };
  let aiRequestService: { create: jest.Mock };

  const enterpriseId = 'enterprise-id-de-prueba';
  const spentId = 'spent-uuid';
  const dropboxPath = '/empresas/enterprise-id-de-prueba/gastos/spent-uuid.pdf';

  /**
   * Construye un gasto de prueba con proveedor.
   * @param overrides - Campos a sobrescribir
   * @returns Entidad Spent simulada
   */
  const buildSpent = (overrides: Partial<Spent> = {}): Spent =>
    ({
      id: spentId,
      supplierId: 'supplier-id',
      name: 'Hosting mensual',
      file: false,
      supplier: { id: 'supplier-id', enterpriseId },
      ...overrides,
    }) as Spent;

  /**
   * Crea un archivo Multer de prueba.
   * @param overrides Propiedades a sobrescribir del archivo
   * @returns Archivo Multer simulado
   */
  const createMulterFile = (overrides: Partial<MulterFile> = {}): MulterFile => {
    return {
      originalname: 'factura-proveedor.pdf',
      mimetype: 'application/pdf',
      size: 2.5 * 1024 * 1024,
      buffer: Buffer.from('contenido-pdf-de-prueba'),
      fieldname: 'file',
      encoding: '7bit',
      destination: '',
      filename: '',
      path: '',
      stream: undefined as unknown as MulterFile['stream'],
      ...overrides,
    } as MulterFile;
  };

  beforeEach(async () => {
    dropboxService = {
      uploadFile: jest.fn().mockResolvedValue({ path: dropboxPath }),
      downloadFile: jest.fn().mockResolvedValue(Buffer.from('pdf-binario')),
      sanitizeFileName: jest.fn().mockImplementation((fileName: string) => fileName),
      deleteFile: jest.fn().mockResolvedValue(undefined),
      moveFile: jest.fn().mockResolvedValue(undefined),
    };
    fileService = {
      processAiSpentPdf: jest.fn().mockResolvedValue({
        originalName: 'factura-proveedor.pdf',
        sizeInMegabytes: 2.5,
        extractedText: 'Texto OCR de prueba',
        message: 'Archivo recibido correctamente',
      }),
      validatePdfFile: jest.fn(),
    };
    openaiService = {
      extractSpentIssuerFromText: jest.fn().mockResolvedValue({
        name: 'Proveedor S.L.',
        nifWithoutCountryPrefix: 'B12345678',
        nifWithCountryPrefix: '',
        promptTokens: 8,
        completionTokens: 4,
        totalTokens: 12,
        requestMessage: 'Texto OCR de prueba',
      }),
      extractSpentConceptsFromText: jest.fn().mockResolvedValue({
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
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        requestMessage: 'Texto OCR de prueba',
      }),
    };

    spentRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
      getSpentFilePath: jest.fn().mockReturnValue(dropboxPath),
      findLatestBySupplierId: jest.fn().mockResolvedValue([]),
      hasEnterpriseAiAccess: jest.fn().mockResolvedValue(true),
    };
    supplierRepository = {
      findByNifAndEnterpriseId: jest.fn().mockResolvedValue(null),
      findById: jest.fn().mockResolvedValue({ id: 'supplier-id', enterpriseId }),
    };
    aiRequestService = {
      create: jest.fn().mockResolvedValue({ id: 'ai-request-id' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpentService,
        { provide: SpentRepository, useValue: spentRepository },
        { provide: DropboxService, useValue: dropboxService },
        { provide: FileService, useValue: fileService },
        { provide: OpenaiService, useValue: openaiService },
        { provide: SupplierRepository, useValue: supplierRepository },
        { provide: AiRequestService, useValue: aiRequestService },
        {
          provide: EnterpriseAccessService,
          useValue: {
            assertCurrentEntityAccessible: jest.fn(),
            mergeRelationNames: (relations?: string[], required: string[] = []) =>
              [...new Set([...(relations ?? []), ...required])],
          },
        },
      ],
    }).compile();

    service = module.get<SpentService>(SpentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('previewAiSpentFile', () => {
    it('debe rechazar el flujo si la empresa no tiene acceso a IA', async () => {
      const file = createMulterFile();
      spentRepository.hasEnterpriseAiAccess.mockResolvedValue(false);

      await expect(service.previewAiSpentFile(file, enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        message: 'La empresa no tiene acceso a las funciones de IA',
      });
      expect(spentRepository.hasEnterpriseAiAccess).toHaveBeenCalledWith(enterpriseId);
      expect(fileService.processAiSpentPdf).not.toHaveBeenCalled();
      expect(openaiService.extractSpentIssuerFromText).not.toHaveBeenCalled();
      expect(openaiService.extractSpentConceptsFromText).not.toHaveBeenCalled();
      expect(aiRequestService.create).not.toHaveBeenCalled();
    });

    it('debe delegar el procesamiento del PDF en FileService sin subir a Dropbox', async () => {
      const file = createMulterFile();

      const result = await service.previewAiSpentFile(file, enterpriseId);

      expect(result.originalName).toBe('factura-proveedor.pdf');
      expect(result.sizeInMegabytes).toBe(2.5);
      expect(result.message).toBe('Archivo recibido correctamente');
      expect(result.spentData).toEqual({
        name: 'Hosting mensual',
        issuedDate: '2026-06-27',
        collectionDate: '2026-06-27',
        declarationDate: '2026-06-27',
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
        status: 'paid',
        supplierId: null,
        suggestedSupplier: {
          name: 'Proveedor S.L.',
          nif: 'B12345678',
          type: 'company',
        },
      });
      expect(fileService.processAiSpentPdf).toHaveBeenCalledWith(file);
      expect(openaiService.extractSpentIssuerFromText).toHaveBeenCalledWith('Texto OCR de prueba');
      expect(supplierRepository.findByNifAndEnterpriseId).toHaveBeenCalledWith(
        'B12345678',
        enterpriseId,
      );
      expect(openaiService.extractSpentConceptsFromText).toHaveBeenCalledWith(
        'Texto OCR de prueba',
        {
          historicalConcepts: [],
          historicalSpentNames: [],
          issuerNifWithCountryPrefix: '',
        },
      );
      expect(spentRepository.findLatestBySupplierId).not.toHaveBeenCalled();
      expect(openaiService.extractSpentIssuerFromText.mock.invocationCallOrder[0]).toBeLessThan(
        openaiService.extractSpentConceptsFromText.mock.invocationCallOrder[0],
      );
      expect(aiRequestService.create).toHaveBeenCalledTimes(2);
      expect(aiRequestService.create).toHaveBeenNthCalledWith(
        1,
        enterpriseId,
        expect.objectContaining({
          type: AiRequestType.GET_SPENT_ISSUER,
          promptTokens: 8,
          completionTokens: 4,
          totalTokens: 12,
          message: 'Texto OCR de prueba',
        }),
      );
      expect(aiRequestService.create).toHaveBeenNthCalledWith(
        2,
        enterpriseId,
        expect.objectContaining({
          type: AiRequestType.GET_SPENT_CONCEPTS,
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        }),
      );
      const issuerCorrelationId = aiRequestService.create.mock.calls[0][1].correlationId;
      const conceptsCorrelationId = aiRequestService.create.mock.calls[1][1].correlationId;
      expect(issuerCorrelationId).toEqual(expect.any(String));
      expect(conceptsCorrelationId).toBe(issuerCorrelationId);
      expect(dropboxService.uploadFile).not.toHaveBeenCalled();
    });

    it('debe propagar el error si FileService rechaza el archivo', async () => {
      const file = createMulterFile({
        originalname: 'imagen.png',
        mimetype: 'image/png',
      });
      fileService.processAiSpentPdf.mockRejectedValue(
        new HttpException('Solo se permiten archivos PDF', HttpStatus.BAD_REQUEST),
      );

      await expect(service.previewAiSpentFile(file, enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Solo se permiten archivos PDF',
      });
      expect(fileService.processAiSpentPdf).toHaveBeenCalledTimes(1);
      expect(openaiService.extractSpentIssuerFromText).not.toHaveBeenCalled();
      expect(supplierRepository.findByNifAndEnterpriseId).not.toHaveBeenCalled();
      expect(openaiService.extractSpentConceptsFromText).not.toHaveBeenCalled();
      expect(spentRepository.findLatestBySupplierId).not.toHaveBeenCalled();
      expect(dropboxService.uploadFile).not.toHaveBeenCalled();
    });

    it('no debe extraer conceptos si falla la extracción del emisor', async () => {
      const file = createMulterFile();
      openaiService.extractSpentIssuerFromText.mockRejectedValue(
        new HttpException('Error al extraer el emisor del gasto con IA', HttpStatus.INTERNAL_SERVER_ERROR),
      );

      await expect(service.previewAiSpentFile(file, enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      });
      expect(openaiService.extractSpentIssuerFromText).toHaveBeenCalledTimes(1);
      expect(aiRequestService.create).not.toHaveBeenCalled();
      expect(supplierRepository.findByNifAndEnterpriseId).not.toHaveBeenCalled();
      expect(openaiService.extractSpentConceptsFromText).not.toHaveBeenCalled();
    });

    it('debe extraer conceptos aunque el proveedor no exista en base de datos', async () => {
      const file = createMulterFile();
      supplierRepository.findByNifAndEnterpriseId.mockResolvedValue(null);

      await service.previewAiSpentFile(file, enterpriseId);

      expect(supplierRepository.findByNifAndEnterpriseId).toHaveBeenCalledWith(
        'B12345678',
        enterpriseId,
      );
      expect(openaiService.extractSpentConceptsFromText).toHaveBeenCalledWith(
        'Texto OCR de prueba',
        {
          historicalConcepts: [],
          historicalSpentNames: [],
          issuerNifWithCountryPrefix: '',
        },
      );
      expect(spentRepository.findLatestBySupplierId).not.toHaveBeenCalled();
    });

    it('debe proponer los datos del emisor para crear el proveedor si no existe, infiriendo particular por NIF', async () => {
      const file = createMulterFile();
      openaiService.extractSpentIssuerFromText.mockResolvedValue({
        name: 'Ana García',
        nifWithoutCountryPrefix: '12345678A',
        nifWithCountryPrefix: 'ES12345678A',
        promptTokens: 8,
        completionTokens: 4,
        totalTokens: 12,
        requestMessage: 'Texto OCR de prueba',
      });
      supplierRepository.findByNifAndEnterpriseId.mockResolvedValue(null);

      const result = await service.previewAiSpentFile(file, enterpriseId);

      expect(result.spentData.supplierId).toBeNull();
      expect(result.spentData.suggestedSupplier).toEqual({
        name: 'Ana García',
        nif: '12345678A',
        type: 'individual',
      });
    });

    it('debe extraer conceptos reutilizando los conceptos completos de las últimas facturas del proveedor', async () => {
      const file = createMulterFile();
      openaiService.extractSpentIssuerFromText.mockResolvedValue({
        name: 'Tesla Spain, S.L. Unipersonal',
        nifWithoutCountryPrefix: 'B66855701',
        nifWithCountryPrefix: 'ESB66855701',
        promptTokens: 8,
        completionTokens: 4,
        totalTokens: 12,
        requestMessage: 'Texto OCR de prueba',
      });
      supplierRepository.findByNifAndEnterpriseId.mockResolvedValue({
        id: 'supplier-id',
        name: 'Tesla Spain S.L.U.',
        nif: 'B66855701',
      });
      spentRepository.findLatestBySupplierId.mockResolvedValue([
        {
          id: 'spent-1',
          name: 'Recarga Tesla',
          concepts: [
            {
              name: '58.5360 kWh',
              base_price: 19.84,
              vat: 21,
              irpf: 0,
              quantity: 1,
              supplied: true,
              percentage: 100,
            },
            {
              name: '',
              base_price: 10,
            },
          ],
        },
        {
          id: 'spent-2',
          name: 'Recarga tesla',
          concepts: [
            {
              name: '32.4460 kWh',
              base_price: 11.0,
              vat: 21,
              irpf: 0,
              quantity: 1,
              supplied: true,
              percentage: 100,
            },
          ],
        },
      ]);

      const result = await service.previewAiSpentFile(file, enterpriseId);

      expect(spentRepository.findLatestBySupplierId).toHaveBeenCalledWith('supplier-id', 5);
      expect(openaiService.extractSpentConceptsFromText).toHaveBeenCalledWith(
        'Texto OCR de prueba',
        expect.objectContaining({
          issuerNifWithCountryPrefix: 'ESB66855701',
          historicalSpentNames: ['Recarga Tesla'],
          historicalConcepts: [
            expect.objectContaining({
              name: '58.5360 kWh',
              base_price: 19.84,
              vat: 21,
              quantity: 1,
            }),
            expect.objectContaining({
              name: '32.4460 kWh',
              base_price: 11.0,
              vat: 21,
              quantity: 1,
            }),
          ],
        }),
      );
      expect(result.spentData.supplierId).toBe('supplier-id');
      expect(result.spentData.suggestedSupplier).toEqual({
        name: 'Tesla Spain, S.L. Unipersonal',
        nif: 'B66855701',
        type: 'company',
      });
      expect(result.spentData.status).toBe('paid');
      expect(result.spentData.collectionDate).toBe(result.spentData.issuedDate);
      expect(result.spentData.declarationDate).toBe(result.spentData.issuedDate);
    });

    it('debe enviar el CIF con prefijo de país aunque el proveedor no exista en base de datos', async () => {
      const file = createMulterFile();
      openaiService.extractSpentIssuerFromText.mockResolvedValue({
        name: 'Proveedor extranjero',
        nifWithoutCountryPrefix: '123456789',
        nifWithCountryPrefix: 'FR123456789',
        promptTokens: 8,
        completionTokens: 4,
        totalTokens: 12,
        requestMessage: 'Texto OCR de prueba',
      });
      supplierRepository.findByNifAndEnterpriseId.mockResolvedValue(null);

      await service.previewAiSpentFile(file, enterpriseId);

      expect(spentRepository.findLatestBySupplierId).not.toHaveBeenCalled();
      expect(openaiService.extractSpentConceptsFromText).toHaveBeenCalledWith(
        'Texto OCR de prueba',
        {
          historicalConcepts: [],
          historicalSpentNames: [],
          issuerNifWithCountryPrefix: 'FR123456789',
        },
      );
    });

    it('debe buscar primero el CIF sin prefijo de país y no consultar el prefijado si ya existe', async () => {
      const file = createMulterFile();
      openaiService.extractSpentIssuerFromText.mockResolvedValue({
        name: 'Tesla Spain, S.L. Unipersonal',
        nifWithoutCountryPrefix: 'B66855701',
        nifWithCountryPrefix: 'ESB66855701',
        promptTokens: 8,
        completionTokens: 4,
        totalTokens: 12,
        requestMessage: 'Texto OCR de prueba',
      });
      supplierRepository.findByNifAndEnterpriseId.mockResolvedValue({
        id: 'supplier-tesla',
        name: 'Tesla Spain',
        nif: 'B66855701',
      });

      await service.previewAiSpentFile(file, enterpriseId);

      expect(supplierRepository.findByNifAndEnterpriseId).toHaveBeenCalledTimes(1);
      expect(supplierRepository.findByNifAndEnterpriseId).toHaveBeenCalledWith(
        'B66855701',
        enterpriseId,
      );
    });

    it('debe buscar el CIF con prefijo de país si no existe sin prefijo', async () => {
      const file = createMulterFile();
      openaiService.extractSpentIssuerFromText.mockResolvedValue({
        name: 'Tesla Spain, S.L. Unipersonal',
        nifWithoutCountryPrefix: 'B66855701',
        nifWithCountryPrefix: 'ESB66855701',
        promptTokens: 8,
        completionTokens: 4,
        totalTokens: 12,
        requestMessage: 'Texto OCR de prueba',
      });
      supplierRepository.findByNifAndEnterpriseId
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'supplier-tesla',
          name: 'Tesla Spain',
          nif: 'ESB66855701',
        });

      await service.previewAiSpentFile(file, enterpriseId);

      expect(supplierRepository.findByNifAndEnterpriseId).toHaveBeenNthCalledWith(
        1,
        'B66855701',
        enterpriseId,
      );
      expect(supplierRepository.findByNifAndEnterpriseId).toHaveBeenNthCalledWith(
        2,
        'ESB66855701',
        enterpriseId,
      );
    });

    it('no busca proveedor si OpenAI no devuelve CIF y no propone alta sin nombre ni NIF', async () => {
      const file = createMulterFile();
      openaiService.extractSpentIssuerFromText.mockResolvedValue({
        name: undefined,
        nifWithoutCountryPrefix: undefined,
        nifWithCountryPrefix: undefined,
        promptTokens: 8,
        completionTokens: 4,
        totalTokens: 12,
        requestMessage: 'Texto OCR de prueba',
      });

      const result = await service.previewAiSpentFile(file, enterpriseId);

      expect(supplierRepository.findByNifAndEnterpriseId).not.toHaveBeenCalled();
      expect(result.spentData.supplierId).toBeNull();
      expect(result.spentData.suggestedSupplier).toBeNull();
    });

    it('usa el CIF con prefijo si falta el sin prefijo e infiere particular por NIE con ES', async () => {
      const file = createMulterFile();
      openaiService.extractSpentIssuerFromText.mockResolvedValue({
        name: 'Persona NIE',
        nifWithoutCountryPrefix: '',
        nifWithCountryPrefix: 'ESX1234567L',
        promptTokens: 8,
        completionTokens: 4,
        totalTokens: 12,
        requestMessage: 'Texto OCR de prueba',
      });
      supplierRepository.findByNifAndEnterpriseId.mockResolvedValue(null);

      const result = await service.previewAiSpentFile(file, enterpriseId);

      expect(supplierRepository.findByNifAndEnterpriseId).toHaveBeenCalledWith(
        'ESX1234567L',
        enterpriseId,
      );
      expect(result.spentData.suggestedSupplier).toEqual({
        name: 'Persona NIE',
        nif: 'ESX1234567L',
        type: 'individual',
      });
    });

    it('construye el nombre del gasto a partir del PDF si OpenAI no lo extrae', async () => {
      const file = createMulterFile();
      openaiService.extractSpentConceptsFromText.mockResolvedValue({
        name: '',
        issuedDate: '2026-06-27',
        concepts: [],
        totalSubtotal: 0,
        totalVAT: 0,
        totalIRPF: 0,
        total: 0,
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        requestMessage: 'Texto OCR de prueba',
      });

      const result = await service.previewAiSpentFile(file, enterpriseId);

      expect(result.spentData.name).toBe('factura-proveedor');
    });

    it('usa el nombre genérico Gasto si el archivo no aporta uno útil', async () => {
      const file = createMulterFile();
      fileService.processAiSpentPdf.mockResolvedValue({
        originalName: '.pdf',
        sizeInMegabytes: 1,
        extractedText: 'Texto OCR de prueba',
        message: 'Archivo recibido correctamente',
      });
      openaiService.extractSpentConceptsFromText.mockResolvedValue({
        name: '',
        issuedDate: '2026-06-27',
        concepts: [],
        totalSubtotal: 0,
        totalVAT: 0,
        totalIRPF: 0,
        total: 0,
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        requestMessage: 'Texto OCR de prueba',
      });

      const result = await service.previewAiSpentFile(file, enterpriseId);

      expect(result.spentData.name).toBe('Gasto');
    });

    it('omite nombres históricos vacíos y conceptos incompletos del proveedor', async () => {
      const file = createMulterFile();
      supplierRepository.findByNifAndEnterpriseId.mockResolvedValue({
        id: 'supplier-id',
        name: 'Proveedor S.L.',
        nif: 'B12345678',
      });
      spentRepository.findLatestBySupplierId.mockResolvedValue([
        {
          id: 'spent-vacio',
          name: '   ',
          concepts: undefined,
        },
        {
          id: 'spent-sin-nombre',
          concepts: [undefined, { name: '  ' }, { name: 'Luz' }],
        },
        {
          id: 'spent-numeros',
          name: 'Factura luz',
          concepts: [
            {
              name: 'Potencia',
            },
          ],
        },
      ]);

      await service.previewAiSpentFile(file, enterpriseId);

      expect(openaiService.extractSpentConceptsFromText).toHaveBeenCalledWith(
        'Texto OCR de prueba',
        expect.objectContaining({
          historicalSpentNames: ['Factura luz'],
          historicalConcepts: [
            expect.objectContaining({
              name: 'Luz',
              base_price: 0,
              vat: 0,
              irpf: 0,
              quantity: 1,
              supplied: false,
            }),
            expect.objectContaining({
              name: 'Potencia',
              base_price: 0,
              quantity: 1,
            }),
          ],
        }),
      );
    });

    it('relanza un error genérico que no es HttpException', async () => {
      const file = createMulterFile();
      fileService.processAiSpentPdf.mockRejectedValue(new Error('OCR caído'));

      await expect(service.previewAiSpentFile(file, enterpriseId)).rejects.toThrow('OCR caído');
    });
  });

  describe('create', () => {
    it('persiste el gasto y lo devuelve', async () => {
      const payload = buildSpent();
      spentRepository.create.mockResolvedValue(payload);

      await expect(service.create(payload)).resolves.toEqual(payload);
      expect(spentRepository.create).toHaveBeenCalledWith(payload);
    });

    it('relanza el error de persistencia', async () => {
      const payload = buildSpent();
      spentRepository.create.mockRejectedValue(new Error('duplicado'));

      await expect(service.create(payload)).rejects.toThrow('duplicado');
    });
  });

  describe('findAll', () => {
    it('delega el listado e informa relaciones cuando existen', async () => {
      const paginated = { items: [buildSpent()], total: 1, currentPage: 1, totalPages: 1 };
      spentRepository.findAll.mockResolvedValue(paginated);
      const filter = { 'supplier.enterpriseId': enterpriseId };

      await expect(
        service.findAll(1, 10, 'issuedDate', 'DESC', filter, ['supplier']),
      ).resolves.toEqual(paginated);
      expect(spentRepository.findAll).toHaveBeenCalledWith(
        1,
        10,
        'issuedDate',
        'DESC',
        filter,
        ['supplier'],
      );
    });

    it('omite el log de relaciones cuando no se informan o el array está vacío', async () => {
      const paginated = { items: [], total: 0, currentPage: 1, totalPages: 0 };
      spentRepository.findAll.mockResolvedValue(paginated);

      await service.findAll(1, 10, 'issuedDate', 'DESC', {});
      await service.findAll(1, 10, 'issuedDate', 'DESC', {}, []);

      expect(spentRepository.findAll).toHaveBeenCalledTimes(2);
    });
  });

  describe('findById', () => {
    it('devuelve el gasto encontrado con relaciones', async () => {
      const spent = buildSpent();
      spentRepository.findById.mockResolvedValue(spent);

      await expect(service.findById(spentId, ['supplier'])).resolves.toEqual(spent);
      expect(spentRepository.findById).toHaveBeenCalledWith(spentId, ['supplier']);
    });

    it('lanza 404 cuando no existe y no se piden relaciones', async () => {
      spentRepository.findById.mockResolvedValue(null);

      await expect(service.findById(spentId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Gasto no encontrado',
      });
    });
  });

  describe('updateById', () => {
    it('actualiza el gasto', async () => {
      const payload = buildSpent({ name: 'Actualizado' });
      spentRepository.findById.mockResolvedValue(buildSpent());
      spentRepository.updateById.mockResolvedValue(payload);

      await expect(service.updateById(spentId, payload)).resolves.toEqual(payload);
    });

    it('relanza el error de actualización', async () => {
      spentRepository.findById.mockResolvedValue(buildSpent());
      spentRepository.updateById.mockRejectedValue(new Error('bloqueo'));

      await expect(service.updateById(spentId, buildSpent())).rejects.toThrow('bloqueo');
    });
  });

  describe('addFileToSpentById', () => {
    it('sube el PDF a Dropbox y marca el gasto con archivo', async () => {
      const spent = buildSpent();
      const updated = buildSpent({ file: true });
      spentRepository.findById.mockResolvedValue(spent);
      spentRepository.updateById.mockResolvedValue(updated);
      const file = createMulterFile();

      await expect(service.addFileToSpentById(spentId, file)).resolves.toEqual(updated);
      expect(fileService.validatePdfFile).toHaveBeenCalledWith(file);
      expect(spentRepository.getSpentFilePath).toHaveBeenCalledWith(enterpriseId, spentId);
      expect(dropboxService.uploadFile).toHaveBeenCalledWith(dropboxPath, file);
      expect(spentRepository.updateById).toHaveBeenCalledWith(spentId, {
        ...spent,
        file: true,
      });
    });

    it('lanza 404 si el gasto no existe', async () => {
      spentRepository.findById.mockResolvedValue(null);

      await expect(service.addFileToSpentById(spentId, createMulterFile())).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Gasto no encontrado',
      });
    });

    it('relanza el error de validación o subida', async () => {
      fileService.validatePdfFile.mockImplementation(() => {
        throw new HttpException('Solo se permiten archivos PDF', HttpStatus.BAD_REQUEST);
      });

      await expect(service.addFileToSpentById(spentId, createMulterFile())).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });
  });

  describe('downloadSpentFile', () => {
    /**
     * Construye una respuesta Express simulada.
     * @param overrides - Campos a sobrescribir
     * @returns Response de prueba
     */
    const buildResponse = (overrides: Partial<Response> = {}): Response =>
      ({
        set: jest.fn(),
        send: jest.fn(),
        headersSent: false,
        ...overrides,
      }) as unknown as Response;

    it('lanza 404 si el gasto no existe', async () => {
      spentRepository.findById.mockResolvedValue(null);

      await expect(service.downloadSpentFile(spentId, buildResponse())).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Gasto no encontrado',
      });
    });

    it('lanza 404 si el gasto no tiene archivo', async () => {
      spentRepository.findById.mockResolvedValue(buildSpent({ file: false }));

      await expect(service.downloadSpentFile(spentId, buildResponse())).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'El gasto no tiene ningún archivo adjunto',
      });
    });

    it('configura cabeceras y envía el buffer', async () => {
      spentRepository.findById.mockResolvedValue(buildSpent({ file: true, name: 'Factura abril' }));
      const response = buildResponse();

      await service.downloadSpentFile(spentId, response);

      expect(dropboxService.sanitizeFileName).toHaveBeenCalledWith('Factura abril');
      expect(response.set).toHaveBeenCalledWith({
        'Content-Type': 'application/pdf',
        'Content-Disposition':
          "attachment; filename=\"Factura abril.pdf\"; filename*=UTF-8''Factura%20abril.pdf",
        'Content-Length': Buffer.from('pdf-binario').length.toString(),
      });
      expect(response.send).toHaveBeenCalledWith(Buffer.from('pdf-binario'));
    });

    it('no relanza si las cabeceras ya se enviaron', async () => {
      spentRepository.findById.mockResolvedValue(buildSpent({ file: true }));
      const response = buildResponse({
        headersSent: true,
        send: jest.fn().mockImplementation(() => {
          throw new Error('broken pipe');
        }),
      } as Partial<Response>);

      await expect(service.downloadSpentFile(spentId, response)).resolves.toBeUndefined();
    });

    it('relanza el error si aún no se enviaron cabeceras', async () => {
      spentRepository.findById.mockResolvedValue(buildSpent({ file: true }));
      dropboxService.downloadFile.mockRejectedValue(new Error('dropbox timeout'));

      await expect(service.downloadSpentFile(spentId, buildResponse())).rejects.toThrow(
        'dropbox timeout',
      );
    });
  });

  describe('deleteById', () => {
    it('lanza 404 si el gasto no existe', async () => {
      spentRepository.findById.mockResolvedValue(null);

      await expect(service.deleteById(spentId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Gasto no encontrado',
      });
    });

    it('elimina el gasto sin tocar Dropbox si no hay archivo', async () => {
      spentRepository.findById.mockResolvedValue(buildSpent({ file: false }));
      spentRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.deleteById(spentId)).resolves.toEqual({ affected: 1, raw: [] });
      expect(dropboxService.deleteFile).not.toHaveBeenCalled();
    });

    it('borra el archivo de Dropbox antes del gasto', async () => {
      spentRepository.findById.mockResolvedValue(buildSpent({ file: true }));
      spentRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await service.deleteById(spentId);

      expect(dropboxService.deleteFile).toHaveBeenCalledWith(dropboxPath);
      expect(spentRepository.deleteById).toHaveBeenCalledWith(spentId);
    });

    it('lanza 500 si no se puede borrar el archivo de Dropbox', async () => {
      spentRepository.findById.mockResolvedValue(buildSpent({ file: true }));
      dropboxService.deleteFile.mockRejectedValue(new Error('dropbox 409'));

      await expect(service.deleteById(spentId)).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'No se pudo eliminar el archivo: dropbox 409',
      });
      expect(spentRepository.deleteById).not.toHaveBeenCalled();
    });
  });

  describe('removeFileFromSpentById', () => {
    it('lanza 404 si el gasto no existe', async () => {
      spentRepository.findById.mockResolvedValue(null);

      await expect(service.removeFileFromSpentById(spentId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Gasto no encontrado',
      });
    });

    it('marca el gasto sin archivo aunque no hubiera documento', async () => {
      const spent = buildSpent({ file: false });
      spentRepository.findById.mockResolvedValue(spent);
      spentRepository.updateById.mockResolvedValue({ ...spent, file: false });

      await service.removeFileFromSpentById(spentId);

      expect(dropboxService.deleteFile).not.toHaveBeenCalled();
      expect(spentRepository.updateById).toHaveBeenCalledWith(spentId, {
        ...spent,
        file: false,
      });
    });

    it('elimina el archivo de Dropbox y actualiza el gasto', async () => {
      const spent = buildSpent({ file: true });
      spentRepository.findById.mockResolvedValue(spent);
      spentRepository.updateById.mockResolvedValue({ ...spent, file: false });

      await service.removeFileFromSpentById(spentId);

      expect(dropboxService.deleteFile).toHaveBeenCalledWith(dropboxPath);
    });

    it('lanza 500 si Dropbox no puede borrar el archivo', async () => {
      spentRepository.findById.mockResolvedValue(buildSpent({ file: true }));
      dropboxService.deleteFile.mockRejectedValue(new Error('dropbox 409'));

      await expect(service.removeFileFromSpentById(spentId)).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'No se pudo eliminar el archivo: dropbox 409',
      });
    });
  });

  describe('changeSpentEnterpriseFolderOndDropbox', () => {
    it('lanza 404 si el gasto no existe', async () => {
      spentRepository.findById.mockResolvedValue(null);

      await expect(
        service.changeSpentEnterpriseFolderOndDropbox(spentId, 'old-ent', 'new-ent'),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Gasto no encontrado',
      });
    });

    it('rechaza el movimiento si la empresa actual coincide con el origen', async () => {
      spentRepository.findById.mockResolvedValue(buildSpent());

      await expect(
        service.changeSpentEnterpriseFolderOndDropbox(spentId, enterpriseId, 'new-ent'),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'La empresa del gasto es la misma que la empresa de destino',
      });
    });

    it('mueve el archivo entre carpetas de empresa', async () => {
      spentRepository.findById.mockResolvedValue(
        buildSpent({ supplier: { id: 'supplier-id', enterpriseId: 'empresa-nueva' } } as Partial<Spent>),
      );
      spentRepository.getSpentFilePath
        .mockReturnValueOnce('/old/path.pdf')
        .mockReturnValueOnce('/new/path.pdf');

      await service.changeSpentEnterpriseFolderOndDropbox(spentId, 'old-ent', 'new-ent');

      expect(dropboxService.moveFile).toHaveBeenCalledWith('/old/path.pdf', '/new/path.pdf');
    });

    it('relanza el error de Dropbox al mover', async () => {
      spentRepository.findById.mockResolvedValue(
        buildSpent({ supplier: { id: 'supplier-id', enterpriseId: 'empresa-nueva' } } as Partial<Spent>),
      );
      dropboxService.moveFile.mockRejectedValue(new Error('move failed'));

      await expect(
        service.changeSpentEnterpriseFolderOndDropbox(spentId, 'old-ent', 'new-ent'),
      ).rejects.toThrow('move failed');
    });
  });
});
