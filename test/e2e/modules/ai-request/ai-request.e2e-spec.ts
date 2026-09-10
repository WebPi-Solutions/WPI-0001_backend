import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { expectIdorHidden, http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

describe('Peticiones IA (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('el usuario A no lista ni lee peticiones IA de B', async () => {
    const seed = getE2eSeed();
    const list = await http()
      .get('/ai-requests')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(list.status).toBe(403);
    const byId = await http()
      .get(`/ai-requests/${seed.aiRequestB.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(byId.status);
  });

  it('el usuario A no registra una petición IA en B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/ai-requests')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
        type: 'get_spent_issuer',
        message: 'intruso',
      });
    expect(response.status).toBe(403);
  });
});
