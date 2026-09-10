import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EnterpriseAccessService } from 'src/helpers/enterprise-access/enterprise-access.service';
import { VacationRepository } from 'src/entities/vacation/vacation-repository.service';
import { Vacation } from 'src/entities/vacation/vacation.entity';
import { VacationService } from './vacation.service';
import { CreateVacationDto } from './dto/create-vacation.dto';

describe('VacationService', () => {
  let service: VacationService;
  let vacationRepository: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };
  let enterpriseAccessService: {
    assertUserEnterpriseBelongsToEnterprise: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const userEnterpriseId = 'user-enterprise-uuid';
  const vacationId = 'vacation-uuid';
  const userEnterpriseRelations = [
    'userEnterprise',
    'userEnterprise.enterprise',
    'userEnterprise.user',
  ];

  /**
   * Construye un permiso de prueba con valores deterministas.
   * @param overrides - Campos a sobrescribir
   * @returns Entidad Vacation simulada
   */
  const buildVacation = (overrides: Partial<Vacation> = {}): Vacation =>
    ({
      id: vacationId,
      userEnterpriseId,
      name: 'Vacaciones',
      calendarDate: '2026-08-15',
      ...overrides,
    }) as Vacation;

  beforeEach(async () => {
    vacationRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };
    enterpriseAccessService = {
      assertUserEnterpriseBelongsToEnterprise: jest.fn().mockResolvedValue({
        id: userEnterpriseId,
        userId: 'user-uuid',
        enterpriseId,
      }),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        VacationService,
        { provide: VacationRepository, useValue: vacationRepository },
        { provide: EnterpriseAccessService, useValue: enterpriseAccessService },
      ],
    }).compile();

    service = testingModule.get(VacationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const validDto: CreateVacationDto = {
      userEnterpriseId,
      calendarDate: '2026-08-15',
    };

    it('rechaza el alta si el vínculo no pertenece a la empresa', async () => {
      enterpriseAccessService.assertUserEnterpriseBelongsToEnterprise.mockImplementation(() =>
        Promise.reject({
          status: HttpStatus.NOT_FOUND,
          message: 'Registro de vacaciones no encontrado',
        }),
      );

      await expect(service.create(enterpriseId, validDto)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
      expect(vacationRepository.create).not.toHaveBeenCalled();
    });

    it('persiste el permiso con nombre por defecto tras validar el vínculo', async () => {
      vacationRepository.create.mockImplementation((payload) =>
        Promise.resolve({ ...payload, id: vacationId }),
      );

      await service.create(enterpriseId, validDto);

      expect(enterpriseAccessService.assertUserEnterpriseBelongsToEnterprise).toHaveBeenCalledWith(
        userEnterpriseId,
        enterpriseId,
        expect.objectContaining({ operationContext: 'vacation' }),
      );
      expect(vacationRepository.create).toHaveBeenCalledWith({
        userEnterpriseId,
        name: 'Vacaciones',
        calendarDate: '2026-08-15',
      });
    });
  });

  describe('findAll', () => {
    it('incluye siempre las relaciones de userEnterprise para acotar por empresa', async () => {
      vacationRepository.findAll.mockResolvedValue({
        items: [],
        total: 0,
        currentPage: 1,
        totalPages: 0,
      });

      await service.findAll(1, 10, 'calendarDate', 'ASC', { 'userEnterprise.enterpriseId': enterpriseId }, [
        'custom',
      ]);

      expect(vacationRepository.findAll).toHaveBeenCalledWith(
        1,
        10,
        'calendarDate',
        'ASC',
        { 'userEnterprise.enterpriseId': enterpriseId },
        [...userEnterpriseRelations, 'custom'],
      );
    });
  });

  describe('findById', () => {
    it('lanza 404 si el registro no existe', async () => {
      vacationRepository.findById.mockResolvedValue(null);

      await expect(service.findById(vacationId, enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Registro de vacaciones no encontrado',
      });
      expect(enterpriseAccessService.assertUserEnterpriseBelongsToEnterprise).not.toHaveBeenCalled();
    });

    it('comprueba el vínculo de empresa antes de devolver el registro', async () => {
      vacationRepository.findById.mockResolvedValue(buildVacation());

      await expect(service.findById(vacationId, enterpriseId, ['userEnterprise'])).resolves.toEqual(
        buildVacation(),
      );
      expect(vacationRepository.findById).toHaveBeenCalledWith(vacationId, userEnterpriseRelations);
      expect(enterpriseAccessService.assertUserEnterpriseBelongsToEnterprise).toHaveBeenCalledWith(
        userEnterpriseId,
        enterpriseId,
        expect.objectContaining({
          operationContext: 'vacation',
          notFoundMessage: 'Registro de vacaciones no encontrado',
        }),
      );
    });
  });

  describe('updateById', () => {
    it('no persiste nada si no hay campos editables', async () => {
      vacationRepository.findById.mockResolvedValue(buildVacation());

      await service.updateById(vacationId, enterpriseId, {});

      expect(vacationRepository.updateById).not.toHaveBeenCalled();
      expect(vacationRepository.findById).toHaveBeenLastCalledWith(
        vacationId,
        userEnterpriseRelations,
      );
    });

    it('actualiza nombre y fecha tras validar la empresa', async () => {
      const updated = buildVacation({ name: 'Asuntos propios', calendarDate: '2026-08-16' });
      vacationRepository.findById.mockResolvedValue(buildVacation());
      vacationRepository.updateById.mockResolvedValue(updated);

      await expect(
        service.updateById(vacationId, enterpriseId, {
          name: 'Asuntos propios',
          calendarDate: '2026-08-16',
        }),
      ).resolves.toEqual(updated);
      expect(vacationRepository.updateById).toHaveBeenCalledWith(vacationId, {
        name: 'Asuntos propios',
        calendarDate: '2026-08-16',
      });
    });
  });

  describe('deleteById', () => {
    it('no elimina si el vínculo no pertenece a la empresa', async () => {
      vacationRepository.findById.mockResolvedValue(buildVacation());
      enterpriseAccessService.assertUserEnterpriseBelongsToEnterprise.mockImplementation(() =>
        Promise.reject({
          status: HttpStatus.NOT_FOUND,
          message: 'Registro de vacaciones no encontrado',
        }),
      );

      await expect(service.deleteById(vacationId, enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
      expect(vacationRepository.deleteById).not.toHaveBeenCalled();
    });

    it('elimina tras validar la titularidad', async () => {
      vacationRepository.findById.mockResolvedValue(buildVacation());
      vacationRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.deleteById(vacationId, enterpriseId)).resolves.toEqual({
        affected: 1,
        raw: [],
      });
      expect(vacationRepository.deleteById).toHaveBeenCalledWith(vacationId);
    });

    it('registra 0 filas afectadas si el borrado no informa affected', async () => {
      vacationRepository.findById.mockResolvedValue(buildVacation());
      vacationRepository.deleteById.mockResolvedValue({ raw: [] });

      await expect(service.deleteById(vacationId, enterpriseId)).resolves.toEqual({
        raw: [],
      });
    });
  });

  describe('create con nombre, findAll sin relaciones extra y errores', () => {
    it('persiste el nombre informado y propaga el error de alta', async () => {
      vacationRepository.create.mockResolvedValue(buildVacation({ name: 'Asuntos' }));

      await service.create(enterpriseId, {
        userEnterpriseId,
        calendarDate: '2026-08-15',
        name: 'Asuntos',
      });

      expect(vacationRepository.create).toHaveBeenCalledWith({
        userEnterpriseId,
        name: 'Asuntos',
        calendarDate: '2026-08-15',
      });

      vacationRepository.create.mockRejectedValue(new Error('fallo crear'));
      await expect(
        service.create(enterpriseId, { userEnterpriseId, calendarDate: '2026-08-15' }),
      ).rejects.toThrow('fallo crear');
    });

    it('lista vacaciones sin relaciones extra del cliente', async () => {
      vacationRepository.findAll.mockResolvedValue({
        items: [],
        total: 0,
        currentPage: 1,
        totalPages: 0,
      });

      await service.findAll(1, 10, 'calendarDate', 'ASC', {});

      expect(vacationRepository.findAll).toHaveBeenCalledWith(
        1,
        10,
        'calendarDate',
        'ASC',
        {},
        userEnterpriseRelations,
      );
    });

    it('propaga errores de actualización y borrado', async () => {
      vacationRepository.findById.mockResolvedValue(buildVacation());
      vacationRepository.updateById.mockRejectedValue(new Error('fallo update'));
      await expect(
        service.updateById(vacationId, enterpriseId, { name: 'X' }),
      ).rejects.toThrow('fallo update');

      vacationRepository.deleteById.mockRejectedValue(new Error('fallo delete'));
      await expect(service.deleteById(vacationId, enterpriseId)).rejects.toThrow('fallo delete');
    });
  });
});
