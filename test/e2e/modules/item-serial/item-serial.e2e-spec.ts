import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { expectIdorHidden, http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

describe('Números de serie de artículos (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('el usuario A no lista series de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/item-serials')
      .query({
        enterpriseId: seed.enterpriseB.id,
        itemId: seed.itemB.id,
      })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it('el usuario A lista series de su artículo y no las de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/item-serials')
      .query({
        enterpriseId: seed.enterpriseA.id,
        itemId: seed.itemA.id,
      })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    const ids = (response.body.items as Array<{ id: string }>).map((item) => item.id);
    expect(ids).toContain(seed.itemSerialA.id);
    expect(ids).not.toContain(seed.itemSerialB.id);
  });

  it('el usuario A no lista series colgando del artículo de B aunque use su enterpriseId', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/item-serials')
      .query({
        enterpriseId: seed.enterpriseA.id,
        itemId: seed.itemB.id,
      })
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(response.status);
  });

  it('el usuario A no lee el número de serie de B por UUID', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/item-serials/${seed.itemSerialB.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(response.status);
  });

  it('el usuario A sí lee su número de serie', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/item-serials/${seed.itemSerialA.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(seed.itemSerialA.id);
    expect(response.body.status).toBe('in_stock');
  });

  it.each([
    {
      name: 'GET /item-serials',
      path: () => '/item-serials',
    },
    {
      name: 'GET /item-serials/:id',
      path: (seed: { itemSerialA: { id: string } }) => `/item-serials/${seed.itemSerialA.id}`,
    },
  ])('$name es 403 para el empleado sin permiso items.read', async ({ path }) => {
    const seed = getE2eSeed();
    const response = await http()
      .get(path(seed))
      .query({
        enterpriseId: seed.enterpriseA.id,
        itemId: seed.itemA.id,
      })
      .set(authHeader(E2E_EMAIL.employeeA));
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('No tiene permiso para realizar la acción items.read');
  });
});
