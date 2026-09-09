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
});
