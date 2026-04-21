import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DefaultSchedule } from './default-schedule.entity';
import { DefaultScheduleRepository } from './default-schedule-repository.service';

@Module({
  imports: [TypeOrmModule.forFeature([DefaultSchedule])],
  providers: [DefaultScheduleRepository],
  exports: [DefaultScheduleRepository],
})
export class DefaultScheduleModule {}
