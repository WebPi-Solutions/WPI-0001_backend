import { SpentConcept } from 'src/models/Concept';

/**
 * Datos dinámicos que se interpolan en el prompt de usuario de extracción de conceptos.
 */
export interface SpentConceptsUserPromptContext {
  /** Texto OCR de la factura */
  extractedText: string;
  /** CIF/NIF del emisor con prefijo de país */
  issuerNifWithCountryPrefix: string;
  /** Nombres de las últimas facturas del proveedor */
  historicalSpentNames: string[];
  /** Conceptos completos de las últimas facturas del proveedor */
  historicalConcepts: SpentConcept[];
}

/**
 * Construye el mensaje de usuario para extraer conceptos de un gasto.
 * Incluye el CIF con prefijo, los conceptos históricos y el texto OCR.
 * @param promptContext CIF del emisor, histórico y texto OCR
 * @returns Contenido del mensaje de usuario
 */
export function buildSpentConceptsUserPrompt(
  promptContext: SpentConceptsUserPromptContext,
): string {
  const messageParts: string[] = [];

  if (promptContext.issuerNifWithCountryPrefix) {
    messageParts.push(
      `CIF del emisor con prefijo de país: ${promptContext.issuerNifWithCountryPrefix}`,
    );
  }

  if (promptContext.historicalSpentNames.length > 0) {
    messageParts.push(
      'Nombres de las últimas facturas del proveedor. Úsalos como patrón para el campo `name` del gasto (combustibles, dietas, internet, recargas, etc.):',
      JSON.stringify(promptContext.historicalSpentNames),
    );
  }

  if (promptContext.historicalConcepts.length > 0) {
    messageParts.push(
      'Conceptos completos de las últimas facturas del proveedor. Úsalos como ejemplo de formato (name, base_price, quantity, vat, irpf y supplied):',
      JSON.stringify(buildHistoricalConceptsPromptPayload(promptContext.historicalConcepts)),
    );
  }

  if (messageParts.length === 0) {
    return promptContext.extractedText;
  }

  messageParts.push('Texto OCR de la factura:', promptContext.extractedText);
  return messageParts.join('\n');
}

/**
 * Serializa los conceptos históricos sin imputación.
 * La imputación no la extrae OpenAI: siempre llega al 100 % y se ajusta en el frontend.
 * @param historicalConcepts Conceptos de facturas anteriores del proveedor
 * @returns Payload listo para el prompt, sin `percentage`
 */
function buildHistoricalConceptsPromptPayload(
  historicalConcepts: SpentConcept[],
): Array<{
  name: string;
  base_price: number;
  vat: number;
  irpf: number;
  quantity: number;
  supplied: boolean;
}> {
  return historicalConcepts.map((historicalConcept) => ({
    name: historicalConcept.name,
    base_price: historicalConcept.base_price,
    vat: historicalConcept.vat,
    irpf: historicalConcept.irpf,
    quantity: historicalConcept.quantity,
    supplied: historicalConcept.supplied,
  }));
}
