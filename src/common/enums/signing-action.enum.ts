/**
 * Acciones de fichaje persistidas en PostgreSQL (`signing_actions`).
 * `start` registra la entrada y `end` la salida.
 */
export enum SigningAction {
  START = 'start',
  END = 'end',
}
