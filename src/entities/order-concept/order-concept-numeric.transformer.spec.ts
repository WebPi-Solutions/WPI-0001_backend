import { orderConceptNumericAmountTransformer } from './order-concept-numeric.transformer';

describe('orderConceptNumericAmountTransformer', () => {
  describe('to', () => {
    it('devuelve el número de la aplicación', () => {
      expect(orderConceptNumericAmountTransformer.to(12.5)).toBe(12.5);
      expect(orderConceptNumericAmountTransformer.to(0)).toBe(0);
    });

    it('devuelve null cuando no hay valor', () => {
      expect(orderConceptNumericAmountTransformer.to(null)).toBeNull();
      expect(orderConceptNumericAmountTransformer.to(undefined)).toBeNull();
    });
  });

  describe('from', () => {
    it('convierte el string de PostgreSQL a número', () => {
      expect(orderConceptNumericAmountTransformer.from('10.50')).toBe(10.5);
    });

    it('deja pasar un número ya parseado', () => {
      expect(orderConceptNumericAmountTransformer.from(3)).toBe(3);
    });

    it('devuelve null cuando la columna llega vacía', () => {
      expect(orderConceptNumericAmountTransformer.from(null)).toBeNull();
      expect(orderConceptNumericAmountTransformer.from(undefined as unknown as null)).toBeNull();
    });
  });
});
