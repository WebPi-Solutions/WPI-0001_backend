import { AiMode, isPremiumAiMode, normalizeAiMode } from './AiMode';

describe('AiMode', () => {
  it('identifica el modo premium', () => {
    expect(isPremiumAiMode(AiMode.PREMIUM)).toBe(true);
    expect(isPremiumAiMode(AiMode.STANDARD)).toBe(false);
    expect(isPremiumAiMode(null)).toBe(false);
  });

  it('normaliza premium y cualquier otro valor a los modos del enum', () => {
    expect(normalizeAiMode(AiMode.PREMIUM)).toBe(AiMode.PREMIUM);
    expect(normalizeAiMode(AiMode.STANDARD)).toBe(AiMode.STANDARD);
    expect(normalizeAiMode(null)).toBe(AiMode.STANDARD);
    expect(normalizeAiMode('otro')).toBe(AiMode.STANDARD);
  });
});
