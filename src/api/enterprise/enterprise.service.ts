import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EnterpriseRepository } from 'src/entities/enterprise/enterprise-repository.service';
import { Enterprise } from 'src/entities/enterprise/enterprise.entity';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { DeleteResult } from 'typeorm';
import { MulterFile } from 'multer';
import { DropboxService } from 'src/services/dropbox/dropbox.service';
import { Response } from 'express';

@Injectable()
export class EnterpriseService {
  private readonly logger = new Logger(EnterpriseService.name);

  constructor(
    private readonly enterpriseRepository: EnterpriseRepository,
    private readonly dropboxService: DropboxService,
  ) {}

  /**
   * Relaciones de `Enterprise` que no deben persistirse desde el cuerpo HTTP.
   */
  private static readonly enterpriseRelationKeysExcludedFromWrite: ReadonlyArray<keyof Enterprise> = [
    'clients',
    'suppliers',
    'userEnterprises',
    'invoiceSeries',
    'defaultSchedules',
    'holidays',
  ];

  /**
   * Elimina `stripeId` y relaciones del payload de escritura para evitar que el cliente las fuerce.
   *
   * @param enterprise - Objeto recibido del controlador (creación o actualización)
   * @returns Copia superficial apta para el repositorio
   */
  private buildSanitizedEnterpriseWritePayload(
    enterprise: Partial<Enterprise>,
  ): Partial<Enterprise> {
    const sanitized: Record<string, unknown> = { ...(enterprise as Record<string, unknown>) };
    delete sanitized.stripeId;
    for (const relationKey of EnterpriseService.enterpriseRelationKeysExcludedFromWrite) {
      delete sanitized[relationKey as string];
    }
    return sanitized as Partial<Enterprise>;
  }

  /**
   * Crea una nueva empresa
   * @param enterprise - La empresa a crear
   * @returns La empresa creada
   */
  async create(enterprise: Enterprise): Promise<Enterprise> {
    this.logger.log(`Iniciando proceso de creación de empresa: ${enterprise.name}`);
    this.logger.log(`Datos de la empresa a crear:`, JSON.stringify(enterprise, null, 2));

    const enterpriseExists = await this.enterpriseRepository.findByNif(enterprise.nif);
    if (enterpriseExists) {
      this.logger.log(`Ya existe una empresa con el NIF: ${enterprise.nif}`);
      throw new HttpException('Ya existe una empresa con el NIF', HttpStatus.CONFLICT);
    }
    
    try {
      const payloadForPersistence = this.buildSanitizedEnterpriseWritePayload(enterprise);
      const newEnterprise = await this.enterpriseRepository.create(payloadForPersistence as Enterprise);
      this.logger.log(`Empresa creada exitosamente con ID: ${newEnterprise.id}`);
      return newEnterprise;
    } catch (error) {
      this.logger.error(`Error al crear empresa ${enterprise.name}:`, error);
      throw error;
    }
  }

  /**
   * Crea/reemplaza el archivo del logo de la empresa en Dropbox
   * @param enterpriseId - ID de la empresa
   * @param file - Archivo del logo de la empresa
   * @returns La empresa actualizada con la ruta del archivo del logo en Dropbox
   */
  async createLogoInDropbox(enterpriseId: string, file: MulterFile): Promise<Enterprise> {
    this.logger.log(`Iniciando adjuntar logo para la empresa con ID: ${enterpriseId}`);
    this.logger.log(`Tipo de archivo: ${file.mimetype}, Tamaño: ${file.size} bytes`);
      
    const enterprise = await this.enterpriseRepository.findById(enterpriseId);
    if (!enterprise) throw new HttpException('Empresa no encontrada', HttpStatus.NOT_FOUND);
    

    try {
      // Validar el tipo de archivo - solo se permiten imágenes JPEG, JPG y PNG
      if (file.mimetype !== 'image/png' && file.mimetype !== 'image/jpeg' && file.mimetype !== 'image/jpg') {
        throw new HttpException('Solo se permiten archivos de imagen (JPEG, JPG, PNG)', HttpStatus.BAD_REQUEST);
      }
      // Construir la ruta de Dropbox para el archivo
      const dropboxPath = this.enterpriseRepository.getLogoFilePath(enterprise.id, file.mimetype.split('/')[1]);
      this.logger.log(`Subiendo archivo a Dropbox en la ruta: ${dropboxPath}`);
      
      // Subir el archivo a Dropbox
      const uploadResult = await this.dropboxService.uploadFile(dropboxPath, file);
      this.logger.log('Archivo subido correctamente a Dropbox');
      
      // Actualizar la empresa con la ruta del archivo del logo en Dropbox
      const updatedEnterprise = await this.enterpriseRepository.updateById(enterpriseId, {
        ...enterprise,
        logo: dropboxPath.split('/').pop()
      });
      
      this.logger.log(`Se ha adjuntado el archivo al empresa ${enterpriseId}`);
      return updatedEnterprise;
    } catch (error) {
      this.logger.error(`Error al adjuntar archivo al empresa ${enterpriseId}: ${error.message}`, error.stack);
      throw error;
    }
  }

