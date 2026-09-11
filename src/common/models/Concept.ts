export const ConceptVats = [
  { name: 'General', value: 21 },
  { name: 'Reducido', value: 10 },
  { name: 'Superreducido', value: 4 },
  { name: 'Exento', value: 0 }
]

export const ConceptIrpfs = [
  { name: 'General', value: 19 },
  { name: 'Reducido', value: 7 },
  { name: 'Exento', value: 0 },
]

export const ConceptPercentages = [
  { name: 'Total', value: 100 },
  { name: 'Parcial', value: 50 },
  { name: 'Excluído', value: 0 },
]

export class Concept {
  name: string;
  base_price: number;
  vat: number;
  irpf: number;
  quantity: number;
  supplied: boolean

  constructor() {
    this.name = '';
    this.base_price = 0;
    this.vat = 0;
    this.irpf = 0;
    this.quantity = 0;
    this.supplied = false;
  }
}

export class SpentConcept extends Concept {
  percentage: number;

  constructor() {
    super();
    this.percentage = 100; // Por defecto 100%
  }
}