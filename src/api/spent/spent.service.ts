import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { SpentRepository } from 'src/entities/spent/spent-repository.service';
import { Spent } from 'src/entities/spent/spent.entity';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { DeleteResult } from 'typeorm';
import { DropboxService } from 'src/services/dropbox/dropbox.service';
import { MulterFile } from 'multer';
import { Response } from 'express';
import {
  SpentAiFilePreviewResponseDto,
  SpentAiPreviewSpentDataDto,
  SpentAiSuggestedSupplierDto,
} from './dto/spent-ai-file-preview-response.dto';
import { FileService } from 'src/services/file/file.service';
import { ExtractedSpentConceptsResult, ExtractedSpentIssuerResult, OpenaiService } from 'src/services/openai/openai.service';
import { SupplierRepository } from 'src/entities/supplier/supplier-repository.service';
import { Supplier } from 'src/entities/supplier/supplier.entity';
import { SpentConcept } from 'src/models/Concept';

/**
 * Servicio de gastos: orquesta repositorio, almacenamiento, archivos y extracción con IA.
 */
@Injectable()
export class SpentService {
  private readonly logger = new Logger(SpentService.name);

  /**
   * Número de facturas recientes del proveedor usadas como ejemplo de formato de conceptos.
   */
  private readonly historicalSpentsForConceptExtractionLimit = 5;

  /**
   * Estado por defecto de un gasto extraído con IA.
   */
  private readonly defaultAiSpentStatus = 'paid';