     /**
    * Descarga el archivo del logo de la empresa por su ID
    * @param enterpriseId - El ID de la empresa
    * @param res - Response object de Express
    * @returns Stream del archivo
    */
     async downloadLogoFile(enterpriseId: string, res: Response): Promise<void> {
      this.logger.log(`Iniciando descarga de archivo del logo de la empresa con ID: ${enterpriseId}`);
      
      try {
        // Verificar si la empresa existe y tiene un archivo del logo
        const enterprise = await this.enterpriseRepository.findById(enterpriseId);
        if (!enterprise) throw new HttpException('Empresa no encontrada', HttpStatus.NOT_FOUND);
        
        if (!enterprise.logo) {
          throw new HttpException('La empresa no tiene ningún archivo del logo', HttpStatus.NOT_FOUND);
        }
        
        // Obtener la ruta del archivo en Dropbox
        const fileExtension = enterprise.logo.split('.').pop()?.toLowerCase();
        const filePath = this.enterpriseRepository.getLogoFilePath(enterprise.id, fileExtension);
        this.logger.log(`Descargando archivo desde Dropbox: ${filePath}`);
        
        // Descargar el archivo de Dropbox
        const fileBuffer = await this.dropboxService.downloadFile(filePath);
        
        // Determinar el Content-Type basado en la extensión del archivo
        let contentType = 'application/octet-stream'; // Default
        if (fileExtension === 'png') {
          contentType = 'image/png';
        } else if (fileExtension === 'jpg' || fileExtension === 'jpeg') {
          contentType = 'image/jpeg';
        }
        
        // Configurar headers para la descarga
        // Sanitizar el nombre del archivo para evitar caracteres inválidos en headers
        // Obtener todas las partes del nombre excepto la última (que es la extensión)
        // Esto maneja correctamente archivos con múltiples puntos, ej: "archivo.ejemplo.txt"
        const fileNameParts = enterprise.logo.split('.');
        const fileNameWithoutExtension = fileNameParts.slice(0, -1).join('.');
        const sanitizedFileName = this.dropboxService.sanitizeFileName(fileNameWithoutExtension);
        const fileName = `${sanitizedFileName}.${fileExtension}`;
        
        // Usar encoding UTF-8 para nombres de archivo con caracteres especiales
        const encodedFileName = encodeURIComponent(fileName);
        
        res.set({
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${fileName}"; filename*=UTF-8''${encodedFileName}`,
          'Content-Length': fileBuffer.length.toString(),
        });
        
        // Enviar el archivo
        res.send(fileBuffer);
        
        this.logger.log(`Archivo descargado exitosamente para la empresa ${enterpriseId}`);
      } catch (error) {
        this.logger.error(`Error al descargar archivo de la empresa ${enterpriseId}: ${error.message}`, error.stack);
        if (!res.headersSent) {
          throw error;
        }
      }
    }
 

  /**
   * Obtiene todas las empresas con paginación, filtros y ordenación
   * @param page - El número de página
   * @param pageSize - El tamaño de la página
   * @param sort - El campo por el que ordenar
   * @param order - La dirección de ordenación
   * @param filter - Los filtros a aplicar
   * @param relations - Las relaciones a incluir
   * @returns Las empresas encontradas
   */
  async findAll(page: number, pageSize: number, sort: string, order: 'ASC' | 'DESC', filter: Record<string, any>, relations?: string[]): Promise<PaginatedResponse<Enterprise>> {
    this.logger.log(`Obteniendo empresas paginadas - Página: ${page}, Tamaño: ${pageSize}, Ordenación: ${sort} ${order}`);
    this.logger.log(`Filtros aplicados:`, JSON.stringify(filter, null, 2));
    
    if (relations && relations.length > 0) {
      this.logger.log(`Incluyendo relaciones: ${relations.join(', ')}`);
    }
    
    const result = await this.enterpriseRepository.findAll(page, pageSize, sort, order, filter, relations);
    this.logger.log(`Empresas obtenidas: ${result.items.length} de ${result.total}`);
    return result;
  }

