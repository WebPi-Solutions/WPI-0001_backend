import { invoiceConceptNumericAmountTransformer } from './invoice-concept-numeric.transformer';

describe('invoiceConceptNumericAmountTransformer', () => {
  describe('to', () => {
    it('devuelve el número de la aplicación', () => {
      expect(invoiceConceptNumericAmountTransformer.to(12.5)).toBe(12.5);
      expect(invoiceConceptNumericAmountTransformer.to(0)).toBe(0);
    });

    it('devuelve null cuando no hay valor', () => {
      expect(invoiceConceptNumericAmountTransformer.to(null)).toBeNull();
      expect(invoiceConceptNumericAmountTransformer.to(undefined)).toBeNull();
    });
  });

  describe('from', () => {
    it('convierte el string de PostgreSQL a número', () => {
      expect(invoiceConceptNumericAmountTransformer.from('10.50')).toBe(10.5);
    });

    it('deja pasar un número ya parseado', () => {
      expect(invoiceConceptNumericAmountTransformer.from(3)).toBe(3);
    });

    it('devuelve null cuando la columna llega vacía', () => {
      expect(invoiceConceptNumericAmountTransformer.from(null)).toBeNull();
      expect(invoiceConceptNumericAmountTransformer.from(undefined as unknown as null)).toBeNull();
    });
  });
});
