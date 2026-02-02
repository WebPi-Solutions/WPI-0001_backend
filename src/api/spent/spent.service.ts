import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { SpentRepository } from 'src/entities/spent/spent-repository.service';
import { Spent } from 'src/entities/spent/spent.entity';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { DeleteResult } from 'typeorm';
import { DropboxService } from 'src/services/dropbox/dropbox.service';
import { MulterFile } from 'multer';
import { Response } from 'express';

@Injectable()
export class SpentService {
  private readonly logger = new Logger(SpentService.name);

  constructor(
    private readonly spentRepository: SpentRepository,
    private readonly dropboxService: DropboxService
  ){}

  /**
   * Crea un nuevo gasto
   * @param spent - El gasto a crear
   * @returns El gasto creado
   */
  async create(spent: Spent): Promise<Spent> {
    this.logger.log(`Iniciando proceso de creación de gasto: ${spent.name}`);
    this.logger.log(`Datos del gasto a crear:`, JSON.stringify(spent, null, 2));
    
    try {
      const newSpent = await this.spentRepository.create(spent);
      this.logger.log(`Gasto creado exitosamente con ID: ${newSpent.id}`);
      return newSpent;
    } catch (error) {
      this.logger.error(`Error al crear gasto ${spent.name}:`, error);
      throw error;
    }
  }

  /**
   * Obtiene todos los gastos con paginación, filtros y ordenación
   * @param page - El número de página
   * @param pageSize - El tamaño de la página
   * @param sort - El campo por el que ordenar
   * @param order - La dirección de ordenación
   * @param filter - Los filtros a aplicar
   * @param relations - Las relaciones a incluir
   * @returns Los gastos encontrados
   */
  async findAll(page: number, pageSize: number, sort: string, order: 'ASC' | 'DESC', filter: Record<string, any>, relations?: string[]): Promise<PaginatedResponse<Spent>> {
    this.logger.log(`Obteniendo gastos paginados - Página: ${page}, Tamaño: ${pageSize}, Ordenación: ${sort} ${order}`);
    this.logger.log(`Filtros aplicados:`, JSON.stringify(filter, null, 2));
    
    if (relations && relations.length > 0) {
      this.logger.log(`Incluyendo relaciones: ${relations.join(', ')}`);
    }
    
    const result = await this.spentRepository.findAll(page, pageSize, sort, order, filter, relations);
    this.logger.log(`Gastos obtenidos: ${result.items.length} de ${result.total}`);
    return result;
  }

  /**
   * Obtiene un gasto por su ID
   * @param id - El ID del gasto a obtener
   * @param relations - Las relaciones a incluir
   * @returns El gasto encontrado
   */
  async findById(id: string, relations?: string[]): Promise<Spent> {
    this.logger.log(`Buscando gasto por ID: ${id}${relations ? ` con relaciones: [${relations.join(', ')}]` : ''}`);
    
    const spent = await this.spentRepository.findById(id, relations);
    
    if (spent) {
      this.logger.log(`Gasto encontrado: ${spent.name} (ID: ${spent.id})`);
    } else {
      this.logger.log(`No se encontró ningún gasto con ID: ${id}`);
    }
    
    return spent;
  }

  /**
   * Actualiza un gasto por su ID
   * @param id - El ID del gasto a actualizar
   * @param spent - El gasto con los datos actualizados
   * @returns El gasto actualizado
   */
  async updateById(id: string, spent: Spent): Promise<Spent> {
    this.logger.log(`Iniciando actualización de gasto con ID: ${id}`);
    this.logger.log(`Datos a actualizar:`, JSON.stringify(spent, null, 2));
    
    try {
      const updatedSpent = await this.spentRepository.updateById(id, spent);
      this.logger.log(`Gasto ${id} actualizado exitosamente`);
      return updatedSpent;
    } catch (error) {
      this.logger.error(`Error al actualizar gasto ${id}:`, error);
      throw error;
    }
  }