  /**
   * Obtiene una empresa por su ID
   * @param id - El ID de la empresa a obtener
   * @param relations - Las relaciones a incluir
   * @returns La empresa encontrada
   */
  async findById(id: string, relations?: string[]): Promise<Enterprise> {
    this.logger.log(`Buscando empresa por ID: ${id}${relations ? ` con relaciones: [${relations.join(', ')}]` : ''}`);
    
    const enterprise = await this.enterpriseRepository.findById(id, relations);
    
    if (enterprise) {
      this.logger.log(`Empresa encontrada: ${enterprise.name} (ID: ${enterprise.id})`);
    } else {
      this.logger.log(`No se encontró ninguna empresa con ID: ${id}`);
      throw new HttpException('Empresa no encontrada', HttpStatus.NOT_FOUND);
    }
    
    return enterprise;
  }

  /**
   * Actualiza una empresa por su ID
   * @param id - El ID de la empresa a actualizar
   * @param enterprise - La empresa con los datos actualizados
   * @returns La empresa actualizada
   */
  async updateById(id: string, enterprise: Enterprise): Promise<Enterprise> {
    this.logger.log(`Iniciando actualización de empresa con ID: ${id}`);
    this.logger.log(`Datos a actualizar:`, JSON.stringify(enterprise, null, 2));
    
    const enterpriseExists = await this.enterpriseRepository.findById(id);
    if (!enterpriseExists) {
      this.logger.log(`No se encontró ninguna empresa con ID: ${id}`);
      throw new HttpException('Empresa no encontrada', HttpStatus.NOT_FOUND);
    }
    
    try {
      const payloadForPersistence = this.buildSanitizedEnterpriseWritePayload(enterprise);
      const updatedEnterprise = await this.enterpriseRepository.updateById(
        id,
        payloadForPersistence as Enterprise,
      );
      this.logger.log(`Empresa ${id} actualizada exitosamente`);
      return updatedEnterprise;
    } catch (error) {
      this.logger.error(`Error al actualizar empresa ${id}:`, error);
      throw error;
    }
  }

  /**
   * Elimina una empresa por su ID
   * @param id - El ID de la empresa a eliminar
   * @returns El resultado de la eliminación
   */
  async deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Iniciando eliminación de empresa con ID: ${id}`);

    const enterpriseExists = await this.enterpriseRepository.findById(id, ['recurrentEarnings']);
    if (!enterpriseExists) {
      this.logger.log(`No se encontró ninguna empresa con ID: ${id}`);
      throw new HttpException('Empresa no encontrada', HttpStatus.NOT_FOUND);
    }

    if (enterpriseExists.recurrentEarnings && enterpriseExists.recurrentEarnings.length > 0) {
      this.logger.error(`No se puede eliminar la empresa ${id} porque tiene ingresos recurrentes asociados`);
      throw new HttpException(
        'No se puede eliminar la empresa porque tiene ingresos recurrentes asociados',
        HttpStatus.BAD_REQUEST,
      );
    }
    
    try {
      const result = await this.enterpriseRepository.deleteById(id);
      this.logger.log(`Empresa ${id} eliminada exitosamente. Filas afectadas: ${result.affected}`);

      if (result.affected && result.affected > 0) {
        // Si se eliminó la empresa, se elimina la carpeta de la empresa en Dropbox
        const folderPath = this.enterpriseRepository.getEnterpriseFolderPath(id);
        const folderExists = await this.dropboxService.checkFolderExists(folderPath);
        if (folderExists) {
          await this.dropboxService.deleteFile(folderPath);
          this.logger.log(`Carpeta de la empresa ${id} eliminada exitosamente en Dropbox`);
        }
        else{
          this.logger.log(`Carpeta de la empresa ${id} no encontrada en Dropbox, abortando eliminación...`);
        }
      }
      return result;
    } catch (error) {
      this.logger.error(`Error al eliminar empresa ${id}:`, error);
      throw error;
    }
  }
}