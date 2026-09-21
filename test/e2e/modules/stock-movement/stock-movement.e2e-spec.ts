import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { expectIdorHidden, http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

describe('Movimientos de stock (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('el usuario A no lista movimientos de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/stock-movements')
      .query({
        enterpriseId: seed.enterpriseB.id,
        itemId: seed.itemB.id,
      })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it('el usuario A lista movimientos de su artículo y no los de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/stock-movements')
      .query({
        enterpriseId: seed.enterpriseA.id,
        itemId: seed.itemA.id,
      })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    const ids = (response.body.items as Array<{ id: string }>).map((item) => item.id);
    expect(ids).toContain(seed.stockMovementA.id);
    expect(ids).not.toContain(seed.stockMovementB.id);
    const listedMovement = (
      response.body.items as Array<{ id: string; itemSerial?: { serialNumber?: string } }>
    ).find((movement) => movement.id === seed.stockMovementA.id);
    expect(listedMovement?.itemSerial?.serialNumber).toBe(seed.itemSerialA.serialNumber);
  });

  it('el usuario A no lista movimientos colgando del artículo de B aunque use su enterpriseId', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/stock-movements')
      .query({
        enterpriseId: seed.enterpriseA.id,
        itemId: seed.itemB.id,
      })
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(response.status);
  });

  it('el usuario A no lee el movimiento de B por UUID', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/stock-movements/${seed.stockMovementB.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(response.status);
  });

  it('el usuario A sí lee su movimiento', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/stock-movements/${seed.stockMovementA.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(seed.stockMovementA.id);
    expect(response.body.direction).toBe('in');
    expect(response.body.itemSerial?.serialNumber).toBe(seed.itemSerialA.serialNumber);
  });

  it.each([
    {
      name: 'GET /stock-movements',
      path: () => '/stock-movements',
    },
    {
      name: 'GET /stock-movements/:id',
      path: (seed: { stockMovementA: { id: string } }) =>
        `/stock-movements/${seed.stockMovementA.id}`,
    },
  ])('$name es 403 para el empleado sin permiso items.read', async ({ path }) => {
    const seed = getE2eSeed();
    const response = await http()
      .get(path(seed))
      .query({
        enterpriseId: seed.enterpriseA.id,
        itemId: seed.itemA.id,
      })
      .set(authHeader(E2E_EMAIL.employeeA));
    expect(response.status).toBe(403);
    expect(response.body.message).toBe('No tiene permiso para realizar la acción items.read');
  });
});
