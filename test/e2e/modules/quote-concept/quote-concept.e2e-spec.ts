import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { expectIdorHidden, http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

describe('Conceptos de presupuesto (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('el usuario A no lista conceptos de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/quote-concepts')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it('el usuario A lista conceptos de A y no ve los de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/quote-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    const ids = (response.body.items as Array<{ id: string }>).map((item) => item.id);
    expect(ids).toContain(seed.quoteConceptA.id);
    expect(ids).not.toContain(seed.quoteConceptB.id);
  });

  it('el usuario A no lee el concepto de B por UUID', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/quote-concepts/${seed.quoteConceptB.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(response.status);
  });

  it('el usuario A no crea un concepto en el presupuesto de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/quote-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ quoteId: seed.quoteB.id, itemId: seed.itemA.id });
    expectIdorHidden(response.status);
  });

  it('el usuario A no crea conceptos en la empresa B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/quote-concepts')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ quoteId: seed.quoteB.id, itemId: seed.itemB.id });
    expect(response.status).toBe(403);
  });

  it('el usuario A sí lee su concepto', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/quote-concepts/${seed.quoteConceptA.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(seed.quoteConceptA.id);
  });

  it('el usuario A no actualiza ni borra el concepto de B', async () => {
    const seed = getE2eSeed();
    expectIdorHidden(
      (
        await http()
          .patch(`/quote-concepts/${seed.quoteConceptB.id}`)
          .set(authHeader(E2E_EMAIL.userA))
          .send({ name: 'Hackeado' })
      ).status,
    );
    expectIdorHidden(
      (
        await http()
          .delete(`/quote-concepts/${seed.quoteConceptB.id}`)
          .set(authHeader(E2E_EMAIL.userA))
      ).status,
    );
  });

  it('un PATCH no mueve el concepto a un presupuesto de otra empresa', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .patch(`/quote-concepts/${seed.quoteConceptA.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ quoteId: seed.quoteB.id });
    expect(response.status).toBe(200);
    expect(response.body.quoteId).toBe(seed.quoteA.id);
  });

  it.each([
    {
      name: 'GET /quote-concepts',
      method: 'get' as const,
      path: () => '/quote-concepts',
      permission: 'quotes.read',
    },
    {
      name: 'POST /quote-concepts',
      method: 'post' as const,
      path: () => '/quote-concepts',
      permission: 'quotes.write',
      body: (seed: { quoteA: { id: string }; itemA: { id: string } }) => ({
        quoteId: seed.quoteA.id,
        itemId: seed.itemA.id,
      }),
    },
    {
      name: 'GET /quote-concepts/:id',
      method: 'get' as const,
      path: (seed: { quoteConceptA: { id: string } }) =>
        `/quote-concepts/${seed.quoteConceptA.id}`,
      permission: 'quotes.read',
    },
    {
      name: 'PATCH /quote-concepts/:id',
      method: 'patch' as const,
      path: (seed: { quoteConceptA: { id: string } }) =>
        `/quote-concepts/${seed.quoteConceptA.id}`,
      permission: 'quotes.write',
      body: () => ({ name: 'Hackeado' }),
    },
    {
      name: 'DELETE /quote-concepts/:id',
      method: 'delete' as const,
      path: (seed: { quoteConceptA: { id: string } }) =>
        `/quote-concepts/${seed.quoteConceptA.id}`,
      permission: 'quotes.delete',
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
      .get('/quote-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.outsider));
    expect(listed.status).toBe(403);
    const created = await http()
      .post('/quote-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.outsider))
      .send({ quoteId: seed.quoteA.id, itemId: seed.itemA.id });
    expect(created.status).toBe(403);
  });

  it('un usuario sin empresas no lee ni muta el concepto de A por UUID (IDOR 404)', async () => {
    const seed = getE2eSeed();
    const conceptPath = `/quote-concepts/${seed.quoteConceptA.id}`;
    expectIdorHidden((await http().get(conceptPath).set(authHeader(E2E_EMAIL.outsider))).status);
    expectIdorHidden(
      (await http().patch(conceptPath).set(authHeader(E2E_EMAIL.outsider)).send({ name: 'Hackeado' }))
        .status,
    );
    expectIdorHidden((await http().delete(conceptPath).set(authHeader(E2E_EMAIL.outsider))).status);
  });
});

describe('Conceptos de presupuesto (e2e) — reglas de negocio', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  /**
   * Crea un presupuesto en borrador de la empresa A.
   * @returns Identificador del presupuesto creado
   */
  async function createDraftQuote(): Promise<string> {
    const seed = getE2eSeed();
    const quote = await http()
      .post('/quotes')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        clientId: seed.clientA.id,
        name: 'Presupuesto de reglas de concepto',
        issuedDate: '2026-06-01',
        formalizationDate: '2026-06-15',
        status: 'draft',
      });
    expect(quote.status).toBe(201);
    return quote.body.id as string;
  }

  it('crea una línea de texto libre sin artículo y permite desvincularlo', async () => {
    const seed = getE2eSeed();
    const quoteId = await createDraftQuote();
    const createdConcept = await http()
      .post('/quote-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ quoteId, name: 'Línea manual' });
    expect(createdConcept.status).toBe(201);
    expect(createdConcept.body.itemId).toBeNull();
    expect(createdConcept.body.name).toBe('Línea manual');

    const linkedConcept = await http()
      .patch(`/quote-concepts/${createdConcept.body.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ itemId: seed.itemA.id });
    expect(linkedConcept.status).toBe(200);
    expect(linkedConcept.body.itemId).toBe(seed.itemA.id);

    const unlinkedConcept = await http()
      .patch(`/quote-concepts/${createdConcept.body.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ itemId: null });
    expect(unlinkedConcept.status).toBe(200);
    expect(unlinkedConcept.body.itemId).toBeNull();
  });

  it('GET de presupuesto incluye conceptos', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/quotes/${seed.quoteA.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    const quoteConcepts = response.body.quoteConcepts as Array<{ id: string }>;
    expect(quoteConcepts.some((concept) => concept.id === seed.quoteConceptA.id)).toBe(true);
  });

  it('no crea un concepto con un artículo de otra empresa (IDOR 404)', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/quote-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        quoteId: seed.quoteA.id,
        itemId: seed.itemB.id,
      });
    expectIdorHidden(response.status);
  });

  it('rechaza una posición duplicada con 409', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/quote-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        quoteId: seed.quoteA.id,
        itemId: seed.itemA.id,
        name: 'Posición ocupada',
        position: 0,
      });
    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Ya existe un concepto en esa posición del presupuesto');
  });

  it('permite mutar conceptos de un presupuesto emitido', async () => {
    const seed = getE2eSeed();
    const quoteId = await createDraftQuote();
    const createdConcept = await http()
      .post('/quote-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ quoteId, itemId: seed.itemA.id, name: 'Línea emitida' });
    expect(createdConcept.status).toBe(201);

    const issued = await http()
      .patch(`/quotes/${quoteId}/status`)
      .query({ status: 'issued' })
      .set(authHeader(E2E_EMAIL.userA));
    expect(issued.status).toBe(200);

    const conceptPath = `/quote-concepts/${createdConcept.body.id}`;
    const patched = await http()
      .patch(conceptPath)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ name: 'Línea modificada' });
    expect(patched.status).toBe(200);
    expect(patched.body.name).toBe('Línea modificada');
    const deleted = await http().delete(conceptPath).set(authHeader(E2E_EMAIL.userA));
    expect(deleted.status).toBe(200);
    const extraConcept = await http()
      .post('/quote-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ quoteId, itemId: seed.itemA.id, name: 'Extra' });
    expect(extraConcept.status).toBe(201);
    expect(extraConcept.body.name).toBe('Extra');
  });
});
