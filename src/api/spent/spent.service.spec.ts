import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MulterFile } from 'multer';
import { SpentRepository } from 'src/entities/spent/spent-repository.service';
import { DropboxService } from 'src/services/dropbox/dropbox.service';
import { FileService } from 'src/services/file/file.service';
import { OpenaiService } from 'src/services/openai/openai.service';
import { SupplierRepository } from 'src/entities/supplier/supplier-repository.service';
import { SpentService } from './spent.service';

describe('SpentService', () => {
  let service: SpentService;
  let dropboxService: { uploadFile: jest.Mock };
  let fileService: { processAiSpentPdf: jest.Mock; validatePdfFile: jest.Mock };
  let openaiService: {
    extractSpentIssuerFromText: jest.Mock;
    extractSpentConceptsFromText: jest.Mock;
  };
  let spentRepository: { findLatestBySupplierId: jest.Mock };
  let supplierRepository: { findByNifAndEnterpriseId: jest.Mock };

  const enterpriseId = 'enterprise-id-de-prueba';

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
      uploadFile: jest.fn(),
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
      }),
    };

    spentRepository = {
      findLatestBySupplierId: jest.fn().mockResolvedValue([]),
    };
    supplierRepository = {
      findByNifAndEnterpriseId: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpentService,
        { provide: SpentRepository, useValue: spentRepository },
        { provide: DropboxService, useValue: dropboxService },
        { provide: FileService, useValue: fileService },
        { provide: OpenaiService, useValue: openaiService },
        { provide: SupplierRepository, useValue: supplierRepository },
      ],
    }).compile();

    service = module.get<SpentService>(SpentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('previewAiSpentFile', () => {
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
  });
});