  /**
   * Crea un nuevo gasto con un archivo adjunto
   * @param spentId - ID del gasto
   * @param file - Archivo PDF de la factura
   * @param enterpriseId - ID de la empresa
   * @returns El gasto creado con la ruta del archivo
   */
  async addFileToSpentById(spentId: string, file: MulterFile): Promise<Spent> {
    this.logger.log(`Iniciando adjuntar archivo a gasto con ID: ${spentId}`);
    this.logger.log(`Tipo de archivo: ${file.mimetype}, Tamaño: ${file.size} bytes`);
    
    try {
      // Validar el tipo de archivo
      if (file.mimetype !== 'application/pdf') {
        throw new HttpException('Solo se permiten archivos PDF', HttpStatus.BAD_REQUEST);
      }
      
      // Obtener el gasto a partir de su ID
      const spent = await this.spentRepository.findById(spentId, ['supplier']);
      if (!spent) throw new HttpException('Gasto no encontrado', HttpStatus.NOT_FOUND);
      
      // Construir la ruta de Dropbox para el archivo
      const dropboxPath = this.spentRepository.getSpentFilePath(spent.supplier.enterpriseId, spentId);
      this.logger.log(`Subiendo archivo a Dropbox en la ruta: ${dropboxPath}`);
      
      // Subir el archivo a Dropbox
      const uploadResult = await this.dropboxService.uploadFile(dropboxPath, file);
      this.logger.log('Archivo subido correctamente a Dropbox');
      
      // Actualizar el gasto con la ruta del documento
      const updatedSpent = await this.spentRepository.updateById(spentId, {
        ...spent,
        file: true
      });
      
      this.logger.log(`Se ha adjuntado el archivo al gasto ${spentId}`);
      return updatedSpent;
    } catch (error) {
      this.logger.error(`Error al adjuntar archivo al gasto ${spentId}: ${error.message}`, error.stack);
      throw error;
    }
   }

   /**
    * Descarga el archivo adjunto de un gasto por su ID
    * @param spentId - El ID del gasto
    * @param res - Response object de Express
    * @returns Stream del archivo
    */
   async downloadSpentFile(spentId: string, res: Response): Promise<void> {
     this.logger.log(`Iniciando descarga de archivo del gasto con ID: ${spentId}`);
     
     try {
       // Verificar si el gasto existe y tiene un archivo
       const spent = await this.spentRepository.findById(spentId, ['supplier']);
       if (!spent) throw new HttpException('Gasto no encontrado', HttpStatus.NOT_FOUND);
       
       if (!spent.file) {
         throw new HttpException('El gasto no tiene ningún archivo adjunto', HttpStatus.NOT_FOUND);
       }
       
       // Obtener la ruta del archivo en Dropbox
       const filePath = this.spentRepository.getSpentFilePath(spent.supplier.enterpriseId, spentId);
       this.logger.log(`Descargando archivo desde Dropbox: ${filePath}`);
       
       // Descargar el archivo de Dropbox
       const fileBuffer = await this.dropboxService.downloadFile(filePath);
       
      // Configurar headers para la descarga
      // Sanitizar el nombre del archivo para evitar caracteres inválidos en headers
      const sanitizedFileName = this.dropboxService.sanitizeFileName(spent.name);
      const fileName = `${sanitizedFileName}.pdf`;
      
      // Usar encoding UTF-8 para nombres de archivo con caracteres especiales
      const encodedFileName = encodeURIComponent(fileName);
      
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"; filename*=UTF-8''${encodedFileName}`,
        'Content-Length': fileBuffer.length.toString(),
      });
       
       // Enviar el archivo
       res.send(fileBuffer);
       
