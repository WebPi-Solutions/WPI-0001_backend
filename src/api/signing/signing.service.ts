import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EnterpriseAccessService } from 'src/helpers/enterprise-access/enterprise-access.service';
import { SigningRepository } from 'src/entities/signing/signing-repository.service';
import { SigningUpdateRepository } from 'src/entities/signing/signing-update-repository.service';
import { SigningUpdate } from 'src/entities/signing/signing-update.entity';
import { Signing, SigningAction } from 'src/entities/signing/signing.entity';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { EntityManager, UpdateResult } from 'typeorm';
import { CreateSigningDto } from './dto/create-signing.dto';
import { UpdateSigningDto } from './dto/update-signing.dto';

/** Relaciones mínimas para listar/validar fichajes por empresa vía `user_enterprise`. */
const USER_ENTERPRISE_RELATIONS = [
  'userEnterprise',
  'userEnterprise.user',
  'userEnterprise.enterprise',
];

/**
 * Servicio de API para fichajes (`signings`), con aislamiento por empresa vía usuario vinculado.
 */
@Injectable()
export class SigningService {
  private readonly logger = new Logger(SigningService.name);

  /** Duración mínima aceptada (segundos). */
  private static readonly MIN_DURATION_SECONDS = 0;

  /**
   * Tolerancia (ms) para evitar falsos positivos por desfases entre cliente/servidor o latencias muy pequeñas.
   * Por ejemplo, un cliente que envía un `moment` "ahora" puede llegar unos milisegundos por delante del `Date.now()`.
   */
  private static readonly FUTURE_MOMENT_TOLERANCE_MS = 1500;

  constructor(
    private readonly signingRepository: SigningRepository,
    private readonly signingUpdateRepository: SigningUpdateRepository,
    private readonly enterpriseAccessService: EnterpriseAccessService,
  ) {}

  /**
   * Carga el fichaje y valida pertenencia indirecta a la empresa.
   * @param id - UUID del fichaje
   * @param enterpriseId - Empresa
   * @param relations - Relaciones adicionales
   * @returns Signing
   */
  private async loadScopedOrThrow(
    id: string,
    enterpriseId: string,
    relations?: string[],
    options?: { rejectIfCancelled: boolean },
  ): Promise<Signing> {
    const mergedRelations = [
      ...new Set([...USER_ENTERPRISE_RELATIONS, ...(relations ?? [])]),
    ];
    const entity = await this.signingRepository.findById(id, mergedRelations);
    if (!entity) {
      this.logger.warn(`Fichaje ${id} no encontrado`);
      throw new HttpException('Fichaje no encontrado', HttpStatus.NOT_FOUND);
    }
    await this.enterpriseAccessService.assertUserEnterpriseBelongsToEnterprise(
      entity.userEnterpriseId,
      enterpriseId,
      { operationContext: 'signing', notFoundMessage: 'Fichaje no encontrado' },
    );
    if (options?.rejectIfCancelled && entity.cancelled) {
      this.logger.warn(`Fichaje ${id} anulado; no disponible para esta operación`);
      throw new HttpException('Fichaje no encontrado', HttpStatus.NOT_FOUND);
    }
    return entity;
  }

