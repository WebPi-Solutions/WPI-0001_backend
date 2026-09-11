import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

/**
 * Rutas de tenant que un usuario autenticado sin empresas no puede usar.
 */
const TENANT_GET_PATHS = [
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
  '/enterprise-roles',
  '/enterprise-roles/catalog',
  '/metrics/invoices/subtotals-by-status',
  '/metrics/ai-requests/counts-by-type',
] as const;

describe('Usuario sin empresas (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it.each(TENANT_GET_PATHS)(
    '%s con enterpriseId de A es 403 para quien no tiene vínculo',
    async (path) => {
      const seed = getE2eSeed();
      const response = await http()
        .get(path)
        .query({ enterpriseId: seed.enterpriseA.id })
        .set(authHeader(E2E_EMAIL.outsider));
      expect(response.status).toBe(403);
    },
  );

  it('no lee por UUID recursos de A (IDOR 404)', async () => {
    const seed = getE2eSeed();
    const client = await http()
      .get(`/clients/${seed.clientA.id}`)
      .set(authHeader(E2E_EMAIL.outsider));
    expect(client.status).toBe(404);
    const invoice = await http()
      .get(`/invoices/${seed.invoiceA.id}`)
      .set(authHeader(E2E_EMAIL.outsider));
    expect(invoice.status).toBe(404);
    const enterprise = await http()
      .get(`/enterprises/${seed.enterpriseA.id}`)
      .set(authHeader(E2E_EMAIL.outsider));
    expect(enterprise.status).toBe(404);
  });

  it('sí puede leer su propio perfil y el catálogo Stripe (skip de empresa)', async () => {
    const myself = await http().get('/users/myself').set(authHeader(E2E_EMAIL.outsider));
    expect(myself.status).toBe(200);
    expect(myself.body.email).toBe(E2E_EMAIL.outsider);
    const catalog = await http()
      .get('/billing/products-signings-with-prices')
      .set(authHeader(E2E_EMAIL.outsider));
    expect(catalog.status).toBe(200);
  });
});
