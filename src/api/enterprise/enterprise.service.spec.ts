import { ForbiddenException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { MulterFile } from 'multer';
import { EnterpriseRepository } from 'src/entities/enterprise/enterprise-repository.service';
import { Enterprise } from 'src/entities/enterprise/enterprise.entity';
import { DropboxService } from 'src/services/dropbox/dropbox.service';
import { EnterpriseService } from './enterprise.service';
import {
  buildMissingEnterprisePermissionMessage,
  EnterpriseAccessService,
} from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { EnterpriseRoleService } from 'src/api/enterprise-role/enterprise-role.service';

describe('EnterpriseService', () => {
  let service: EnterpriseService;
  let enterpriseRepository: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
    findByNif: jest.Mock;
    getEnterpriseFolderPath: jest.Mock;
    getLogoFilePath: jest.Mock;
  };
  let dropboxService: {
    checkFolderExists: jest.Mock;
    deleteFile: jest.Mock;
    uploadFile: jest.Mock;
    downloadFile: jest.Mock;
    sanitizeFileName: jest.Mock;
  };
  let enterpriseAccessService: {
    assertCurrentEntityAccessible: jest.Mock;
    assertCanCreateEnterprise: jest.Mock;
    assertCanDeleteEnterprise: jest.Mock;
    getCurrentAccessContextOrThrow: jest.Mock;
  };
  let enterpriseRoleService: {
    seedDefaultRolesForEnterprise: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  /**
   * Construye una empresa de prueba.
   * @param overrides - Campos a sobrescribir
   * @returns Entidad Enterprise simulada
   */
  const buildEnterprise = (overrides: Partial<Enterprise> = {}): Enterprise =>
    ({
      id: enterpriseId,
      name: 'Empresa Demo',
      nif: 'B00000000',
      stripeId: 'cus_original',
      logo: undefined,
      recurrentEarnings: [],
      ...overrides,
    }) as Enterprise;

  /**
   * Construye un archivo Multer de prueba para el logo.
   * @param overrides - Campos a sobrescribir
   * @returns Archivo Multer simulado
   */
  const buildMulterFile = (overrides: Partial<MulterFile> = {}): MulterFile =>
    ({
      originalname: 'logo.png',
      mimetype: 'image/png',
      size: 1024,
      buffer: Buffer.from('contenido-logo'),
      fieldname: 'file',
      encoding: '7bit',
      ...overrides,
    }) as MulterFile;

  /**
   * Construye un Response de Express simulado para la descarga del logo.
   * @param headersSent - Indica si los headers ya se enviaron
   * @returns Response mockeado
   */
  const buildExpressResponse = (headersSent = false): Response =>
    ({
      set: jest.fn(),
      send: jest.fn(),
      headersSent,
    }) as unknown as Response;

  beforeEach(async () => {
    enterpriseRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
      findByNif: jest.fn(),
      getEnterpriseFolderPath: jest.fn().mockReturnValue('/empresas/enterprise-uuid'),
      getLogoFilePath: jest.fn().mockImplementation(
        (id: string, extension: string) => `/empresas/${id}/logo.${extension}`,
      ),
    };
    dropboxService = {
      checkFolderExists: jest.fn().mockResolvedValue(false),
      deleteFile: jest.fn(),
      uploadFile: jest.fn(),
      downloadFile: jest.fn().mockResolvedValue(Buffer.from('logo-binario')),
      sanitizeFileName: jest.fn().mockImplementation((fileName: string) => fileName),
    };

    enterpriseAccessService = {
      assertCurrentEntityAccessible: jest.fn(),
      assertCanCreateEnterprise: jest.fn(),
      assertCanDeleteEnterprise: jest.fn(),
      getCurrentAccessContextOrThrow: jest.fn().mockReturnValue({
        userId: 'test-user-id',
        isGlobalAdmin: true,
        allowedEnterpriseIds: [],
      }),
    };
    enterpriseRoleService = {
      seedDefaultRolesForEnterprise: jest.fn().mockResolvedValue(undefined),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        EnterpriseService,
        { provide: EnterpriseRepository, useValue: enterpriseRepository },
        { provide: DropboxService, useValue: dropboxService },
        { provide: EnterpriseAccessService, useValue: enterpriseAccessService },
        { provide: EnterpriseRoleService, useValue: enterpriseRoleService },
      ],
    }).compile();

    service = testingModule.get(EnterpriseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('rechaza un NIF duplicado', async () => {
      enterpriseRepository.findByNif.mockResolvedValue(buildEnterprise());

      await expect(service.create(buildEnterprise())).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        message: 'Ya existe una empresa con el NIF',
      });
      expect(enterpriseRepository.create).not.toHaveBeenCalled();
    });

    it('no persiste stripeId ni relaciones enviadas por el cliente', async () => {
      enterpriseRepository.findByNif.mockResolvedValue(null);
      enterpriseRepository.create.mockImplementation((payload: Enterprise) =>
        Promise.resolve({ ...payload, id: enterpriseId }),
      );

      await service.create({
        name: 'Empresa Demo',
        nif: 'B00000000',
        stripeId: 'cus_forzado',
        clients: [{ id: 'client-uuid' }],
        suppliers: [{ id: 'supplier-uuid' }],
        userEnterprises: [{ id: 'link-uuid' }],
        invoiceSeries: [{ id: 'series-uuid' }],
        defaultSchedules: [{ id: 'schedule-uuid' }],
        holidays: [{ id: 'holiday-uuid' }],
      } as unknown as Enterprise);

      const persistedPayload = enterpriseRepository.create.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(persistedPayload.stripeId).toEqual(expect.stringMatching(/^cus_pending_/));
      expect(persistedPayload.stripeId).not.toBe('cus_forzado');
      expect(persistedPayload.clients).toBeUndefined();
      expect(persistedPayload.suppliers).toBeUndefined();
      expect(persistedPayload.userEnterprises).toBeUndefined();
      expect(persistedPayload.invoiceSeries).toBeUndefined();
      expect(persistedPayload.defaultSchedules).toBeUndefined();
      expect(persistedPayload.holidays).toBeUndefined();
      expect(enterpriseRoleService.seedDefaultRolesForEnterprise).toHaveBeenCalledWith(
        enterpriseId,
      );
      expect(persistedPayload.name).toBe('Empresa Demo');
    });

    it('persiste la empresa cuando el NIF es único', async () => {
      const createdEnterprise = buildEnterprise();
      enterpriseRepository.findByNif.mockResolvedValue(null);
      enterpriseRepository.create.mockResolvedValue(createdEnterprise);

      await expect(service.create(buildEnterprise())).resolves.toEqual(createdEnterprise);
    });

    it('relanza el error del repositorio', async () => {
      const repositoryError = new Error('fallo al persistir');
      enterpriseRepository.findByNif.mockResolvedValue(null);
      enterpriseRepository.create.mockRejectedValue(repositoryError);

      await expect(service.create(buildEnterprise())).rejects.toBe(repositoryError);
    });
  });

  describe('createLogoInDropbox', () => {
    it('lanza 404 si la empresa no existe', async () => {
      enterpriseRepository.findById.mockResolvedValue(null);

      await expect(
        service.createLogoInDropbox(enterpriseId, buildMulterFile()),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Empresa no encontrada',
      });
      expect(dropboxService.uploadFile).not.toHaveBeenCalled();
    });

    it('rechaza un tipo de archivo que no es imagen', async () => {
      enterpriseRepository.findById.mockResolvedValue(buildEnterprise());

      await expect(
        service.createLogoInDropbox(
          enterpriseId,
          buildMulterFile({ mimetype: 'application/pdf' }),
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Solo se permiten archivos de imagen (JPEG, JPG, PNG)',
      });
    });

    /**
     * Sube un logo con el mime indicado y comprueba la extensión usada en Dropbox.
     * @param mimeType - MIME del archivo
     * @param expectedExtension - Extensión extraída del MIME
     */
    const expectSuccessfulLogoUpload = async (
      mimeType: string,
      expectedExtension: string,
    ): Promise<void> => {
      const updatedEnterprise = buildEnterprise({ logo: `logo.${expectedExtension}` });
      enterpriseRepository.findById.mockResolvedValue(buildEnterprise());
      dropboxService.uploadFile.mockResolvedValue({ path: `/empresas/${enterpriseId}/logo.${expectedExtension}` });
      enterpriseRepository.updateById.mockResolvedValue(updatedEnterprise);

      const file = buildMulterFile({ mimetype: mimeType });
      await expect(service.createLogoInDropbox(enterpriseId, file)).resolves.toEqual(
        updatedEnterprise,
      );
      expect(enterpriseRepository.getLogoFilePath).toHaveBeenCalledWith(
        enterpriseId,
        expectedExtension,
      );
      expect(dropboxService.uploadFile).toHaveBeenCalledWith(
        `/empresas/${enterpriseId}/logo.${expectedExtension}`,
        file,
      );
      expect(enterpriseRepository.updateById).toHaveBeenCalledWith(
        enterpriseId,
        expect.objectContaining({ logo: `logo.${expectedExtension}` }),
      );
    };

    it('sube un logo PNG y guarda el nombre del archivo', async () => {
      await expectSuccessfulLogoUpload('image/png', 'png');
    });

    it('sube un logo JPEG y guarda el nombre del archivo', async () => {
      await expectSuccessfulLogoUpload('image/jpeg', 'jpeg');
    });

    it('sube un logo JPG y guarda el nombre del archivo', async () => {
      await expectSuccessfulLogoUpload('image/jpg', 'jpg');
    });

    it('relanza el error de Dropbox al fallar la subida', async () => {
      const uploadError = new Error('fallo de Dropbox');
      enterpriseRepository.findById.mockResolvedValue(buildEnterprise());
      dropboxService.uploadFile.mockRejectedValue(uploadError);

      await expect(
        service.createLogoInDropbox(enterpriseId, buildMulterFile()),
      ).rejects.toBe(uploadError);
    });
  });

  describe('downloadLogoFile', () => {
    it('lanza 404 si la empresa no existe', async () => {
      enterpriseRepository.findById.mockResolvedValue(null);
      const response = buildExpressResponse();

      await expect(service.downloadLogoFile(enterpriseId, response)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Empresa no encontrada',
      });
    });

    it('lanza 404 si la empresa no tiene logo', async () => {
      enterpriseRepository.findById.mockResolvedValue(buildEnterprise({ logo: undefined }));
      const response = buildExpressResponse();

      await expect(service.downloadLogoFile(enterpriseId, response)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'La empresa no tiene ningún archivo del logo',
      });
    });

    /**
     * Descarga un logo y comprueba el Content-Type según la extensión.
     * @param logoFileName - Nombre del archivo persistido
     * @param expectedContentType - Content-Type esperado en la respuesta
     */
    const expectLogoDownloadWithContentType = async (
      logoFileName: string,
      expectedContentType: string,
    ): Promise<void> => {
      const fileBuffer = Buffer.from('logo-binario');
      enterpriseRepository.findById.mockResolvedValue(buildEnterprise({ logo: logoFileName }));
      dropboxService.downloadFile.mockResolvedValue(fileBuffer);
      const response = buildExpressResponse();

      await service.downloadLogoFile(enterpriseId, response);

      expect(response.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': expectedContentType,
          'Content-Length': fileBuffer.length.toString(),
        }),
      );
      expect(response.send).toHaveBeenCalledWith(fileBuffer);
    };

    it('envía un PNG con Content-Type image/png', async () => {
      await expectLogoDownloadWithContentType('logo.empresa.png', 'image/png');
    });

    it('envía un JPG con Content-Type image/jpeg', async () => {
      await expectLogoDownloadWithContentType('logo.jpg', 'image/jpeg');
    });

    it('envía un JPEG con Content-Type image/jpeg', async () => {
      await expectLogoDownloadWithContentType('logo.jpeg', 'image/jpeg');
    });

    it('usa application/octet-stream cuando la extensión no es imagen conocida', async () => {
      await expectLogoDownloadWithContentType('logo.webp', 'application/octet-stream');
    });

    it('relanza el error si los headers aún no se enviaron', async () => {
      const downloadError = new Error('fallo de descarga');
      enterpriseRepository.findById.mockResolvedValue(buildEnterprise({ logo: 'logo.png' }));
      dropboxService.downloadFile.mockRejectedValue(downloadError);

      await expect(
        service.downloadLogoFile(enterpriseId, buildExpressResponse(false)),
      ).rejects.toBe(downloadError);
    });

    it('no relanza el error si los headers ya se enviaron', async () => {
      const downloadError = new Error('fallo a mitad de envío');
      enterpriseRepository.findById.mockResolvedValue(buildEnterprise({ logo: 'logo.png' }));
      dropboxService.downloadFile.mockRejectedValue(downloadError);

      await expect(
        service.downloadLogoFile(enterpriseId, buildExpressResponse(true)),
      ).resolves.toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('delega la consulta paginada al repositorio', async () => {
      enterpriseRepository.findAll.mockResolvedValue(emptyPaginatedResponse);
      const filter = { nif: 'B00000000' };

      await expect(
        service.findAll(1, 10, 'name', 'ASC', filter),
      ).resolves.toEqual(emptyPaginatedResponse);
      expect(enterpriseRepository.findAll).toHaveBeenCalledWith(
        1,
        10,
        'name',
        'ASC',
        filter,
        undefined,
      );
    });

    it('incluye relaciones cuando se informan', async () => {
      const paginatedWithItems = {
        items: [buildEnterprise()],
        total: 1,
        currentPage: 1,
        totalPages: 1,
      };
      enterpriseRepository.findAll.mockResolvedValue(paginatedWithItems);

      await expect(
        service.findAll(2, 20, 'name', 'DESC', {}, ['clients', 'suppliers']),
      ).resolves.toEqual(paginatedWithItems);
      expect(enterpriseRepository.findAll).toHaveBeenCalledWith(
        2,
        20,
        'name',
        'DESC',
        {},
        ['clients', 'suppliers'],
      );
    });

    it('restringe el listado a las empresas vinculadas con enterprises.read', async () => {
      enterpriseAccessService.getCurrentAccessContextOrThrow.mockReturnValue({
        userId: 'regular-user-id',
        isGlobalAdmin: false,
        allowedEnterpriseIds: [enterpriseId, 'otra-empresa'],
        permissionsByEnterpriseId: {
          [enterpriseId]: { enterprises: { read: true } },
          'otra-empresa': { enterprises: { read: true } },
        },
      });
      enterpriseRepository.findAll.mockResolvedValue(emptyPaginatedResponse);

      await service.findAll(1, 10, 'name', 'ASC', { nif: 'B00000000' });

      expect(enterpriseRepository.findAll).toHaveBeenCalledWith(
        1,
        10,
        'name',
        'ASC',
        { nif: 'B00000000', id: [enterpriseId, 'otra-empresa'] },
        undefined,
      );
    });

    it('omite del listado las empresas vinculadas sin enterprises.read', async () => {
      enterpriseAccessService.getCurrentAccessContextOrThrow.mockReturnValue({
        userId: 'regular-user-id',
        isGlobalAdmin: false,
        allowedEnterpriseIds: [enterpriseId, 'otra-empresa'],
        permissionsByEnterpriseId: {
          [enterpriseId]: { enterprises: { read: true } },
          'otra-empresa': {},
        },
      });
      enterpriseRepository.findAll.mockResolvedValue(emptyPaginatedResponse);

      await service.findAll(1, 10, 'name', 'ASC', {});

      expect(enterpriseRepository.findAll).toHaveBeenCalledWith(
        1,
        10,
        'name',
        'ASC',
        { id: [enterpriseId] },
        undefined,
      );
    });

    it('lanza 403 si el caller tiene empresas pero ninguna con enterprises.read', async () => {
      enterpriseAccessService.getCurrentAccessContextOrThrow.mockReturnValue({
        userId: 'regular-user-id',
        isGlobalAdmin: false,
        allowedEnterpriseIds: [enterpriseId],
        permissionsByEnterpriseId: { [enterpriseId]: {} },
      });

      await expect(service.findAll(1, 10, 'name', 'ASC', {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.findAll(1, 10, 'name', 'ASC', {})).rejects.toThrow(
        buildMissingEnterprisePermissionMessage('enterprises', 'read'),
      );
      expect(enterpriseRepository.findAll).not.toHaveBeenCalled();
    });

    it('lanza 403 si el contexto no trae permissionsByEnterpriseId', async () => {
      enterpriseAccessService.getCurrentAccessContextOrThrow.mockReturnValue({
        userId: 'regular-user-id',
        isGlobalAdmin: false,
        allowedEnterpriseIds: [enterpriseId],
      });

      await expect(service.findAll(1, 10, 'name', 'ASC', {})).rejects.toThrow(
        buildMissingEnterprisePermissionMessage('enterprises', 'read'),
      );
    });

    it('lanza 403 si el mapa de permisos no incluye la empresa vinculada', async () => {
      enterpriseAccessService.getCurrentAccessContextOrThrow.mockReturnValue({
        userId: 'regular-user-id',
        isGlobalAdmin: false,
        allowedEnterpriseIds: [enterpriseId],
        permissionsByEnterpriseId: {},
      });

      await expect(service.findAll(1, 10, 'name', 'ASC', { id: enterpriseId })).rejects.toThrow(
        buildMissingEnterprisePermissionMessage('enterprises', 'read'),
      );
    });

    it('intersecta filter.id en array con las empresas que tienen enterprises.read', async () => {
      enterpriseAccessService.getCurrentAccessContextOrThrow.mockReturnValue({
        userId: 'regular-user-id',
        isGlobalAdmin: false,
        allowedEnterpriseIds: [enterpriseId, 'otra-empresa'],
        permissionsByEnterpriseId: {
          [enterpriseId]: { enterprises: { read: true } },
          'otra-empresa': { enterprises: { read: true } },
        },
      });
      enterpriseRepository.findAll.mockResolvedValue(emptyPaginatedResponse);

      await service.findAll(1, 10, 'name', 'ASC', { id: [enterpriseId] });

      expect(enterpriseRepository.findAll).toHaveBeenCalledWith(
        1,
        10,
        'name',
        'ASC',
        { id: [enterpriseId] },
        undefined,
      );
    });

    it('ignora filter.id nulo y lista las empresas con enterprises.read', async () => {
      enterpriseAccessService.getCurrentAccessContextOrThrow.mockReturnValue({
        userId: 'regular-user-id',
        isGlobalAdmin: false,
        allowedEnterpriseIds: [enterpriseId],
        permissionsByEnterpriseId: {
          [enterpriseId]: { enterprises: { read: true } },
        },
      });
      enterpriseRepository.findAll.mockResolvedValue(emptyPaginatedResponse);

      await service.findAll(1, 10, 'name', 'ASC', { id: null });

      expect(enterpriseRepository.findAll).toHaveBeenCalledWith(
        1,
        10,
        'name',
        'ASC',
        { id: [enterpriseId] },
        undefined,
      );
    });

    it('devuelve página vacía si filter.id no coincide con ninguna empresa vinculada', async () => {
      enterpriseAccessService.getCurrentAccessContextOrThrow.mockReturnValue({
        userId: 'regular-user-id',
        isGlobalAdmin: false,
        allowedEnterpriseIds: [enterpriseId],
        permissionsByEnterpriseId: {
          [enterpriseId]: { enterprises: { read: true } },
        },
      });

      await expect(
        service.findAll(1, 10, 'name', 'ASC', { id: 'empresa-ajena' }),
      ).resolves.toEqual({
        items: [],
        total: 0,
        currentPage: 1,
        totalPages: 0,
      });
      expect(enterpriseRepository.findAll).not.toHaveBeenCalled();
    });

    it('devuelve página vacía si el usuario no tiene empresas vinculadas', async () => {
      enterpriseAccessService.getCurrentAccessContextOrThrow.mockReturnValue({
        userId: 'regular-user-id',
        isGlobalAdmin: false,
        allowedEnterpriseIds: [],
      });

      await expect(service.findAll(1, 10, 'name', 'ASC', {})).resolves.toEqual({
        items: [],
        total: 0,
        currentPage: 1,
        totalPages: 0,
      });
      expect(enterpriseRepository.findAll).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('devuelve la empresa cuando existe', async () => {
      const existingEnterprise = buildEnterprise();
      enterpriseRepository.findById.mockResolvedValue(existingEnterprise);

      await expect(service.findById(enterpriseId, ['clients'])).resolves.toEqual(
        existingEnterprise,
      );
      expect(enterpriseRepository.findById).toHaveBeenCalledWith(enterpriseId, ['clients']);
    });

    it('consulta sin relaciones cuando no se informan', async () => {
      const existingEnterprise = buildEnterprise();
      enterpriseRepository.findById.mockResolvedValue(existingEnterprise);

      await expect(service.findById(enterpriseId)).resolves.toEqual(existingEnterprise);
      expect(enterpriseRepository.findById).toHaveBeenCalledWith(enterpriseId, undefined);
    });

    it('lanza 404 si la empresa no existe', async () => {
      enterpriseRepository.findById.mockResolvedValue(null);

      await expect(service.findById(enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Empresa no encontrada',
      });
    });
  });

  describe('updateById', () => {
    it('lanza 404 si la empresa no existe', async () => {
      enterpriseRepository.findById.mockResolvedValue(null);

      await expect(
        service.updateById(enterpriseId, buildEnterprise()),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Empresa no encontrada',
      });
      expect(enterpriseRepository.updateById).not.toHaveBeenCalled();
    });

    it('elimina stripeId del payload de actualización', async () => {
      enterpriseRepository.findById.mockResolvedValue(buildEnterprise());
      enterpriseRepository.updateById.mockResolvedValue(buildEnterprise());

      await service.updateById(enterpriseId, {
        name: 'Nuevo nombre',
        stripeId: 'cus_inyectado',
      } as Enterprise);

      const persistedPayload = enterpriseRepository.updateById.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(persistedPayload.stripeId).toBeUndefined();
      expect(persistedPayload.name).toBe('Nuevo nombre');
    });

    it('relanza el error del repositorio', async () => {
      const repositoryError = new Error('fallo al actualizar');
      enterpriseRepository.findById.mockResolvedValue(buildEnterprise());
      enterpriseRepository.updateById.mockRejectedValue(repositoryError);

      await expect(
        service.updateById(enterpriseId, buildEnterprise({ name: 'Nueva' })),
      ).rejects.toBe(repositoryError);
    });
  });

  describe('deleteById', () => {
    it('exige administrador global antes de borrar', async () => {
      enterpriseRepository.findById.mockResolvedValue(buildEnterprise());
      enterpriseRepository.deleteById.mockResolvedValue({ affected: 0, raw: [] });

      await service.deleteById(enterpriseId);

      expect(enterpriseAccessService.assertCurrentEntityAccessible).toHaveBeenCalledWith(
        enterpriseId,
        'Empresa no encontrada',
      );
      expect(enterpriseAccessService.assertCanDeleteEnterprise).toHaveBeenCalled();
    });

    it('lanza 404 si la empresa no existe', async () => {
      enterpriseRepository.findById.mockResolvedValue(null);

      await expect(service.deleteById(enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Empresa no encontrada',
      });
      expect(enterpriseRepository.deleteById).not.toHaveBeenCalled();
    });

    it('bloquea el borrado cuando hay ingresos recurrentes asociados', async () => {
      enterpriseRepository.findById.mockResolvedValue(
        buildEnterprise({
          recurrentEarnings: [{ id: 'recurrent-uuid' }] as Enterprise['recurrentEarnings'],
        }),
      );

      await expect(service.deleteById(enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'No se puede eliminar la empresa porque tiene ingresos recurrentes asociados',
      });
      expect(enterpriseRepository.deleteById).not.toHaveBeenCalled();
    });

    it('permite el borrado si recurrentEarnings no está cargado', async () => {
      enterpriseRepository.findById.mockResolvedValue(
        buildEnterprise({ recurrentEarnings: undefined }),
      );
      enterpriseRepository.deleteById.mockResolvedValue({ affected: 0, raw: [] });

      await expect(service.deleteById(enterpriseId)).resolves.toEqual({ affected: 0, raw: [] });
      expect(dropboxService.checkFolderExists).not.toHaveBeenCalled();
    });

    it('elimina la carpeta de Dropbox si la empresa se borra y la carpeta existe', async () => {
      enterpriseRepository.findById.mockResolvedValue(buildEnterprise());
      enterpriseRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });
      dropboxService.checkFolderExists.mockResolvedValue(true);

      await expect(service.deleteById(enterpriseId)).resolves.toEqual({ affected: 1, raw: [] });
      expect(dropboxService.deleteFile).toHaveBeenCalledWith('/empresas/enterprise-uuid');
    });

    it('no intenta borrar Dropbox si la carpeta no existe', async () => {
      enterpriseRepository.findById.mockResolvedValue(buildEnterprise());
      enterpriseRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });
      dropboxService.checkFolderExists.mockResolvedValue(false);

      await service.deleteById(enterpriseId);

      expect(dropboxService.deleteFile).not.toHaveBeenCalled();
    });

    it('relanza el error del repositorio', async () => {
      const repositoryError = new Error('fallo al borrar');
      enterpriseRepository.findById.mockResolvedValue(buildEnterprise());
      enterpriseRepository.deleteById.mockRejectedValue(repositoryError);

      await expect(service.deleteById(enterpriseId)).rejects.toBe(repositoryError);
    });
  });
});
