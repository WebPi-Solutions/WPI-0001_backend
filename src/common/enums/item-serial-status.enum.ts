/**
 * Estados persistidos en PostgreSQL (`item_serial_status`).
 * Se usan en `item_serials.status`.
 */
export enum ItemSerialStatus {
  IN_STOCK = 'in_stock',
  RESERVED = 'reserved',
  SOLD = 'sold',
  VOIDED = 'voided',
}

/**
 * Valor por defecto de `item_serials.status` cuando nace por una compra.
 */
export const DEFAULT_ITEM_SERIAL_STATUS = ItemSerialStatus.IN_STOCK;

/**
 * Indica si el valor pertenece al enum PostgreSQL `item_serial_status`.
 *
 * @param itemSerialStatus - Valor recibido
 * @returns `true` si el valor es un estado de número de serie válido
 */
export function isValidItemSerialStatus(
  itemSerialStatus: unknown,
): itemSerialStatus is ItemSerialStatus {
  return Object.values(ItemSerialStatus).includes(itemSerialStatus as ItemSerialStatus);
}