  /**
   * Parsea un momento recibido en DTO a Date y valida que sea un Date válido.
   *
   * @param rawMoment - Momento recibido (ISO string habitual en frontend)
   * @param operationContext - Contexto para logs
   * @returns Date parseado
   */
  private parseMomentOrThrow(rawMoment: string, operationContext: string): Date {
    const parsed = new Date(rawMoment);
    if (!Number.isFinite(parsed.getTime())) {
      this.logger.warn(
        `Momento inválido recibido (${operationContext}): "${rawMoment}"`,
      );
      throw new HttpException(
        'La fecha y hora indicada no es válida.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return parsed;
  }

  /**
   * Valida que un momento no sea posterior a la fecha/hora actual.
   *
   * @param moment - Momento a validar
   * @param operationContext - Contexto para logs
   */
  private assertMomentIsNotInFuture(moment: Date, operationContext: string): void {
    const nowEpochMs = Date.now();
    const momentEpochMs = moment.getTime();
    if (
      Number.isFinite(momentEpochMs) &&
      momentEpochMs > nowEpochMs + SigningService.FUTURE_MOMENT_TOLERANCE_MS
    ) {
      this.logger.warn(
        `Momento futuro rechazado (${operationContext}): moment=${moment.toISOString()}, now=${new Date(
          nowEpochMs,
        ).toISOString()}`,
      );
      throw new HttpException(
        'No se puede crear o editar un fichaje con una fecha y hora posterior a la actual.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Registra un fichaje para un usuario de la empresa.
   * @param enterpriseId - Empresa (query)
   * @param dto - Datos permitidos (sin poder fijar `createdAt` / `updatedAt`)
   * @returns Registro creado
   */
  async create(enterpriseId: string, dto: CreateSigningDto): Promise<Signing> {
    this.logger.log(
      `Creando fichaje para userEnterprise ${dto.userEnterpriseId} (empresa ${enterpriseId})`,
    );

    await this.enterpriseAccessService.assertUserEnterpriseBelongsToEnterprise(
      dto.userEnterpriseId,
      enterpriseId,
      { operationContext: 'signing', notFoundMessage: 'Fichaje no encontrado' },
    );

    const entityData: Partial<Signing> = {
      userEnterpriseId: dto.userEnterpriseId,
      action: dto.action,
      cancelled: false,
    };

    if (dto.moment !== undefined && dto.moment !== null && dto.moment !== '') {
      const parsedMoment = this.parseMomentOrThrow(dto.moment, 'signing.create');
      this.assertMomentIsNotInFuture(parsedMoment, 'signing.create');
      entityData.moment = parsedMoment;
    }

    if (dto.durationInSeconds !== undefined) {
      entityData.durationInSeconds = dto.durationInSeconds;
    }

    try {
      const created = await this.signingRepository.create(entityData);
      this.logger.log(`Fichaje creado con id ${created.id}`);

      // Si se confirma una salida, intentar cerrar el último start pendiente asignando duration_in_seconds.
      if (dto.action === SigningAction.END) {
        await this.tryAssignDurationToLatestOpenStartSigning(
          enterpriseId,
          dto.userEnterpriseId,
          created.moment,
          created.id,
        );
      }

      return created;
    } catch (error) {
      this.logger.error(`Error al crear fichaje:`, error);
      throw error;
    }
  }

  /**
   * Al registrar una salida (`end`), asigna `duration_in_seconds` al último `start` del usuario
   * que aún no tenga duración, para la empresa indicada.
   *
   * No lanza error si no hay `start` pendiente: solo registra un warning.
   *
   * @param enterpriseId Empresa activa (scoping)
   * @param userId Usuario
   * @param endMoment Momento del fichaje de salida ya creado
   * @param endSigningId Id del fichaje de salida (solo para logs)
   */
  private async tryAssignDurationToLatestOpenStartSigning(
    enterpriseId: string,
    userEnterpriseId: string,
    endMoment: Date,
    endSigningId: string,
  ): Promise<void> {
    try {
      // Valida de nuevo scope (defensa en profundidad); si falla, no tocar duraciones.
      await this.enterpriseAccessService.assertUserEnterpriseBelongsToEnterprise(userEnterpriseId, enterpriseId, {
        operationContext: 'signing.duration',
        notFoundMessage: 'Fichaje no encontrado',
      });

      const openStart = await this.signingRepository.findLatestOpenStartSigningForUser(
        userEnterpriseId,
        endMoment,
      );

      if (!openStart) {
        this.logger.warn(
          `No hay fichaje START pendiente para asignar duración (userEnterpriseId=${userEnterpriseId}, enterpriseId=${enterpriseId}, endSigningId=${endSigningId})`,
        );
        return;
      }

      const startMoment = openStart.moment;
      const diffMs = endMoment.getTime() - startMoment.getTime();
      const durationSeconds = Math.max(
        SigningService.MIN_DURATION_SECONDS,
        Math.floor(diffMs / 1000),
      );

      await this.signingRepository.updateById(openStart.id, {
        durationInSeconds: durationSeconds,
      });

      this.logger.log(
        `Duración asignada al START ${openStart.id} tras END ${endSigningId}: ${durationSeconds}s (userEnterpriseId=${userEnterpriseId}, enterpriseId=${enterpriseId})`,
      );
    } catch (error) {
      this.logger.error(
        `Error al asignar duration_in_seconds tras fichaje END (userEnterpriseId=${userEnterpriseId}, enterpriseId=${enterpriseId}, endSigningId=${endSigningId})`,
        error instanceof Error ? error.stack : undefined,
      );
      // No propagamos: el fichaje END ya fue creado correctamente.
    }
  }

  /**
   * Listado paginado filtrado por empresa (y opcionalmente por `userId` en filtros).
   * @param page - Página
   * @param pageSize - Tamaño
   * @param sort - Orden
   * @param order - Dirección
   * @param filter - Filtros con `userEnterprise.enterpriseId` (y opcionalmente `userEnterpriseId`)
   * @param relations - Relaciones (se fusionan con las del filtro)
   * @returns Página
   */
  async findAll(
    page: number,
    pageSize: number,
    sort: string,
    order: 'ASC' | 'DESC',
    filter: Record<string, unknown>,
    relations?: string[],
  ): Promise<PaginatedResponse<Signing>> {
    const mergedRelations = [
      ...new Set([...USER_ENTERPRISE_RELATIONS, ...(relations ?? [])]),
    ];

    this.logger.log(
      `Listando fichajes — página ${page}, orden ${sort} ${order}, filtros: ${JSON.stringify(filter)}`,
    );

    const pageResult = await this.signingRepository.findAll(
      page,
      pageSize,
      sort,
      order,
      filter,
      mergedRelations,
    );
    return pageResult;
  }

  /**
   * Obtiene un fichaje si el usuario está en la empresa.
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @param relations - Relaciones opcionales
   * @returns Signing
   */
  async findById(
    id: string,
    enterpriseId: string,
    relations?: string[],
  ): Promise<Signing> {
    this.logger.log(`Buscando fichaje ${id} para empresa ${enterpriseId}`);
    const entity = await this.loadScopedOrThrow(id, enterpriseId, relations, {
      rejectIfCancelled: true,
    });
    return entity;
  }

  /**
   * Lista el histórico de cambios guardados en `signings_updates` para un fichaje.
   * Valida el mismo ámbito de empresa que el resto de operaciones.
   *
   * @param signingId - Identificador del fichaje
   * @param enterpriseId - Empresa de contexto
   * @returns Entradas de más antigua a más reciente
   */
  async getSigningUpdatesForSigning(
    signingId: string,
    enterpriseId: string,
  ): Promise<SigningUpdate[]> {
    this.logger.log(
      `Histórico de actualizaciones: fichaje ${signingId}, empresa ${enterpriseId}`,
    );
    await this.loadScopedOrThrow(signingId, enterpriseId, undefined, {
      rejectIfCancelled: true,
    });
    return this.signingUpdateRepository.findBySigningsIdChronological(signingId);
  }

  /**
   * Actualiza acción, momento o duración.
   * Si se cambia el momento o el tipo, valida la secuencia (entrada/salida) del mismo
   * `user_enterprise` y recalcula `duration_in_seconds` de todas las entradas afectadas.
   * Cada persistencia con cambios añade una fila al histórico `signings_updates`.
   *
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @param dto - Campos opcionales
   * @param performedByUserId - Actor autenticado (solo trazas en log; no se persiste en `signings_updates`)
   * @returns Entidad actualizada
   */
  async updateById(
    id: string,
    enterpriseId: string,
    dto: UpdateSigningDto,
    performedByUserId: string,
  ): Promise<Signing> {
    this.logger.log(
      `Actualizando fichaje ${id} para empresa ${enterpriseId} (por usuario ${performedByUserId})`,
    );

    const current = await this.loadScopedOrThrow(id, enterpriseId, undefined, {
      rejectIfCancelled: true,
    });

    const newMoment: Date =
      dto.moment !== undefined && dto.moment !== null && dto.moment !== ''
        ? this.parseMomentOrThrow(dto.moment, `signing.update:${id}`)
        : new Date(current.moment);

    const newAction: SigningAction =
      dto.action !== undefined ? dto.action : current.action;

    /**
     * Reglas de negocio: no permitir crear o editar fichajes en el futuro.
     * Se valida tanto si se envía `moment` como si no (defensa en profundidad).
     */
    this.assertMomentIsNotInFuture(newMoment, `signing.update:${id}`);

    const momentChanged =
      dto.moment !== undefined &&
      dto.moment !== null &&
      dto.moment !== '' &&
      new Date(dto.moment).getTime() !== new Date(current.moment).getTime();
    const actionChanged =
      dto.action !== undefined && dto.action !== current.action;

    const willRecomputeSequence = momentChanged || actionChanged;

    if (!willRecomputeSequence) {
      const entityData: Partial<Signing> = {};
      if (dto.durationInSeconds !== undefined) {
        entityData.durationInSeconds = dto.durationInSeconds;
      }

      if (Object.keys(entityData).length === 0) {
        this.logger.log(`Sin campos editables; se devuelve el registro actual`);
        return this.findById(id, enterpriseId, [
          'userEnterprise',
          'userEnterprise.user',
        ]);
      }

      try {
        const updated = await this.signingRepository.updateById(id, entityData);
        await this.signingUpdateRepository.createRecord(null, {
          userEnterpriseId: current.userEnterpriseId,
          signingsId: id,
          previousMoment: new Date(current.moment),
          updatedMoment: newMoment,
          previousAction: current.action,
          updatedAction: newAction,
        });
        return updated;
      } catch (error) {
        this.logger.error(`Error al actualizar fichaje ${id}:`, error);
        throw error;
      }
    }

    // --- Mover/retipar: validar secuencia y recalcular duraciones (misma empresa / mismo vínculo) ---

    const allForLink =
      await this.signingRepository.findByUserEnterpriseIdOrderedByMoment(
        current.userEnterpriseId,
      );
    const withoutCurrent = allForLink.filter((row) => row.id !== id);
    const candidate: Signing = {
      ...current,
      moment: newMoment,
      action: newAction,
    } as Signing;
    const ordered = this.sortSigningsChronologically([...withoutCurrent, candidate]);
    this.assertValidSigningSequence(ordered, id);

    const startDurationUpdates = this.buildDurationUpdatesForStartSignings(ordered);
    this.logger.log(
      `Fichaje ${id} — secuencia validada; se actualizan ${startDurationUpdates.length} duraciones de entradas para userEnterprise ${current.userEnterpriseId}.`,
    );

    const historySnapshot = {
      userEnterpriseId: current.userEnterpriseId,
      signingsId: id,
      previousMoment: new Date(current.moment),
      updatedMoment: newMoment,
      previousAction: current.action,
      updatedAction: newAction,
    };

    try {
      await this.signingRepository.getEntityManager().transaction(
        async (manager: EntityManager) => {
          const repo = manager.getRepository(Signing);
          await repo.update(
            { id },
            { moment: newMoment, action: newAction },
          );
          await this.signingUpdateRepository.createRecord(manager, historySnapshot);
          for (const u of startDurationUpdates) {
            await repo.update(
              { id: u.id },
              { durationInSeconds: u.durationInSeconds },
            );
          }
        },
      );
      return this.findById(id, enterpriseId, [
        'userEnterprise',
        'userEnterprise.user',
      ]);
    } catch (error) {
      this.logger.error(`Error al actualizar fichaje ${id} (secuencia y duraciones):`, error);
      throw error;
    }
  }

  /**
   * Ordena por `moment` asc., luego `start` antes de `end` a igual timestamp, luego `id` estable.
   */
  private sortSigningsChronologically(rows: Signing[]): Signing[] {
    return [...rows].sort((a, b) => {
      const ta = new Date(a.moment).getTime();
      const tb = new Date(b.moment).getTime();
      if (ta !== tb) {
        return ta - tb;
      }
      const order = (m: Signing) =>
        m.action === SigningAction.START ? 0 : 1;
      const ao = order(a) - order(b);
      if (ao !== 0) {
        return ao;
      }
      return a.id.localeCompare(b.id);
    });
  }

  /**
   * Comprueba el patrón: tras una entrada va una salida o nada; tras una salida va una entrada o nada;
   * una salida nunca al inicio del historial.
   *
   * @param ordered - Fichajes ordenados por tiempo
   * @param _editedId - Id en edición (reservado para trazas)
   */
  private assertValidSigningSequence(ordered: Signing[], _editedId: string): void {
    for (let i = 0; i < ordered.length; i += 1) {
      const currentRow = ordered[i];
      const prev = i > 0 ? ordered[i - 1] : null;
      const next = i < ordered.length - 1 ? ordered[i + 1] : null;

      if (currentRow.action === SigningAction.START) {
        if (prev && prev.action !== SigningAction.END) {
          this.logger.warn(
            `Validación de secuencia: entrada rechazada (vecino previo no es salida) — editing=${_editedId}`,
          );
          throw new HttpException(
            'No se puede colocar la entrada en esa fecha y hora: debe ir tras una salida o al inicio, y no puede quedar entre la entrada y la salida de otra jornada.',
            HttpStatus.BAD_REQUEST,
          );
        }
        if (next && next.action !== SigningAction.END) {
          this.logger.warn(
            `Validación de secuencia: entrada rechazada (señal siguiente no es salida) — editing=${_editedId}`,
          );
          throw new HttpException(
            'No se puede colocar la entrada en esa fecha y hora: a continuación debe existir una salida o el bloque de fichajes debe acabar, sin otra entrada intercalada.',
            HttpStatus.BAD_REQUEST,
          );
        }
      } else {
        if (!prev || prev.action !== SigningAction.START) {
          this.logger.warn(
            `Validación de secuencia: salida rechazada (no va tras una entrada) — editing=${_editedId}`,
          );
          throw new HttpException(
            'No se puede colocar la salida en esa fecha y hora: siempre debe existir una entrada previa inmediata en la secuencia temporal.',
            HttpStatus.BAD_REQUEST,
          );
        }
        if (next && next.action !== SigningAction.START) {
          this.logger.warn(
            `Validación de secuencia: salida rechazada (señal siguiente no es otra entrada) — editing=${_editedId}`,
          );
          throw new HttpException(
            'No se puede colocar la salida en esa fecha y hora: no puede quedar entre la entrada y la salida de otra jornada; tras ella solo puede haber otra entrada o el fin de los fichajes.',
            HttpStatus.BAD_REQUEST,
          );
        }
      }
    }
  }

  /**
   * Para cada `start`, la duración es hasta el siguiente `end` inmediato en la secuencia; si no hay,
   * `null` (jornada abierta).
   */
  private buildDurationUpdatesForStartSignings(
    ordered: Signing[],
  ): { id: string; durationInSeconds: number | null }[] {
    const out: { id: string; durationInSeconds: number | null }[] = [];
    for (let i = 0; i < ordered.length; i += 1) {
      if (ordered[i].action !== SigningAction.START) {
        continue;
      }
      const startRow = ordered[i];
      const next = i + 1 < ordered.length ? ordered[i + 1] : null;
      if (!next) {
        out.push({ id: startRow.id, durationInSeconds: null });
        continue;
      }
      if (next.action === SigningAction.END) {
        const diffSec = Math.max(
          SigningService.MIN_DURATION_SECONDS,
          Math.floor(
            (new Date(next.moment).getTime() - new Date(startRow.moment).getTime()) / 1000,
          ),
        );
        out.push({ id: startRow.id, durationInSeconds: diffSec });
      } else {
        out.push({ id: startRow.id, durationInSeconds: null });
      }
    }
    return out;
  }

  /**
   * Anula el fichaje (cancelled = true) si el usuario pertenece a la empresa.
   * Idempotente: si ya estaba cancelado, no re-lanza error.
   *
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @returns Resultado compatible con anulación lógica
   */
  async deleteById(id: string, enterpriseId: string): Promise<UpdateResult> {
    this.logger.log(`Anulando fichaje ${id} para empresa ${enterpriseId}`);

    const current = await this.loadScopedOrThrow(id, enterpriseId);
    if (current.cancelled) {
      this.logger.log(`Fichaje ${id} ya estaba anulado; operación idempotente`);
      return { affected: 0, raw: [], generatedMaps: [] };
    }

    try {
      await this.signingRepository.markCancelledEntity(current);
      this.logger.log(`Fichaje ${id} marcado como cancelado (anulación lógica)`);
      return { affected: 1, raw: [], generatedMaps: [] };
    } catch (error) {
      this.logger.error(`Error al anular fichaje ${id}:`, error);
      throw error;
    }
  }
}
