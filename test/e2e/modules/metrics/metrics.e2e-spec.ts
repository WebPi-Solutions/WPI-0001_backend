import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

const METRICS_DENIED_FOR_EMPLOYEE = [
  { path: '/metrics/invoices/subtotals-by-status', permission: 'invoices.read' },
  { path: '/metrics/spents/subtotals-by-status', permission: 'spents.read' },
  { path: '/metrics/quotes/subtotals-by-status', permission: 'quotes.read' },
  { path: '/metrics/users/counts-by-status', permission: 'users.read' },
  { path: '/metrics/clients/counts-by-type', permission: 'clients.read' },
  { path: '/metrics/suppliers/counts-by-type', permission: 'suppliers.read' },
  { path: '/metrics/invoice-series/list-counts', permission: 'invoiceSeries.read' },
  { path: '/metrics/ai-requests/counts-by-type', permission: 'aiRequests.read' },
  { path: '/metrics/invoices', permission: 'invoices.read' },
  { path: '/metrics/spents', permission: 'spents.read' },
  { path: '/metrics/invoices/yearly', permission: 'invoices.read' },
  { path: '/metrics/spents/yearly', permission: 'spents.read' },
] as const;

const METRICS_PATHS = METRICS_DENIED_FOR_EMPLOYEE.map((entry) => entry.path);

describe('Métricas (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  /**
   * Query extra que algunos endpoints de métricas exigen además de enterpriseId.
   *
   * @param path - Ruta de métricas
   * @returns Parámetros adicionales
   */
  const extraQueryForPath = (path: string): Record<string, string> => {
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
    return {};
  };

  it.each(METRICS_PATHS)('%s exige enterpriseId', async (path) => {
    const response = await http()
      .get(path)
      .query(extraQueryForPath(path))
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(400);
  });

  it.each(METRICS_PATHS)('%s rechaza la empresa B para el usuario A', async (path) => {
    const seed = getE2eSeed();
    const response = await http()
      .get(path)
      .query({ enterpriseId: seed.enterpriseB.id, ...extraQueryForPath(path) })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it.each(METRICS_DENIED_FOR_EMPLOYEE)(
    '$path es 403 para el empleado por $permission',
    async ({ path, permission }) => {
      const seed = getE2eSeed();
      const response = await http()
        .get(path)
        .query({ enterpriseId: seed.enterpriseA.id, ...extraQueryForPath(path) })
        .set(authHeader(E2E_EMAIL.employeeA));
      expect(response.status).toBe(403);
      expect(response.body.message).toBe(
        `No tiene permiso para realizar la acción ${permission}`,
      );
    },
  );

  it.each(METRICS_PATHS)('%s permite la empresa A al usuario A', async (path) => {
    const seed = getE2eSeed();
    const response = await http()
      .get(path)
      .query({ enterpriseId: seed.enterpriseA.id, ...extraQueryForPath(path) })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
  });
});
