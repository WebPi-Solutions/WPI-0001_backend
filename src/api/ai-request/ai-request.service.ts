import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AiRequestRepository } from 'src/entities/ai-request/ai-request-repository.service';
import { AiRequest, AiRequestType } from 'src/entities/ai-request/ai-request.entity';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { CreateAiRequestDto } from './dto/create-ai-request.dto';

/**
 * Servicio de negocio de peticiones a la API de IA.
 * Valida el tipo y los tokens antes de persistir el registro de auditoría.
 */
@Injectable()
export class AiRequestService {
  private readonly logger = new Logger(AiRequestService.name);

  constructor(private readonly aiRequestRepository: AiRequestRepository) {}

  /**
   * Crea una petición de IA para la empresa indicada.
   * @param enterpriseId - Empresa propietaria
   * @param createAiRequestDto - Datos de la petición
   * @returns La petición persistida
   */
  async create(enterpriseId: string, createAiRequestDto: CreateAiRequestDto): Promise<AiRequest> {
    this.logger.log(
      `Registrando petición de IA tipo ${createAiRequestDto.type} para la empresa ${enterpriseId}`,
    );

    this.validateEnterpriseId(enterpriseId);
    this.validateType(createAiRequestDto.type);
    this.validateTokenUsage(createAiRequestDto);

    const aiRequestToPersist: Partial<AiRequest> = {
      enterpriseId,
      correlationId: createAiRequestDto.correlationId ?? randomUUID(),
      promptTokens: createAiRequestDto.promptTokens,
      completionTokens: createAiRequestDto.completionTokens,
      totalTokens: createAiRequestDto.totalTokens,
      type: createAiRequestDto.type,
      message: createAiRequestDto.message,
      response: createAiRequestDto.response ?? null,
    };

    try {
      const createdAiRequest = await this.aiRequestRepository.create(aiRequestToPersist);
      this.logger.log(`Petición de IA registrada con ID: ${createdAiRequest.id}`);
      return createdAiRequest;
    } catch (error) {
      this.logger.error(
        `Error al registrar la petición de IA tipo ${createAiRequestDto.type} para la empresa ${enterpriseId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Obtiene peticiones de IA paginadas, filtradas y ordenadas.
   * @param page - Número de página
   * @param pageSize - Tamaño de página
   * @param sort - Campo de ordenación
   * @param order - Dirección de ordenación
   * @param filter - Filtros a aplicar (incluye enterpriseId)
   * @param relations - Relaciones a incluir
   * @returns Respuesta paginada con las peticiones
   */
  async findAll(
    page: number,
    pageSize: number,
    sort: string,
    order: 'ASC' | 'DESC',
    filter: Record<string, unknown>,
    relations?: string[],
  ): Promise<PaginatedResponse<AiRequest>> {
    this.logger.log(
      `Obteniendo peticiones de IA paginadas - Página: ${page}, Tamaño: ${pageSize}, Ordenación: ${sort} ${order}`,
    );
    this.logger.log(`Filtros aplicados: ${JSON.stringify(filter)}`);

    const result = await this.aiRequestRepository.findAll(
      page,
      pageSize,
      sort,
      order,
      filter,
      relations,
    );
    this.logger.log(`Peticiones de IA obtenidas: ${result.items.length} de ${result.total}`);
    return result;
  }

  /**
   * Obtiene una petición de IA por su ID.
   * @param id - Identificador de la petición
   * @param relations - Relaciones a incluir
   * @returns La petición encontrada
   */
  async findById(id: string, relations?: string[]): Promise<AiRequest> {
    this.logger.log(
      `Buscando petición de IA por ID: ${id}${relations?.length ? ` con relaciones: [${relations.join(', ')}]` : ''}`,
    );
    return this.aiRequestRepository.findByIdOrFail(id, relations);
  }

  /**
   * Comprueba que se ha informado el identificador de empresa.
   * @param enterpriseId - Identificador de empresa
   */
  private validateEnterpriseId(enterpriseId: string): void {
    if (!enterpriseId) {
      this.logger.error('No se ha informado el ID de la empresa al registrar una petición de IA');
      throw new HttpException('Es obligatorio especificar el ID de la empresa', HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Comprueba que el tipo de petición pertenece al enum de base de datos.
   * @param aiRequestType - Tipo recibido
   */
  private validateType(aiRequestType: AiRequestType): void {
    const isValidType = Object.values(AiRequestType).includes(aiRequestType);
    if (!isValidType) {
      this.logger.error(`Tipo de petición de IA no válido: ${aiRequestType}`);
      throw new HttpException('El tipo de petición de IA no es válido', HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Comprueba que los tokens no sean negativos y que el total sea coherente.
   * @param createAiRequestDto - Datos de tokens a validar
   */
  private validateTokenUsage(createAiRequestDto: CreateAiRequestDto): void {
    const { promptTokens, completionTokens, totalTokens } = createAiRequestDto;
    if (promptTokens < 0 || completionTokens < 0 || totalTokens < 0) {
      this.logger.error(
        `Tokens negativos en petición de IA: prompt=${promptTokens}, completion=${completionTokens}, total=${totalTokens}`,
      );
      throw new HttpException('Los tokens de la petición de IA no pueden ser negativos', HttpStatus.BAD_REQUEST);
    }

    const expectedTotalTokens = promptTokens + completionTokens;
    if (totalTokens < expectedTotalTokens) {
      this.logger.error(
        `Total de tokens incoherente: total=${totalTokens}, prompt+completion=${expectedTotalTokens}`,
      );
      throw new HttpException(
        'El total de tokens no puede ser menor que la suma de prompt y completion',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
