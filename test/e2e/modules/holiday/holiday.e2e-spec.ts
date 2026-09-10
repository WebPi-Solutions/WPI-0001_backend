import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { expectIdorHidden, http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

describe('Festivos (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('el usuario A no lista festivos de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/holidays')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it('mezclar id de B con enterpriseId de A oculta el festivo (404)', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/holidays/${seed.holidayB.id}`)
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(response.status);
  });

  it('pedir el festivo de B con enterpriseId de B sin vínculo es 403', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/holidays/${seed.holidayB.id}`)
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it('el usuario A no crea un festivo en B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/holidays')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ calendarDate: '2026-01-01' });
    expect(response.status).toBe(403);
  });

  it('el usuario A no muta festivos de B', async () => {
    const seed = getE2eSeed();
    expectIdorHidden(
      (
        await http()
          .patch(`/holidays/${seed.holidayB.id}`)
          .query({ enterpriseId: seed.enterpriseA.id })
          .set(authHeader(E2E_EMAIL.userA))
          .send({ name: 'Hackeado' })
      ).status,
    );
    expect(
      (
        await http()
          .delete(`/holidays/${seed.holidayB.id}`)
          .query({ enterpriseId: seed.enterpriseB.id })
          .set(authHeader(E2E_EMAIL.userA))
      ).status,
    ).toBe(403);
  });
});
