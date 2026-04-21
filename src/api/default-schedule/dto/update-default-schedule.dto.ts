import { PartialType } from '@nestjs/swagger';
import { CreateDefaultScheduleDto } from './create-default-schedule.dto';

/**
 * Cuerpo para actualizar una plantilla: todos los campos son opcionales.
 * Solo se persisten propiedades presentes en el payload (patch parcial en servicio).
 */
export class UpdateDefaultScheduleDto extends PartialType(
  CreateDefaultScheduleDto,
) {}
