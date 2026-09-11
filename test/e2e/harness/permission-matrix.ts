import { E2eHttpMethod } from './http-access';
import { E2eSeed } from './seed';
import { E2E_EMAIL } from './auth';

/**
 * Caso e2e de denegación RBAC: miembro de la empresa A con rol Empleado (`{}`).
 * El guard o el servicio deben responder 403 con el permiso denegado.
 */
export interface DeniedPermissionCase {
  /** Descripción para el título del test. */
  name: string;
  /** Verbo HTTP. */
  method: E2eHttpMethod;
  /**
   * Construye la ruta a partir de la semilla.
   *
   * @param seed - Dataset e2e
   * @returns Ruta absoluta
   */
  path: (seed: E2eSeed) => string;
  /** Clave `recurso.acción` que debe figurar en el mensaje 403. */
  permission: string;
  /**
   * Query opcional (habitualmente `enterpriseId` de A para que el guard evalúe ya).
   *
   * @param seed - Dataset e2e
   * @returns Parámetros de query
   */
  query?: (seed: E2eSeed) => Record<string, string>;
  /**
   * Cuerpo opcional de POST/PATCH.
   *
   * @param seed - Dataset e2e
   * @returns JSON enviado
   */
  body?: (seed: E2eSeed) => Record<string, unknown>;
}

/**
 * Query de tenant de la empresa A.
 *
 * @param seed - Dataset e2e
 * @returns `enterpriseId` de A
 */
function enterpriseAQuery(seed: E2eSeed): { enterpriseId: string } {
  return { enterpriseId: seed.enterpriseA.id };
}

/**
 * Query extra de métricas de rango o anuales.
 *
 * @param path - Ruta de métricas
 * @returns Parámetros adicionales
 */
export function extraMetricsQueryForPath(path: string): Record<string, string> {
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
}

/**
 * Todos los endpoints con `@RequirePermission` (y listados que evalúan RBAC en servicio).
 * El empleado de A debe recibir 403 en cada uno.
 */
