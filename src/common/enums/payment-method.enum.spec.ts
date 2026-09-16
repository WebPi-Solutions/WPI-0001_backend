import { DEFAULT_PAYMENT_METHOD, isValidPaymentMethod, PaymentMethod } from './payment-method.enum';

describe('PaymentMethod', () => {
  it('acepta los cuatro valores del enum de base de datos', () => {
    expect(isValidPaymentMethod(PaymentMethod.CARD)).toBe(true);
    expect(isValidPaymentMethod(PaymentMethod.CASH)).toBe(true);
    expect(isValidPaymentMethod(PaymentMethod.BANK_TRANSFER)).toBe(true);
    expect(isValidPaymentMethod(PaymentMethod.DIRECT_DEBIT)).toBe(true);
  });

  it('rechaza valores vacíos o ajenos al enum', () => {
    expect(isValidPaymentMethod(null)).toBe(false);
    expect(isValidPaymentMethod(undefined)).toBe(false);
    expect(isValidPaymentMethod('paypal')).toBe(false);
  });

  it('usa transferencia bancaria como valor por defecto', () => {
    expect(DEFAULT_PAYMENT_METHOD).toBe(PaymentMethod.BANK_TRANSFER);
  });
});