       this.logger.log(`Archivo descargado exitosamente para el gasto ${spentId}`);
     } catch (error) {
       this.logger.error(`Error al descargar archivo del gasto ${spentId}: ${error.message}`, error.stack);
       if (!res.headersSent) {
         throw error;
       }
     }
   }

   /**
    * Elimina un gasto por su ID
    * @param id - El ID del gasto a eliminar
    * @returns El resultado de la eliminación
    */
  async deleteById(spentId: string): Promise<DeleteResult> {
    this.logger.log(`Iniciando eliminación de gasto con ID: ${spentId}`);
    
    try {
      // Verificar si el gasto tiene un documento asociado
      const spent = await this.spentRepository.findById(spentId, ['supplier']);
      if (!spent) throw new HttpException('Gasto no encontrado', HttpStatus.NOT_FOUND);
      
      // Si tiene un documento, intentar eliminarlo de Dropbox
      if (spent && spent.file) {
        try {
          await this.dropboxService.deleteFile(this.spentRepository.getSpentFilePath(spent.supplier.enterpriseId, spentId));
          this.logger.log(`Archivo eliminado: ${this.spentRepository.getSpentFilePath(spent.supplier.enterpriseId, spentId)}`);
        } catch (deleteError) {
          this.logger.error(`No se pudo eliminar el archivo: ${deleteError.message}`);
          throw new HttpException(`No se pudo eliminar el archivo: ${deleteError.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
          // Continuamos con la eliminación del gasto incluso si no se pudo eliminar el archivo
        }
      }
      
      // Eliminar el gasto
      const result = await this.spentRepository.deleteById(spentId);
      this.logger.log(`Gasto ${spentId} eliminado exitosamente. Filas afectadas: ${result.affected}`);
      return result;
    } catch (error) {
      this.logger.error(`Error al eliminar gasto ${spentId}:`, error);
      throw error;
    }
  }

  /**
   * Elimina el archivo adjunto de un gasto por su ID
   * @param id - El ID del gasto a eliminar
   * @returns El resultado de la eliminación
   */
  async removeFileFromSpentById(spentId: string): Promise<Spent> {
    this.logger.log(`Iniciando eliminación de archivo adjunto de gasto con ID: ${spentId}`);
    
    try {
      // Verificar si el gasto tiene un documento asociado
      const spent = await this.spentRepository.findById(spentId, ['supplier']);
      if (!spent) throw new HttpException('Gasto no encontrado', HttpStatus.NOT_FOUND);
      
      // Si tiene un documento, intentar eliminarlo de Dropbox
      if (spent && spent.file) {
        try {
          await this.dropboxService.deleteFile(this.spentRepository.getSpentFilePath(spent.supplier.enterpriseId, spentId));
          this.logger.log(`Archivo eliminado: ${this.spentRepository.getSpentFilePath(spent.supplier.enterpriseId, spentId)}`);
        } catch (deleteError) {
          this.logger.error(`No se pudo eliminar el archivo: ${deleteError.message}`);
          throw new HttpException(`No se pudo eliminar el archivo: ${deleteError.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
          // Continuamos con la eliminación del gasto incluso si no se pudo eliminar el archivo
        }
      }
      
      // Actualizar el gasto para que no tenga un documento asociado
      const updatedSpent = await this.spentRepository.updateById(spentId, {
        ...spent,
        file: false
      });
      this.logger.log(`Archivo adjunto de gasto ${spentId} eliminado exitosamente`);
      return updatedSpent;
    } catch (error) {
      this.logger.error(`Error al eliminar archivo adjunto de gasto ${spentId}:`, error);
      throw error;
    }
  }

  async changeSpentEnterpriseFolderOndDropbox(spentId: string, oldEnterpriseId: string, newEnterpriseId: string): Promise<void> {
    this.logger.log(`Iniciando cambio de carpeta de Dropbox del gasto con ID: ${spentId} de la empresa ${oldEnterpriseId} a la empresa ${newEnterpriseId}`);
    
    try {
      // Verificar si el gasto existe
      const spent = await this.spentRepository.findById(spentId, ['supplier']);
      if (!spent) throw new HttpException('Gasto no encontrado', HttpStatus.NOT_FOUND);
      
      // Verificar si la empresa es la misma
      if (spent.supplier.enterpriseId === oldEnterpriseId) {
        throw new HttpException('La empresa del gasto es la misma que la empresa de destino', HttpStatus.BAD_REQUEST);
      }
      
      // Cambiar la carpeta de Dropbox
      const oldDropboxPath = this.spentRepository.getSpentFilePath(oldEnterpriseId, spentId);
      const newDropboxPath = this.spentRepository.getSpentFilePath(newEnterpriseId, spentId);
      await this.dropboxService.moveFile(oldDropboxPath, newDropboxPath);
      this.logger.log(`Carpeta de Dropbox del gasto ${spentId} cambiada de ${oldEnterpriseId} a ${newEnterpriseId} exitosamente`);
    } catch (error) {
      this.logger.error(`Error al cambiar la carpeta de Dropbox del gasto ${spentId}:`, error);
      throw error;
    }
  }
}