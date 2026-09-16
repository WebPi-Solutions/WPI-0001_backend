/**
 * Modos de IA persistidos en PostgreSQL (`ai_modes`).
 * `standard` envía el texto OCR a OpenAI; `premium` envía el PDF.
 */
export enum AiMode {
  STANDARD = 'standard',
  PREMIUM = 'premium',
}

/**
 * Indica si el modo de IA usa el flujo premium (PDF nativo).
 * @param aiMode - Modo persistido o recibido
 * @returns `true` si el modo es premium
 */
export function isPremiumAiMode(aiMode: AiMode | string | null | undefined): boolean {
  return aiMode === AiMode.PREMIUM;
}

/**
 * Normaliza un valor de modo de IA al enum de base de datos.
 * Cualquier valor distinto de `premium` se trata como `standard`.
 * @param aiMode - Valor recibido
 * @returns Modo válido
 */
export function normalizeAiMode(aiMode: unknown): AiMode {
  return aiMode === AiMode.PREMIUM ? AiMode.PREMIUM : AiMode.STANDARD;
}
