import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Holiday } from './holiday.entity';
import { HolidayRepository } from './holiday-repository.service';

@Module({
  imports: [TypeOrmModule.forFeature([Holiday])],
  providers: [HolidayRepository],
  exports: [HolidayRepository],
})
export class HolidayModule {}
