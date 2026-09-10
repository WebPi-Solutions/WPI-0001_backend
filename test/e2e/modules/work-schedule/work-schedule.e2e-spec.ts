import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

describe('Horarios de trabajo (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('el usuario A no lista horarios de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/work-schedules')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it('el usuario A no lee el horario de B por id con enterpriseId de A', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/work-schedules/${seed.workScheduleB.id}`)
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(404);
  });
});
