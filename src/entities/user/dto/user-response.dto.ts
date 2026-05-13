import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { DefaultScheduleResponseDto } from 'src/entities/default-schedule/dto/default-schedule-response.dto';
import { EnterpriseResponseDto } from 'src/entities/enterprise/dto/enterprise-response.dto';
import { UserRoleTypes, UserStatusTypes } from 'src/entities/user/user.entity';

/**
 * Vista pública de usuario para respuestas HTTP.
 * Las empresas anidadas se exponen solo vía `UserEnterpriseResponseDto` → `EnterpriseResponseDto`.
 *
 * Nota: esta clase debe declararse antes que `UserEnterpriseResponseDto` en el mismo módulo.
 * Con `emitDecoratorMetadata`, las propiedades de `UserEnterpriseResponseDto` que tipan `UserResponseDto`
 * generan metadatos en tiempo de carga que referencian esta clase; si `UserEnterpriseResponseDto`
 * apareciera primero, se produciría un error de zona temporal muerta (TDZ) en tiempo de arranque.
 */
export class UserResponseDto {
  /**
   * Identificador único del usuario
   */
  @ApiProperty({ description: 'UUID del usuario' })
  @Expose()
  id: string;

  /**
   * Nombre completo
   */
  @ApiProperty({ description: 'Nombre completo del usuario' })
  @Expose()
  name: string;

  /**
   * Correo electrónico
   */
  @ApiProperty({ description: 'Correo electrónico del usuario' })
  @Expose()
  email: string;

  /**
   * Rol global en la aplicación
   */
  @ApiProperty({ description: 'Rol global del usuario', enum: UserRoleTypes })
  @Expose()
  role: UserRoleTypes;

  /**
   * Teléfono de contacto
   */
  @ApiProperty({
    description: 'Teléfono del usuario',
    required: false,
    nullable: true,
  })
  @Expose()
  phone: string | null;

  /**
   * Estado del usuario
   */
  @ApiProperty({ description: 'Estado del usuario', enum: UserStatusTypes })
  @Expose()
  status: UserStatusTypes;

  /**
   * Fecha de creación del registro
   */
  @ApiProperty({ description: 'Fecha de creación del usuario' })
  @Expose()
  createdAt: Date;

  /**
   * Fecha de última actualización
   */
  @ApiProperty({ description: 'Fecha de última actualización del usuario' })
  @Expose()
  updatedAt: Date;

  /**
   * Vínculos del usuario con empresas
   */
  @ApiProperty({
    description: 'Relaciones usuario–empresa visibles',
    type: () => [UserEnterpriseResponseDto],
    required: false,
  })
  @Expose()
  @Type(() => UserEnterpriseResponseDto)
  userEnterprises?: UserEnterpriseResponseDto[];
}

/**
 * Vista pública del vínculo usuario–empresa (`user_enterprise`).
 * La empresa anidada se expone como `EnterpriseResponseDto` (sin `stripeId`).
 */
export class UserEnterpriseResponseDto {
  /**
   * Identificador del vínculo
   */
  @ApiProperty({ description: 'UUID del vínculo usuario–empresa' })
  @Expose()
  id: string;

  /**
   * Usuario asociado
   */
  @ApiProperty({ description: 'UUID del usuario' })
  @Expose()
  userId: string;

  /**
   * Empresa asociada
   */
  @ApiProperty({ description: 'UUID de la empresa' })
  @Expose()
  enterpriseId: string;

  /**
   * Rol del usuario en la empresa
   */
  @ApiProperty({ description: 'Rol del usuario dentro de la empresa' })
  @Expose()
  role: string;

  /**
   * Identificador de tarjeta o credencial en el ámbito de la empresa
   */
  @ApiProperty({ description: 'Identificador numérico de tarjeta (por empresa)' })
  @Expose()
  cardId: number;

  /**
   * Plantilla de horario por defecto en la empresa (FK opcional)
   */
  @ApiProperty({
    description: 'UUID de plantilla de horario por defecto',
    required: false,
    nullable: true,
  })
  @Expose()
  defaultScheduleId: string | null;

  /**
   * Plantilla de horario por defecto expandida cuando el cliente solicita la relación `userEnterprises.defaultSchedule`.
   * Debe exponerse explícitamente: el interceptor global serializa solo propiedades con `@Expose()`.
   */
  @ApiProperty({
    description: 'Plantilla de horario por defecto asociada al vínculo (si se cargó la relación)',
    type: () => DefaultScheduleResponseDto,
    required: false,
    nullable: true,
  })
  @Expose()
  @Type(() => DefaultScheduleResponseDto)
  defaultSchedule?: DefaultScheduleResponseDto | null;

  /**
   * Fecha de creación del vínculo
   */
  @ApiProperty({ description: 'Fecha de creación del vínculo' })
  @Expose()
  createdAt: Date;

  /**
   * Fecha de última actualización del vínculo
   */
  @ApiProperty({ description: 'Fecha de última actualización del vínculo' })
  @Expose()
  updatedAt: Date;

  /**
   * Usuario cargado (por ejemplo en kiosco)
   */
  @ApiProperty({
    description: 'Usuario asociado al vínculo',
    type: () => UserResponseDto,
    required: false,
  })
  @Expose()
  @Type(() => UserResponseDto)
  user?: UserResponseDto;

  /**
   * Empresa cargada (vista pública)
   */
  @ApiProperty({
    description: 'Empresa asociada al vínculo',
    type: () => EnterpriseResponseDto,
    required: false,
  })
  @Expose()
  @Type(() => EnterpriseResponseDto)
  enterprise?: EnterpriseResponseDto;
}
