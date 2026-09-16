import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { expectIdorHidden, http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

describe('Presupuestos (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('el usuario A no lista presupuestos de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/quotes')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it('el usuario A no lee ni muta el presupuesto de B', async () => {
    const seed = getE2eSeed();
    expectIdorHidden(
      (await http().get(`/quotes/${seed.quoteB.id}`).set(authHeader(E2E_EMAIL.userA))).status,
    );
    expectIdorHidden(
      (
        await http()
          .patch(`/quotes/${seed.quoteB.id}`)
          .set(authHeader(E2E_EMAIL.userA))
          .send({ name: 'Hackeado' })
      ).status,
    );
    expectIdorHidden(
      (await http().delete(`/quotes/${seed.quoteB.id}`).set(authHeader(E2E_EMAIL.userA))).status,
    );
  });

  it('el usuario A no crea un presupuesto del cliente de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/quotes')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        clientId: seed.clientB.id,
        name: 'Intruso',
        issuedDate: '2026-03-01',
        formalizationDate: '2026-03-15',
        status: 'draft',
      });
    expectIdorHidden(response.status);
  });

  it('el usuario A sí lee su presupuesto', async () => {
    const seed = getE2eSeed();
    const response = await http().get(`/quotes/${seed.quoteA.id}`).set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
  });

  it('el usuario A puede editar un presupuesto ya emitido', async () => {
    const seed = getE2eSeed();
    const created = await http()
      .post('/quotes')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        clientId: seed.clientA.id,
        name: 'Presupuesto para editar emitido',
        issuedDate: '2026-03-01',
        formalizationDate: '2026-03-15',
        status: 'draft',
      });
    expect(created.status).toBe(201);

    const issued = await http()
      .patch(`/quotes/${created.body.id}/status`)
      .query({ status: 'issued' })
      .set(authHeader(E2E_EMAIL.userA));
    expect(issued.status).toBe(200);

    const updated = await http()
      .patch(`/quotes/${created.body.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ name: 'Presupuesto emitido actualizado' });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe('Presupuesto emitido actualizado');
    expect(updated.body.status).toBe('issued');
  });

  it('el usuario A no cambia el estado del presupuesto de B', async () => {
    const seed = getE2eSeed();
    expectIdorHidden(
      (
        await http()
          .patch(`/quotes/${seed.quoteB.id}/status`)
          .query({ status: 'issued' })
          .set(authHeader(E2E_EMAIL.userA))
      ).status,
    );
  });
});
