import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

/**
 * Subconjunto de la semilla e2e usado por el grafo de gasto.
 */
type SpentGraphSeed = ReturnType<typeof getE2eSeed>;

/**
 * Serie anidada en la respuesta del grafo de gasto.
 */
interface SpentGraphSerialBody {
  /** UUID persistido de `spent_concept_serials` */
  id?: string;
  /** Número de serie recortado */
  serialNumber: string;
}

/**
 * Concepto anidado en la respuesta del grafo de gasto.
 */
interface SpentGraphConceptBody {
  /** UUID persistido de `spent_concepts` */
  id: string;
  /** Nombre congelado de la línea */
  name: string;
  /** Artículo de catálogo, o null en alta libre */
  itemId?: string | null;
  /** Unidades de la línea */
  quantity?: number;
  /** Series vinculadas a la línea */
  serials?: SpentGraphSerialBody[];
}

/**
 * Cuerpo HTTP del gasto recargado con líneas y series.
 */
interface SpentGraphBody {
  /** UUID del gasto */
  id: string;
  /** Nombre de la factura */
  name: string;
  /** Estado persistido */
  status?: string;
  /** Grafo de conceptos */
  spentConcepts?: SpentGraphConceptBody[];
}

/**
 * Genera un sufijo único por caso para no chocar entre tests paralelos ni reintentos.
 *
 * @returns Token alfanumérico
 */
function buildUniqueToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Cabecera mínima de un gasto de la empresa A.
 *
 * @param seed - Semilla e2e
 * @param uniqueToken - Sufijo del nombre
 * @param overrides - Campos a sobrescribir
 * @returns Cuerpo de cabecera
 */
function buildSpentHeader(
  seed: SpentGraphSeed,
  uniqueToken: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    supplierId: seed.supplierA.id,
    name: `Gasto atómico ${uniqueToken}`,
    issuedDate: '2026-03-01',
    collectionDate: '2026-03-15',
    declarationDate: '2026-03-01',
    status: 'paid',
    ...overrides,
  };
}

/**
 * Línea de artículo con números de serie (una unidad por serie, salvo override).
 *
 * @param options - Artículo, series y posición
 * @returns Concepto anidado
 */
function buildSerializedLine(options: {
  name: string;
  itemId: string;
  serialNumbers: string[];
  position: number;
  quantity?: number;
}): Record<string, unknown> {
  const quantity = options.quantity ?? options.serialNumbers.length;
  return {
    name: options.name,
    itemId: options.itemId,
    quantity,
    basePrice: 10,
    vat: 21,
    irpf: 0,
    position: options.position,
    serials: options.serialNumbers.map((serialNumber) => ({ serialNumber })),
  };
}

/**
 * Línea de texto libre, sin artículo ni series.
 *
 * @param name - Nombre de la línea
 * @param position - Posición 0-based
 * @returns Concepto anidado
 */
function buildFreeTextLine(name: string, position: number): Record<string, unknown> {
  return {
    name,
    itemId: null,
    quantity: 1,
    basePrice: 5,
    vat: 21,
    irpf: 0,
    position,
  };
}

/**
 * Recoge los números de serie persistidos en el grafo.
 *
 * @param spentGraph - Gasto recargado
 * @returns Series en el orden de las líneas
 */
function collectSpentSerialNumbers(spentGraph: SpentGraphBody): string[] {
  return (spentGraph.spentConcepts ?? []).flatMap((spentConcept) =>
    (spentConcept.serials ?? []).map((spentConceptSerial) => spentConceptSerial.serialNumber),
  );
}

/**
 * POST `/spents` con el grafo anidado en una sola petición.
 *
 * @param seed - Semilla e2e
 * @param payload - Cabecera y `spentConcepts`
 * @returns Respuesta HTTP
 */
function postSpentGraph(seed: SpentGraphSeed, payload: Record<string, unknown>) {
  return http()
    .post('/spents')
    .query({ enterpriseId: seed.enterpriseA.id })
    .set(authHeader(E2E_EMAIL.userA))
    .send(payload);
}

