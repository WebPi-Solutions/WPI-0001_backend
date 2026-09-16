import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { expectIdorHidden, http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

describe('Artículos (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('el usuario A no puede listar artículos de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/items')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it('el usuario A lista artículos de A y no ve los de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/items')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    const ids = (response.body.items as Array<{ id: string }>).map((item) => item.id);
    expect(ids).toContain(seed.itemA.id);
    expect(ids).not.toContain(seed.itemB.id);
  });

  it('el usuario A no lee el artículo de B por UUID', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/items/${seed.itemB.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(response.status);
  });

  it('el usuario A no crea un artículo con la categoría de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/items')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ name: 'Intruso', itemCategoryId: seed.itemCategoryB.id });
    expectIdorHidden(response.status);
  });

  it('el usuario A no crea artículos en la empresa B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/items')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ name: 'Intruso', itemCategoryId: seed.itemCategoryB.id });
    expect(response.status).toBe(403);
  });

  it('el usuario A sí lee su artículo', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/items/${seed.itemA.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(seed.itemA.id);
  });

  it('el usuario A no actualiza ni borra el artículo de B', async () => {
    const seed = getE2eSeed();
    expectIdorHidden(
      (
        await http()
          .patch(`/items/${seed.itemB.id}`)
          .set(authHeader(E2E_EMAIL.userA))
          .send({ name: 'Hackeado' })
      ).status,
    );
    expectIdorHidden(
      (await http().delete(`/items/${seed.itemB.id}`).set(authHeader(E2E_EMAIL.userA))).status,
    );
  });

    it('un PATCH no mueve el artículo a una categoría de otra empresa', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .patch(`/items/${seed.itemA.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ itemCategoryId: seed.itemCategoryB.id });
    expectIdorHidden(response.status);

    const stillOwn = await http()
      .get(`/items/${seed.itemA.id}`)
      .query({ relations: 'itemCategory' })
      .set(authHeader(E2E_EMAIL.userA));
    expect(stillOwn.status).toBe(200);
    expect(stillOwn.body.itemCategoryId).toBe(seed.itemCategoryA.id);
  });

  it.each([
    {
      name: 'GET /items',
      method: 'get' as const,
      path: () => '/items',
      permission: 'items.read',
    },
    {
      name: 'POST /items',
      method: 'post' as const,
      path: () => '/items',
      permission: 'items.write',
      body: (seed: { itemCategoryA: { id: string } }) => ({
        name: 'Intruso empleado',
        itemCategoryId: seed.itemCategoryA.id,
      }),
    },
    {
      name: 'GET /items/:id',
      method: 'get' as const,
      path: (seed: { itemA: { id: string } }) => `/items/${seed.itemA.id}`,
      permission: 'items.read',
    },
    {
      name: 'PATCH /items/:id',
      method: 'patch' as const,
      path: (seed: { itemA: { id: string } }) => `/items/${seed.itemA.id}`,
      permission: 'items.write',
      body: () => ({ name: 'Hackeado' }),
    },
    {
      name: 'DELETE /items/:id',
      method: 'delete' as const,
      path: (seed: { itemA: { id: string } }) => `/items/${seed.itemA.id}`,
      permission: 'items.delete',
    },
  ])('$name es 403 para el empleado sin permiso $permission', async ({ method, path, permission, body }) => {
    const seed = getE2eSeed();
    let requestBuilder = http()
      [method](path(seed))
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.employeeA));
    if (body && (method === 'post' || method === 'patch')) {
      requestBuilder = requestBuilder.send(body(seed));
    }
    const response = await requestBuilder;
    expect(response.status).toBe(403);
    expect(response.body.message).toBe(`No tiene permiso para realizar la acción ${permission}`);
  });

  it('un usuario sin empresas no lista ni crea artículos de A', async () => {
    const seed = getE2eSeed();
    const listed = await http()
      .get('/items')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.outsider));
    expect(listed.status).toBe(403);
    const created = await http()
      .post('/items')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.outsider))
      .send({ name: 'Intruso externo', itemCategoryId: seed.itemCategoryA.id });
    expect(created.status).toBe(403);
  });

  it('un usuario sin empresas no lee ni muta el artículo de A por UUID (IDOR 404)', async () => {
    const seed = getE2eSeed();
    const itemPath = `/items/${seed.itemA.id}`;
    expectIdorHidden((await http().get(itemPath).set(authHeader(E2E_EMAIL.outsider))).status);
    expectIdorHidden(
      (await http().patch(itemPath).set(authHeader(E2E_EMAIL.outsider)).send({ name: 'Hackeado' }))
        .status,
    );
    expectIdorHidden((await http().delete(itemPath).set(authHeader(E2E_EMAIL.outsider))).status);
  });
});

describe('Artículos (e2e) — número de serie exige stock', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('rechaza crear un artículo con número de serie y stock deshabilitado', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/items')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        name: 'Serie sin stock',
        itemCategoryId: seed.itemCategoryA.id,
        serialNumber: true,
        stock: false,
      });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      'El número de serie requiere que el stock esté habilitado',
    );
  });

  it('rechaza crear un artículo con número de serie si el stock se omite', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/items')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        name: 'Serie omitiendo stock',
        itemCategoryId: seed.itemCategoryA.id,
        serialNumber: true,
      });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      'El número de serie requiere que el stock esté habilitado',
    );
  });

  it('crea un artículo con número de serie y stock habilitados', async () => {
    const seed = getE2eSeed();
    const created = await http()
      .post('/items')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        name: 'Serie con stock',
        itemCategoryId: seed.itemCategoryA.id,
        serialNumber: true,
        stock: true,
      });
    expect(created.status).toBe(201);
    expect(created.body.serialNumber).toBe(true);
    expect(created.body.stock).toBe(true);

    await http().delete(`/items/${created.body.id}`).set(authHeader(E2E_EMAIL.userA));
  });

  it('rechaza desactivar el stock de un artículo que sigue con número de serie', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .patch(`/items/${seed.itemA.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ stock: false });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      'El número de serie requiere que el stock esté habilitado',
    );

    const stillTracked = await http()
      .get(`/items/${seed.itemA.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expect(stillTracked.status).toBe(200);
    expect(stillTracked.body.serialNumber).toBe(true);
    expect(stillTracked.body.stock).toBe(true);
  });
});
