import { Module } from '@nestjs/common';
import { EnterpriseRepository } from './enterprise-repository.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Enterprise } from './enterprise.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Enterprise])],
  providers: [EnterpriseRepository],
  exports: [EnterpriseRepository]
})
export class EnterpriseModule {}
