import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEmail, IsOptional, IsBoolean, IsInt, IsDate, IsUUID, IsEnum } from 'class-validator';
import { UserRoleTypes } from '../user.entity';

export class CreateUserEnterpriseDto {
  @ApiProperty({ description: 'ID de la empresa' })
  @IsUUID()
  @IsNotEmpty()
  enterpriseId: string;

  @ApiProperty({ description: 'ID del usuario' })
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ description: 'Rol del usuario en la empresa' })
  @IsEnum(UserRoleTypes)
  @IsNotEmpty()
  role: string;
}