export const DENIED_PERMISSION_CASES: DeniedPermissionCase[] = [
  {
    name: 'GET /clients',
    method: 'get',
    path: () => '/clients',
    permission: 'clients.read',
    query: enterpriseAQuery,
  },
  {
    name: 'POST /clients',
    method: 'post',
    path: () => '/clients',
    permission: 'clients.write',
    query: enterpriseAQuery,
    body: () => ({ name: 'Intruso empleado', nif: 'E00000001' }),
  },
  {
    name: 'GET /clients/:id',
    method: 'get',
    path: (seed) => `/clients/${seed.clientA.id}`,
    permission: 'clients.read',
  },
  {
    name: 'PATCH /clients/:id',
    method: 'patch',
    path: (seed) => `/clients/${seed.clientA.id}`,
    permission: 'clients.write',
    query: enterpriseAQuery,
    body: () => ({ name: 'Hackeado' }),
  },
  {
    name: 'DELETE /clients/:id',
    method: 'delete',
    path: (seed) => `/clients/${seed.clientA.id}`,
    permission: 'clients.delete',
    query: enterpriseAQuery,
  },
  {
    name: 'GET /suppliers',
    method: 'get',
    path: () => '/suppliers',
    permission: 'suppliers.read',
    query: enterpriseAQuery,
  },
  {
    name: 'POST /suppliers',
    method: 'post',
    path: () => '/suppliers',
    permission: 'suppliers.write',
    query: enterpriseAQuery,
    body: () => ({ name: 'Intruso empleado', nif: 'E00000002' }),
  },
  {
    name: 'GET /suppliers/:id',
    method: 'get',
    path: (seed) => `/suppliers/${seed.supplierA.id}`,
    permission: 'suppliers.read',
  },
  {
    name: 'PATCH /suppliers/:id',
    method: 'patch',
    path: (seed) => `/suppliers/${seed.supplierA.id}`,
    permission: 'suppliers.write',
    query: enterpriseAQuery,
    body: () => ({ name: 'Hackeado' }),
  },
  {
    name: 'DELETE /suppliers/:id',
    method: 'delete',
    path: (seed) => `/suppliers/${seed.supplierA.id}`,
    permission: 'suppliers.delete',
    query: enterpriseAQuery,
  },
  {
    name: 'GET /invoices',
    method: 'get',
    path: () => '/invoices',
    permission: 'invoices.read',
    query: enterpriseAQuery,
  },
  {
    name: 'POST /invoices',
    method: 'post',
    path: () => '/invoices',
    permission: 'invoices.write',
    query: enterpriseAQuery,
    body: (seed) => ({ clientId: seed.clientA.id, seriesId: seed.seriesA.id, name: 'Intrusa' }),
  },
  {
    name: 'GET /invoices/:id',
    method: 'get',
    path: (seed) => `/invoices/${seed.invoiceA.id}`,
    permission: 'invoices.read',
  },
  {
    name: 'PATCH /invoices/:id',
    method: 'patch',
    path: (seed) => `/invoices/${seed.invoiceA.id}`,
    permission: 'invoices.write',
    query: enterpriseAQuery,
    body: () => ({ name: 'Hackeada' }),
  },
  {
    name: 'PATCH /invoices/:id/status',
    method: 'patch',
    path: (seed) => `/invoices/${seed.invoiceA.id}/status`,
    permission: 'invoices.write',
    query: enterpriseAQuery,
    body: () => ({ status: 'issued' }),
  },
  {
    name: 'DELETE /invoices/:id',
    method: 'delete',
    path: (seed) => `/invoices/${seed.invoiceA.id}`,
    permission: 'invoices.delete',
    query: enterpriseAQuery,
  },
  {
    name: 'GET /quotes',
    method: 'get',
    path: () => '/quotes',
    permission: 'quotes.read',
    query: enterpriseAQuery,
  },
  {
    name: 'POST /quotes',
    method: 'post',
    path: () => '/quotes',
    permission: 'quotes.write',
    query: enterpriseAQuery,
    body: (seed) => ({ clientId: seed.clientA.id, name: 'Intruso' }),
  },
  {
    name: 'GET /quotes/:id',
    method: 'get',
    path: (seed) => `/quotes/${seed.quoteA.id}`,
    permission: 'quotes.read',
  },
  {
    name: 'PATCH /quotes/:id',
    method: 'patch',
    path: (seed) => `/quotes/${seed.quoteA.id}`,
    permission: 'quotes.write',
    query: enterpriseAQuery,
    body: () => ({ name: 'Hackeado' }),
  },
  {
    name: 'PATCH /quotes/:id/status',
    method: 'patch',
    path: (seed) => `/quotes/${seed.quoteA.id}/status`,
    permission: 'quotes.write',
    query: enterpriseAQuery,
    body: () => ({ status: 'issued' }),
  },
  {
    name: 'DELETE /quotes/:id',
    method: 'delete',
    path: (seed) => `/quotes/${seed.quoteA.id}`,
    permission: 'quotes.delete',
    query: enterpriseAQuery,
  },
  {
    name: 'GET /invoice-series',
    method: 'get',
    path: () => '/invoice-series',
    permission: 'invoiceSeries.read',
    query: enterpriseAQuery,
  },
  {
    name: 'POST /invoice-series',
    method: 'post',
    path: () => '/invoice-series',
    permission: 'invoiceSeries.write',
    query: enterpriseAQuery,
    body: () => ({ series: 'Z', description: 'Intrusa' }),
  },
  {
    name: 'GET /invoice-series/:id',
    method: 'get',
    path: (seed) => `/invoice-series/${seed.seriesA.id}`,
    permission: 'invoiceSeries.read',
  },
  {
    name: 'PATCH /invoice-series/:id',
    method: 'patch',
    path: (seed) => `/invoice-series/${seed.seriesA.id}`,
    permission: 'invoiceSeries.write',
    query: enterpriseAQuery,
    body: () => ({ description: 'Hackeada' }),
  },
  {
    name: 'DELETE /invoice-series/:id',
    method: 'delete',
    path: (seed) => `/invoice-series/${seed.seriesA.id}`,
    permission: 'invoiceSeries.delete',
    query: enterpriseAQuery,
  },
  {
    name: 'GET /recurrent-earnings',
    method: 'get',
    path: () => '/recurrent-earnings',
    permission: 'recurrentEarnings.read',
    query: enterpriseAQuery,
  },
  {
    name: 'POST /recurrent-earnings',
    method: 'post',
    path: () => '/recurrent-earnings',
    permission: 'recurrentEarnings.write',
    query: enterpriseAQuery,
    body: (seed) => ({
      invoiceSerieId: seed.seriesA.id,
      clientId: seed.clientA.id,
      type: 'monthly',
      name: 'Intrusa',
    }),
  },
  {
    name: 'GET /recurrent-earnings/:id',
    method: 'get',
    path: (seed) => `/recurrent-earnings/${seed.recurrentA.id}`,
    permission: 'recurrentEarnings.read',
  },
  {
    name: 'PATCH /recurrent-earnings/:id',
    method: 'patch',
    path: (seed) => `/recurrent-earnings/${seed.recurrentA.id}`,
    permission: 'recurrentEarnings.write',
    query: enterpriseAQuery,
    body: () => ({ name: 'Hackeada' }),
  },
  {
    name: 'DELETE /recurrent-earnings/:id',
    method: 'delete',
    path: (seed) => `/recurrent-earnings/${seed.recurrentA.id}`,
    permission: 'recurrentEarnings.delete',
    query: enterpriseAQuery,
  },
  {
    name: 'GET /spents',
    method: 'get',
    path: () => '/spents',
    permission: 'spents.read',
    query: enterpriseAQuery,
  },
  {
    name: 'POST /spents',
    method: 'post',
    path: () => '/spents',
    permission: 'spents.write',
    query: enterpriseAQuery,
    body: (seed) => ({ supplierId: seed.supplierA.id, name: 'Intruso' }),
  },
  {
    name: 'POST /spents/file',
    method: 'post',
    path: () => '/spents/file',
    permission: 'spents.write',
    query: (seed) => ({ ...enterpriseAQuery(seed), spentId: seed.spentA.id }),
  },
  {
    name: 'POST /spents/ai/file',
    method: 'post',
    path: () => '/spents/ai/file',
    permission: 'spents.write',
    query: enterpriseAQuery,
  },
  {
    name: 'GET /spents/:id',
    method: 'get',
    path: (seed) => `/spents/${seed.spentA.id}`,
    permission: 'spents.read',
  },
  {
    name: 'PATCH /spents/:id',
    method: 'patch',
    path: (seed) => `/spents/${seed.spentA.id}`,
    permission: 'spents.write',
    query: enterpriseAQuery,
    body: () => ({ name: 'Hackeado' }),
  },
  {
    name: 'DELETE /spents/:id',
    method: 'delete',
    path: (seed) => `/spents/${seed.spentA.id}`,
    permission: 'spents.delete',
    query: enterpriseAQuery,
  },
  {
    name: 'GET /spents/:id/file/download',
    method: 'get',
    path: (seed) => `/spents/${seed.spentA.id}/file/download`,
    permission: 'spents.read',
    query: enterpriseAQuery,
  },
  {
    name: 'DELETE /spents/:id/file',
    method: 'delete',
    path: (seed) => `/spents/${seed.spentA.id}/file`,
    permission: 'spents.delete',
    query: enterpriseAQuery,
  },
  {
    name: 'GET /users',
    method: 'get',
    path: () => '/users',
    permission: 'users.read',
    query: (seed) => ({ ...enterpriseAQuery(seed), relations: 'userEnterprises' }),
  },
  {
    name: 'POST /users',
    method: 'post',
    path: () => '/users',
    permission: 'users.write',
    query: enterpriseAQuery,
    body: (seed) => ({
      name: 'Intruso empleado',
      email: 'intruso-empleado@e2e.test',
      password: 'secret-password',
      userEnterprises: [{ enterpriseId: seed.enterpriseA.id }],
    }),
  },
  {
    name: 'GET /users/card/:cardId',
    method: 'get',
    path: () => '/users/card/1',
    permission: 'users.read',
    query: enterpriseAQuery,
  },
  {
    name: 'GET /users/email/:email de otro usuario de A',
    method: 'get',
    path: () => `/users/email/${E2E_EMAIL.userA}`,
    permission: 'users.read',
  },
  {
    name: 'GET /users/:id de otro usuario de A',
    method: 'get',
    path: (seed) => `/users/${seed.userA.id}`,
    permission: 'users.read',
  },
  {
    name: 'PATCH /users/:id de otro usuario de A',
    method: 'patch',
    path: (seed) => `/users/${seed.userA.id}`,
    permission: 'users.write',
    query: enterpriseAQuery,
    body: () => ({ name: 'Hackeado' }),
  },
  {
    name: 'PATCH /users/:id del propio empleado',
    method: 'patch',
    path: (seed) => `/users/${seed.employeeA.id}`,
    permission: 'users.write',
    query: enterpriseAQuery,
    body: () => ({ name: 'Autoedición' }),
  },
  {
    name: 'DELETE /users/:id/enterprise/:enterpriseId',
    method: 'delete',
    path: (seed) => `/users/${seed.userA.id}/enterprise/${seed.enterpriseA.id}`,
    permission: 'users.delete',
  },
  {
    name: 'GET /enterprise-roles/catalog',
    method: 'get',
    path: () => '/enterprise-roles/catalog',
    permission: 'enterpriseRoles.read',
    query: enterpriseAQuery,
  },
  {
    name: 'GET /enterprise-roles',
    method: 'get',
    path: () => '/enterprise-roles',
    permission: 'enterpriseRoles.read',
    query: enterpriseAQuery,
  },
  {
    name: 'POST /enterprise-roles',
    method: 'post',
    path: () => '/enterprise-roles',
    permission: 'enterpriseRoles.write',
    query: enterpriseAQuery,
    body: () => ({ role: 'Intruso', permissions: { invoices: { read: true } } }),
  },
  {
    name: 'GET /enterprise-roles/:id',
    method: 'get',
    path: (seed) => `/enterprise-roles/${seed.administratorRoleA.id}`,
    permission: 'enterpriseRoles.read',
    query: enterpriseAQuery,
  },
  {
    name: 'PATCH /enterprise-roles/:id',
    method: 'patch',
    path: (seed) => `/enterprise-roles/${seed.employeeRoleA.id}`,
    permission: 'enterpriseRoles.write',
    query: enterpriseAQuery,
    body: () => ({ permissions: { invoices: { read: true } } }),
  },
  {
    name: 'DELETE /enterprise-roles/:id',
    method: 'delete',
    path: (seed) => `/enterprise-roles/${seed.employeeRoleA.id}`,
    permission: 'enterpriseRoles.delete',
    query: enterpriseAQuery,
  },
  {
    name: 'GET /enterprises',
    method: 'get',
    path: () => '/enterprises',
    permission: 'enterprises.read',
  },
  {
    name: 'POST /enterprises/logo',
    method: 'post',
    path: () => '/enterprises/logo',
    permission: 'enterprises.write',
    query: enterpriseAQuery,
  },
  {
    name: 'GET /enterprises/:id',
    method: 'get',
    path: (seed) => `/enterprises/${seed.enterpriseA.id}`,
    permission: 'enterprises.read',
  },
  {
    name: 'GET /enterprises/logo/:enterpriseId',
    method: 'get',
    path: (seed) => `/enterprises/logo/${seed.enterpriseA.id}`,
    permission: 'enterprises.read',
  },
  {
    name: 'PATCH /enterprises/:id',
    method: 'patch',
    path: (seed) => `/enterprises/${seed.enterpriseA.id}`,
    permission: 'enterprises.write',
    query: enterpriseAQuery,
    body: () => ({ name: 'Hackeada' }),
  },
  {
    name: 'GET /holidays',
    method: 'get',
    path: () => '/holidays',
    permission: 'holidays.read',
    query: enterpriseAQuery,
  },
  {
    name: 'POST /holidays',
    method: 'post',
    path: () => '/holidays',
    permission: 'holidays.write',
    query: enterpriseAQuery,
    body: () => ({ name: 'Intruso', calendarDate: '2026-11-01' }),
  },
  {
    name: 'GET /holidays/:id',
    method: 'get',
    path: (seed) => `/holidays/${seed.holidayA.id}`,
    permission: 'holidays.read',
    query: enterpriseAQuery,
  },
  {
    name: 'PATCH /holidays/:id',
    method: 'patch',
    path: (seed) => `/holidays/${seed.holidayA.id}`,
    permission: 'holidays.write',
    query: enterpriseAQuery,
    body: () => ({ name: 'Hackeado' }),
  },
  {
    name: 'DELETE /holidays/:id',
    method: 'delete',
    path: (seed) => `/holidays/${seed.holidayA.id}`,
    permission: 'holidays.delete',
    query: enterpriseAQuery,
  },
  {
    name: 'GET /default-schedules',
    method: 'get',
    path: () => '/default-schedules',
    permission: 'defaultSchedules.read',
    query: enterpriseAQuery,
  },
  {
    name: 'POST /default-schedules',
    method: 'post',
    path: () => '/default-schedules',
    permission: 'defaultSchedules.write',
    query: enterpriseAQuery,
    body: () => ({ name: 'Intrusa', schedule: { weekdays: {} } }),
  },
  {
    name: 'GET /default-schedules/:id',
    method: 'get',
    path: (seed) => `/default-schedules/${seed.defaultScheduleA.id}`,
    permission: 'defaultSchedules.read',
    query: enterpriseAQuery,
  },
  {
    name: 'PATCH /default-schedules/:id',
    method: 'patch',
    path: (seed) => `/default-schedules/${seed.defaultScheduleA.id}`,
    permission: 'defaultSchedules.write',
    query: enterpriseAQuery,
    body: () => ({ name: 'Hackeada' }),
  },
  {
    name: 'DELETE /default-schedules/:id',
    method: 'delete',
    path: (seed) => `/default-schedules/${seed.defaultScheduleA.id}`,
    permission: 'defaultSchedules.delete',
    query: enterpriseAQuery,
  },
  {
    name: 'GET /signings',
    method: 'get',
    path: () => '/signings',
    permission: 'signings.read',
    query: enterpriseAQuery,
  },
  {
    name: 'POST /signings',
    method: 'post',
    path: () => '/signings',
    permission: 'signings.write',
    query: enterpriseAQuery,
    body: (seed) => ({ userEnterpriseId: seed.linkA.id, action: 'start' }),
  },
  {
    name: 'GET /signings/:id/signing-updates',
    method: 'get',
    path: (seed) => `/signings/${seed.signingA.id}/signing-updates`,
    permission: 'signings.read',
    query: enterpriseAQuery,
  },
  {
    name: 'GET /signings/:id',
    method: 'get',
    path: (seed) => `/signings/${seed.signingA.id}`,
    permission: 'signings.read',
    query: enterpriseAQuery,
  },
  {
    name: 'PATCH /signings/:id',
    method: 'patch',
    path: (seed) => `/signings/${seed.signingA.id}`,
    permission: 'signings.write',
    query: enterpriseAQuery,
    body: () => ({}),
  },
  {
    name: 'DELETE /signings/:id',
    method: 'delete',
    path: (seed) => `/signings/${seed.signingA.id}`,
    permission: 'signings.delete',
    query: enterpriseAQuery,
  },
  {
    name: 'GET /user-enterprises/card/:cardId',
    method: 'get',
    path: () => '/user-enterprises/card/1',
    permission: 'signings.read',
    query: enterpriseAQuery,
  },
  {
    name: 'GET /vacations',
    method: 'get',
    path: () => '/vacations',
    permission: 'vacations.read',
    query: enterpriseAQuery,
  },
  {
    name: 'POST /vacations',
    method: 'post',
    path: () => '/vacations',
    permission: 'vacations.write',
    query: enterpriseAQuery,
    body: (seed) => ({
      userEnterpriseId: seed.linkA.id,
      name: 'Intrusa',
      calendarDate: '2026-09-01',
    }),
  },
  {
    name: 'GET /vacations/:id',
    method: 'get',
    path: (seed) => `/vacations/${seed.vacationA.id}`,
    permission: 'vacations.read',
    query: enterpriseAQuery,
  },
  {
    name: 'PATCH /vacations/:id',
    method: 'patch',
    path: (seed) => `/vacations/${seed.vacationA.id}`,
    permission: 'vacations.write',
    query: enterpriseAQuery,
    body: () => ({ name: 'Hackeada' }),
  },
  {
    name: 'DELETE /vacations/:id',
    method: 'delete',
    path: (seed) => `/vacations/${seed.vacationA.id}`,
    permission: 'vacations.delete',
    query: enterpriseAQuery,
  },
  {
    name: 'GET /work-schedules',
    method: 'get',
    path: () => '/work-schedules',
    permission: 'workSchedules.read',
    query: enterpriseAQuery,
  },
  {
    name: 'POST /work-schedules',
    method: 'post',
    path: () => '/work-schedules',
    permission: 'workSchedules.write',
    query: enterpriseAQuery,
    body: (seed) => ({
      userEnterpriseId: seed.linkA.id,
      startsAt: '2026-04-14T08:00:00.000Z',
      endsAt: '2026-04-14T16:00:00.000Z',
    }),
  },
  {
    name: 'GET /work-schedules/:id',
    method: 'get',
    path: (seed) => `/work-schedules/${seed.workScheduleA.id}`,
    permission: 'workSchedules.read',
    query: enterpriseAQuery,
  },
  {
    name: 'PATCH /work-schedules/:id',
    method: 'patch',
    path: (seed) => `/work-schedules/${seed.workScheduleA.id}`,
    permission: 'workSchedules.write',
    query: enterpriseAQuery,
    body: () => ({}),
  },
  {
    name: 'DELETE /work-schedules/:id',
    method: 'delete',
    path: (seed) => `/work-schedules/${seed.workScheduleA.id}`,
    permission: 'workSchedules.delete',
    query: enterpriseAQuery,
  },
  {
    name: 'GET /ai-requests',
    method: 'get',
    path: () => '/ai-requests',
    permission: 'aiRequests.read',
    query: enterpriseAQuery,
  },
  {
    name: 'POST /ai-requests',
    method: 'post',
    path: () => '/ai-requests',
    permission: 'aiRequests.write',
    query: enterpriseAQuery,
    body: () => ({
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      type: 'get_spent_issuer',
      message: 'intruso',
    }),
  },
  {
    name: 'GET /ai-requests/:id',
    method: 'get',
    path: (seed) => `/ai-requests/${seed.aiRequestA.id}`,
    permission: 'aiRequests.read',
  },
  {
    name: 'POST /billing/create-subscription-checkout-session',
    method: 'post',
    path: () => '/billing/create-subscription-checkout-session',
    permission: 'billing.write',
    body: (seed) => ({
      enterpriseId: seed.enterpriseA.id,
      priceId: 'price_e2e',
      successUrl: 'https://app.test/ok',
      cancelUrl: 'https://app.test/ko',
    }),
  },
  {
    name: 'POST /billing/update-subscription-price',
    method: 'post',
    path: () => '/billing/update-subscription-price',
    permission: 'billing.write',
    body: (seed) => ({
      enterpriseId: seed.enterpriseA.id,
      subscriptionId: 'sub_e2e_a',
      priceId: 'price_e2e',
    }),
  },
  {
    name: 'POST /billing/cancel-subscription-at-period-end',
    method: 'post',
    path: () => '/billing/cancel-subscription-at-period-end',
    permission: 'billing.write',
    body: (seed) => ({
      enterpriseId: seed.enterpriseA.id,
      subscriptionId: 'sub_e2e_a',
    }),
  },
  {
    name: 'POST /billing/revoke-cancel-subscription-at-period-end',
    method: 'post',
    path: () => '/billing/revoke-cancel-subscription-at-period-end',
    permission: 'billing.write',
    body: (seed) => ({
      enterpriseId: seed.enterpriseA.id,
      subscriptionId: 'sub_e2e_a',
    }),
  },
  {
    name: 'GET /metrics/invoices/subtotals-by-status',
    method: 'get',
    path: () => '/metrics/invoices/subtotals-by-status',
    permission: 'invoices.read',
    query: enterpriseAQuery,
  },
  {
    name: 'GET /metrics/spents/subtotals-by-status',
    method: 'get',
    path: () => '/metrics/spents/subtotals-by-status',
    permission: 'spents.read',
    query: enterpriseAQuery,
  },
  {
    name: 'GET /metrics/quotes/subtotals-by-status',
    method: 'get',
    path: () => '/metrics/quotes/subtotals-by-status',
    permission: 'quotes.read',
    query: enterpriseAQuery,
  },
  {
    name: 'GET /metrics/users/counts-by-status',
    method: 'get',
    path: () => '/metrics/users/counts-by-status',
    permission: 'users.read',
    query: enterpriseAQuery,
  },
  {
    name: 'GET /metrics/clients/counts-by-type',
    method: 'get',
    path: () => '/metrics/clients/counts-by-type',
    permission: 'clients.read',
    query: enterpriseAQuery,
  },
  {
    name: 'GET /metrics/suppliers/counts-by-type',
    method: 'get',
    path: () => '/metrics/suppliers/counts-by-type',
    permission: 'suppliers.read',
    query: enterpriseAQuery,
  },
  {
    name: 'GET /metrics/invoice-series/list-counts',
    method: 'get',
    path: () => '/metrics/invoice-series/list-counts',
    permission: 'invoiceSeries.read',
    query: (seed) => ({
      ...enterpriseAQuery(seed),
      ...extraMetricsQueryForPath('/metrics/invoice-series/list-counts'),
    }),
  },
  {
    name: 'GET /metrics/ai-requests/counts-by-type',
    method: 'get',
    path: () => '/metrics/ai-requests/counts-by-type',
    permission: 'aiRequests.read',
    query: enterpriseAQuery,
  },
  {
    name: 'GET /metrics/invoices',
    method: 'get',
    path: () => '/metrics/invoices',
    permission: 'invoices.read',
    query: (seed) => ({
      ...enterpriseAQuery(seed),
      ...extraMetricsQueryForPath('/metrics/invoices'),
    }),
  },
  {
    name: 'GET /metrics/spents',
    method: 'get',
    path: () => '/metrics/spents',
    permission: 'spents.read',
    query: (seed) => ({
      ...enterpriseAQuery(seed),
      ...extraMetricsQueryForPath('/metrics/spents'),
    }),
  },
  {
    name: 'GET /metrics/invoices/yearly',
    method: 'get',
    path: () => '/metrics/invoices/yearly',
    permission: 'invoices.read',
    query: (seed) => ({
      ...enterpriseAQuery(seed),
      ...extraMetricsQueryForPath('/metrics/invoices/yearly'),
    }),
  },
  {
    name: 'GET /metrics/spents/yearly',
    method: 'get',
    path: () => '/metrics/spents/yearly',
    permission: 'spents.read',
    query: (seed) => ({
      ...enterpriseAQuery(seed),
      ...extraMetricsQueryForPath('/metrics/spents/yearly'),
    }),
  },
];

/**
 * Mensaje 403 de RBAC que el API debe devolver.
 *
 * @param permission - Clave `recurso.acción`
 * @returns Texto del cuerpo
 */
export function deniedPermissionMessage(permission: string): string {
  return `No tiene permiso para realizar la acción ${permission}`;
}
