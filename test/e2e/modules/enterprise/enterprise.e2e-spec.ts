import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { expectIdorHidden, http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

describe('Empresas (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('el usuario A solo lista su empresa', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/enterprises')
      .query({ pageSize: 50 })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    const ids = (response.body.items as Array<{ id: string }>).map((item) => item.id);
    expect(ids).toContain(seed.enterpriseA.id);
    expect(ids).not.toContain(seed.enterpriseB.id);
  });

  it('un usuario sin empresas recibe listado vacío', async () => {
    const response = await http().get('/enterprises').set(authHeader(E2E_EMAIL.outsider));
    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
    expect(response.body.total).toBe(0);
  });

  it('el administrador global lista A y B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/enterprises')
      .query({ pageSize: 50 })
      .set(authHeader(E2E_EMAIL.admin));
    expect(response.status).toBe(200);
    const ids = (response.body.items as Array<{ id: string }>).map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining([seed.enterpriseA.id, seed.enterpriseB.id]));
  });

  it('el usuario A no puede leer la empresa B por id (404)', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/enterprises/${seed.enterpriseB.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(response.status);
  });

  it('el usuario A sí lee su empresa', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/enterprises/${seed.enterpriseA.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(seed.enterpriseA.id);
  });

  it('el admin global puede leer la empresa B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/enterprises/${seed.enterpriseB.id}`)
      .set(authHeader(E2E_EMAIL.admin));
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(seed.enterpriseB.id);
  });

  it('un no-admin no puede crear empresas', async () => {
    const response = await http()
      .post('/enterprises')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        name: 'Empresa Intrusa',
        email: 'intrusa@e2e.test',
        nif: 'Z99999999',
      });
    expect(response.status).toBe(403);
  });

  it('el usuario A no puede actualizar la empresa B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .patch(`/enterprises/${seed.enterpriseB.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ name: 'Hackeada' });
    expectIdorHidden(response.status);
  });

  it('el usuario A no puede borrar la empresa B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .delete(`/enterprises/${seed.enterpriseB.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(response.status);
  });

  it('el usuario A no puede descargar el logo de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/enterprises/logo/${seed.enterpriseB.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expect([403, 404]).toContain(response.status);
  });

  it('el empleado no lista ni lee ni edita su empresa (enterprises.read/write)', async () => {
    const seed = getE2eSeed();
    const list = await http()
      .get('/enterprises')
      .query({ pageSize: 50 })
      .set(authHeader(E2E_EMAIL.employeeA));
    expect(list.status).toBe(403);
    expect(list.body.message).toBe(
      'No tiene permiso para realizar la acción enterprises.read',
    );

    const byId = await http()
      .get(`/enterprises/${seed.enterpriseA.id}`)
      .set(authHeader(E2E_EMAIL.employeeA));
    expect(byId.status).toBe(403);
    expect(byId.body.message).toBe(
      'No tiene permiso para realizar la acción enterprises.read',
    );

    const patch = await http()
      .patch(`/enterprises/${seed.enterpriseA.id}`)
      .set(authHeader(E2E_EMAIL.employeeA))
      .send({ name: 'Hackeada' });
    expect(patch.status).toBe(403);
    expect(patch.body.message).toBe(
      'No tiene permiso para realizar la acción enterprises.write',
    );
  });

  it('GET /enterprises sin Bearer es 401', async () => {
    const response = await http().get('/enterprises');
    expect(response.status).toBe(401);
  });

  it('el usuario A no sube logo a la empresa B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/enterprises/logo')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA))
      .attach('file', Buffer.from('fake-png'), 'logo.png');
    expect(response.status).toBe(403);
  });
});
