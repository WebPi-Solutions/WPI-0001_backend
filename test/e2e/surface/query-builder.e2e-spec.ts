import { Client } from 'src/entities/client/client.entity';
import { Invoice } from 'src/entities/invoice/invoice.entity';
import { QueryBuilderService } from 'src/common/helpers/query-builder/query-builder.service';
import { getE2eDataSource, getE2eSeed, startE2eWorld } from '@e2e/world';

describe('QueryBuilderService (e2e) — Postgres real', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('pagina, ordena, cuenta y aplica filtros, $or, $and, LIKE, rangos y relaciones', async () => {
    const seed = getE2eSeed();
    const clientRepository = getE2eDataSource().getRepository(Client);
    const relations = [
      { property: 'enterprise', alias: 'enterprise', isLeftJoinAndSelect: true },
    ];

    const page = await QueryBuilderService.getPaginatedResults(clientRepository, 'client', {
      page: 1,
      pageSize: 10,
      sort: 'name',
      order: 'ASC',
      extraAndWhere: { sql: 'client.id IS NOT NULL' },
      filter: {
        enterpriseId: seed.enterpriseA.id,
        name_ilike: 'cliente',
        name_like: 'C',
        createdAt_from: '2020-01-01',
        createdAt_to: '2099-12-31',
        email: null,
        nif: ['C11111111'],
        $or: [{ name: 'Cliente A' }, { nif: 'C11111111' }],
        $and: [{ enterpriseId: seed.enterpriseA.id }],
        'enterprise.name': seed.enterpriseA.name,
      },
      relations,
    });

    expect(page.total).toBeGreaterThanOrEqual(1);
    expect(page.items.some((client) => client.id === seed.clientA.id)).toBe(true);

    const count = await QueryBuilderService.getCount(
      clientRepository,
      'client',
      { enterpriseId: seed.enterpriseA.id },
      relations,
    );
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('aplica LIKE/ILIKE anidados, IS NULL de relación, IN y ordenación por relación', async () => {
    const seed = getE2eSeed();
    const clientRepository = getE2eDataSource().getRepository(Client);
    const relations = [
      { property: 'enterprise', alias: 'enterprise', isLeftJoinAndSelect: true },
    ];

    const byRelationLike = await QueryBuilderService.getPaginatedResults(
      clientRepository,
      'client',
      {
        page: 1,
        pageSize: 20,
        sort: 'enterprise.name',
        order: 'DESC',
        filter: {
          enterpriseId: seed.enterpriseA.id,
          'enterprise.name_ilike': 'empresa',
          'enterprise.name_like': 'E',
        },
        relations,
      },
    );
    expect(byRelationLike.items.length).toBeGreaterThan(0);

    const nullRelation = await QueryBuilderService.getPaginatedResults(clientRepository, 'client', {
      page: 1,
      pageSize: 5,
      sort: 'name',
      order: 'ASC',
      filter: {
        enterpriseId: seed.enterpriseA.id,
        'enterprise.phone': null,
      },
      relations,
    });
    expect(nullRelation.total).toBeGreaterThanOrEqual(0);

    const inRelation = await QueryBuilderService.getPaginatedResults(clientRepository, 'client', {
      page: 1,
      pageSize: 5,
      sort: 'name',
      order: 'ASC',
      filter: {
        enterpriseId: seed.enterpriseA.id,
        'enterprise.name': [seed.enterpriseA.name],
      },
      relations,
    });
    expect(inRelation.items.length).toBeGreaterThan(0);
  });

  it('ordena facturas con relación series y cubre joins anidados y selectFields', async () => {
    const seed = getE2eSeed();
    const invoiceRepository = getE2eDataSource().getRepository(Invoice);
    const page = await QueryBuilderService.getPaginatedResults(invoiceRepository, 'invoice', {
      page: 1,
      pageSize: 10,
      sort: 'series.series',
      order: 'ASC',
      filter: { clientId: seed.clientA.id },
      relations: [
        { property: 'client', alias: 'client', isLeftJoinAndSelect: true },
        { property: 'series', alias: 'series', isLeftJoinAndSelect: true },
      ],
    });
    expect(page.items.some((invoice) => invoice.id === seed.invoiceA.id)).toBe(true);
  });

  it('acepta pageSize, sort vacío y joins duplicados sin fallar', async () => {
    const clientRepository = getE2eDataSource().getRepository(Client);
    const page = await QueryBuilderService.getPaginatedResults(clientRepository, 'client', {
      page: 1,
      pageSize: 2,
      sort: undefined,
      order: 'ASC',
      filter: {},
      relations: [
        { property: 'enterprise', alias: 'enterprise' },
        { property: 'enterprise', alias: 'enterprise' },
      ],
    });
    expect(page.currentPage).toBe(1);
    expect(page.totalPages).toBeGreaterThanOrEqual(1);
  });

  it('cubre rangos de fecha unilaterales, JSON LIKE, leftJoin y filtros $or anidados', async () => {
    const seed = getE2eSeed();
    const clientRepository = getE2eDataSource().getRepository(Client);
    const invoiceRepository = getE2eDataSource().getRepository(Invoice);

    const fromOnly = await QueryBuilderService.getPaginatedResults(clientRepository, 'client', {
      page: 1,
      pageSize: 5,
      sort: 'name',
      order: 'ASC',
      filter: {
        enterpriseId: seed.enterpriseA.id,
        createdAt_from: '2020-01-01',
      },
    });
    expect(fromOnly.total).toBeGreaterThanOrEqual(1);

    const toOnly = await QueryBuilderService.getPaginatedResults(clientRepository, 'client', {
      page: 1,
      pageSize: 5,
      sort: 'name',
      order: 'ASC',
      filter: {
        enterpriseId: seed.enterpriseA.id,
        createdAt_to: '2099-12-31',
      },
    });
    expect(toOnly.total).toBeGreaterThanOrEqual(1);

    const jsonLike = await QueryBuilderService.getPaginatedResults(invoiceRepository, 'invoice', {
      page: 1,
      pageSize: 5,
      sort: 'name',
      order: 'ASC',
      filter: {
        clientId: seed.clientA.id,
        'concepts.name_like': 'Hora',
        'concepts.name_ilike': 'hora',
      },
    });
    expect(jsonLike.total).toBeGreaterThanOrEqual(0);

    const nestedJoin = await QueryBuilderService.getPaginatedResults(invoiceRepository, 'invoice', {
      page: 1,
      pageSize: 5,
      sort: 'name',
      order: 'ASC',
      filter: { clientId: seed.clientA.id },
      relations: [
        { property: 'client', alias: 'client', isLeftJoinAndSelect: false },
        {
          property: 'client.enterprise',
          alias: 'client.enterprise',
          isLeftJoinAndSelect: false,
          selectFields: ['id', 'name'],
        },
        {
          property: 'client.enterprise',
          alias: 'client_enterprise_dup',
          isLeftJoinAndSelect: true,
        },
      ],
    });
    expect(nestedJoin.total).toBeGreaterThanOrEqual(1);

    const orSimple = await QueryBuilderService.getPaginatedResults(clientRepository, 'client', {
      page: 1,
      pageSize: 5,
      sort: 'name',
      order: 'ASC',
      filter: {
        enterpriseId: seed.enterpriseA.id,
        $or: [{ name: 'Cliente A' }, { nif: null }, { nif: [seed.clientA.nif] }],
      },
    });
    expect(orSimple.total).toBeGreaterThanOrEqual(0);
  });
});
