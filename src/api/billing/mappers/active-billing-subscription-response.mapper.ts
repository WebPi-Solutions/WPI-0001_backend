import {
  ActiveBillingSubscriptionResponseDto,
  BillingScheduledLicensedQuotaReductionDto,
} from '../dto/active-billing-subscription-response.dto';
import { BillingSubscriptionPresentation } from '../types/billing-subscription-presentation';

/**
 * Transforma las vistas de presentación producidas por `BillingService` al DTO expuesto por el controlador.
 * Mantiene la forma de respuesta HTTP acotada a los campos acordados con el frontend.
 */
export class ActiveBillingSubscriptionResponseMapper {
  /**
   * Convierte una lista de presentaciones en DTOs listos para serializar y aplicar `@MapResponse`.
   *
   * @param presentations - Filas ya resueltas en capa de negocio
   * @returns Misma información en instancias de `ActiveBillingSubscriptionResponseDto`
   */
  static toResponseDtos(
    presentations: BillingSubscriptionPresentation[],
  ): ActiveBillingSubscriptionResponseDto[] {
    return presentations.map((presentation) =>
      ActiveBillingSubscriptionResponseMapper.toResponseDto(presentation),
    );
  }

  /**
   * Convierte una presentación individual en DTO.
   *
   * @param presentation - Fuente de negocio
   * @returns DTO con propiedades expuestas para Swagger y el interceptor de respuesta
   */
  static toResponseDto(
    presentation: BillingSubscriptionPresentation,
  ): ActiveBillingSubscriptionResponseDto {
    const dto = new ActiveBillingSubscriptionResponseDto();
    dto.subscriptionId = presentation.subscriptionId;
    dto.status = presentation.status;
    dto.product = presentation.product;
    dto.billingInterval = presentation.billingInterval;
    dto.usage = presentation.usage;
    dto.currentPeriod = presentation.currentPeriod;
    dto.renewsAt = presentation.renewsAtIso;
    dto.cancelAtPeriodEnd = presentation.cancelAtPeriodEnd;
    if (presentation.scheduledLicensedQuotaReduction) {
      const scheduledDto = new BillingScheduledLicensedQuotaReductionDto();
      scheduledDto.nextMaxUsers =
        presentation.scheduledLicensedQuotaReduction.nextMaxUsers;
      scheduledDto.effectiveAtIso =
        presentation.scheduledLicensedQuotaReduction.effectiveAtIso;
      dto.scheduledLicensedQuotaReduction = scheduledDto;
    } else {
      dto.scheduledLicensedQuotaReduction = null;
    }
    return dto;
  }
}
