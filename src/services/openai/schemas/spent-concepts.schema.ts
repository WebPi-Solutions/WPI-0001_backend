import OpenAI from 'openai';

/**
 * Formato JSON estricto para extraer nombre, fecha, conceptos y totales de un gasto desde texto OCR.
 */
export const spentConceptsResponseFormat: OpenAI.ResponseFormatJSONSchema = {
  type: 'json_schema',
  json_schema: {
    name: 'spent_concepts_response',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'issuedDate', 'concepts', 'totalSubtotal', 'totalVAT', 'totalIRPF', 'total'],
      properties: {
        name: {
          type: 'string',
          description:
            'Nombre corto del gasto. Debe seguir el patrón de facturas históricas del mismo tipo (combustibles, dietas, internet, etc.)',
        },
        issuedDate: {
          type: 'string',
          description: 'Fecha de emisión de la factura en formato YYYY-MM-DD',
        },
        concepts: {
          type: 'array',
          description: 'Líneas de concepto detectadas en la factura o ticket de gasto',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'name',
              'base_price',
              'vat',
              'irpf',
              'quantity',
              'supplied',
            ],
            properties: {
              name: {
                type: 'string',
                description: 'Descripción del concepto o línea de factura',
              },
              base_price: {
                type: 'number',
                description:
                  'Importe base del concepto. Si el emisor es español y hay que usar más de 2 decimales, el redondeo a 2 decimales debe seguir coincidiendo con la base impresa (5.884 se ve 5.88; 5.885 se vería 5.89 y no vale). Si el emisor es extranjero, incluye el IVA',
              },
              vat: {
                type: 'number',
                description:
                  'Porcentaje de IVA aplicable (0, 4, 10 o 21). Si el CIF del emisor no es español, siempre 0',
                enum: [0, 4, 10, 21],
              },
              irpf: {
                type: 'number',
                description: 'Porcentaje de IRPF aplicable (0, 7 o 19)',
                enum: [0, 7, 19],
              },
              quantity: {
                type: 'number',
                description:
                  'Unidades del concepto. Si el histórico usa quantity=1 y el importe de línea en base_price, usa 1',
              },
              supplied: {
                type: 'boolean',
                description:
                  'True solo si la factura indica explícitamente que es un gasto suplido. En cualquier otro caso, false',
              },
            },
          },
        },
        totalSubtotal: {
          type: 'number',
          description: 'Subtotal total de la factura (base imponible)',
        },
        totalVAT: {
          type: 'number',
          description:
            'IVA total de la factura en importe. Si el emisor es extranjero, siempre 0',
        },
        totalIRPF: {
          type: 'number',
          description: 'Retención IRPF total de la factura en importe. Si no hay retención, 0',
        },
        total: {
          type: 'number',
          description: 'Total de la factura: totalSubtotal - totalIRPF + totalVAT',
        },
      },
    },
  },
};
