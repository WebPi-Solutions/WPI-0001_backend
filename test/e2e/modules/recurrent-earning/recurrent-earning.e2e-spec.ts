import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { expectIdorHidden, http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

describe('Ingresos recurrentes (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('el usuario A no lista ingresos recurrentes de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/recurrent-earnings')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it('el usuario A no lee ni borra el ingreso recurrente de B', async () => {
    const seed = getE2eSeed();
    expectIdorHidden(
      (
        await http()
          .get(`/recurrent-earnings/${seed.recurrentB.id}`)
          .set(authHeader(E2E_EMAIL.userA))
      ).status,
    );
    expectIdorHidden(
      (
        await http()
          .delete(`/recurrent-earnings/${seed.recurrentB.id}`)
          .set(authHeader(E2E_EMAIL.userA))
      ).status,
    );
  });

  it('el usuario A no actualiza el ingreso recurrente de B', async () => {
    const seed = getE2eSeed();
    expectIdorHidden(
      (
        await http()
          .patch(`/recurrent-earnings/${seed.recurrentB.id}`)
          .set(authHeader(E2E_EMAIL.userA))
          .send({ name: 'Hackeado' })
      ).status,
    );
  });
});
