import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { expectIdorHidden, http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

describe('Conceptos de gasto (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('el usuario A no lista conceptos de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/spent-concepts')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it('el usuario A lista conceptos de A y no ve los de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/spent-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    const ids = (response.body.items as Array<{ id: string }>).map((item) => item.id);
    expect(ids).toContain(seed.spentConceptA.id);
    expect(ids).not.toContain(seed.spentConceptB.id);
  });

  it('el usuario A no lee el concepto de B por UUID', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/spent-concepts/${seed.spentConceptB.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(response.status);
  });

  it('el usuario A no crea un concepto en el gasto de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/spent-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ spentId: seed.spentB.id, name: 'Intruso' });
    expectIdorHidden(response.status);
  });

  it('el usuario A no crea conceptos en la empresa B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/spent-concepts')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ spentId: seed.spentB.id, name: 'Intruso' });
    expect(response.status).toBe(403);
  });

  it('el usuario A sí lee su concepto', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/spent-concepts/${seed.spentConceptA.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(seed.spentConceptA.id);
  });

  it('el usuario A no actualiza ni borra el concepto de B', async () => {
    const seed = getE2eSeed();
    expectIdorHidden(
      (
        await http()
          .patch(`/spent-concepts/${seed.spentConceptB.id}`)
          .set(authHeader(E2E_EMAIL.userA))
          .send({ name: 'Hackeado' })
      ).status,
    );
    expectIdorHidden(
      (
        await http()
          .delete(`/spent-concepts/${seed.spentConceptB.id}`)
          .set(authHeader(E2E_EMAIL.userA))
      ).status,
    );
  });

  it('un PATCH no mueve el concepto a un gasto de otra empresa', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .patch(`/spent-concepts/${seed.spentConceptA.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ spentId: seed.spentB.id });
    expect(response.status).toBe(200);
    expect(response.body.spentId).toBe(seed.spentA.id);
  });

  it.each([
    {
      name: 'GET /spent-concepts',
      method: 'get' as const,
      path: () => '/spent-concepts',
      permission: 'spents.read',
    },
    {
      name: 'POST /spent-concepts',
      method: 'post' as const,
      path: () => '/spent-concepts',
      permission: 'spents.write',
      body: (seed: { spentA: { id: string } }) => ({
        spentId: seed.spentA.id,
        name: 'Intruso empleado',
      }),
    },
    {
      name: 'GET /spent-concepts/:id',
      method: 'get' as const,
      path: (seed: { spentConceptA: { id: string } }) =>
        `/spent-concepts/${seed.spentConceptA.id}`,
      permission: 'spents.read',
    },
    {
      name: 'PATCH /spent-concepts/:id',
      method: 'patch' as const,
      path: (seed: { spentConceptA: { id: string } }) =>
        `/spent-concepts/${seed.spentConceptA.id}`,
      permission: 'spents.write',
      body: () => ({ name: 'Hackeado' }),
    },
    {
      name: 'DELETE /spent-concepts/:id',
      method: 'delete' as const,
      path: (seed: { spentConceptA: { id: string } }) =>
        `/spent-concepts/${seed.spentConceptA.id}`,
      permission: 'spents.delete',
    },
  ])('$name es 403 para el empleado sin permiso $permission', async ({ method, path, permission, body }) => {
    const seed = getE2eSeed();
    let requestBuilder = http()
      [method](path(seed))
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.employeeA));
    if (body && (method === 'post' || method === 'patch')) {
      requestBuilder = requestBuilder.send(body(seed));
    }
    const response = await requestBuilder;
    expect(response.status).toBe(403);
    expect(response.body.message).toBe(`No tiene permiso para realizar la acción ${permission}`);
  });

  it('un usuario sin empresas no lista ni crea conceptos de A', async () => {
    const seed = getE2eSeed();
    const listed = await http()
      .get('/spent-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.outsider));
    expect(listed.status).toBe(403);
    const created = await http()
      .post('/spent-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.outsider))
      .send({ spentId: seed.spentA.id, name: 'Intruso externo' });
    expect(created.status).toBe(403);
  });

  it('un usuario sin empresas no lee ni muta el concepto de A por UUID (IDOR 404)', async () => {
    const seed = getE2eSeed();
    const conceptPath = `/spent-concepts/${seed.spentConceptA.id}`;
    expectIdorHidden((await http().get(conceptPath).set(authHeader(E2E_EMAIL.outsider))).status);
    expectIdorHidden(
      (await http().patch(conceptPath).set(authHeader(E2E_EMAIL.outsider)).send({ name: 'Hackeado' }))
        .status,
    );
    expectIdorHidden((await http().delete(conceptPath).set(authHeader(E2E_EMAIL.outsider))).status);
  });
});

describe('Conceptos de gasto (e2e) — reglas de negocio', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  /**
   * Crea un gasto de la empresa A.
   * @returns Identificador del gasto creado
   */
  async function createSpent(): Promise<string> {
    const seed = getE2eSeed();
    const spent = await http()
      .post('/spents')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        supplierId: seed.supplierA.id,
        name: 'Gasto de reglas de concepto',
        issuedDate: '2026-06-01',
        collectionDate: '2026-06-15',
        declarationDate: '2026-06-01',
        status: 'paid',
      });
    expect(spent.status).toBe(201);
    return spent.body.id as string;
  }

  /**
   * Crea un artículo con o sin gestión de número de serie.
   * @param serialNumber - Si el artículo admite series
   * @returns Identificador del artículo
   */
  async function createItem(serialNumber: boolean): Promise<string> {
    const seed = getE2eSeed();
    const item = await http()
      .post('/items')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        name: serialNumber ? 'Artículo gasto con serie' : 'Artículo gasto sin serie',
        itemCategoryId: seed.itemCategoryA.id,
        serialNumber,
        stock: serialNumber,
        pricePvp: 12,
      });
    expect(item.status).toBe(201);
    return item.body.id as string;
  }

  it('GET de gasto incluye conceptos y sus números de serie', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/spents/${seed.spentA.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    const spentConcepts = response.body.spentConcepts as Array<{
      id: string;
      serials?: Array<{ id: string; serialNumber: string }>;
    }>;
    expect(spentConcepts.some((concept) => concept.id === seed.spentConceptA.id)).toBe(true);
    const seededConcept = spentConcepts.find(
      (concept) => concept.id === seed.spentConceptA.id,
    );
    expect(seededConcept?.serials?.some((serial) => serial.id === seed.spentConceptSerialA.id))
      .toBe(true);
  });

  it('crea una línea de texto libre sin artículo y permite desvincularlo', async () => {
    const seed = getE2eSeed();
    const spentId = await createSpent();
    const createdConcept = await http()
      .post('/spent-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ spentId, name: 'Línea manual' });
    expect(createdConcept.status).toBe(201);
    expect(createdConcept.body.itemId).toBeNull();
    expect(createdConcept.body.name).toBe('Línea manual');

    const linkedConcept = await http()
      .patch(`/spent-concepts/${createdConcept.body.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ itemId: seed.itemA.id });
    expect(linkedConcept.status).toBe(200);
    expect(linkedConcept.body.itemId).toBe(seed.itemA.id);

    const unlinkedConcept = await http()
      .patch(`/spent-concepts/${createdConcept.body.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ itemId: null });
    expect(unlinkedConcept.status).toBe(200);
    expect(unlinkedConcept.body.itemId).toBeNull();

    expect(
      (
        await http()
          .delete(`/spent-concepts/${createdConcept.body.id}`)
          .set(authHeader(E2E_EMAIL.userA))
      ).status,
    ).toBe(200);
    expect((await http().delete(`/spents/${spentId}`).set(authHeader(E2E_EMAIL.userA))).status).toBe(
      200,
    );
  });

  it('no crea un concepto con un artículo de otra empresa (IDOR 404)', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/spent-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        spentId: seed.spentA.id,
        itemId: seed.itemB.id,
      });
    expectIdorHidden(response.status);
  });

  it('rechaza una posición duplicada con 409', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/spent-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        spentId: seed.spentA.id,
        name: 'Posición ocupada',
        position: 0,
      });
    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Ya existe un concepto en esa posición del gasto');
  });

  it('no desvincula el artículo ni baja la cantidad por debajo de las series', async () => {
    const seed = getE2eSeed();
    const spentId = await createSpent();
    const serialTrackedItemId = await createItem(true);
    const itemWithoutSerialId = await createItem(false);
    const createdConcept = await http()
      .post('/spent-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        spentId,
        itemId: serialTrackedItemId,
        quantity: 2,
      });
    expect(createdConcept.status).toBe(201);
    const createdSerial = await http()
      .post('/spent-concept-serials')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        spentConceptId: createdConcept.body.id,
        serialNumber: 'SN-SPENT-QTY-1',
      });
    expect(createdSerial.status).toBe(201);

    const reducedQuantity = await http()
      .patch(`/spent-concepts/${createdConcept.body.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ quantity: 0 });
    expect(reducedQuantity.status).toBe(400);
    expect(reducedQuantity.body.message).toBe(
      'La cantidad no puede ser menor que el número de series asignadas',
    );

    const unlinked = await http()
      .patch(`/spent-concepts/${createdConcept.body.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ itemId: null });
    expect(unlinked.status).toBe(400);
    expect(unlinked.body.message).toBe(
      'No se puede quitar el artículo con número de serie mientras el concepto tenga series asignadas',
    );

    const switched = await http()
      .patch(`/spent-concepts/${createdConcept.body.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ itemId: itemWithoutSerialId });
    expect(switched.status).toBe(400);

    expect(
      (
        await http()
          .delete(`/spent-concept-serials/${createdSerial.body.id}`)
          .set(authHeader(E2E_EMAIL.userA))
      ).status,
    ).toBe(200);
    expect(
      (
        await http()
          .delete(`/spent-concepts/${createdConcept.body.id}`)
          .set(authHeader(E2E_EMAIL.userA))
      ).status,
    ).toBe(200);
    expect((await http().delete(`/spents/${spentId}`).set(authHeader(E2E_EMAIL.userA))).status).toBe(
      200,
    );
    expect(
      (
        await http()
          .delete(`/items/${serialTrackedItemId}`)
          .set(authHeader(E2E_EMAIL.userA))
      ).status,
    ).toBe(200);
    expect(
      (
        await http().delete(`/items/${itemWithoutSerialId}`).set(authHeader(E2E_EMAIL.userA))
      ).status,
    ).toBe(200);
  });
});
