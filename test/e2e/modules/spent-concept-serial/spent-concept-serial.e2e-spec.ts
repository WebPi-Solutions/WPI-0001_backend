import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { expectIdorHidden, http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

describe('Números de serie de conceptos de gasto (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('el usuario A no lista series de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/spent-concept-serials')
      .query({
        enterpriseId: seed.enterpriseB.id,
        spentConceptId: seed.spentConceptB.id,
      })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it('el usuario A lista series de su concepto y no las de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/spent-concept-serials')
      .query({
        enterpriseId: seed.enterpriseA.id,
        spentConceptId: seed.spentConceptA.id,
      })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    const ids = (response.body.items as Array<{ id: string }>).map((item) => item.id);
    expect(ids).toContain(seed.spentConceptSerialA.id);
    expect(ids).not.toContain(seed.spentConceptSerialB.id);
  });

  it('el usuario A no lista series colgando del concepto de B aunque use su enterpriseId', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/spent-concept-serials')
      .query({
        enterpriseId: seed.enterpriseA.id,
        spentConceptId: seed.spentConceptB.id,
      })
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(response.status);
  });

  it('el usuario A no lee el número de serie de B por UUID', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/spent-concept-serials/${seed.spentConceptSerialB.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(response.status);
  });

  it('el usuario A no crea un número de serie en el concepto de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/spent-concept-serials')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ spentConceptId: seed.spentConceptB.id, serialNumber: 'INTRUSO' });
    expectIdorHidden(response.status);
  });

  it('el usuario A sí lee su número de serie', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/spent-concept-serials/${seed.spentConceptSerialA.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(seed.spentConceptSerialA.id);
  });

  it('el usuario A no actualiza ni borra el número de serie de B', async () => {
    const seed = getE2eSeed();
    expectIdorHidden(
      (
        await http()
          .patch(`/spent-concept-serials/${seed.spentConceptSerialB.id}`)
          .set(authHeader(E2E_EMAIL.userA))
          .send({ serialNumber: 'HACK' })
      ).status,
    );
    expectIdorHidden(
      (
        await http()
          .delete(`/spent-concept-serials/${seed.spentConceptSerialB.id}`)
          .set(authHeader(E2E_EMAIL.userA))
      ).status,
    );
  });

  it.each([
    {
      name: 'GET /spent-concept-serials',
      method: 'get' as const,
      path: () => '/spent-concept-serials',
      permission: 'spents.read',
    },
    {
      name: 'POST /spent-concept-serials',
      method: 'post' as const,
      path: () => '/spent-concept-serials',
      permission: 'spents.write',
      body: (seed: { spentConceptA: { id: string } }) => ({
        spentConceptId: seed.spentConceptA.id,
        serialNumber: 'EMPLEADO',
      }),
    },
    {
      name: 'GET /spent-concept-serials/:id',
      method: 'get' as const,
      path: (seed: { spentConceptSerialA: { id: string } }) =>
        `/spent-concept-serials/${seed.spentConceptSerialA.id}`,
      permission: 'spents.read',
    },
    {
      name: 'PATCH /spent-concept-serials/:id',
      method: 'patch' as const,
      path: (seed: { spentConceptSerialA: { id: string } }) =>
        `/spent-concept-serials/${seed.spentConceptSerialA.id}`,
      permission: 'spents.write',
      body: () => ({ serialNumber: 'HACK' }),
    },
    {
      name: 'DELETE /spent-concept-serials/:id',
      method: 'delete' as const,
      path: (seed: { spentConceptSerialA: { id: string } }) =>
        `/spent-concept-serials/${seed.spentConceptSerialA.id}`,
      permission: 'spents.delete',
    },
  ])('$name es 403 para el empleado sin permiso $permission', async ({ method, path, permission, body }) => {
    const seed = getE2eSeed();
    let requestBuilder = http()
      [method](path(seed))
      .query({
        enterpriseId: seed.enterpriseA.id,
        spentConceptId: seed.spentConceptA.id,
      })
      .set(authHeader(E2E_EMAIL.employeeA));
    if (body && (method === 'post' || method === 'patch')) {
      requestBuilder = requestBuilder.send(body(seed));
    }
    const response = await requestBuilder;
    expect(response.status).toBe(403);
    expect(response.body.message).toBe(`No tiene permiso para realizar la acción ${permission}`);
  });
});