/**
 * PATCH `/spents/:id` con el grafo anidado en una sola petición.
 *
 * @param seed - Semilla e2e
 * @param spentId - UUID del gasto
 * @param payload - Cabecera y, si aplica, `spentConcepts`
 * @returns Respuesta HTTP
 */
function patchSpentGraph(seed: SpentGraphSeed, spentId: string, payload: Record<string, unknown>) {
  return http()
    .patch(`/spents/${spentId}`)
    .query({ enterpriseId: seed.enterpriseA.id })
    .set(authHeader(E2E_EMAIL.userA))
    .send(payload);
}

/**
 * Recarga el gasto con conceptos y series fusionados por el servicio.
 *
 * @param spentId - UUID del gasto
 * @returns Grafo persistido
 */
async function loadSpentGraph(spentId: string): Promise<SpentGraphBody> {
  const response = await http().get(`/spents/${spentId}`).set(authHeader(E2E_EMAIL.userA));
  expect(response.status).toBe(200);
  return response.body as SpentGraphBody;
}

/**
 * Lista gastos de A filtrando por nombre exacto.
 *
 * @param seed - Semilla e2e
 * @param spentName - Nombre buscado
 * @returns Nombres de la página
 */
async function listSpentNamesByExactName(seed: SpentGraphSeed, spentName: string): Promise<string[]> {
  const response = await http()
    .get('/spents')
    .query({
      enterpriseId: seed.enterpriseA.id,
      pageSize: 100,
      filter: JSON.stringify({ name: spentName }),
    })
    .set(authHeader(E2E_EMAIL.userA));
  expect(response.status).toBe(200);
  return (response.body.items as Array<{ name: string }>).map((spent) => spent.name);
}

/**
 * Busca un número de serie concreto en el catálogo del artículo.
 *
 * @param seed - Semilla e2e
 * @param itemId - Artículo propietario
 * @param serialNumber - Valor buscado
 * @returns Series coincidentes
 */
async function listCatalogSerialNumbers(
  seed: SpentGraphSeed,
  itemId: string,
  serialNumber: string,
): Promise<string[]> {
  const response = await http()
    .get('/item-serials')
    .query({
      enterpriseId: seed.enterpriseA.id,
      itemId,
      pageSize: 10,
      filter: JSON.stringify({ serialNumber }),
    })
    .set(authHeader(E2E_EMAIL.userA));
  expect(response.status).toBe(200);
  return (response.body.items as Array<{ serialNumber: string }>).map(
    (itemSerial) => itemSerial.serialNumber,
  );
}

/**
 * Afirma que el número de serie no existe en el catálogo.
 *
 * @param seed - Semilla e2e
 * @param itemId - Artículo
 * @param serialNumber - Valor que no debe persistir
 */
async function expectCatalogSerialAbsent(
  seed: SpentGraphSeed,
  itemId: string,
  serialNumber: string,
): Promise<void> {
  const catalogSerialNumbers = await listCatalogSerialNumbers(seed, itemId, serialNumber);
  expect(catalogSerialNumbers).not.toContain(serialNumber);
}

/**
 * Afirma que el número de serie existe exactamente una vez en el catálogo.
 *
 * @param seed - Semilla e2e
 * @param itemId - Artículo
 * @param serialNumber - Valor único esperado
 */
async function expectCatalogSerialUnique(
  seed: SpentGraphSeed,
  itemId: string,
  serialNumber: string,
): Promise<void> {
  const catalogSerialNumbers = await listCatalogSerialNumbers(seed, itemId, serialNumber);
  expect(catalogSerialNumbers.filter((value) => value === serialNumber)).toEqual([serialNumber]);
}

/**
 * Crea un artículo de cantidad (stock sí, número de serie no) en la empresa A.
 *
 * @param seed - Semilla e2e
 * @param uniqueToken - Sufijo del nombre
 * @returns UUID del artículo
 */
