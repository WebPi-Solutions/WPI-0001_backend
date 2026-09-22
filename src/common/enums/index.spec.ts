import {
  AiMode,
  AiRequestType,
  ClientType,
  DEFAULT_ITEM_SERIAL_STATUS,
  DEFAULT_ORDER_STATUS,
  DEFAULT_PAYMENT_METHOD,
  InvoiceStatus,
  isPremiumAiMode,
  isValidItemSerialStatus,
  isValidOrderStatus,
  isValidPaymentMethod,
  isValidStockDirection,
  isValidStockType,
  ItemSerialStatus,
  normalizeAiMode,
  OrderStatus,
  PaymentMethod,
  QuoteStatus,
  RecurrentEarningType,
  SigningAction,
  SpentStatus,
  StockDirection,
  StockType,
  SupplierType,
  UserRoleTypes,
  UserStatusTypes,
} from './index';

describe('Enums de la aplicación', () => {
  it('expone los tipos persistidos en la base de datos y en varchar de dominio', () => {
    expect(AiMode.STANDARD).toBe('standard');
    expect(AiRequestType.GET_SPENT_ISSUER).toBe('get_spent_issuer');
    expect(PaymentMethod.BANK_TRANSFER).toBe('bank_transfer');
    expect(OrderStatus.AWAITING_RECEIPT).toBe('awaiting_receipt');
    expect(ItemSerialStatus.IN_STOCK).toBe('in_stock');
    expect(StockDirection.IN).toBe('in');
    expect(StockType.PURCHASE).toBe('purchase');
    expect(RecurrentEarningType.MONTHLY).toBe('monthly');
    expect(RecurrentEarningType.QUARTERLY).toBe('quarterly');
    expect(SigningAction.START).toBe('start');
    expect(InvoiceStatus.DRAFT).toBe('draft');
    expect(QuoteStatus.ISSUED).toBe('issued');
    expect(SpentStatus.PENDING).toBe('pending');
    expect(ClientType.PARTICULAR).toBe('particular');
    expect(SupplierType.INDIVIDUAL).toBe('individual');
    expect(UserStatusTypes.ACTIVE).toBe('active');
    expect(UserRoleTypes.ADMIN).toBe('administrator');
  });

  it('reexporta los helpers asociados a los enums', () => {
    expect(isPremiumAiMode(AiMode.PREMIUM)).toBe(true);
    expect(normalizeAiMode('otro')).toBe(AiMode.STANDARD);
    expect(isValidPaymentMethod(PaymentMethod.CASH)).toBe(true);
    expect(DEFAULT_PAYMENT_METHOD).toBe(PaymentMethod.BANK_TRANSFER);
    expect(isValidOrderStatus(OrderStatus.RECEIVED)).toBe(true);
    expect(DEFAULT_ORDER_STATUS).toBe(OrderStatus.AWAITING_RECEIPT);
    expect(isValidItemSerialStatus(ItemSerialStatus.SOLD)).toBe(true);
    expect(DEFAULT_ITEM_SERIAL_STATUS).toBe(ItemSerialStatus.IN_STOCK);
    expect(isValidStockDirection(StockDirection.OUT)).toBe(true);
    expect(isValidStockType(StockType.REVERSAL)).toBe(true);
  });
});