  constructor(
    private readonly spentRepository: SpentRepository,
    private readonly dropboxService: DropboxService,
    private readonly fileService: FileService,
    private readonly openaiService: OpenaiService,
    private readonly supplierRepository: SupplierRepository,
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
      this.fileService.validatePdfFile(file);
      
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
   * Recibe un PDF de gasto para procesamiento con IA.
   * Delega OCR, extracción del emisor, búsqueda del proveedor, conceptos históricos y armado de spentData.
   * @param file Archivo PDF recibido
   * @param enterpriseId ID de la empresa en la que se busca el proveedor
   * @returns Datos del archivo y spentData listo para crear el gasto
   */
  async previewAiSpentFile(
    file: MulterFile,
    enterpriseId: string,
  ): Promise<SpentAiFilePreviewResponseDto> {
    this.logger.log('Iniciando recepción de PDF para subida de gastos con IA');

    try {
      const processedFile = await this.fileService.processAiSpentPdf(file);
      const extractedIssuer = await this.openaiService.extractSpentIssuerFromText(
        processedFile.extractedText,
      );
      const existingSupplier = await this.findSupplierByIssuerNif(extractedIssuer, enterpriseId);
      const historicalExtractionContext = existingSupplier
        ? await this.getHistoricalExtractionContextFromSupplier(existingSupplier.id)
        : { historicalConcepts: [], historicalSpentNames: [] };
      const extractedInvoice = await this.openaiService.extractSpentConceptsFromText(
        processedFile.extractedText,
        {
          ...historicalExtractionContext,
          issuerNifWithCountryPrefix: extractedIssuer.nifWithCountryPrefix,
        },
      );
      const spentData = this.buildAiPreviewSpentData(
        extractedInvoice,
        existingSupplier,
        extractedIssuer,
        processedFile.originalName,
      );

      this.logger.log(`spentData generado para el frontend:\n${JSON.stringify(spentData, null, 2)}`);

      return {
        originalName: processedFile.originalName,
        sizeInMegabytes: processedFile.sizeInMegabytes,
        message: processedFile.message,
        spentData,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        this.logger.warn(`PDF rechazado para subida de gastos con IA: ${error.message}`);
        throw error;
      }

      this.logger.error(
        `Error al recibir el PDF para subida de gastos con IA: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Busca el proveedor por los CIF extraídos (sin prefijo y, si viene, con prefijo).
   * Primero consulta sin prefijo y después con prefijo.
   * @param extractedIssuer Datos del emisor extraídos por OpenAI
   * @param enterpriseId ID de la empresa
   * @returns El proveedor si existe, o null
   */
  private async findSupplierByIssuerNif(
    extractedIssuer: ExtractedSpentIssuerResult,
    enterpriseId: string,
  ): Promise<Supplier | null> {
    const nifSearchCandidates = this.buildSupplierNifSearchCandidates(extractedIssuer);
    if (nifSearchCandidates.length === 0) {
      this.logger.warn(
        'No se busca el proveedor en base de datos: OpenAI no ha devuelto un CIF/NIF del emisor',
      );
      return null;
    }

    this.logger.debug(
      `Candidatos de CIF para buscar proveedor: ${nifSearchCandidates.join(', ')}`,
    );

    for (const nifCandidate of nifSearchCandidates) {
      const existingSupplier = await this.supplierRepository.findByNifAndEnterpriseId(
        nifCandidate,
        enterpriseId,
      );

      if (existingSupplier) {
        this.logger.debug(
          `Proveedor encontrado por CIF ${nifCandidate}: ${existingSupplier.name} (ID: ${existingSupplier.id})`,
        );
        return existingSupplier;
      }
    }

    this.logger.warn(
      `No existe un proveedor con el CIF ${nifSearchCandidates.join(' / ')} para la empresa ${enterpriseId}`,
    );
    return null;
  }

  /**
   * Obtiene conceptos y nombres de las últimas facturas del proveedor.
   * @param supplierId ID del proveedor encontrado
   * @returns Conceptos históricos y nombres de factura
   */
  private async getHistoricalExtractionContextFromSupplier(supplierId: string): Promise<{
    historicalConcepts: SpentConcept[];
    historicalSpentNames: string[];
  }> {
    const latestSpents = await this.spentRepository.findLatestBySupplierId(
      supplierId,
      this.historicalSpentsForConceptExtractionLimit,
    );
    const historicalConcepts = this.collectHistoricalConceptsFromSpents(latestSpents);
    const historicalSpentNames = this.collectHistoricalSpentNamesFromSpents(latestSpents);

    this.logger.debug(
      `Historial del proveedor ${supplierId} (${latestSpents.length} facturas): nombres=${JSON.stringify(historicalSpentNames)}, conceptos=${JSON.stringify(historicalConcepts)}`,
    );

    return {
      historicalConcepts,
      historicalSpentNames,
    };
  }

  /**
   * Extrae nombres de factura únicos conservando el orden más reciente primero.
   * @param spents Gastos de los que extraer nombres
   * @returns Nombres de factura sin duplicados
   */
  private collectHistoricalSpentNamesFromSpents(spents: Spent[]): string[] {
    const uniqueSpentNames: string[] = [];
    const seenSpentNames = new Set<string>();

    for (const spent of spents) {
      const spentName = spent?.name?.trim();
      if (!spentName) {
        continue;
      }

      const spentNameKey = spentName.toLowerCase();
      if (seenSpentNames.has(spentNameKey)) {
        continue;
      }

      seenSpentNames.add(spentNameKey);
      uniqueSpentNames.push(spentName);
    }

    return uniqueSpentNames;
  }

  /**
   * Completa spentData a partir de la extracción de OpenAI, el proveedor y las fechas.
   * Incluye siempre los datos del emisor para poder crear un proveedor si el vinculado no es el correcto.
   * @param extractedInvoice Resultado de OpenAI
   * @param existingSupplier Proveedor encontrado, si existe
   * @param extractedIssuer Emisor extraído de la factura
   * @param originalFileName Nombre original del PDF, por si falta el nombre extraído
   * @returns Datos listos para crear el gasto
   */
  private buildAiPreviewSpentData(
    extractedInvoice: ExtractedSpentConceptsResult,
    existingSupplier: Supplier | null,
    extractedIssuer: ExtractedSpentIssuerResult,
    originalFileName: string,
  ): SpentAiPreviewSpentDataDto {
    const issuedDate = extractedInvoice.issuedDate;
    const spentName = extractedInvoice.name || this.buildFallbackSpentName(originalFileName);

    return {
      name: spentName,
      issuedDate,
      collectionDate: issuedDate,
      declarationDate: issuedDate,
      concepts: extractedInvoice.concepts,
      status: this.defaultAiSpentStatus,
      supplierId: existingSupplier?.id ?? null,
      suggestedSupplier: this.buildSuggestedSupplierFromIssuer(extractedIssuer),
    };
  }

  /**
   * Prepara los datos del emisor extraídos de la factura para crear un proveedor.
   * Se incluye aunque ya exista un proveedor vinculado, por si el emparejamiento no es el correcto.
   * @param extractedIssuer Emisor extraído por OpenAI
   * @returns Datos para el alta, o null si no hay nombre ni CIF
   */
  private buildSuggestedSupplierFromIssuer(
    extractedIssuer: ExtractedSpentIssuerResult,
  ): SpentAiSuggestedSupplierDto | null {
    const suggestedNif = this.pickSuggestedSupplierNif(extractedIssuer);
    const suggestedName = extractedIssuer.name?.trim() ?? '';
    if (!suggestedName && !suggestedNif) {
      this.logger.warn('El emisor extraído no tiene nombre ni CIF; no se proponen datos de alta');
      return null;
    }

    const suggestedSupplier: SpentAiSuggestedSupplierDto = {
      name: suggestedName,
      nif: suggestedNif,
      type: this.inferSupplierTypeFromNif(suggestedNif),
    };

    this.logger.log(
      `Datos del emisor extraídos para posible alta de proveedor: ${JSON.stringify(suggestedSupplier)}`,
    );
    return suggestedSupplier;
  }

  /**
   * Elige el CIF/NIF a usar en el alta: primero sin prefijo de país y, si no hay, con prefijo.
   * @param extractedIssuer Emisor extraído por OpenAI
   * @returns CIF/NIF propuesto, o cadena vacía
   */
  private pickSuggestedSupplierNif(extractedIssuer: ExtractedSpentIssuerResult): string {
    const nifWithoutCountryPrefix = extractedIssuer.nifWithoutCountryPrefix?.trim() ?? '';
    if (nifWithoutCountryPrefix) {
      return nifWithoutCountryPrefix;
    }

    return extractedIssuer.nifWithCountryPrefix?.trim() ?? '';
  }

  /**
   * Infiere si el emisor es empresa o particular a partir del CIF/NIF.
   * Un NIF/NIE español se trata como particular; el resto, como empresa.
   * @param nif CIF/NIF propuesto
   * @returns `company` o `individual`
   */
  private inferSupplierTypeFromNif(nif: string): 'company' | 'individual' {
    const normalizedNif = nif.replace(/[\s.\-]/g, '').toUpperCase();
    const nifWithoutCountryPrefix = normalizedNif.startsWith('ES')
      ? normalizedNif.slice(2)
      : normalizedNif;

    const isSpanishIndividualNif = /^\d{8}[A-Z]$/.test(nifWithoutCountryPrefix);
    const isSpanishNie = /^[XYZ]\d{7}[A-Z]$/.test(nifWithoutCountryPrefix);
    if (isSpanishIndividualNif || isSpanishNie) {
      return 'individual';
    }

    return 'company';
  }

  /**
   * Construye un nombre de gasto a partir del nombre del archivo si OpenAI no lo ha devuelto.
   * @param originalFileName Nombre original del PDF
   * @returns Nombre sin extensión
   */
  private buildFallbackSpentName(originalFileName: string): string {
    const fileNameWithoutExtension = originalFileName.replace(/\.pdf$/i, '').trim();
    return fileNameWithoutExtension || 'Gasto';
  }

  /**
   * Recorre los gastos y extrae los conceptos completos con nombre.
   * @param spents Gastos de los que extraer conceptos
   * @returns Conceptos normalizados en el orden de las facturas
   */
  private collectHistoricalConceptsFromSpents(spents: Spent[]): SpentConcept[] {
    const historicalConcepts: SpentConcept[] = [];

    for (const spent of spents) {
      for (const concept of spent.concepts ?? []) {
        const mappedConcept = this.mapToHistoricalSpentConcept(concept);
        if (!mappedConcept) {
          continue;
        }

        historicalConcepts.push(mappedConcept);
      }
    }

    return historicalConcepts;
  }

  /**
   * Normaliza un concepto histórico a los campos usados por la extracción con IA.
   * No incluye imputación: OpenAI no la extrae y el frontend la ajusta después.
   * @param concept Concepto almacenado en un gasto
   * @returns Concepto listo para el prompt, o null si no tiene nombre
   */
  private mapToHistoricalSpentConcept(concept: SpentConcept): SpentConcept | null {
    const conceptName = concept?.name?.trim();
    if (!conceptName) {
      return null;
    }

    const mappedConcept = new SpentConcept();
    mappedConcept.name = conceptName;
    mappedConcept.base_price = Number(concept.base_price) || 0;
    mappedConcept.vat = Number(concept.vat) || 0;
    mappedConcept.irpf = Number(concept.irpf) || 0;
    mappedConcept.quantity = Number(concept.quantity) || 1;
    mappedConcept.supplied = Boolean(concept.supplied);

    return mappedConcept;
  }

  /**
   * Ordena los CIF a consultar: primero sin prefijo de país y después con prefijo.
   * @param extractedIssuer Datos del emisor extraídos por OpenAI
   * @returns Lista de CIFs a buscar, sin vacíos ni duplicados
   */
  private buildSupplierNifSearchCandidates(
    extractedIssuer: ExtractedSpentIssuerResult,
  ): string[] {
    const nifWithoutCountryPrefix = extractedIssuer.nifWithoutCountryPrefix?.trim() ?? '';
    const nifWithCountryPrefix = extractedIssuer.nifWithCountryPrefix?.trim() ?? '';

    return [...new Set([nifWithoutCountryPrefix, nifWithCountryPrefix].filter(Boolean))];
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