import {
  DEFAULT_ITEM_SERIAL_STATUS,
  isValidItemSerialStatus,
  ItemSerialStatus,
} from './item-serial-status.enum';

describe('ItemSerialStatus', () => {
  it('reconoce los cuatro estados persistidos en PostgreSQL', () => {
    expect(isValidItemSerialStatus(ItemSerialStatus.IN_STOCK)).toBe(true);
    expect(isValidItemSerialStatus(ItemSerialStatus.RESERVED)).toBe(true);
    expect(isValidItemSerialStatus(ItemSerialStatus.SOLD)).toBe(true);
    expect(isValidItemSerialStatus(ItemSerialStatus.VOIDED)).toBe(true);
  });

  it('rechaza valores ajenos al enumerado', () => {
    expect(isValidItemSerialStatus(null)).toBe(false);
    expect(isValidItemSerialStatus(undefined)).toBe(false);
    expect(isValidItemSerialStatus('draft')).toBe(false);
  });

  it('usa en stock como estado por defecto', () => {
    expect(DEFAULT_ITEM_SERIAL_STATUS).toBe(ItemSerialStatus.IN_STOCK);
  });
});
