import { E2E_EMAIL, authHeader } from './auth';
import { http } from './http';
import { getE2eSeed } from './world';

/**
 * Compra de números de serie creada en e2e para alimentar el stock.
 */
export interface PurchasedItemSerials {
  /** UUID del gasto de compra */
  spentId: string;
  /** UUID de la línea de gasto */
  spentConceptId: string;
}

/**
 * Da de alta unidades en stock comprándolas en un gasto de la empresa A.
 * @param itemId - Artículo con número de serie
 * @param serialNumbers - Números de serie a entrar
 * @returns Identificadores del gasto creado
 */
export async function purchaseItemSerials(
  itemId: string,
  serialNumbers: string[],
): Promise<PurchasedItemSerials> {
  const seed = getE2eSeed();
  const spent = await http()
    .post('/spents')
    .set(authHeader(E2E_EMAIL.userA))
    .send({
      supplierId: seed.supplierA.id,
      name: 'Compra de series e2e',
      issuedDate: '2026-06-01',
      collectionDate: '2026-06-15',
      declarationDate: '2026-06-01',
      status: 'paid',
    });
  expect(spent.status).toBe(201);

  const spentConcept = await http()
    .post('/spent-concepts')
    .query({ enterpriseId: seed.enterpriseA.id })
    .set(authHeader(E2E_EMAIL.userA))
    .send({
      spentId: spent.body.id,
      itemId,
      quantity: serialNumbers.length,
    });
  expect(spentConcept.status).toBe(201);

  for (const serialNumber of serialNumbers) {
    const createdSerial = await http()
      .post('/spent-concept-serials')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        spentConceptId: spentConcept.body.id,
        serialNumber,
      });
    expect(createdSerial.status).toBe(201);
  }

  return {
    spentId: spent.body.id as string,
    spentConceptId: spentConcept.body.id as string,
  };
}

/**
 * Elimina el gasto de compra usado para sembrar stock.
 * @param purchased - Gasto y línea creados por `purchaseItemSerials`
 */
export async function deletePurchasedItemSerials(
  purchased: PurchasedItemSerials,
): Promise<void> {
  await http()
    .delete(`/spent-concepts/${purchased.spentConceptId}`)
    .set(authHeader(E2E_EMAIL.userA));
  await http().delete(`/spents/${purchased.spentId}`).set(authHeader(E2E_EMAIL.userA));
}
