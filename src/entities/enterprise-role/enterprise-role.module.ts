import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnterpriseRole } from './enterprise-role.entity';
import { EnterpriseRoleRepository } from './enterprise-role-repository.service';

/**
 * Módulo de persistencia de roles de empresa.
 */
@Module({
  imports: [TypeOrmModule.forFeature([EnterpriseRole])],
  providers: [EnterpriseRoleRepository],
  exports: [EnterpriseRoleRepository],
})
export class EnterpriseRoleModule {}
