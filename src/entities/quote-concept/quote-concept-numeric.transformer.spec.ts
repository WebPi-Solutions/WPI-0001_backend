import { quoteConceptNumericAmountTransformer } from './quote-concept-numeric.transformer';

describe('quoteConceptNumericAmountTransformer', () => {
  describe('to', () => {
    it('devuelve el número de la aplicación', () => {
      expect(quoteConceptNumericAmountTransformer.to(12.5)).toBe(12.5);
      expect(quoteConceptNumericAmountTransformer.to(0)).toBe(0);
    });

    it('devuelve null cuando no hay valor', () => {
      expect(quoteConceptNumericAmountTransformer.to(null)).toBeNull();
      expect(quoteConceptNumericAmountTransformer.to(undefined)).toBeNull();
    });
  });

  describe('from', () => {
    it('convierte el string de PostgreSQL a número', () => {
      expect(quoteConceptNumericAmountTransformer.from('10.50')).toBe(10.5);
    });

    it('deja pasar un número ya parseado', () => {
      expect(quoteConceptNumericAmountTransformer.from(3)).toBe(3);
    });

    it('devuelve null cuando la columna llega vacía', () => {
      expect(quoteConceptNumericAmountTransformer.from(null)).toBeNull();
      expect(quoteConceptNumericAmountTransformer.from(undefined as unknown as null)).toBeNull();
    });
  });
});
