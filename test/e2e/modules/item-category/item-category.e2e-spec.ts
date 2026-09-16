import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { expectIdorHidden, http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

describe('Categorías de artículos (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('el usuario A no puede listar categorías de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/item-categories')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it('el usuario A lista categorías de A y no ve las de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/item-categories')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    const ids = (response.body.items as Array<{ id: string }>).map((item) => item.id);
    expect(ids).toContain(seed.itemCategoryA.id);
    expect(ids).not.toContain(seed.itemCategoryB.id);
  });

  it('el usuario A no lee la categoría de B por id', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/item-categories/${seed.itemCategoryB.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(response.status);
  });

  it('el usuario A no crea categorías en B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/item-categories')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ name: 'Intrusa' });
    expect(response.status).toBe(403);
  });

  it('el usuario A no actualiza ni borra la categoría de B', async () => {
    const seed = getE2eSeed();
    const patchResponse = await http()
      .patch(`/item-categories/${seed.itemCategoryB.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ name: 'Hackeada' });
    expectIdorHidden(patchResponse.status);
    const deleteResponse = await http()
      .delete(`/item-categories/${seed.itemCategoryB.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(deleteResponse.status);
  });

    it('un PATCH no mueve la categoría a otra empresa', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .patch(`/item-categories/${seed.itemCategoryA.id}`)
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        name: 'Categoría A',
        enterpriseId: seed.enterpriseB.id,
        enterprise: { id: seed.enterpriseB.id },
      });
    expect(response.status).toBe(200);
    expect(response.body.enterpriseId).toBe(seed.enterpriseA.id);
  });

  it.each([
    {
      name: 'GET /item-categories',
      method: 'get' as const,
      path: () => '/item-categories',
      permission: 'itemCategories.read',
    },
    {
      name: 'POST /item-categories',
      method: 'post' as const,
      path: () => '/item-categories',
      permission: 'itemCategories.write',
      body: { name: 'Intrusa empleado' },
    },
    {
      name: 'GET /item-categories/:id',
      method: 'get' as const,
      path: (seed: { itemCategoryA: { id: string } }) => `/item-categories/${seed.itemCategoryA.id}`,
      permission: 'itemCategories.read',
    },
    {
      name: 'PATCH /item-categories/:id',
      method: 'patch' as const,
      path: (seed: { itemCategoryA: { id: string } }) => `/item-categories/${seed.itemCategoryA.id}`,
      permission: 'itemCategories.write',
      body: { name: 'Hackeada' },
    },
    {
      name: 'DELETE /item-categories/:id',
      method: 'delete' as const,
      path: (seed: { itemCategoryA: { id: string } }) => `/item-categories/${seed.itemCategoryA.id}`,
      permission: 'itemCategories.delete',
    },
  ])('$name es 403 para el empleado sin permiso $permission', async ({ method, path, permission, body }) => {
    const seed = getE2eSeed();
    let requestBuilder = http()
      [method](path(seed))
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.employeeA));
    if (body && (method === 'post' || method === 'patch')) {
      requestBuilder = requestBuilder.send(body);
    }
    const response = await requestBuilder;
    expect(response.status).toBe(403);
    expect(response.body.message).toBe(`No tiene permiso para realizar la acción ${permission}`);
  });

  it('un usuario sin empresas no lista ni crea categorías de A', async () => {
    const seed = getE2eSeed();
    const listed = await http()
      .get('/item-categories')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.outsider));
    expect(listed.status).toBe(403);
    const created = await http()
      .post('/item-categories')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.outsider))
      .send({ name: 'Intrusa externa' });
    expect(created.status).toBe(403);
  });

  it('un usuario sin empresas no lee ni muta la categoría de A por UUID (IDOR 404)', async () => {
    const seed = getE2eSeed();
    const categoryPath = `/item-categories/${seed.itemCategoryA.id}`;
    expectIdorHidden((await http().get(categoryPath).set(authHeader(E2E_EMAIL.outsider))).status);
    expectIdorHidden(
      (
        await http()
          .patch(categoryPath)
          .set(authHeader(E2E_EMAIL.outsider))
          .send({ name: 'Hackeada' })
      ).status,
    );
    expectIdorHidden((await http().delete(categoryPath).set(authHeader(E2E_EMAIL.outsider))).status);
  });
});
