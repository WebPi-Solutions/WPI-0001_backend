import { E2E_EMAIL, e2eRequest, enterpriseAQuery, enterpriseBQuery } from '@e2e/http-access';
import { E2eSeed } from '@e2e/seed';
import { getE2eSeed, startE2eWorld } from '@e2e/world';
import { http } from '@e2e/http';

/**
 * Listados de tenant que exigen `enterpriseId` y autenticación.
 */
const TENANT_LIST_PATHS = [
  '/clients',
  '/suppliers',
  '/invoices',
  '/quotes',
  '/spents',
  '/invoice-series',
  '/holidays',
  '/default-schedules',
  '/signings',
  '/vacations',
  '/work-schedules',
  '/recurrent-earnings',
  '/ai-requests',
  '/users',
  '/metrics/invoices/subtotals-by-status',
  '/metrics/spents/subtotals-by-status',
  '/metrics/quotes/subtotals-by-status',
  '/metrics/users/counts-by-status',
  '/metrics/clients/counts-by-type',
  '/metrics/suppliers/counts-by-type',
  '/metrics/invoices',
  '/metrics/spents',
  '/metrics/invoices/yearly',
  '/metrics/spents/yearly',
  '/metrics/invoice-series/list-counts',
] as const;

/**
 * Query extra que algunos listados de métricas exigen además de enterpriseId.
 *
 * @param path - Ruta
 * @returns Parámetros adicionales
 */
function extraQueryForPath(path: string): Record<string, string> {
  if (path.endsWith('/yearly')) {
    return { year: '2026' };
  }
  if (path === '/metrics/invoices' || path === '/metrics/spents') {
    return { startDate: '2026-01-01', endDate: '2026-12-31' };
  }
  if (path === '/metrics/invoice-series/list-counts') {
    return {
      monthFrom: '2026-09-01',
      monthTo: '2026-09-30',
      weekFrom: '2026-09-07',
      weekTo: '2026-09-13',
    };
  }
  if (path === '/users') {
    return { relations: 'userEnterprises' };
  }
  return {};
}

describe('Matriz HTTP de acceso (e2e)', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it.each(TENANT_LIST_PATHS)('%s sin Authorization es 401', async (path) => {
    const seed = getE2eSeed();
    const response = await e2eRequest('get', path, {
      query: { ...enterpriseAQuery(seed), ...extraQueryForPath(path) },
    });
    expect(response.status).toBe(401);
  });

  it.each(TENANT_LIST_PATHS)('%s sin enterpriseId es 400', async (path) => {
    const response = await e2eRequest('get', path, {
      email: E2E_EMAIL.userA,
      query: extraQueryForPath(path),
    });
    expect(response.status).toBe(400);
  });

  it.each(TENANT_LIST_PATHS)('%s con empresa B es 403 para el usuario A', async (path) => {
    const seed = getE2eSeed();
    const response = await e2eRequest('get', path, {
      email: E2E_EMAIL.userA,
      query: { ...enterpriseBQuery(seed), ...extraQueryForPath(path) },
    });
    expect(response.status).toBe(403);
  });

  it.each(TENANT_LIST_PATHS)('%s con empresa A es 200 para el usuario A', async (path) => {
    const seed = getE2eSeed();
    const response = await e2eRequest('get', path, {
      email: E2E_EMAIL.userA,
      query: { ...enterpriseAQuery(seed), ...extraQueryForPath(path) },
    });
    expect(response.status).toBe(200);
  });

  it.each(TENANT_LIST_PATHS)('%s con empresa A es 403 para un usuario sin empresas', async (path) => {
    const seed = getE2eSeed();
    const response = await e2eRequest('get', path, {
      email: E2E_EMAIL.outsider,
      query: { ...enterpriseAQuery(seed), ...extraQueryForPath(path) },
    });
    expect(response.status).toBe(403);
  });

  it('POST de recursos de tenant sin token es 401', async () => {
    const seed = getE2eSeed();
    const paths = [
      '/clients',
      '/suppliers',
      '/holidays',
      '/default-schedules',
      '/signings',
      '/vacations',
      '/work-schedules',
      '/ai-requests',
      '/recurrent-earnings',
      '/invoice-series',
      '/users',
    ];
    for (const path of paths) {
      const response = await e2eRequest('post', path, {
        query: enterpriseAQuery(seed),
        body: {},
      });
      expect(response.status).toBe(401);
    }
  });

  it('mutaciones GET/PATCH/DELETE por id sin token son 401', async () => {
    const seed = getE2eSeed();
    const paths = [
      `/clients/${seed.clientA.id}`,
      `/suppliers/${seed.supplierA.id}`,
      `/invoices/${seed.invoiceA.id}`,
      `/quotes/${seed.quoteA.id}`,
      `/spents/${seed.spentA.id}`,
      `/enterprises/${seed.enterpriseA.id}`,
      `/users/${seed.userA.id}`,
      `/holidays/${seed.holidayA.id}`,
      `/invoice-series/${seed.seriesA.id}`,
    ];
    for (const path of paths) {
      expect((await e2eRequest('get', path, { query: enterpriseAQuery(seed) })).status).toBe(401);
      expect((await e2eRequest('patch', path, { query: enterpriseAQuery(seed), body: {} })).status).toBe(401);
      expect((await e2eRequest('delete', path, { query: enterpriseAQuery(seed) })).status).toBe(401);
    }
  });

  it('token inválido o email desconocido es 401', async () => {
    const seed = getE2eSeed();
    const invalid = await http()
      .get('/clients')
      .query(enterpriseAQuery(seed))
      .set('Authorization', 'Bearer invalid-token');
    expect([401, 403]).toContain(invalid.status);

    const unknown = await http()
      .get('/clients')
      .query(enterpriseAQuery(seed))
      .set('Authorization', 'Bearer desconocido@e2e.test');
    expect([401, 403]).toContain(unknown.status);
  });

  it('GET / (salud) no exige Bearer', async () => {
    const response = await e2eRequest('get', '/');
    expect(response.status).toBe(200);
  });
});

