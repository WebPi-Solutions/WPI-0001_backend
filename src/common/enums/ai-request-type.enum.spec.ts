import { AiRequestType } from './ai-request-type.enum';

describe('AiRequestType', () => {
  it('expone los tipos de petición a la API de IA', () => {
    expect(AiRequestType.GET_SPENT_ISSUER).toBe('get_spent_issuer');
    expect(AiRequestType.GET_SPENT_CONCEPTS).toBe('get_spent_concepts');
  });
});
