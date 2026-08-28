// src/dropbox/dropbox.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Dropbox, DropboxResponse, files } from 'dropbox';
import * as fetch from 'isomorphic-fetch';
import { File as MulterFile } from 'multer';
import axios from 'axios';

import * as dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class DropboxService {

  private readonly logger = new Logger(DropboxService.name);
  
  private dbx: Dropbox; // Cliente de dropbox
  
  constructor() {
    // Se intenta inicializar el cliente de Dropbox de forma anticipada para
    // "calentar" el token de acceso. La promesa se marca con `void` y la
    // inicialización captura sus propios errores: un fallo en el arranque (por
    // ejemplo, credenciales ausentes o Dropbox inaccesible) no debe generar un
    // rechazo de promesa no gestionado que derribe todo el proceso. En ese caso
    // `ensureAccessToken()` reintentará la obtención del token antes de la
    // primera operación real contra Dropbox.
    void this.initializeDropboxClient();
  }

  token_expiration_time: number = 0; // Tiempo de expiración del token

  /**
   * Inicializa el cliente de Dropbox obteniendo un token de acceso inicial.
   *
   * Cualquier error se registra como advertencia y se absorbe deliberadamente
   * para no interrumpir el arranque de la aplicación: la obtención del token se
   * reintenta de forma perezosa en {@link ensureAccessToken} antes de cada
   * operación. De este modo, las funcionalidades que no dependen de Dropbox
   * siguen estando disponibles aunque la integración no esté configurada.
   *
   * @returns Promesa que se resuelve cuando finaliza el intento de inicialización.
   */
  private async initializeDropboxClient(): Promise<void> {
    try {
      const accessToken = await this.getAccessToken(); // Obtenemos un token de acceso
      this.dbx = new Dropbox({ accessToken, fetch }); // Creamos un cliente de dropbox con el token de acceso
    } catch (error) {
      // Se degrada de forma controlada: se avisa pero no se propaga el error.
      this.logger.warn(
        `No se pudo inicializar el cliente de Dropbox durante el arranque; ` +
          `se reintentará antes de la primera operación. Detalle: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Obtiene un token de acceso
   * @returns Token de acceso
   */
  private async getAccessToken(): Promise<string> {
    try { // Intentamos obtener un token de acceso haciendo una petición a dropbox con las credenciales de la aplicación
      const response = await axios.post('https://api.dropboxapi.com/oauth2/token', null, {
        params: {
          grant_type: 'refresh_token',
          refresh_token: process.env.DROPBOX_REFRESH_TOKEN,
          client_id: process.env.DROPBOX_CLIENT_ID,
          client_secret: process.env.DROPBOX_CLIENT_SECRET,
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      this.token_expiration_time = Date.now() + response.data.expires_in * 1000; // Guardar el tiempo de expiración
      this.logger.log(`Refreshed Dropbox token expiration time: ${new Date(this.token_expiration_time).toISOString()}`) // Mostrar el tiempo de expiración
      return response.data.access_token; // Retornar el token de acceso
    } catch (error) {
      this.logger.error("Error obteniendo token de acceso: ", error)
      throw new Error(`Error obtaining access token: ${error.message}`);
    }
  }


  /**
   * Nos aseguramos de que el token de acceso sea válido
   */
  private async ensureAccessToken() {
    if (Date.now() >= this.token_expiration_time) { // Si el token ha expirado
      const new_access_token: string = await this.getAccessToken(); // Obtenemos un nuevo token
      this.dbx = new Dropbox({ accessToken: new_access_token, fetch }); // Creamos un nuevo cliente de dropbox con el nuevo token
    }
  }

  /**
   * Sube un archivo a dropbox
   * @param path Ruta donde se guardará el archivo
   * @param file Archivo a subir
   * @returns 
   */
  async uploadFile(path: string, file: MulterFile): Promise<DropboxResponse<files.FileMetadata>> {
    await this.ensureAccessToken(); //Nos aseguramos de que el token de acceso sea válido

    try {
      const response = await this.dbx.filesUpload({ //Subimos el archivo a dropbox en la ruta correspondiente
        path, //Ruta donde se guardará el archivo
        contents: file.buffer, // Contenido del archivo
        mode: {
          '.tag': 'overwrite', // Sobreescribe el archivo si ya existe
        },
      });
      return response; //Retornamos la respuesta de dropbox
    } catch (error) {
      this.logger.error("Error subiendo archivo a Dropbox: ", error)
      throw new Error(`Error uploading file: ${error.message}`); //Manejamos el error
    }
  }

  /**
   * Devuelve una lista de archivos para una ruta concreta
   * @param path Ruta de la que se quieren obtener los archivos
   * @returns 
   */
  async listFiles(path: string): Promise<files.ListFolderResult> {
    await this.ensureAccessToken(); //Nos aseguramos de que el token de acceso sea válido

    try {
      const response = await this.dbx.filesListFolder({ path }); //Listamos los archivos de la ruta indicada
      return response.result.entries as unknown as files.ListFolderResult; //Retornamos los archivos
    } catch (error) {
      if (error.status === 409) {
        this.logger.error("Error 409 (Posible carpeta no encontrada / No existe / Sin permisos). Retornando array vacío... ", error)
        // Manejar el error 409 (carpeta no encontrada) devolviendo una lista vacía
        return { entries: [], cursor: '', has_more: false };
      }

      throw new Error(`Error listing files: ${error.message}`); //Manejamos el error
    }
  }

  /**
   * Descarga un archivo de dropbox a partir de su ruta
   * @param path Ruta del archivo
   * @returns
   */
  async getFile(path: string): Promise<files.FileMetadata> {
    await this.ensureAccessToken(); //Nos aseguramos de que el token de acceso sea válido
   
    try {
      const response = await this.dbx.filesDownload({ path }); //Obtenemos el archivo en cuestión
      return response.result; //Retornamos el archivo
    } catch (error) {
      this.logger.error("Error descargando archivo de Dropbox: ", error)
      throw new Error(`Error downloading file: ${error.message}`); //Manejamos el error
    }
  }

  /**
   * Descarga un archivo de dropbox y devuelve su buffer
   * @param path Ruta del archivo
   * @returns Buffer del archivo
   */
  async downloadFile(path: string): Promise<Buffer> {
    await this.ensureAccessToken(); //Nos aseguramos de que el token de acceso sea válido
   
    try {
      const response = await this.dbx.filesDownload({ path }); //Descargamos el archivo
      // El contenido del archivo está en response.result.fileBinary
      const fileContent = (response.result as any).fileBinary;
      
      if (!fileContent) {
        throw new Error('No se pudo obtener el contenido del archivo');
      }
      
      // Convertir a Buffer si no lo es ya
      return Buffer.isBuffer(fileContent) ? fileContent : Buffer.from(fileContent);
    } catch (error) {
      this.logger.error("Error descargando archivo de Dropbox: ", error)
      throw new Error(`Error downloading file: ${error.message}`); //Manejamos el error
    }
  }

  /**
   * Elimina un archivo de dropbox a partir de su ruta
   * @param path Ruta del archivo
   */
  async deleteFile(path: string): Promise<void> {
    await this.ensureAccessToken(); //Nos aseguramos de que el token de acceso sea válido

    try {
      await this.dbx.filesDeleteV2({ path }); //Eliminamos el archivo
    } catch (error) {
      this.logger.error("Error eliminando archivo de Dropbox: ", error)
      throw new Error(`Error deleting file: ${error.message}`); //Manejamos el error
    }
  }

  /**
   * Mueve un archivo de dropbox a partir de su ruta, a una nueva ruta
   * @param path Ruta del archivo
   * @param new_path Nueva ruta del archivo
   */
  async moveFile(old_path: string, new_path: string): Promise<void> {
    this.logger.log(`Moviendo archivo de Dropbox de ${old_path} a ${new_path}`)
    await this.ensureAccessToken(); //Nos aseguramos de que el token de acceso sea válido

    try {
      await this.dbx.filesMoveV2({ from_path: old_path, to_path: new_path }); //Movemos el archivo a la nueva ruta
    } catch (error) {
      this.logger.error("Error moviendo archivo de Dropbox: ", error)
      throw new Error(`Error moving file: ${error.message}`); //Manejamos el error
    }
  }

  /**
   * Verifica si existe una carpeta concreta en dropbox
   * @param path Ruta de la carpeta
   * @returns True si la carpeta existe, false en caso contrario
   */
  async checkFolderExists(path: string): Promise<boolean> {
    await this.ensureAccessToken(); //Nos aseguramos de que el token de acceso sea válido
    try {
      await this.dbx.filesListFolder({ path }); //Verificamos si la carpeta existe
      return true;
    } catch (error) {
      if (error.status === 409) {
        this.logger.error("Error 409 (Posible carpeta no encontrada / No existe / Sin permisos). Retornando false... ", error)
        return false;
      }

      this.logger.error("Error verificando si existe una carpeta en Dropbox: ", error)
      throw new Error(`Error verificando si existe una carpeta en Dropbox: ${error.message}`); //Manejamos el error
    }
  }

  /**
   * Sanitiza el nombre del archivo para evitar caracteres inválidos en headers HTTP
   * @param fileName - El nombre del archivo original
   * @returns El nombre del archivo sanitizado
   */
  sanitizeFileName(fileName: string): string {
    if (!fileName) {
      return 'documento';
    }

    // Reemplazar caracteres problemáticos con equivalentes seguros
    return fileName
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') // Caracteres inválidos en nombres de archivo
      .replace(/[^\x20-\x7E]/g, '_') // Caracteres no ASCII
      .replace(/\s+/g, '_') // Espacios múltiples con underscore
      .replace(/_{2,}/g, '_') // Múltiples underscores con uno solo
      .replace(/^_+|_+$/g, '') // Quitar underscores al inicio y final
      .substring(0, 100) // Limitar longitud
      .trim() || 'documento'; // Fallback si queda vacío
  }
}