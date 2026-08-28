import { resolveFirebasePrivateKey } from './firebase-env';

describe('resolveFirebasePrivateKey', () => {
  /**
   * Comprueba que una PEM en una sola línea con "\n" se convierte en saltos reales.
   */
  it('convierte los saltos de línea escapados en saltos reales', () => {
    const resolvedPrivateKey = resolveFirebasePrivateKey(
      '-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n',
    );

    expect(resolvedPrivateKey).toContain('\nABC\n');
    expect(resolvedPrivateKey).not.toContain('\\n');
  });

  /**
   * Comprueba que una clave ausente provoca un error descriptivo.
   */
  it('lanza un error si la clave no está definida', () => {
    expect(() => resolveFirebasePrivateKey(undefined)).toThrow(
      'FIREBASE_PRIVATE_KEY no está definida',
    );
  });

  /**
   * Comprueba que una cadena vacía no se acepta como clave válida.
   */
  it('lanza un error si la clave está vacía', () => {
    expect(() => resolveFirebasePrivateKey('   ')).toThrow(
      'FIREBASE_PRIVATE_KEY no está definida',
    );
  });
});