async function createQuantityStockItem(seed: SpentGraphSeed, uniqueToken: string): Promise<string> {
  const createdItem = await http()
    .post('/items')
    .query({ enterpriseId: seed.enterpriseA.id })
    .set(authHeader(E2E_EMAIL.userA))
    .send({
      name: `Cantidad ${uniqueToken}`,
      itemCategoryId: seed.itemCategoryA.id,
      serialNumber: false,
      stock: true,
      pricePvp: 8,
    });
  expect(createdItem.status).toBe(201);
  return createdItem.body.id as string;
}

describe('Gastos (e2e) — persistencia atómica y unicidad', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('crea cabecera, conceptos y series en la misma petición POST', async () => {
    const seed = getE2eSeed();
    const uniqueToken = buildUniqueToken();
    const iphoneSerialNumber = `SN-IPHONE-${uniqueToken}`;
    const macbookSerialNumber = `SN-MAC-${uniqueToken}`;

    const createResponse = await postSpentGraph(seed, {
      ...buildSpentHeader(seed, uniqueToken),
      spentConcepts: [
        buildSerializedLine({
          name: 'iPhone',
          itemId: seed.itemA.id,
          serialNumbers: [iphoneSerialNumber],
          position: 0,
        }),
        buildSerializedLine({
          name: 'Macbook',
          itemId: seed.itemA.id,
          serialNumbers: [macbookSerialNumber],
          position: 1,
        }),
      ],
    });

    expect(createResponse.status).toBe(201);
    const createdSpent = createResponse.body as SpentGraphBody;
    expect(createdSpent.spentConcepts).toHaveLength(2);
    expect(collectSpentSerialNumbers(createdSpent)).toEqual(
      expect.arrayContaining([iphoneSerialNumber, macbookSerialNumber]),
    );

    const reloadedSpent = await loadSpentGraph(createdSpent.id);
    expect(reloadedSpent.spentConcepts).toHaveLength(2);
    expect(collectSpentSerialNumbers(reloadedSpent)).toEqual(
      expect.arrayContaining([iphoneSerialNumber, macbookSerialNumber]),
    );
    await expectCatalogSerialUnique(seed, seed.itemA.id, iphoneSerialNumber);
    await expectCatalogSerialUnique(seed, seed.itemA.id, macbookSerialNumber);
  });

  it('persiste una línea libre y otra con series en la misma petición', async () => {
    const seed = getE2eSeed();
    const uniqueToken = buildUniqueToken();
    const trackedSerialNumber = `SN-MIX-${uniqueToken}`;

    const createResponse = await postSpentGraph(seed, {
      ...buildSpentHeader(seed, uniqueToken, { name: `Mixto ${uniqueToken}` }),
      spentConcepts: [
        buildFreeTextLine('Consultoría', 0),
        buildSerializedLine({
          name: 'iPhone',
          itemId: seed.itemA.id,
          serialNumbers: [trackedSerialNumber],
          position: 1,
        }),
      ],
    });

    expect(createResponse.status).toBe(201);
    const createdSpent = await loadSpentGraph(createResponse.body.id);
    expect(createdSpent.spentConcepts).toHaveLength(2);
    const freeTextLine = createdSpent.spentConcepts?.find(
      (spentConcept) => spentConcept.name === 'Consultoría',
    );
    const serializedLine = createdSpent.spentConcepts?.find(
      (spentConcept) => spentConcept.name === 'iPhone',
    );
    expect(freeTextLine?.itemId ?? null).toBeNull();
    expect(freeTextLine?.serials ?? []).toHaveLength(0);
    expect(collectSpentSerialNumbers(createdSpent)).toEqual([trackedSerialNumber]);
    expect(serializedLine?.itemId).toBe(seed.itemA.id);
    await expectCatalogSerialUnique(seed, seed.itemA.id, trackedSerialNumber);
  });

  it('entra stock de un artículo de cantidad sin crear números de serie', async () => {
    const seed = getE2eSeed();
    const uniqueToken = buildUniqueToken();
    const quantityItemId = await createQuantityStockItem(seed, uniqueToken);

    const createResponse = await postSpentGraph(seed, {
      ...buildSpentHeader(seed, uniqueToken, { name: `Cantidad ${uniqueToken}` }),
      spentConcepts: [
        {
          name: 'Caja',
          itemId: quantityItemId,
          quantity: 3,
          basePrice: 8,
          vat: 21,
          irpf: 0,
          position: 0,
        },
      ],
    });

    expect(createResponse.status).toBe(201);
    const createdSpent = await loadSpentGraph(createResponse.body.id);
    expect(createdSpent.spentConcepts).toHaveLength(1);
    expect(createdSpent.spentConcepts?.[0].serials ?? []).toHaveLength(0);

    const stockMovements = await http()
      .get('/stock-movements')
      .query({
        enterpriseId: seed.enterpriseA.id,
        itemId: quantityItemId,
        pageSize: 50,
      })
      .set(authHeader(E2E_EMAIL.userA));
    expect(stockMovements.status).toBe(200);
    const purchaseMovements = (
      stockMovements.body.items as Array<{
        quantity: number;
        direction: string;
        type: string;
        itemSerialId?: string | null;
        spentConceptId?: string;
      }>
    ).filter((stockMovement) => stockMovement.spentConceptId === createdSpent.spentConcepts?.[0].id);
    expect(purchaseMovements).toHaveLength(1);
    expect(purchaseMovements[0].quantity).toBe(3);
    expect(purchaseMovements[0].direction).toBe('in');
    expect(purchaseMovements[0].type).toBe('purchase');
    expect(purchaseMovements[0].itemSerialId ?? null).toBeNull();
  });

  it('no deja el gasto ni las series válidas si un número posterior choca en catálogo', async () => {
    const seed = getE2eSeed();
    const uniqueToken = buildUniqueToken();
    const spentName = `Rollback mixto ${uniqueToken}`;
    const validSerialNumber = `SN-IPHONE-OK-${uniqueToken}`;

    const createResponse = await postSpentGraph(seed, {
      ...buildSpentHeader(seed, uniqueToken, { name: spentName }),
      spentConcepts: [
        buildSerializedLine({
          name: 'iPhone',
          itemId: seed.itemA.id,
          serialNumbers: [validSerialNumber],
          position: 0,
        }),
        buildSerializedLine({
          name: 'Macbook',
          itemId: seed.itemA.id,
          serialNumbers: [seed.itemSerialA.serialNumber],
          position: 1,
        }),
      ],
    });

    expect(createResponse.status).toBe(409);
    expect(String(createResponse.body.message)).toContain(seed.itemSerialA.serialNumber);
    expect(await listSpentNamesByExactName(seed, spentName)).not.toContain(spentName);
    await expectCatalogSerialAbsent(seed, seed.itemA.id, validSerialNumber);
  });

  it('enumera todos los números de serie de catálogo en el 409 y no persiste los válidos', async () => {
    const seed = getE2eSeed();
    const uniqueToken = buildUniqueToken();
    const firstCatalogSerialNumber = `SN-CAT-A-${uniqueToken}`;
    const secondCatalogSerialNumber = `SN-CAT-B-${uniqueToken}`;
    const validSerialNumber = `SN-CAT-OK-${uniqueToken}`;
    const collidingSpentName = `Choque múltiple ${uniqueToken}`;

    const catalogOwner = await postSpentGraph(seed, {
      ...buildSpentHeader(seed, `${uniqueToken}-owner`, {
        name: `Dueño catálogo ${uniqueToken}`,
      }),
      spentConcepts: [
        buildSerializedLine({
          name: 'Unidad A',
          itemId: seed.itemA.id,
          serialNumbers: [firstCatalogSerialNumber],
          position: 0,
        }),
        buildSerializedLine({
          name: 'Unidad B',
          itemId: seed.itemA.id,
          serialNumbers: [secondCatalogSerialNumber],
          position: 1,
        }),
      ],
    });
    expect(catalogOwner.status).toBe(201);

    const collidingResponse = await postSpentGraph(seed, {
      ...buildSpentHeader(seed, uniqueToken, { name: collidingSpentName }),
      spentConcepts: [
        buildSerializedLine({
          name: 'Choque A',
          itemId: seed.itemA.id,
          serialNumbers: [firstCatalogSerialNumber],
          position: 0,
        }),
        buildSerializedLine({
          name: 'Choque B',
          itemId: seed.itemA.id,
          serialNumbers: [secondCatalogSerialNumber],
          position: 1,
        }),
        buildSerializedLine({
          name: 'Válida',
          itemId: seed.itemA.id,
          serialNumbers: [validSerialNumber],
          position: 2,
        }),
      ],
    });

    expect(collidingResponse.status).toBe(409);
    const conflictMessage = String(collidingResponse.body.message);
    expect(conflictMessage).toContain(firstCatalogSerialNumber);
    expect(conflictMessage).toContain(secondCatalogSerialNumber);
    expect(await listSpentNamesByExactName(seed, collidingSpentName)).not.toContain(
      collidingSpentName,
    );
    await expectCatalogSerialAbsent(seed, seed.itemA.id, validSerialNumber);
    await expectCatalogSerialUnique(seed, seed.itemA.id, firstCatalogSerialNumber);
    await expectCatalogSerialUnique(seed, seed.itemA.id, secondCatalogSerialNumber);
  });

  it('permite reintentar el alta tras un 409 y deja un solo gasto', async () => {
    const seed = getE2eSeed();
    const uniqueToken = buildUniqueToken();
    const spentName = `Reintento ${uniqueToken}`;
    const validSerialNumber = `SN-RETRY-${uniqueToken}`;

    const collidingResponse = await postSpentGraph(seed, {
      ...buildSpentHeader(seed, uniqueToken, { name: spentName }),
      spentConcepts: [
        buildSerializedLine({
          name: 'iPhone',
          itemId: seed.itemA.id,
          serialNumbers: [seed.itemSerialA.serialNumber],
          position: 0,
        }),
      ],
    });
    expect(collidingResponse.status).toBe(409);
    expect(await listSpentNamesByExactName(seed, spentName)).not.toContain(spentName);

    const retryResponse = await postSpentGraph(seed, {
      ...buildSpentHeader(seed, uniqueToken, { name: spentName }),
      spentConcepts: [
        buildSerializedLine({
          name: 'iPhone',
          itemId: seed.itemA.id,
          serialNumbers: [validSerialNumber],
          position: 0,
        }),
      ],
    });
    expect(retryResponse.status).toBe(201);
    expect(await listSpentNamesByExactName(seed, spentName)).toEqual([spentName]);
    await expectCatalogSerialUnique(seed, seed.itemA.id, validSerialNumber);
  });

  it('rechaza un segundo POST con el mismo número de serie y no crea otro gasto', async () => {
    const seed = getE2eSeed();
    const uniqueToken = buildUniqueToken();
    const sharedSerialNumber = `SN-UNIQ-${uniqueToken}`;
    const firstSpentName = `Primero único ${uniqueToken}`;
    const secondSpentName = `Segundo único ${uniqueToken}`;

    const firstResponse = await postSpentGraph(seed, {
      ...buildSpentHeader(seed, uniqueToken, { name: firstSpentName }),
      spentConcepts: [
        buildSerializedLine({
          name: 'iPhone',
          itemId: seed.itemA.id,
          serialNumbers: [sharedSerialNumber],
          position: 0,
        }),
      ],
    });
    expect(firstResponse.status).toBe(201);

    const secondResponse = await postSpentGraph(seed, {
      ...buildSpentHeader(seed, `${uniqueToken}-dup`, { name: secondSpentName }),
      spentConcepts: [
        buildSerializedLine({
          name: 'iPhone',
          itemId: seed.itemA.id,
          serialNumbers: [sharedSerialNumber],
          position: 0,
        }),
      ],
    });
    expect(secondResponse.status).toBe(409);
    expect(String(secondResponse.body.message)).toContain(sharedSerialNumber);
    expect(await listSpentNamesByExactName(seed, secondSpentName)).not.toContain(secondSpentName);
    await expectCatalogSerialUnique(seed, seed.itemA.id, sharedSerialNumber);

    const firstSpent = await loadSpentGraph(firstResponse.body.id);
    expect(collectSpentSerialNumbers(firstSpent)).toEqual([sharedSerialNumber]);
  });

  it('rechaza números de serie duplicados en el propio payload sin escribir nada', async () => {
    const seed = getE2eSeed();
    const uniqueToken = buildUniqueToken();
    const duplicatedSerialNumber = `SN-DUP-${uniqueToken}`;
    const spentName = `Duplicado payload ${uniqueToken}`;

    const sameLineResponse = await postSpentGraph(seed, {
      ...buildSpentHeader(seed, `${uniqueToken}-line`, { name: `${spentName} línea` }),
      spentConcepts: [
        buildSerializedLine({
          name: 'iPhone',
          itemId: seed.itemA.id,
          serialNumbers: [duplicatedSerialNumber, duplicatedSerialNumber],
          position: 0,
          quantity: 2,
        }),
      ],
    });
    expect(sameLineResponse.status).toBe(400);
    expect(String(sameLineResponse.body.message)).toContain(
      'Los números de serie de un mismo concepto no pueden repetirse',
    );

    const acrossLinesResponse = await postSpentGraph(seed, {
      ...buildSpentHeader(seed, uniqueToken, { name: spentName }),
      spentConcepts: [
        buildSerializedLine({
          name: 'Unidad 1',
          itemId: seed.itemA.id,
          serialNumbers: [duplicatedSerialNumber],
          position: 0,
        }),
        buildSerializedLine({
          name: 'Unidad 2',
          itemId: seed.itemA.id,
          serialNumbers: [duplicatedSerialNumber],
          position: 1,
        }),
      ],
    });
    expect(acrossLinesResponse.status).toBe(400);
    expect(String(acrossLinesResponse.body.message)).toContain(duplicatedSerialNumber);
    expect(await listSpentNamesByExactName(seed, spentName)).not.toContain(spentName);
    expect(await listSpentNamesByExactName(seed, `${spentName} línea`)).not.toContain(
      `${spentName} línea`,
    );
    await expectCatalogSerialAbsent(seed, seed.itemA.id, duplicatedSerialNumber);
  });

  it('exige un número de serie por unidad y no persiste el gasto', async () => {
    const seed = getE2eSeed();
    const uniqueToken = buildUniqueToken();
    const spentName = `Series incompletas ${uniqueToken}`;
    const partialSerialNumber = `SN-MISS-${uniqueToken}`;

    const createResponse = await postSpentGraph(seed, {
      ...buildSpentHeader(seed, uniqueToken, { name: spentName }),
      spentConcepts: [
        buildSerializedLine({
          name: 'iPhone',
          itemId: seed.itemA.id,
          serialNumbers: [partialSerialNumber],
          position: 0,
          quantity: 2,
        }),
      ],
    });

    expect(createResponse.status).toBe(400);
    expect(String(createResponse.body.message)).toBe(
      'Debe informar un número de serie por cada unidad',
    );
    expect(await listSpentNamesByExactName(seed, spentName)).not.toContain(spentName);
    await expectCatalogSerialAbsent(seed, seed.itemA.id, partialSerialNumber);
  });

  it('rechaza series en un artículo que no las gestiona y no crea el gasto', async () => {
    const seed = getE2eSeed();
    const uniqueToken = buildUniqueToken();
    const spentName = `Serie prohibida ${uniqueToken}`;
    const forbiddenSerialNumber = `SN-NOSERIAL-${uniqueToken}`;
    const quantityItemId = await createQuantityStockItem(seed, uniqueToken);

    const createResponse = await postSpentGraph(seed, {
      ...buildSpentHeader(seed, uniqueToken, { name: spentName }),
      spentConcepts: [
        buildSerializedLine({
          name: 'Caja',
          itemId: quantityItemId,
          serialNumbers: [forbiddenSerialNumber],
          position: 0,
        }),
      ],
    });

    expect(createResponse.status).toBe(400);
    expect(String(createResponse.body.message)).toBe(
      'Solo se pueden asignar números de serie a conceptos vinculados a un artículo que se gestiona con número de serie',
    );
    expect(await listSpentNamesByExactName(seed, spentName)).not.toContain(spentName);
  });

  it('oculta el artículo de otra empresa con 404 y no escribe el gasto', async () => {
    const seed = getE2eSeed();
    const uniqueToken = buildUniqueToken();
    const spentName = `Artículo ajeno ${uniqueToken}`;
    const foreignSerialNumber = `SN-B-${uniqueToken}`;

    const createResponse = await postSpentGraph(seed, {
      ...buildSpentHeader(seed, uniqueToken, { name: spentName }),
      spentConcepts: [
        buildSerializedLine({
          name: 'Intruso',
          itemId: seed.itemB.id,
          serialNumbers: [foreignSerialNumber],
          position: 0,
        }),
      ],
    });

    expect(createResponse.status).toBe(404);
    expect(String(createResponse.body.message)).toBe('Concepto de gasto no encontrado');
    expect(await listSpentNamesByExactName(seed, spentName)).not.toContain(spentName);
  });

  it('un gasto cancelado guarda conceptos y no da de alta series de catálogo', async () => {
    const seed = getE2eSeed();
    const uniqueToken = buildUniqueToken();
    const cancelledSerialNumber = `SN-CANCEL-${uniqueToken}`;

    const createResponse = await postSpentGraph(seed, {
      ...buildSpentHeader(seed, uniqueToken, {
        name: `Cancelado ${uniqueToken}`,
        status: 'cancelled',
      }),
      spentConcepts: [
        buildSerializedLine({
          name: 'iPhone',
          itemId: seed.itemA.id,
          serialNumbers: [cancelledSerialNumber],
          position: 0,
        }),
      ],
    });

    expect(createResponse.status).toBe(201);
    const createdSpent = await loadSpentGraph(createResponse.body.id);
    expect(createdSpent.status).toBe('cancelled');
    expect(createdSpent.spentConcepts).toHaveLength(1);
    expect(createdSpent.spentConcepts?.[0].name).toBe('iPhone');
    expect(collectSpentSerialNumbers(createdSpent)).toHaveLength(0);
    await expectCatalogSerialAbsent(seed, seed.itemA.id, cancelledSerialNumber);
  });

  it('sustituye el grafo en un solo PATCH y elimina las series antiguas', async () => {
    const seed = getE2eSeed();
    const uniqueToken = buildUniqueToken();
    const originalSerialNumber = `SN-OLD-${uniqueToken}`;
    const replacementSerialNumber = `SN-NEW-${uniqueToken}`;

    const createResponse = await postSpentGraph(seed, {
      ...buildSpentHeader(seed, uniqueToken),
      spentConcepts: [
        buildSerializedLine({
          name: 'iPhone',
          itemId: seed.itemA.id,
          serialNumbers: [originalSerialNumber],
          position: 0,
        }),
      ],
    });
    expect(createResponse.status).toBe(201);
    const createdSpent = createResponse.body as SpentGraphBody;
    const existingConceptId = createdSpent.spentConcepts?.[0].id;
    expect(existingConceptId).toBeDefined();

    const updateResponse = await patchSpentGraph(seed, createdSpent.id, {
      name: `Actualizado ${uniqueToken}`,
      spentConcepts: [
        {
          id: existingConceptId,
          ...buildSerializedLine({
            name: 'iPhone',
            itemId: seed.itemA.id,
            serialNumbers: [replacementSerialNumber],
            position: 0,
          }),
        },
      ],
    });

    expect(updateResponse.status).toBe(200);
    const updatedSpent = await loadSpentGraph(createdSpent.id);
    expect(updatedSpent.name).toBe(`Actualizado ${uniqueToken}`);
    expect(updatedSpent.spentConcepts).toHaveLength(1);
    expect(collectSpentSerialNumbers(updatedSpent)).toEqual([replacementSerialNumber]);
    await expectCatalogSerialAbsent(seed, seed.itemA.id, originalSerialNumber);
    await expectCatalogSerialUnique(seed, seed.itemA.id, replacementSerialNumber);
  });

  it('un PATCH con choque de catálogo deja intacto el grafo original', async () => {
    const seed = getE2eSeed();
    const uniqueToken = buildUniqueToken();
    const originalSerialNumber = `SN-KEEP-${uniqueToken}`;

    const createResponse = await postSpentGraph(seed, {
      ...buildSpentHeader(seed, uniqueToken, { name: `Original ${uniqueToken}` }),
      spentConcepts: [
        buildSerializedLine({
          name: 'iPhone',
          itemId: seed.itemA.id,
          serialNumbers: [originalSerialNumber],
          position: 0,
        }),
      ],
    });
    expect(createResponse.status).toBe(201);
    const createdSpent = createResponse.body as SpentGraphBody;

    const collidingPatch = await patchSpentGraph(seed, createdSpent.id, {
      name: `Hackeado ${uniqueToken}`,
      spentConcepts: [
        buildSerializedLine({
          name: 'iPhone',
          itemId: seed.itemA.id,
          serialNumbers: [seed.itemSerialA.serialNumber],
          position: 0,
        }),
      ],
    });

    expect(collidingPatch.status).toBe(409);
    expect(String(collidingPatch.body.message)).toContain(seed.itemSerialA.serialNumber);

    const unchangedSpent = await loadSpentGraph(createdSpent.id);
    expect(unchangedSpent.name).toBe(`Original ${uniqueToken}`);
    expect(collectSpentSerialNumbers(unchangedSpent)).toEqual([originalSerialNumber]);
    await expectCatalogSerialUnique(seed, seed.itemA.id, originalSerialNumber);
  });

  it('un PATCH solo de cabecera no toca conceptos ni series', async () => {
    const seed = getE2eSeed();
    const uniqueToken = buildUniqueToken();
    const originalSerialNumber = `SN-HEADER-${uniqueToken}`;

    const createResponse = await postSpentGraph(seed, {
      ...buildSpentHeader(seed, uniqueToken, { name: `Cabecera ${uniqueToken}` }),
      spentConcepts: [
        buildSerializedLine({
          name: 'iPhone',
          itemId: seed.itemA.id,
          serialNumbers: [originalSerialNumber],
          position: 0,
        }),
      ],
    });
    expect(createResponse.status).toBe(201);
    const createdSpent = createResponse.body as SpentGraphBody;

    const headerPatch = await patchSpentGraph(seed, createdSpent.id, {
      name: `Cabecera nueva ${uniqueToken}`,
    });
    expect(headerPatch.status).toBe(200);

    const reloadedSpent = await loadSpentGraph(createdSpent.id);
    expect(reloadedSpent.name).toBe(`Cabecera nueva ${uniqueToken}`);
    expect(reloadedSpent.spentConcepts).toHaveLength(1);
    expect(collectSpentSerialNumbers(reloadedSpent)).toEqual([originalSerialNumber]);
    await expectCatalogSerialUnique(seed, seed.itemA.id, originalSerialNumber);
  });
});
