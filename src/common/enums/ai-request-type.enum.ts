/**
 * Tipos de petición a la API de IA persistidos en PostgreSQL (`ai_request_types`).
 */
export enum AiRequestType {
  GET_SPENT_ISSUER = 'get_spent_issuer',
  GET_SPENT_CONCEPTS = 'get_spent_concepts',
}
