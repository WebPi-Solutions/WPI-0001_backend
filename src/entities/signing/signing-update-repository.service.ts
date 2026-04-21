import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { SigningAction } from './signing.entity';
import { SigningUpdate } from './signing-update.entity';

/**
 * Acceso a `signings_updates` (histórico de cambios sobre fichajes).
 */
@Injectable()
export class SigningUpdateRepository {
  private readonly logger = new Logger(SigningUpdateRepository.name);

  constructor(
    @InjectRepository(SigningUpdate)
    private readonly signingUpdateRepository: Repository<SigningUpdate>,
  ) {}

  /**
   * Inserta un registro de auditoría.
   *
   * @param manager - Transacción opcional (mismo `EntityManager` que el `update` del fichaje)
   * @param payload - Vínculo empresa y fichaje, pares antes/después
   * @returns Fila guardada
   */
  async createRecord(
    manager: EntityManager | null,
    payload: {
      userEnterpriseId: string;
      signingsId: string;
      previousMoment: Date;
      updatedMoment: Date;
      previousAction: SigningAction;
      updatedAction: SigningAction;
    },
  ): Promise<SigningUpdate> {
    const repo = manager
      ? manager.getRepository(SigningUpdate)
      : this.signingUpdateRepository;
    const row = repo.create({
      userEnterpriseId: payload.userEnterpriseId,
      signingsId: payload.signingsId,
      previousMoment: payload.previousMoment,
      updatedMoment: payload.updatedMoment,
      previousAction: payload.previousAction,
      updatedAction: payload.updatedAction,
    });
    const saved = await repo.save(row);
    this.logger.log(
      `signings_updates: registro creado signingsId=${payload.signingsId}`,
    );
    return saved;
  }

  /**
   * Listado de actualizaciones de un fichaje, de la más antigua a la más reciente.
   * Carga `user_enterprise` y `user` para exponer el nombre asociado al vínculo de cada fila.
   *
   * @param signingsId - `signings.id`
   * @returns Filas de histórico con relaciones resueltas
   */
  findBySigningsIdChronological(signingsId: string): Promise<SigningUpdate[]> {
    return this.signingUpdateRepository.find({
      where: { signingsId },
      relations: ['userEnterprise', 'userEnterprise.user'],
      order: { createdAt: 'ASC' },
    });
  }
}
