/** Error tipado para distinguir un archivo inexistente de otros fallos de Dropbox. */
export class DropboxFileNotFoundError extends Error {
  constructor(path: string) {
    super(`El archivo no existe en Dropbox: ${path}`);
    this.name = DropboxFileNotFoundError.name;
  }
}
