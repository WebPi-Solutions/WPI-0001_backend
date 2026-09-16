import {
  AiMode,
  AiRequestType,
  DEFAULT_ORDER_STATUS,
  DEFAULT_PAYMENT_METHOD,
  isPremiumAiMode,
  isValidOrderStatus,
  isValidPaymentMethod,
  normalizeAiMode,
  OrderStatus,
  PaymentMethod,
  RecurrentEarningType,
  SigningAction,
} from './index';

describe('Enums de PostgreSQL', () => {
  it('expone los tipos persistidos en la base de datos', () => {
    expect(AiMode.STANDARD).toBe('standard');
    expect(AiRequestType.GET_SPENT_ISSUER).toBe('get_spent_issuer');
    expect(PaymentMethod.BANK_TRANSFER).toBe('bank_transfer');
    expect(OrderStatus.AWAITING_RECEIPT).toBe('awaiting_receipt');
    expect(RecurrentEarningType.MONTHLY).toBe('monthly');
    expect(SigningAction.START).toBe('start');
  });

  it('reexporta los helpers asociados a los enums', () => {
    expect(isPremiumAiMode(AiMode.PREMIUM)).toBe(true);
    expect(normalizeAiMode('otro')).toBe(AiMode.STANDARD);
    expect(isValidPaymentMethod(PaymentMethod.CASH)).toBe(true);
    expect(DEFAULT_PAYMENT_METHOD).toBe(PaymentMethod.BANK_TRANSFER);
    expect(isValidOrderStatus(OrderStatus.RECEIVED)).toBe(true);
    expect(DEFAULT_ORDER_STATUS).toBe(OrderStatus.AWAITING_RECEIPT);
  });
});

describe('Enums de PostgreSQL', () => {
  it('expone los tipos persistidos en la base de datos', () => {
    expect(AiMode.STANDARD).toBe('standard');
    expect(AiRequestType.GET_SPENT_ISSUER).toBe('get_spent_issuer');
    expect(PaymentMethod.BANK_TRANSFER).toBe('bank_transfer');
    expect(RecurrentEarningType.MONTHLY).toBe('monthly');
    expect(SigningAction.START).toBe('start');
  });

  it('reexporta los helpers asociados a los enums', () => {
    expect(isPremiumAiMode(AiMode.PREMIUM)).toBe(true);
    expect(normalizeAiMode('otro')).toBe(AiMode.STANDARD);
    expect(isValidPaymentMethod(PaymentMethod.CASH)).toBe(true);
    expect(DEFAULT_PAYMENT_METHOD).toBe(PaymentMethod.BANK_TRANSFER);
  });
});
