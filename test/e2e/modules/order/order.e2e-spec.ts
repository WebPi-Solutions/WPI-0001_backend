import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { expectIdorHidden, http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

describe('Pedidos (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('el usuario A no lista pedidos de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/orders')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it('el usuario A no lee ni muta el pedido de B', async () => {
    const seed = getE2eSeed();
    expectIdorHidden(
      (await http().get(`/orders/${seed.orderB.id}`).set(authHeader(E2E_EMAIL.userA))).status,
    );
    expectIdorHidden(
      (
        await http()
          .patch(`/orders/${seed.orderB.id}`)
          .set(authHeader(E2E_EMAIL.userA))
          .send({ name: 'Hackeado' })
      ).status,
    );
    expectIdorHidden(
      (await http().delete(`/orders/${seed.orderB.id}`).set(authHeader(E2E_EMAIL.userA))).status,
    );
  });

  it('el usuario A no crea un pedido del cliente de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/orders')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        clientId: seed.clientB.id,
        quoteId: seed.quoteB.id,
        name: 'Intruso',
        date: '2026-03-01',
        status: 'awaiting_receipt',
      });
    expectIdorHidden(response.status);
  });

  it('el usuario A sí lee su pedido', async () => {
    const seed = getE2eSeed();
    const response = await http().get(`/orders/${seed.orderA.id}`).set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
  });

  it('el usuario A puede editar un pedido pendiente de recepción', async () => {
    const seed = getE2eSeed();
    const created = await http()
      .post('/orders')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        clientId: seed.clientA.id,
        quoteId: seed.quoteA.id,
        name: 'Pedido para editar',
        date: '2026-03-01',
        status: 'awaiting_receipt',
      });
    expect(created.status).toBe(201);

    const updated = await http()
      .patch(`/orders/${created.body.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ name: 'Pedido actualizado' });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe('Pedido actualizado');
    expect(updated.body.status).toBe('awaiting_receipt');
  });

  it('el usuario A no cambia el estado del pedido de B', async () => {
    const seed = getE2eSeed();
    expectIdorHidden(
      (
        await http()
          .patch(`/orders/${seed.orderB.id}/status`)
          .query({ status: 'received' })
          .set(authHeader(E2E_EMAIL.userA))
      ).status,
    );
  });
});