/**
 * Recurso GET/PATCH/DELETE por id que exige `enterpriseId` en query.
 */
const BY_ID_REQUIRES_ENTERPRISE_ID: Array<{
  name: string;
  ownPath: (seed: E2eSeed) => string;
  foreignPath: (seed: E2eSeed) => string;
}> = [
  { name: 'festivo', ownPath: (seed) => `/holidays/${seed.holidayA.id}`, foreignPath: (seed) => `/holidays/${seed.holidayB.id}` },
  { name: 'plantilla', ownPath: (seed) => `/default-schedules/${seed.defaultScheduleA.id}`, foreignPath: (seed) => `/default-schedules/${seed.defaultScheduleB.id}` },
  { name: 'fichaje', ownPath: (seed) => `/signings/${seed.signingA.id}`, foreignPath: (seed) => `/signings/${seed.signingB.id}` },
  { name: 'vacación', ownPath: (seed) => `/vacations/${seed.vacationA.id}`, foreignPath: (seed) => `/vacations/${seed.vacationB.id}` },
  { name: 'horario', ownPath: (seed) => `/work-schedules/${seed.workScheduleA.id}`, foreignPath: (seed) => `/work-schedules/${seed.workScheduleB.id}` },
];

/**
 * Recurso GET por id sin `enterpriseId` (el servicio resuelve la empresa del propio registro).
 */
const BY_ID_RESOLVES_TENANT: Array<{
  name: string;
  ownPath: (seed: E2eSeed) => string;
  foreignPath: (seed: E2eSeed) => string;
}> = [
  { name: 'cliente', ownPath: (seed) => `/clients/${seed.clientA.id}`, foreignPath: (seed) => `/clients/${seed.clientB.id}` },
  { name: 'proveedor', ownPath: (seed) => `/suppliers/${seed.supplierA.id}`, foreignPath: (seed) => `/suppliers/${seed.supplierB.id}` },
  { name: 'factura', ownPath: (seed) => `/invoices/${seed.invoiceA.id}`, foreignPath: (seed) => `/invoices/${seed.invoiceB.id}` },
  { name: 'presupuesto', ownPath: (seed) => `/quotes/${seed.quoteA.id}`, foreignPath: (seed) => `/quotes/${seed.quoteB.id}` },
  { name: 'gasto', ownPath: (seed) => `/spents/${seed.spentA.id}`, foreignPath: (seed) => `/spents/${seed.spentB.id}` },
  { name: 'serie', ownPath: (seed) => `/invoice-series/${seed.seriesA.id}`, foreignPath: (seed) => `/invoice-series/${seed.seriesB.id}` },
  { name: 'recurrente', ownPath: (seed) => `/recurrent-earnings/${seed.recurrentA.id}`, foreignPath: (seed) => `/recurrent-earnings/${seed.recurrentB.id}` },
  { name: 'ia', ownPath: (seed) => `/ai-requests/${seed.aiRequestA.id}`, foreignPath: (seed) => `/ai-requests/${seed.aiRequestB.id}` },
  { name: 'empresa', ownPath: (seed) => `/enterprises/${seed.enterpriseA.id}`, foreignPath: (seed) => `/enterprises/${seed.enterpriseB.id}` },
  { name: 'usuario', ownPath: (seed) => `/users/${seed.userA.id}`, foreignPath: (seed) => `/users/${seed.userB.id}` },
];

