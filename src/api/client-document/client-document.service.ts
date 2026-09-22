import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Response } from 'express';
import { DeleteResult } from 'typeorm';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { Client } from 'src/entities/client/client.entity';
import { ClientRepository } from 'src/entities/client/client-repository.service';
import { ClientDocument } from 'src/entities/client-document/client-document.entity';
import { ClientDocumentRepository } from 'src/entities/client-document/client-document-repository.service';
import { DropboxService } from 'src/services/dropbox/dropbox.service';
import { MulterFile } from 'multer';

/**
 * Servicio de documentos de cliente.
 * La empresa se resuelve siempre a través del cliente, no desde el cuerpo HTTP.
 */
@Injectable()
export class ClientDocumentService {
  constructor(
    private readonly clientDocumentRepository: ClientDocumentRepository,
    private readonly clientRepository: ClientRepository,
    private readonly enterpriseAccessService: EnterpriseAccessService,
    private readonly dropboxService: DropboxService,
  ) {}

  /** Crea los metadatos de un documento para un cliente de la empresa indicada. */
  async create(
    clientId: string,
    file: MulterFile,
    expectedEnterpriseId: string,
  ): Promise<ClientDocument> {
    const client = await this.resolveAccessibleClient(
      clientId,
      expectedEnterpriseId,
      'write',
    );
    const payload = this.buildCreatePersistencePayload(file, client.id);
    const createdDocument = await this.clientDocumentRepository.create(payload);
    const dropboxPath = this.clientDocumentRepository.getClientDocumentFilePath(
      expectedEnterpriseId,
      client.id,
      createdDocument.id,
    );
    try {
      await this.dropboxService.uploadFile(dropboxPath, file);
      return createdDocument;
    } catch (uploadError) {
      try {
        await this.clientDocumentRepository.deleteById(createdDocument.id);
      } catch (rollbackError) {
        // No se oculta el error de Dropbox: es la causa que invalida el alta.
        console.error(
          'Error al revertir el documento de cliente tras fallar Dropbox:',
          rollbackError,
        );
      }
      throw uploadError;
    }
  }

  /** Lista los documentos filtrados por cliente. */
  findAll(
    page: number,
    pageSize: number,
    sort: string,
    order: 'ASC' | 'DESC',
    filter: Record<string, unknown>,
    relations?: string[],
  ): Promise<PaginatedResponse<ClientDocument>> {
    return this.clientDocumentRepository.findAll(
      page,
      pageSize,
      sort,
      order,
      filter,
      relations,
    );
  }

  /** Comprueba que el cliente del listado pertenece a la empresa solicitada. */
  async assertClientAccessibleForList(
    clientId: string,
    expectedEnterpriseId: string,
  ): Promise<void> {
    await this.resolveAccessibleClient(clientId, expectedEnterpriseId, 'read');
  }

  /** Busca un documento y comprueba el tenant a través del cliente. */
  async findById(id: string, relations?: string[]): Promise<ClientDocument> {
    const relationNames = this.enterpriseAccessService.mergeRelationNames(
      relations,
      ['client'],
    );
    const clientDocument = await this.clientDocumentRepository.findById(
      id,
      relationNames,
    );
    if (!clientDocument) {
      throw new HttpException(
        'Documento de cliente no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
    this.assertDocumentAccessible(clientDocument, 'read');
    return clientDocument;
  }

  /** Actualiza exclusivamente el nombre, sin permitir alterar metadatos o cliente. */
  async updateById(
    id: string,
    clientDocument: ClientDocument,
  ): Promise<ClientDocument> {
    await this.findExistingAccessibleDocument(id, 'write');
    const name = clientDocument.name?.trim();
    if (!name) {
      throw new HttpException(
        'El nombre del documento es obligatorio',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.clientDocumentRepository.updateById(id, { name });
  }

  /** Elimina un documento accesible para la empresa activa. */
  async deleteById(id: string): Promise<DeleteResult> {
    const existingDocument = await this.findExistingAccessibleDocument(
      id,
      'delete',
    );
    await this.dropboxService.deleteFile(
      this.clientDocumentRepository.getClientDocumentFilePath(
        existingDocument.client.enterpriseId,
        existingDocument.clientId,
        existingDocument.id,
      ),
    );
    return this.clientDocumentRepository.deleteById(id);
  }

  /** Descarga un documento accesible desde Dropbox. */
  async downloadById(id: string, response: Response): Promise<void> {
    const document = await this.findExistingAccessibleDocument(id, 'read');
    const fileBuffer = await this.dropboxService.downloadFile(
      this.clientDocumentRepository.getClientDocumentFilePath(
        document.client.enterpriseId,
        document.clientId,
        document.id,
      ),
    );
    const fileName = this.dropboxService.sanitizeFileName(document.name);
    response.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Content-Length': fileBuffer.length.toString(),
    });
    response.send(fileBuffer);
  }

  /** Carga un cliente, comprueba permiso y valida que pertenece a la empresa de la query. */
  private async resolveAccessibleClient(
    clientId: string | undefined,
    expectedEnterpriseId: string,
    action: 'read' | 'write' | 'delete',
  ): Promise<Client> {
    if (!clientId) {
      throw new HttpException(
        'El documento debe pertenecer a un cliente',
        HttpStatus.BAD_REQUEST,
      );
    }
    const client = await this.clientRepository.findById(clientId);
    if (!client) {
      throw new HttpException(
        'Documento de cliente no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      client.enterpriseId,
      'Documento de cliente no encontrado',
      { resource: 'documentManagement', action },
    );
    if (client.enterpriseId !== expectedEnterpriseId) {
      throw new HttpException(
        'Documento de cliente no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
    return client;
  }

  /** Comprueba tenant y permiso del documento a través de su cliente cargado. */
  private assertDocumentAccessible(
    clientDocument: ClientDocument,
    action: 'read' | 'write' | 'delete',
  ): void {
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      clientDocument.client?.enterpriseId,
      'Documento de cliente no encontrado',
      { resource: 'documentManagement', action },
    );
  }

  /** Carga el documento con su cliente y aplica el control de acceso correspondiente. */
  private async findExistingAccessibleDocument(
    id: string,
    action: 'read' | 'write' | 'delete',
  ): Promise<ClientDocument> {
    const clientDocument = await this.clientDocumentRepository.findById(id, [
      'client',
    ]);
    if (!clientDocument) {
      throw new HttpException(
        'Documento de cliente no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
    this.assertDocumentAccessible(clientDocument, action);
    return clientDocument;
  }

  /** Construye los metadatos confiables a partir del archivo multipart recibido. */
  private buildCreatePersistencePayload(
    file: MulterFile,
    clientId: string,
  ): Partial<ClientDocument> {
    const name = file?.originalname?.trim();
    if (!name) {
      throw new HttpException(
        'El nombre del documento es obligatorio',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!Number.isInteger(file.size) || file.size < 0) {
      throw new HttpException(
        'El tamaño del documento debe ser un número entero igual o mayor que cero',
        HttpStatus.BAD_REQUEST,
      );
    }
    return { clientId, name, size: file.size };
  }
}
