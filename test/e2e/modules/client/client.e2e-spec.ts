import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { expectIdorHidden, http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

describe('Clientes (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('exige autenticación', async () => {
    const seed = getE2eSeed();
    const response = await http().get('/clients').query({ enterpriseId: seed.enterpriseA.id });
    expect(response.status).toBe(401);
  });

  it('exige enterpriseId en el listado', async () => {
    const response = await http().get('/clients').set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(400);
  });

  it('el usuario A lista solo clientes de A', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/clients')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    const ids = (response.body.items as Array<{ id: string }>).map((item) => item.id);
    expect(ids).toContain(seed.clientA.id);
    expect(ids).not.toContain(seed.clientB.id);
  });

  it('el usuario A no puede listar clientes de B (403)', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/clients')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it('el usuario A lee su cliente por id', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/clients/${seed.clientA.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(seed.clientA.id);
  });

  it('el usuario A no puede leer el cliente de B por id (404)', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/clients/${seed.clientB.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(response.status);
  });

  it('el admin global sí lee el cliente de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/clients/${seed.clientB.id}`)
      .set(authHeader(E2E_EMAIL.admin));
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(seed.clientB.id);
  });

  it('el usuario A no puede crear un cliente en B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/clients')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ name: 'Intruso', nif: 'X00000000' });
    expect(response.status).toBe(403);
  });

  it('el usuario A puede crear un cliente en A', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/clients')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ name: 'Cliente nuevo A', nif: 'C33333333' });
    expect(response.status).toBe(201);
    expect(response.body.name).toBe('Cliente nuevo A');
  });

  it('el usuario A no puede actualizar el cliente de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .patch(`/clients/${seed.clientB.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ name: 'Hackeado' });
    expectIdorHidden(response.status);
  });

  it('el usuario A no puede borrar el cliente de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .delete(`/clients/${seed.clientB.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(response.status);
  });
});
