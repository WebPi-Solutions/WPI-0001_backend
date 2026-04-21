import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkSchedule } from './work-schedule.entity';
import { WorkScheduleRepository } from './work-schedule-repository.service';

@Module({
  imports: [TypeOrmModule.forFeature([WorkSchedule])],
  providers: [WorkScheduleRepository],
  exports: [WorkScheduleRepository],
})
export class WorkScheduleModule {}
