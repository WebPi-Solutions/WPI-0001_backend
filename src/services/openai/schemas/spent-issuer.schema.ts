import OpenAI from 'openai';

/**
 * Formato JSON estricto para extraer los datos del emisor de un gasto desde texto OCR.
 * El CIF se pide con y sin prefijo de país para buscar el proveedor en base de datos.
 */
export const spentIssuerResponseFormat: OpenAI.ResponseFormatJSONSchema = {
  type: 'json_schema',
  json_schema: {
    name: 'spent_issuer_response',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'nifWithoutCountryPrefix', 'nifWithCountryPrefix'],
      properties: {
        name: {
          type: 'string',
          description:
            'Nombre fiscal del emisor (razón social o denominación social). No usar la marca comercial ni el logotipo si aparece la razón social, por ejemplo Galaonia Energía S.L. en lugar de Gana Energía',
        },
        nifWithoutCountryPrefix: {
          type: 'string',
          description:
            'CIF, NIF, NIE o VAT del emisor sin prefijo de país (por ejemplo B66855701)',
        },
        nifWithCountryPrefix: {
          type: 'string',
          description:
            'CIF, NIF, NIE o VAT del emisor con prefijo de país si aparece o se conoce (por ejemplo ESB66855701). Cadena vacía si no hay prefijo',
        },
      },
    },
  },
};