describe('Matriz HTTP por id (e2e)', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it.each(BY_ID_REQUIRES_ENTERPRISE_ID)('$name GET sin token es 401', async ({ ownPath }) => {
    const seed = getE2eSeed();
    expect((await e2eRequest('get', ownPath(seed), { query: enterpriseAQuery(seed) })).status).toBe(401);
  });

  it.each(BY_ID_REQUIRES_ENTERPRISE_ID)('$name GET sin enterpriseId es 400', async ({ ownPath }) => {
    expect((await e2eRequest('get', ownPath(getE2eSeed()), { email: E2E_EMAIL.userA })).status).toBe(400);
  });

  it.each(BY_ID_REQUIRES_ENTERPRISE_ID)('$name GET con empresa B es 403 para el usuario A', async ({ ownPath }) => {
    const seed = getE2eSeed();
    expect(
      (await e2eRequest('get', ownPath(seed), { email: E2E_EMAIL.userA, query: enterpriseBQuery(seed) })).status,
    ).toBe(403);
  });

  it.each(BY_ID_REQUIRES_ENTERPRISE_ID)('$name GET propio es 200', async ({ ownPath }) => {
    const seed = getE2eSeed();
    expect(
      (await e2eRequest('get', ownPath(seed), { email: E2E_EMAIL.userA, query: enterpriseAQuery(seed) })).status,
    ).toBe(200);
  });

  it.each(BY_ID_REQUIRES_ENTERPRISE_ID)('$name GET de B con empresa A es 404', async ({ foreignPath }) => {
    const seed = getE2eSeed();
    expect(
      (await e2eRequest('get', foreignPath(seed), { email: E2E_EMAIL.userA, query: enterpriseAQuery(seed) })).status,
    ).toBe(404);
  });

  it.each(BY_ID_REQUIRES_ENTERPRISE_ID)('$name PATCH/DELETE sin enterpriseId es 400', async ({ ownPath }) => {
    const path = ownPath(getE2eSeed());
    expect((await e2eRequest('patch', path, { email: E2E_EMAIL.userA, body: {} })).status).toBe(400);
    expect((await e2eRequest('delete', path, { email: E2E_EMAIL.userA })).status).toBe(400);
  });

  it.each(BY_ID_RESOLVES_TENANT)('$name GET sin token es 401', async ({ ownPath }) => {
    expect((await e2eRequest('get', ownPath(getE2eSeed()))).status).toBe(401);
  });

  it.each(BY_ID_RESOLVES_TENANT)('$name GET propio es 200', async ({ ownPath }) => {
    expect((await e2eRequest('get', ownPath(getE2eSeed()), { email: E2E_EMAIL.userA })).status).toBe(200);
  });

  it.each(BY_ID_RESOLVES_TENANT)('$name GET de B es 404 para el usuario A', async ({ foreignPath }) => {
    expect((await e2eRequest('get', foreignPath(getE2eSeed()), { email: E2E_EMAIL.userA })).status).toBe(404);
  });
});

const BILLING_GET_PATHS = [
  '/billing/products-by-metadata',
  '/billing/products-signings-with-prices',
  '/billing/products-management-with-prices',
  '/billing/active-subscriptions',
] as const;

const BILLING_POST_PATHS = [
  '/billing/create-subscription-checkout-session',
  '/billing/update-subscription-price',
  '/billing/cancel-subscription-at-period-end',
  '/billing/revoke-cancel-subscription-at-period-end',
] as const;