describe('Números de serie de conceptos de gasto (e2e) — reglas de negocio', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  /**
   * Crea un gasto de la empresa A.
   * @returns Identificador del gasto
   */
  async function createSpent(): Promise<string> {
    const seed = getE2eSeed();
    const spent = await http()
      .post('/spents')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        supplierId: seed.supplierA.id,
        name: 'Gasto de reglas de serie',
        issuedDate: '2026-06-01',
        collectionDate: '2026-06-15',
        declarationDate: '2026-06-01',
        status: 'paid',
      });
    expect(spent.status).toBe(201);
    return spent.body.id as string;
  }

  it('un PATCH no mueve el número de serie a otro concepto', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .patch(`/spent-concept-serials/${seed.spentConceptSerialA.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ spentConceptId: seed.spentConceptB.id });
    expect(response.status).toBe(200);
    expect(response.body.spentConceptId).toBe(seed.spentConceptA.id);
  });

  it('rechaza un número de serie duplicado con 409', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/spent-concept-serials')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        spentConceptId: seed.spentConceptA.id,
        serialNumber: seed.spentConceptSerialA.serialNumber,
      });
    expect(response.status).toBe(409);
    expect(response.body.message).toBe(
      `El número de serie ${seed.spentConceptSerialA.serialNumber} ya existe para este artículo`,
    );
  });

  it('no asigna series a un concepto manual ni a un artículo sin número de serie', async () => {
    const seed = getE2eSeed();
    const spentId = await createSpent();
    const itemWithoutSerial = await http()
      .post('/items')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        name: 'Gasto sin serie',
        itemCategoryId: seed.itemCategoryA.id,
        serialNumber: false,
        pricePvp: 5,
      });
    expect(itemWithoutSerial.status).toBe(201);

    const manualConcept = await http()
      .post('/spent-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ spentId, name: 'Hora manual', quantity: 2 });
    expect(manualConcept.status).toBe(201);
    const serialOnManual = await http()
      .post('/spent-concept-serials')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        spentConceptId: manualConcept.body.id,
        serialNumber: 'SN-SPENT-MANUAL',
      });
    expect(serialOnManual.status).toBe(400);
    expect(serialOnManual.body.message).toBe(
      'Solo se pueden asignar números de serie a conceptos vinculados a un artículo que se gestiona con número de serie',
    );

    const conceptWithoutSerialItem = await http()
      .post('/spent-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        spentId,
        itemId: itemWithoutSerial.body.id,
        quantity: 2,
      });
    expect(conceptWithoutSerialItem.status).toBe(201);
    const serialOnItem = await http()
      .post('/spent-concept-serials')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        spentConceptId: conceptWithoutSerialItem.body.id,
        serialNumber: 'SN-SPENT-NOSERIAL',
      });
    expect(serialOnItem.status).toBe(400);

    await http()
      .delete(`/spent-concepts/${manualConcept.body.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    await http()
      .delete(`/spent-concepts/${conceptWithoutSerialItem.body.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    await http().delete(`/spents/${spentId}`).set(authHeader(E2E_EMAIL.userA));
    await http()
      .delete(`/items/${itemWithoutSerial.body.id}`)
      .set(authHeader(E2E_EMAIL.userA));
  });

  it('no crea más series que la cantidad del concepto', async () => {
    const seed = getE2eSeed();
    const spentId = await createSpent();
    const serialTrackedItem = await http()
      .post('/items')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        name: 'Gasto con serie',
        itemCategoryId: seed.itemCategoryA.id,
        serialNumber: true,
        stock: true,
        pricePvp: 8,
      });
    expect(serialTrackedItem.status).toBe(201);
    const concept = await http()
      .post('/spent-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        spentId,
        itemId: serialTrackedItem.body.id,
        quantity: 1,
      });
    expect(concept.status).toBe(201);
    const firstSerial = await http()
      .post('/spent-concept-serials')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        spentConceptId: concept.body.id,
        serialNumber: 'SN-SPENT-CAP-1',
      });
    expect(firstSerial.status).toBe(201);
    const extraSerial = await http()
      .post('/spent-concept-serials')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        spentConceptId: concept.body.id,
        serialNumber: 'SN-SPENT-CAP-2',
      });
    expect(extraSerial.status).toBe(400);
    expect(extraSerial.body.message).toBe(
      'El número de series no puede superar la cantidad del concepto',
    );

    await http()
      .delete(`/spent-concept-serials/${firstSerial.body.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    await http()
      .delete(`/spent-concepts/${concept.body.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    await http().delete(`/spents/${spentId}`).set(authHeader(E2E_EMAIL.userA));
    await http()
      .delete(`/items/${serialTrackedItem.body.id}`)
      .set(authHeader(E2E_EMAIL.userA));
  });
});
