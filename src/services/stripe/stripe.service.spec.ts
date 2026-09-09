import { Test, TestingModule } from '@nestjs/testing';
import Stripe from 'stripe';
import { StripeService } from './stripe.service';

describe('StripeService', () => {
  let service: StripeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StripeService],
    }).compile();

    service = module.get<StripeService>(StripeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('extractDefaultPriceIdFromProduct', () => {
    it('devuelve cadena vacía si no hay default_price', () => {
      expect(
        StripeService.extractDefaultPriceIdFromProduct({ id: 'prod_1' } as Stripe.Product),
      ).toBe('');
    });

    it('devuelve el identificador recortado cuando default_price es una cadena', () => {
      expect(
        StripeService.extractDefaultPriceIdFromProduct({
          id: 'prod_1',
          default_price: '  price_abc  ',
        } as Stripe.Product),
      ).toBe('price_abc');
    });

    it('extrae el id cuando default_price está expandido', () => {
      expect(
        StripeService.extractDefaultPriceIdFromProduct({
          id: 'prod_1',
          default_price: { id: 'price_expanded' },
        } as Stripe.Product),
      ).toBe('price_expanded');
    });
  });

  describe('normalizeStripeMetadataToSortedEntries', () => {
    it('devuelve lista vacía si los metadatos no son un objeto', () => {
      expect(StripeService.normalizeStripeMetadataToSortedEntries(null)).toEqual([]);
      expect(StripeService.normalizeStripeMetadataToSortedEntries(undefined)).toEqual([]);
    });

    it('ordena las claves de forma estable e ignora mayúsculas', () => {
      expect(
        StripeService.normalizeStripeMetadataToSortedEntries({
          type: 'signings',
          Module: 'hr',
          amount: '10',
        }),
      ).toEqual([
        { key: 'amount', value: '10' },
        { key: 'Module', value: 'hr' },
        { key: 'type', value: 'signings' },
      ]);
    });
  });
});

