import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { expectIdorHidden, http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

describe('Proveedores (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('el usuario A no puede listar proveedores de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/suppliers')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it('el usuario A lista proveedores de A', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/suppliers')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    const ids = (response.body.items as Array<{ id: string }>).map((item) => item.id);
    expect(ids).toContain(seed.supplierA.id);
    expect(ids).not.toContain(seed.supplierB.id);
  });

  it('rechaza crear un proveedor con un NIF duplicado de la misma empresa', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/suppliers')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ name: 'Dup', nif: seed.supplierA.nif });
    expect(response.status).toBe(409);
    expect(response.body.message).toBe(`Ya existe un proveedor con el NIF ${seed.supplierA.nif}`);
  });

  it('el usuario A no lee el proveedor de B por id', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/suppliers/${seed.supplierB.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(response.status);
  });

  it('el usuario A no crea proveedores en B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/suppliers')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ name: 'Intruso', nif: 'Y00000000' });
    expect(response.status).toBe(403);
  });

  it('el usuario A no actualiza ni borra el proveedor de B', async () => {
    const seed = getE2eSeed();
    const patchResponse = await http()
      .patch(`/suppliers/${seed.supplierB.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ name: 'Hackeado' });
    expectIdorHidden(patchResponse.status);
    const deleteResponse = await http()
      .delete(`/suppliers/${seed.supplierB.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(deleteResponse.status);
  });

  it('rechaza actualizar un proveedor con el NIF de otro de la misma empresa', async () => {
    const seed = getE2eSeed();
    const created = await http()
      .post('/suppliers')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ name: 'Proveedor NIF único', nif: 'P66666666' });
    expect(created.status).toBe(201);

    const response = await http()
      .patch(`/suppliers/${created.body.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ nif: seed.supplierA.nif });
    expect(response.status).toBe(409);
    expect(response.body.message).toBe(`Ya existe un proveedor con el NIF ${seed.supplierA.nif}`);
  });

  it('permite actualizar un proveedor conservando su propio NIF', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .patch(`/suppliers/${seed.supplierA.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ nif: seed.supplierA.nif, name: 'Proveedor A' });
    expect(response.status).toBe(200);
    expect(response.body.nif).toBe(seed.supplierA.nif);
  });
});