describe('Matriz HTTP billing (e2e)', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it.each(BILLING_GET_PATHS)('%s sin token es 401', async (path) => {
    const seed = getE2eSeed();
    const query = path === '/billing/products-by-metadata'
      ? { metadataKey: 'type' }
      : path === '/billing/active-subscriptions'
        ? enterpriseAQuery(seed)
        : undefined;
    expect((await e2eRequest('get', path, { query })).status).toBe(401);
  });

  it.each(BILLING_POST_PATHS)('%s sin token es 401', async (path) => {
    const seed = getE2eSeed();
    expect(
      (
        await e2eRequest('post', path, {
          body: {
            enterpriseId: seed.enterpriseA.id,
            priceId: 'price_e2e',
            successUrl: 'https://app.test/ok',
            cancelUrl: 'https://app.test/ko',
            subscriptionId: 'sub_e2e_a',
          },
        })
      ).status,
    ).toBe(401);
  });

  it('catálogo y suscripciones propias son 200; empresa B es 403 en mutaciones', async () => {
    const seed = getE2eSeed();
    expect(
      (
        await e2eRequest('get', '/billing/products-by-metadata', {
          email: E2E_EMAIL.userA,
          query: { metadataKey: 'type' },
        })
      ).status,
    ).toBe(200);
    expect(
      (await e2eRequest('get', '/billing/products-signings-with-prices', { email: E2E_EMAIL.userA })).status,
    ).toBe(200);
    expect(
      (await e2eRequest('get', '/billing/products-management-with-prices', { email: E2E_EMAIL.userA })).status,
    ).toBe(200);
    expect(
      (
        await e2eRequest('get', '/billing/active-subscriptions', {
          email: E2E_EMAIL.userA,
          query: enterpriseAQuery(seed),
        })
      ).status,
    ).toBe(200);

    const checkoutForeign = await e2eRequest('post', '/billing/create-subscription-checkout-session', {
      email: E2E_EMAIL.userA,
      body: {
        enterpriseId: seed.enterpriseB.id,
        priceId: 'price_e2e',
        successUrl: 'https://app.test/ok',
        cancelUrl: 'https://app.test/ko',
      },
    });
    expect(checkoutForeign.status).toBe(403);
  });

  it('histórico de fichaje: 401, 400, 403, 200 y 404', async () => {
    const seed = getE2eSeed();
    const own = `/signings/${seed.signingA.id}/signing-updates`;
    const foreign = `/signings/${seed.signingB.id}/signing-updates`;
    expect((await e2eRequest('get', own, { query: enterpriseAQuery(seed) })).status).toBe(401);
    expect((await e2eRequest('get', own, { email: E2E_EMAIL.userA })).status).toBe(400);
    expect(
      (await e2eRequest('get', own, { email: E2E_EMAIL.userA, query: enterpriseBQuery(seed) })).status,
    ).toBe(403);
    expect(
      (await e2eRequest('get', own, { email: E2E_EMAIL.userA, query: enterpriseAQuery(seed) })).status,
    ).toBe(200);
    expect(
      (await e2eRequest('get', foreign, { email: E2E_EMAIL.userA, query: enterpriseAQuery(seed) })).status,
    ).toBe(404);
  });

  it('métricas de rango sin fechas o año son 400', async () => {
    const seed = getE2eSeed();
    expect(
      (
        await e2eRequest('get', '/metrics/invoices', {
          email: E2E_EMAIL.userA,
          query: enterpriseAQuery(seed),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await e2eRequest('get', '/metrics/invoices/yearly', {
          email: E2E_EMAIL.userA,
          query: enterpriseAQuery(seed),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await e2eRequest('get', '/metrics/spents', {
          email: E2E_EMAIL.userA,
          query: { ...enterpriseAQuery(seed), startDate: '2026-01-01' },
        })
      ).status,
    ).toBe(400);
  });

  it('gasto: descarga y borrado de archivo sin token es 401; IDOR es 404', async () => {
    const seed = getE2eSeed();
    expect((await e2eRequest('get', `/spents/${seed.spentA.id}/file/download`)).status).toBe(401);
    expect((await e2eRequest('delete', `/spents/${seed.spentA.id}/file`)).status).toBe(401);
    expect(
      (await e2eRequest('get', `/spents/${seed.spentB.id}/file/download`, { email: E2E_EMAIL.userA })).status,
    ).toBe(404);
  });
});

