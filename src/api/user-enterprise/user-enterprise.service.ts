import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { UserEnterprise } from 'src/entities/user/user-enterprise.entity';
import { UserRepository } from 'src/entities/user/user-repository.service';

/**
 * Servicio para operar sobre vínculos usuario–empresa (`user_enterprise`) desde la API.
 * Se usa principalmente para flujos multi-empresa que necesitan `userEnterpriseId`.
 */
@Injectable()
export class UserEnterpriseService {
  private readonly logger = new Logger(UserEnterpriseService.name);

  constructor(private readonly userRepository: UserRepository) {}

  /**
   * Resuelve el vínculo usuario–empresa asociado a un `card_id` dentro de una empresa.
   *
   * @param enterpriseId Empresa donde se valida el `card_id`
   * @param cardId Identificador numérico asignado en `user_enterprise.card_id`
   * @returns Vínculo encontrado
   */
  async findByEnterpriseCardId(
    enterpriseId: string,
    cardId: number,
  ): Promise<UserEnterprise> {
    this.logger.log(
      `Buscando user_enterprise por card_id=${cardId} en empresa ${enterpriseId}`,
    );

    const link = await this.userRepository.findUserEnterpriseByEnterpriseAndCardId(
      enterpriseId,
      cardId,
      ['user', 'enterprise'],
    );

    if (!link) {
      this.logger.warn(
        `No se encontró vínculo user_enterprise para card_id=${cardId} en empresa ${enterpriseId}`,
      );
      throw new HttpException('Usuario no encontrado', HttpStatus.NOT_FOUND);
    }

    return link;
  }
}

