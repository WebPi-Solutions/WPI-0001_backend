import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { e2eRequest } from '@e2e/http-access';
import { http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';
import {
  DENIED_PERMISSION_CASES,
  deniedPermissionMessage,
} from '@e2e/permission-matrix';
import {
  ENTERPRISE_ROLE_NAME_ADMINISTRATOR,
  ENTERPRISE_ROLE_NAME_EMPLOYEE,
} from 'src/common/helpers/enterprise-permission/permission.catalog';

describe('Permisos de rol de empresa (e2e)', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it.each(DENIED_PERMISSION_CASES)(
    '$name es 403 para el empleado por $permission',
    async ({ method, path, permission, query, body }) => {
      const seed = getE2eSeed();
      const response = await e2eRequest(method, path(seed), {
        email: E2E_EMAIL.employeeA,
        query: query?.(seed),
        body: body?.(seed),
      });
      expect(response.status).toBe(403);
      expect(response.body.message).toBe(deniedPermissionMessage(permission));
    },
  );

  it('GET /clients es 200 para el Administrador de la empresa', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/clients')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
  });

  it('el administrador global se salta el RBAC aunque no tenga vínculo', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/clients')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.admin));
    expect(response.status).toBe(200);
  });

  it('GET /users/myself no exige permiso de rol', async () => {
    const response = await http()
      .get('/users/myself')
      .set(authHeader(E2E_EMAIL.employeeA));
    expect(response.status).toBe(200);
    expect(response.body.email).toBe(E2E_EMAIL.employeeA);
  });

  it('GET /users/:id del propio empleado no exige users.read (self bypass)', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/users/${seed.employeeA.id}`)
      .set(authHeader(E2E_EMAIL.employeeA));
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(seed.employeeA.id);
  });

  it('GET /users/email del propio empleado no exige users.read (self bypass)', async () => {
    const response = await http()
      .get(`/users/email/${E2E_EMAIL.employeeA}`)
      .set(authHeader(E2E_EMAIL.employeeA));
    expect(response.status).toBe(200);
    expect(response.body.email).toBe(E2E_EMAIL.employeeA);
  });

  it('GET /billing/active-subscriptions no exige billing.read (menú)', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/billing/active-subscriptions')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.employeeA));
    expect(response.status).toBe(200);
  });

  it('el catálogo Stripe no exige permiso de rol', async () => {
    const catalog = await http()
      .get('/billing/products-by-metadata')
      .query({ metadataKey: 'type' })
      .set(authHeader(E2E_EMAIL.employeeA));
    expect(catalog.status).toBe(200);
    const signings = await http()
      .get('/billing/products-signings-with-prices')
      .set(authHeader(E2E_EMAIL.employeeA));
    expect(signings.status).toBe(200);
    const management = await http()
      .get('/billing/products-management-with-prices')
      .set(authHeader(E2E_EMAIL.employeeA));
    expect(management.status).toBe(200);
  });

  it('POST /enterprises del empleado es 403 de admin global, no de RBAC de rol', async () => {
    const response = await http()
      .post('/enterprises')
      .set(authHeader(E2E_EMAIL.employeeA))
      .send({
        name: 'Empresa empleado',
        email: 'empleado-empresa@e2e.test',
        nif: 'E88888888',
      });
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('No tiene permiso para crear empresas.');
  });

  it('DELETE /enterprises/:id del empleado es 403 de admin global', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .delete(`/enterprises/${seed.enterpriseA.id}`)
      .set(authHeader(E2E_EMAIL.employeeA));
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('No tiene permiso para eliminar empresas.');
  });

  it('GET /enterprise-roles/catalog es 200 para el Administrador', async () => {
    const seed = getE2eSeed();
    const allowed = await http()
      .get('/enterprise-roles/catalog')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(allowed.status).toBe(200);
    expect(Array.isArray(allowed.body.resources)).toBe(true);
    expect(Array.isArray(allowed.body.actions)).toBe(true);
  });

  it('lista y crea roles de empresa para el Administrador', async () => {
    const seed = getE2eSeed();
    const listResponse = await http()
      .get('/enterprise-roles')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(listResponse.status).toBe(200);
    const roleNames = (listResponse.body as Array<{ role: string }>).map(
      (enterpriseRole) => enterpriseRole.role,
    );
    expect(roleNames).toEqual(
      expect.arrayContaining([
        ENTERPRISE_ROLE_NAME_ADMINISTRATOR,
        ENTERPRISE_ROLE_NAME_EMPLOYEE,
      ]),
    );

    const createResponse = await http()
      .post('/enterprise-roles')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        role: `Contable-${Date.now()}`,
        permissions: { invoices: { read: true } },
      });
    expect([200, 201]).toContain(createResponse.status);
    expect(createResponse.body.permissions).toEqual({ invoices: { read: true } });

    const createdRoleId = createResponse.body.id as string;
    const getResponse = await http()
      .get(`/enterprise-roles/${createdRoleId}`)
      .set(authHeader(E2E_EMAIL.userA));
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.role).toBe(createResponse.body.role);

    const patchResponse = await http()
      .patch(`/enterprise-roles/${createdRoleId}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        role: `${createResponse.body.role}-upd`,
        permissions: { invoices: { write: true, delete: true } },
      });
    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body.permissions).toEqual({});

    const deleteAdministratorDenied = await http()
      .delete(`/enterprise-roles/${seed.administratorRoleA.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expect(deleteAdministratorDenied.status).toBe(400);
    expect(deleteAdministratorDenied.body.message).toBe(
      'Los roles Administrador y Empleado no son eliminables',
    );

    const deleteEmployeeDenied = await http()
      .delete(`/enterprise-roles/${seed.employeeRoleA.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expect(deleteEmployeeDenied.status).toBe(400);
    expect(deleteEmployeeDenied.body.message).toBe(
      'Los roles Administrador y Empleado no son eliminables',
    );

    const patchAdministratorDenied = await http()
      .patch(`/enterprise-roles/${seed.administratorRoleA.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        role: ENTERPRISE_ROLE_NAME_ADMINISTRATOR,
        permissions: { invoices: { read: true } },
      });
    expect(patchAdministratorDenied.status).toBe(400);
    expect(patchAdministratorDenied.body.message).toBe(
      'El rol Administrador no puede modificar los permisos',
    );

    const deleteOk = await http()
      .delete(`/enterprise-roles/${createdRoleId}`)
      .set(authHeader(E2E_EMAIL.userA));
    expect(deleteOk.status).toBe(200);
  });

  it('al crear una empresa se siembran Administrador y Empleado', async () => {
    const uniqueSuffix = Date.now();
    const createResponse = await http()
      .post('/enterprises')
      .set(authHeader(E2E_EMAIL.admin))
      .send({
        name: `Empresa semilla ${uniqueSuffix}`,
        email: `semilla-${uniqueSuffix}@e2e.test`,
        nif: `Z${String(uniqueSuffix).slice(-8)}`,
      });
    expect([200, 201]).toContain(createResponse.status);
    const createdEnterpriseId = createResponse.body.id as string;

    const rolesResponse = await http()
      .get('/enterprise-roles')
      .query({ enterpriseId: createdEnterpriseId })
      .set(authHeader(E2E_EMAIL.admin));
    expect(rolesResponse.status).toBe(200);
    const roleNames = (rolesResponse.body as Array<{ role: string }>).map(
      (enterpriseRole) => enterpriseRole.role,
    );
    expect(roleNames).toEqual(
      expect.arrayContaining([
        ENTERPRISE_ROLE_NAME_ADMINISTRATOR,
        ENTERPRISE_ROLE_NAME_EMPLOYEE,
      ]),
    );
  });

  it('GET /invoices/:id es 200 para el admin global', async () => {
    const seed = getE2eSeed();
    const allowed = await http()
      .get(`/invoices/${seed.invoiceA.id}`)
      .set(authHeader(E2E_EMAIL.admin));
    expect(allowed.status).toBe(200);
  });
});
