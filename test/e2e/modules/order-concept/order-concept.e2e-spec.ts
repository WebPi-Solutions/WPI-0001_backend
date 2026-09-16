import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { expectIdorHidden, http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

describe('Conceptos de pedido (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('el usuario A no lista conceptos de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/order-concepts')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it('el usuario A lista conceptos de A y no ve los de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/order-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    const ids = (response.body.items as Array<{ id: string }>).map((item) => item.id);
    expect(ids).toContain(seed.orderConceptA.id);
    expect(ids).not.toContain(seed.orderConceptB.id);
  });

  it('el usuario A no lee el concepto de B por UUID', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/order-concepts/${seed.orderConceptB.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(response.status);
  });

  it('el usuario A no crea un concepto en el pedido de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/order-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ orderId: seed.orderB.id, itemId: seed.itemA.id });
    expectIdorHidden(response.status);
  });

  it('el usuario A no crea conceptos en la empresa B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/order-concepts')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ orderId: seed.orderB.id, itemId: seed.itemB.id });
    expect(response.status).toBe(403);
  });

  it('el usuario A sí lee su concepto', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/order-concepts/${seed.orderConceptA.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(seed.orderConceptA.id);
  });

  it('el usuario A no actualiza ni borra el concepto de B', async () => {
    const seed = getE2eSeed();
    expectIdorHidden(
      (
        await http()
          .patch(`/order-concepts/${seed.orderConceptB.id}`)
          .set(authHeader(E2E_EMAIL.userA))
          .send({ name: 'Hackeado' })
      ).status,
    );
    expectIdorHidden(
      (
        await http()
          .delete(`/order-concepts/${seed.orderConceptB.id}`)
          .set(authHeader(E2E_EMAIL.userA))
      ).status,
    );
  });

  it('un PATCH no mueve el concepto a un pedido de otra empresa', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .patch(`/order-concepts/${seed.orderConceptA.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ orderId: seed.orderB.id });
    expect(response.status).toBe(200);
    expect(response.body.orderId).toBe(seed.orderA.id);
  });

  it.each([
    {
      name: 'GET /order-concepts',
      method: 'get' as const,
      path: () => '/order-concepts',
      permission: 'orders.read',
    },
    {
      name: 'POST /order-concepts',
      method: 'post' as const,
      path: () => '/order-concepts',
      permission: 'orders.write',
      body: (seed: { orderA: { id: string }; itemA: { id: string } }) => ({
        orderId: seed.orderA.id,
        itemId: seed.itemA.id,
      }),
    },
    {
      name: 'GET /order-concepts/:id',
      method: 'get' as const,
      path: (seed: { orderConceptA: { id: string } }) =>
        `/order-concepts/${seed.orderConceptA.id}`,
      permission: 'orders.read',
    },
    {
      name: 'PATCH /order-concepts/:id',
      method: 'patch' as const,
      path: (seed: { orderConceptA: { id: string } }) =>
        `/order-concepts/${seed.orderConceptA.id}`,
      permission: 'orders.write',
      body: () => ({ name: 'Hackeado' }),
    },
    {
      name: 'DELETE /order-concepts/:id',
      method: 'delete' as const,
      path: (seed: { orderConceptA: { id: string } }) =>
        `/order-concepts/${seed.orderConceptA.id}`,
      permission: 'orders.delete',
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

  it('un usuario sin empresas no lista ni crea conceptos de A', async () => {
    const seed = getE2eSeed();
    const listed = await http()
      .get('/order-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.outsider));
    expect(listed.status).toBe(403);
    const created = await http()
      .post('/order-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.outsider))
      .send({ orderId: seed.orderA.id, itemId: seed.itemA.id });
    expect(created.status).toBe(403);
  });

  it('un usuario sin empresas no lee ni muta el concepto de A por UUID (IDOR 404)', async () => {
    const seed = getE2eSeed();
    const conceptPath = `/order-concepts/${seed.orderConceptA.id}`;
    expectIdorHidden((await http().get(conceptPath).set(authHeader(E2E_EMAIL.outsider))).status);
    expectIdorHidden(
      (await http().patch(conceptPath).set(authHeader(E2E_EMAIL.outsider)).send({ name: 'Hackeado' }))
        .status,
    );
    expectIdorHidden((await http().delete(conceptPath).set(authHeader(E2E_EMAIL.outsider))).status);
  });
});

describe('Conceptos de pedido (e2e) — reglas de negocio', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  /**
   * Crea un pedido pendiente de recepción de la empresa A.
   * @returns Identificador del pedido creado
   */
  async function createAwaitingReceiptOrder(): Promise<string> {
    const seed = getE2eSeed();
    const order = await http()
      .post('/orders')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        clientId: seed.clientA.id,
        quoteId: seed.quoteA.id,
        name: 'Pedido de reglas de concepto',
        date: '2026-06-01',
        status: 'awaiting_receipt',
      });
    expect(order.status).toBe(201);
    return order.body.id as string;
  }

  it('crea una línea de texto libre sin artículo y permite desvincularlo', async () => {
    const seed = getE2eSeed();
    const orderId = await createAwaitingReceiptOrder();
    const createdConcept = await http()
      .post('/order-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ orderId, name: 'Línea manual' });
    expect(createdConcept.status).toBe(201);
    expect(createdConcept.body.itemId).toBeNull();
    expect(createdConcept.body.name).toBe('Línea manual');

    const linkedConcept = await http()
      .patch(`/order-concepts/${createdConcept.body.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ itemId: seed.itemA.id });
    expect(linkedConcept.status).toBe(200);
    expect(linkedConcept.body.itemId).toBe(seed.itemA.id);

    const unlinkedConcept = await http()
      .patch(`/order-concepts/${createdConcept.body.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ itemId: null });
    expect(unlinkedConcept.status).toBe(200);
    expect(unlinkedConcept.body.itemId).toBeNull();
  });

  it('GET de pedido incluye conceptos', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/orders/${seed.orderA.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    const orderConcepts = response.body.orderConcepts as Array<{ id: string }>;
    expect(orderConcepts.some((concept) => concept.id === seed.orderConceptA.id)).toBe(true);
  });

  it('no crea un concepto con un artículo de otra empresa (IDOR 404)', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/order-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        orderId: seed.orderA.id,
        itemId: seed.itemB.id,
      });
    expectIdorHidden(response.status);
  });

  it('rechaza una posición duplicada con 409', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/order-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        orderId: seed.orderA.id,
        itemId: seed.itemA.id,
        name: 'Posición ocupada',
        position: 0,
      });
    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Ya existe un concepto en esa posición del pedido');
  });

  it('no muta conceptos de un pedido que ya no está pendiente de recepción', async () => {
    const seed = getE2eSeed();
    const orderId = await createAwaitingReceiptOrder();
    const createdConcept = await http()
      .post('/order-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ orderId, itemId: seed.itemA.id, name: 'Línea recibida' });
    expect(createdConcept.status).toBe(201);

    const received = await http()
      .patch(`/orders/${orderId}/status`)
      .query({ status: 'received' })
      .set(authHeader(E2E_EMAIL.userA));
    expect(received.status).toBe(200);

    const conceptPath = `/order-concepts/${createdConcept.body.id}`;
    const patched = await http()
      .patch(conceptPath)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ name: 'No debe cambiar' });
    expect(patched.status).toBe(400);
    expect(patched.body.message).toBe(
      'No se pueden modificar los conceptos de un pedido que ya no está pendiente de recepción',
    );
    const deleted = await http().delete(conceptPath).set(authHeader(E2E_EMAIL.userA));
    expect(deleted.status).toBe(400);
    const extraConcept = await http()
      .post('/order-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ orderId, itemId: seed.itemA.id, name: 'Extra' });
    expect(extraConcept.status).toBe(400);
  });
});
