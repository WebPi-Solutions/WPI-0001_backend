import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

describe('Billing (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('el catálogo Stripe es accesible para un usuario autenticado (skip de empresa)', async () => {
    const catalog = await http()
      .get('/billing/products-by-metadata')
      .query({ metadataKey: 'type' })
      .set(authHeader(E2E_EMAIL.userA));
    expect(catalog.status).toBe(200);
    const signings = await http()
      .get('/billing/products-signings-with-prices')
      .set(authHeader(E2E_EMAIL.outsider));
    expect(signings.status).toBe(200);
    const management = await http()
      .get('/billing/products-management-with-prices')
      .set(authHeader(E2E_EMAIL.userB));
    expect(management.status).toBe(200);
  });

  it('el usuario A no consulta suscripciones de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/billing/active-subscriptions')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it('el usuario A no crea checkout, cambia precio ni cancela la suscripción de B', async () => {
    const seed = getE2eSeed();
    const checkout = await http()
      .post('/billing/create-subscription-checkout-session')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        enterpriseId: seed.enterpriseB.id,
        priceId: 'price_e2e',
        successUrl: 'https://app.test/ok',
        cancelUrl: 'https://app.test/ko',
      });
    expect(checkout.status).toBe(403);

    const updatePrice = await http()
      .post('/billing/update-subscription-price')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        enterpriseId: seed.enterpriseB.id,
        subscriptionId: 'sub_e2e',
        priceId: 'price_e2e',
      });
    expect(updatePrice.status).toBe(403);

    const cancel = await http()
      .post('/billing/cancel-subscription-at-period-end')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        enterpriseId: seed.enterpriseB.id,
        subscriptionId: 'sub_e2e',
      });
    expect(cancel.status).toBe(403);

    const revoke = await http()
      .post('/billing/revoke-cancel-subscription-at-period-end')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        enterpriseId: seed.enterpriseB.id,
        subscriptionId: 'sub_e2e',
      });
    expect(revoke.status).toBe(403);
  });

  it('el catálogo no es público sin autenticación', async () => {
    const response = await http()
      .get('/billing/products-by-metadata')
      .query({ metadataKey: 'type' });
    expect(response.status).toBe(401);
  });

  it('el usuario A consulta suscripciones de A y un usuario sin empresas recibe lista vacía', async () => {
    const seed = getE2eSeed();
    const own = await http()
      .get('/billing/active-subscriptions')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(own.status).toBe(200);
    const outsider = await http()
      .get('/billing/active-subscriptions')
      .set(authHeader(E2E_EMAIL.outsider));
    expect(outsider.status).toBe(200);
    expect(outsider.body).toEqual([]);
  });
});
