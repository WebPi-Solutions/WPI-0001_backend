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
});
