import { OrderStatus, PaymentMethod } from 'src/common/enums';
import { Enterprise } from 'src/entities/enterprise/enterprise.entity';
import { Invoice } from 'src/entities/invoice/invoice.entity';
import { Order } from 'src/entities/order/order.entity';
import { Quote } from 'src/entities/quote/quote.entity';
import { HtmlTemplateDataService } from './html-template-data.service';

describe('HtmlTemplateDataService', () => {
  const service = new HtmlTemplateDataService();
  const enterprise = {
    name: 'Empresa Demo', nif: 'A12345678', address: 'Calle Empresa 1', bankAccount: 'ES00', phone: '910000000', email: 'empresa@example.com',
  } as Enterprise;

  it('normaliza presupuesto, ordena conceptos y agrupa el desglose de IVA', () => {
    const data = service.getQuoteTemplateData({
      issuedDate: new Date('2026-03-01T00:00:00.000Z'),
      clientName: 'Cliente Demo',
      client: { paymentMethod: PaymentMethod.CASH } as Quote['client'],
      quoteConcepts: [
        { name: 'Segundo', position: 1, basePrice: 50, quantity: 2, vat: 21, irpf: 0 },
        { name: 'Primero', position: 0, basePrice: 100, quantity: 1, vat: 10, irpf: 1 },
      ],
    } as Quote, enterprise) as {
      issued_date: string; client: { payment_method: string }; concepts: Array<{ name: string }>;
      vat_breakdown: unknown; totals: { total: string };
    };

    expect(data.issued_date).toBe('01/03/2026');
    expect(data.client.payment_method).toBe('Efectivo');
    expect(data.concepts.map(({ name }) => name)).toEqual(['Primero', 'Segundo']);
    expect(data.vat_breakdown).toEqual([
      { base: '100,00 €', percentage: '10', amount: '10,00 €', total: '109,00 €' },
      { base: '100,00 €', percentage: '21', amount: '21,00 €', total: '121,00 €' },
    ]);
    expect(data.totals.total).toBe('230,00 €');
  });

  it('incluye los campos propios de pedido y factura', () => {
    const order = service.getOrderTemplateData({ date: null, status: OrderStatus.RECEIVED } as Order, enterprise) as { order: { status: string } };
    const invoice = service.getInvoiceTemplateData({ series: { series: 'F' }, seriesNumber: 7 } as Invoice, enterprise) as { invoice: { code: string } };

    expect(order.order.status).toBe(OrderStatus.RECEIVED);
    expect(invoice.invoice.code).toBe('F-0007');

    const emptyOrder = service.getOrderTemplateData({ date: null } as Order, enterprise) as { order: { status: string } };
    const emptyInvoice = service.getInvoiceTemplateData({ seriesNumber: null } as Invoice, enterprise) as { invoice: { code: string } };
    expect(emptyOrder.order.status).toBe('');
    expect(emptyInvoice.invoice.code).toBe('-0000');
  });

  it('deja valores neutros cuando faltan datos opcionales o son inválidos', () => {
    const data = service.getQuoteTemplateData({ issuedDate: 'fecha inválida' } as unknown as Quote, {} as Enterprise) as {
      issued_date: string; concept: unknown; totals: { total: string }; vat_breakdown: unknown;
    };

    expect(data.issued_date).toBe('');
    expect(data.concept).toEqual({ name: '', quantity: '0', subtotal: '0,00 €', iva: '0%', total: '0,00 €' });
    expect(data.vat_breakdown).toEqual([]);
    expect(data.totals.total).toBe('0,00 €');

    const nullableLine = service.getQuoteTemplateData({
      client: { paymentMethod: 'otro' },
      quoteConcepts: [{ name: null, quantity: null, basePrice: 0, vat: null, irpf: null }],
    } as unknown as Quote, enterprise) as { concept: { name: string; quantity: string }; client: { payment_method: string } };
    expect(nullableLine.concept).toMatchObject({ name: '', quantity: '0' });
    expect(nullableLine.client.payment_method).toBe('');
  });
});
