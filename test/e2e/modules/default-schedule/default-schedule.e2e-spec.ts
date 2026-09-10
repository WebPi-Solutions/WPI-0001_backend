import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

describe('Plantillas de horario (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('el usuario A no lista plantillas de horario de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/default-schedules')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it('el usuario A no lee la plantilla de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/default-schedules/${seed.defaultScheduleB.id}`)
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it('el usuario A no actualiza la plantilla de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .patch(`/default-schedules/${seed.defaultScheduleB.id}`)
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ name: 'Hackeada' });
    expect(response.status).toBe(403);
  });
});
