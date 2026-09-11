import { QueryBuilderService } from './query-builder.service';

describe('QueryBuilderService', () => {
  /**
   * Crea un query builder de TypeORM simulado que encadena llamadas y registra filtros.
   * @param aliases - Alias de relaciones ya presentes en la consulta
   * @returns Query builder simulado
   */
  const createQueryBuilderMock = (aliases: Array<{ name: string }> = []) => {
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(2),
      getMany: jest.fn().mockResolvedValue([{ id: 'item-1' }]),
      expressionMap: { aliases },
    };

    return queryBuilder;
  };

  /**
   * Crea un repositorio simulado que entrega el query builder indicado.
   * @param queryBuilder - Query builder a devolver
   * @returns Repositorio TypeORM simulado
   */
  const createRepositoryMock = (queryBuilder: ReturnType<typeof createQueryBuilderMock>) => ({
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
  });

  it('aplica extraAndWhere, filtros de rango, ILIKE y paginación', async () => {
    const queryBuilder = createQueryBuilderMock();
    const repository = createRepositoryMock(queryBuilder);

    const result = await QueryBuilderService.getPaginatedResults(repository as never, 'spent', {
      page: 2,
      pageSize: 10,
      sort: 'issuedDate',
      order: 'DESC',
      extraAndWhere: { sql: 'spent.cancelled = :cancelled', parameters: { cancelled: false } },
      filter: {
        enterpriseId: 'enterprise-uuid',
        issuedDate_from: '2026-01-01',
        issuedDate_to: '2026-01-31',
        name_ilike: 'hosting',
        status: ['paid', 'pending'],
      },
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('spent.cancelled = :cancelled', {
      cancelled: false,
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'spent.issuedDate BETWEEN :issuedDate_from AND :issuedDate_to',
      { issuedDate_from: '2026-01-01', issuedDate_to: '2026-01-31' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'LOWER(spent.name) LIKE LOWER(:name_ilike_param)',
      { name_ilike_param: '%hosting%' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('spent.status IN (:...status)', {
      status: ['paid', 'pending'],
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('spent.enterpriseId = :enterpriseId', {
      enterpriseId: 'enterprise-uuid',
    });
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('spent.issuedDate', 'DESC');
    expect(queryBuilder.skip).toHaveBeenCalledWith(10);
    expect(queryBuilder.take).toHaveBeenCalledWith(10);
    expect(result).toEqual({
      items: [{ id: 'item-1' }],
      total: 2,
      currentPage: 2,
      totalPages: 1,
    });
  });

  it('traduce $or y valores nulos a condiciones SQL', async () => {
    const queryBuilder = createQueryBuilderMock();
    const repository = createRepositoryMock(queryBuilder);

    await QueryBuilderService.getPaginatedResults(repository as never, 'invoice', {
      page: 1,
      pageSize: 5,
      filter: {
        $or: [{ name: 'A' }, { nif: null }],
        seriesId: null,
      },
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '((invoice.name = :or_param_0) OR (invoice.nif IS NULL))',
      { or_param_0: 'A' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('invoice.seriesId IS NULL');
  });

  it('filtra por relación anidada cuando el alias existe', async () => {
    const queryBuilder = createQueryBuilderMock([{ name: 'userEnterprise' }]);
    const repository = createRepositoryMock(queryBuilder);

    await QueryBuilderService.getPaginatedResults(repository as never, 'vacation', {
      page: 1,
      pageSize: 10,
      filter: {
        'userEnterprise.enterpriseId': 'enterprise-uuid',
      },
      relations: [{ property: 'userEnterprise', alias: 'userEnterprise' }],
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'userEnterprise.enterpriseId = :userEnterprise_enterpriseId',
      { userEnterprise_enterpriseId: 'enterprise-uuid' },
    );
  });

  it('añade ordenación secundaria de serie y número en facturas', async () => {
    const queryBuilder = createQueryBuilderMock([{ name: 'series' }]);
    const repository = createRepositoryMock(queryBuilder);

    await QueryBuilderService.getPaginatedResults(repository as never, 'invoice', {
      page: 1,
      pageSize: 10,
      sort: 'issuedDate',
      order: 'DESC',
      relations: [{ property: 'series', alias: 'series' }],
    });

    expect(queryBuilder.orderBy).toHaveBeenCalledWith('invoice.issuedDate', 'DESC');
    expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('series.series', 'ASC');
    expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('invoice.seriesNumber', 'DESC');
  });

  it('cuenta aplicando joins sin seleccionar relaciones', async () => {
    const queryBuilder = createQueryBuilderMock();
    const repository = createRepositoryMock(queryBuilder);

    await QueryBuilderService.getCount(repository as never, 'holiday', { enterpriseId: 'enterprise-uuid' }, [
      { property: 'enterprise', alias: 'enterprise' },
    ]);

    expect(queryBuilder.leftJoin).toHaveBeenCalledWith('holiday.enterprise', 'enterprise');
    expect(queryBuilder.leftJoinAndSelect).not.toHaveBeenCalled();
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('holiday.enterpriseId = :enterpriseId', {
      enterpriseId: 'enterprise-uuid',
    });
  });

  it('cuenta sin filtros ni relaciones y sin aplicar where', async () => {
    const queryBuilder = createQueryBuilderMock();
    const repository = createRepositoryMock(queryBuilder);

    const total = await QueryBuilderService.getCount(repository as never, 'client');

    expect(queryBuilder.leftJoin).not.toHaveBeenCalled();
    expect(queryBuilder.andWhere).not.toHaveBeenCalled();
    expect(total).toBe(2);
  });

  it('cuenta con filtro vacío y relaciones vacías sin joins ni where', async () => {
    const queryBuilder = createQueryBuilderMock();
    const repository = createRepositoryMock(queryBuilder);

    await QueryBuilderService.getCount(repository as never, 'client', {}, []);

    expect(queryBuilder.leftJoin).not.toHaveBeenCalled();
    expect(queryBuilder.andWhere).not.toHaveBeenCalled();
  });

  it('pagina sin sort, sin filter y con extraAndWhere vacío', async () => {
    const queryBuilder = createQueryBuilderMock();
    const repository = createRepositoryMock(queryBuilder);

    const result = await QueryBuilderService.getPaginatedResults(repository as never, 'client', {
      page: 1,
      pageSize: 10,
      extraAndWhere: { sql: '' },
    });

    expect(queryBuilder.orderBy).not.toHaveBeenCalled();
    expect(queryBuilder.andWhere).not.toHaveBeenCalled();
    expect(queryBuilder.skip).toHaveBeenCalledWith(0);
    expect(result.currentPage).toBe(1);
  });

  it('usa orden ASC por defecto cuando no se indica order', async () => {
    const queryBuilder = createQueryBuilderMock();
    const repository = createRepositoryMock(queryBuilder);

    await QueryBuilderService.getPaginatedResults(repository as never, 'client', {
      page: 1,
      pageSize: 5,
      sort: 'name',
    });

    expect(queryBuilder.orderBy).toHaveBeenCalledWith('client.name', 'ASC');
  });

  it('aplica leftJoin simple, selectFields y evita duplicar la misma relación', async () => {
    const queryBuilder = createQueryBuilderMock();
    const repository = createRepositoryMock(queryBuilder);

    await QueryBuilderService.getPaginatedResults(repository as never, 'invoice', {
      page: 1,
      pageSize: 10,
      relations: [
        {
          property: 'client',
          alias: 'client',
          isLeftJoinAndSelect: false,
          selectFields: ['id', 'name'],
        },
        { property: 'client', alias: 'clientDuplicado', isLeftJoinAndSelect: false },
      ],
    });

    expect(queryBuilder.leftJoin).toHaveBeenCalledTimes(1);
    expect(queryBuilder.leftJoin).toHaveBeenCalledWith('invoice.client', 'client');
    expect(queryBuilder.addSelect).toHaveBeenCalledWith(['client.id', 'client.name']);
  });

  it('aplica leftJoinAndSelect por defecto y relaciones anidadas con alias con punto', async () => {
    const queryBuilder = createQueryBuilderMock();
    const repository = createRepositoryMock(queryBuilder);

    await QueryBuilderService.getPaginatedResults(repository as never, 'vacation', {
      page: 1,
      pageSize: 10,
      relations: [
        { property: 'userEnterprise', alias: 'userEnterprise' },
        {
          property: 'userEnterprise.user',
          alias: 'userEnterprise.user',
          selectFields: ['id', 'name'],
        },
      ],
    });

    expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
      'vacation.userEnterprise',
      'userEnterprise',
    );
    expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('userEnterprise.user', 'user');
    expect(queryBuilder.addSelect).toHaveBeenCalledWith(['user.id', 'user.name']);
  });

  it('crea el join padre al aplicar solo una relación anidada y usa leftJoin si se pide', async () => {
    const queryBuilder = createQueryBuilderMock();
    const repository = createRepositoryMock(queryBuilder);

    await QueryBuilderService.getPaginatedResults(repository as never, 'vacation', {
      page: 1,
      pageSize: 10,
      relations: [
        {
          property: 'userEnterprise.enterprise',
          alias: 'enterpriseNested',
          isLeftJoinAndSelect: false,
        },
        {
          property: 'userEnterprise.enterprise',
          alias: 'enterpriseDuplicado',
          isLeftJoinAndSelect: false,
        },
      ],
    });

    expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
      'vacation.userEnterprise',
      'userEnterprise',
    );
    expect(queryBuilder.leftJoin).toHaveBeenCalledWith(
      'userEnterprise.enterprise',
      'userEnterprise_enterprise',
    );
    expect(queryBuilder.leftJoin).toHaveBeenCalledTimes(1);
  });

  it('traduce $and, $or no array, arrays IN y valores nulos anidados', async () => {
    const queryBuilder = createQueryBuilderMock([{ name: 'client' }]);
    const repository = createRepositoryMock(queryBuilder);

    await QueryBuilderService.getPaginatedResults(repository as never, 'invoice', {
      page: 1,
      pageSize: 10,
      filter: {
        $or: { ignored: true },
        $and: [{ status: 'issued' }, { 'client.id': null }],
        tags: ['a', 'b'],
        cancelledAt: undefined,
        'client.name': ['Acme', 'Beta'],
      },
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('invoice.status = :status', {
      status: 'issued',
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('client.id IS NULL');
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('invoice.tags IN (:...tags)', {
      tags: ['a', 'b'],
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('invoice.cancelledAt IS NULL');
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('client.name IN (:...client_name)', {
      client_name: ['Acme', 'Beta'],
    });
  });

  it('aplica $or con arrays, nulos y propiedades anidadas', async () => {
    const queryBuilder = createQueryBuilderMock();
    const repository = createRepositoryMock(queryBuilder);

    await QueryBuilderService.getPaginatedResults(repository as never, 'invoice', {
      page: 1,
      pageSize: 10,
      filter: {
        $or: [
          { status: ['issued', 'paid'] },
          { 'client.name': 'Acme' },
          { seriesId: null },
          {},
        ],
      },
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '((invoice.status IN (:...or_param_0)) OR (invoice.client.name = :or_param_1) OR (invoice.seriesId IS NULL))',
      {
        or_param_0: ['issued', 'paid'],
        or_param_1: 'Acme',
      },
    );
  });

  it('aplica $or con IN y IS NULL sobre claves anidadas', async () => {
    const queryBuilder = createQueryBuilderMock();
    const repository = createRepositoryMock(queryBuilder);

    await QueryBuilderService.getPaginatedResults(repository as never, 'invoice', {
      page: 1,
      pageSize: 10,
      filter: {
        $or: [
          { 'client.id': ['client-a', 'client-b'] },
          { 'client.name': null },
          { 'series.id': undefined },
        ],
      },
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '((invoice.client.id IN (:...or_param_0)) OR (invoice.client.name IS NULL) OR (invoice.series.id IS NULL))',
      {
        or_param_0: ['client-a', 'client-b'],
      },
    );
  });

  it('ignora $or vacío y $and que no es array', async () => {
    const queryBuilder = createQueryBuilderMock();
    const repository = createRepositoryMock(queryBuilder);

    await QueryBuilderService.getPaginatedResults(repository as never, 'spent', {
      page: 1,
      pageSize: 10,
      filter: {
        $or: [],
        $and: { ignored: true },
        name: 'hosting',
      },
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledTimes(1);
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('spent.name = :name', { name: 'hosting' });
  });

  it('filtra solo por fecha desde, solo hasta y LIKE simple', async () => {
    const queryBuilder = createQueryBuilderMock();
    const repository = createRepositoryMock(queryBuilder);

    await QueryBuilderService.getPaginatedResults(repository as never, 'spent', {
      page: 1,
      pageSize: 10,
      filter: {
        issuedDate_from: '2026-01-01',
        createdAt_to: '2026-01-31',
        name_like: 'host',
      },
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('spent.issuedDate >= :issuedDate_from', {
      issuedDate_from: '2026-01-01',
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('spent.createdAt <= :createdAt_to', {
      createdAt_to: '2026-01-31',
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('spent.name LIKE :name_like_param', {
      name_like_param: '%host%',
    });
  });

  it('aplica LIKE e ILIKE sobre relación y sobre JSON', async () => {
    const queryBuilder = createQueryBuilderMock([{ name: 'client' }]);
    const repository = createRepositoryMock(queryBuilder);

    await QueryBuilderService.getPaginatedResults(repository as never, 'invoice', {
      page: 1,
      pageSize: 10,
      filter: {
        'client.name_like': 'acme',
        'client.name_ilike': 'acme',
        'address.province_like': 'madrid',
        'address.province_ilike': 'madrid',
      },
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('client.name LIKE :client_name_like_param', {
      client_name_like_param: '%acme%',
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'LOWER(client.name) LIKE LOWER(:client_name_ilike_param)',
      { client_name_ilike_param: '%acme%' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '(invoice.address).province LIKE :address_province_like_param',
      { address_province_like_param: '%madrid%' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'LOWER((invoice.address).province) LIKE LOWER(:address_province_ilike_param)',
      { address_province_ilike_param: '%madrid%' },
    );
  });

  it('filtra JSON anidado por IN, igualdad y IS NULL', async () => {
    const queryBuilder = createQueryBuilderMock();
    const repository = createRepositoryMock(queryBuilder);

    await QueryBuilderService.getPaginatedResults(repository as never, 'client', {
      page: 1,
      pageSize: 10,
      filter: {
        'address.province': ['Madrid', 'Barcelona'],
        'address.city': 'Valencia',
        'address.country': null,
      },
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '(client.address).province IN (:...address_province)',
      { address_province: ['Madrid', 'Barcelona'] },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('(client.address).city = :address_city', {
      address_city: 'Valencia',
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('(client.address).country IS NULL');
  });

  it('filtra relación anidada por valor único', async () => {
    const queryBuilder = createQueryBuilderMock([{ name: 'series' }]);
    const repository = createRepositoryMock(queryBuilder);

    await QueryBuilderService.getPaginatedResults(repository as never, 'invoice', {
      page: 1,
      pageSize: 10,
      filter: {
        'series.id': 'series-uuid',
      },
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('series.id = :series_id', {
      series_id: 'series-uuid',
    });
  });

  it('ordena por JSON anidado y por relación sin serie secundaria', async () => {
    const queryBuilder = createQueryBuilderMock([{ name: 'client' }]);
    const repository = createRepositoryMock(queryBuilder);

    await QueryBuilderService.getPaginatedResults(repository as never, 'invoice', {
      page: 1,
      pageSize: 10,
      sort: 'client.name',
      order: 'ASC',
    });

    expect(queryBuilder.orderBy).toHaveBeenCalledWith('client.name', 'ASC');
    expect(queryBuilder.addOrderBy).not.toHaveBeenCalled();

    queryBuilder.orderBy.mockClear();
    await QueryBuilderService.getPaginatedResults(repository as never, 'client', {
      page: 1,
      pageSize: 10,
      sort: 'address.province',
      order: 'DESC',
    });

    expect(queryBuilder.orderBy).toHaveBeenCalledWith('(client.address).province', 'DESC');
  });

  it('añade ordenación secundaria de serie al ordenar factura por relación', async () => {
    const queryBuilder = createQueryBuilderMock([{ name: 'client' }, { name: 'series' }]);
    const repository = createRepositoryMock(queryBuilder);

    await QueryBuilderService.getPaginatedResults(repository as never, 'invoice', {
      page: 1,
      pageSize: 10,
      sort: 'client.name',
      order: 'ASC',
    });

    expect(queryBuilder.orderBy).toHaveBeenCalledWith('client.name', 'ASC');
    expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('series.series', 'ASC');
    expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('invoice.seriesNumber', 'DESC');
  });

  it('ordena factura simple sin añadir serie si la relación no está cargada', async () => {
    const queryBuilder = createQueryBuilderMock();
    const repository = createRepositoryMock(queryBuilder);

    await QueryBuilderService.getPaginatedResults(repository as never, 'invoice', {
      page: 1,
      pageSize: 10,
      sort: 'issuedDate',
      order: 'DESC',
    });

    expect(queryBuilder.orderBy).toHaveBeenCalledWith('invoice.issuedDate', 'DESC');
    expect(queryBuilder.addOrderBy).not.toHaveBeenCalled();
  });
});
