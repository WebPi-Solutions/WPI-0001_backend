import { Concept, ConceptIrpfs, ConceptPercentages, ConceptVats, SpentConcept } from './Concept';

describe('Concept', () => {
  /**
   * Comprueba los valores fiscales de catálogo usados en conceptos.
   */
  it('expone los tipos de IVA, IRPF y porcentajes de gasto', () => {
    expect(ConceptVats.map((vatType) => vatType.value)).toEqual([21, 10, 4, 0]);
    expect(ConceptIrpfs.map((irpfType) => irpfType.value)).toEqual([19, 7, 0]);
    expect(ConceptPercentages.map((percentageType) => percentageType.value)).toEqual([100, 50, 0]);
  });

  /**
   * El constructor deja un concepto vacío listo para rellenar en formularios.
   */
  it('inicializa un concepto con valores por defecto', () => {
    const concept = new Concept();

    expect(concept.name).toBe('');
    expect(concept.base_price).toBe(0);
    expect(concept.vat).toBe(0);
    expect(concept.irpf).toBe(0);
    expect(concept.quantity).toBe(0);
    expect(concept.supplied).toBe(false);
  });

  /**
   * SpentConcept añade el porcentaje de imputación, 100% por defecto.
   */
  it('inicializa un concepto de gasto con porcentaje total', () => {
    const spentConcept = new SpentConcept();

    expect(spentConcept).toBeInstanceOf(Concept);
    expect(spentConcept.percentage).toBe(100);
    expect(spentConcept.supplied).toBe(false);
  });
});
