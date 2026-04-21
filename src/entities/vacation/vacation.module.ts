import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vacation } from './vacation.entity';
import { VacationRepository } from './vacation-repository.service';

@Module({
  imports: [TypeOrmModule.forFeature([Vacation])],
  providers: [VacationRepository],
  exports: [VacationRepository],
})
export class VacationModule {}
