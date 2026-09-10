import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

describe('Vacaciones (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('el usuario A no lista vacaciones de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/vacations')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it('el usuario A no usa el vínculo de B para crear vacaciones en A (404 del recurso)', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/vacations')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        userEnterpriseId: seed.linkB.id,
        calendarDate: '2026-09-01',
      });
    expect(response.status).toBe(404);
  });

  it('el usuario A no lee vacaciones de B por id con enterpriseId de A', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/vacations/${seed.vacationB.id}`)
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(404);
  });
});
