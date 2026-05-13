import { Controller, Get, HttpException, HttpStatus, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MapResponse } from 'src/common/decorators/map-response.decorator';
import { UserEnterpriseResponseDto } from 'src/entities/user/dto/user-enterprise-response.dto';
import { UserEnterprise } from 'src/entities/user/user-enterprise.entity';
import { UserEnterpriseService } from './user-enterprise.service';

/**
 * Endpoints REST para vínculos usuario–empresa (`user_enterprise`).
 */
@ApiTags('UsuarioEmpresa')
@Controller('user-enterprises')
export class UserEnterpriseController {
  constructor(private readonly userEnterpriseService: UserEnterpriseService) {}

  /**
   * Obtiene el vínculo `user_enterprise` asociado a un `card_id` dentro de una empresa.
   * Pensado para la pantalla kiosco: devuelve directamente `userEnterpriseId` (id del vínculo).
   */
  @Get('card/:cardId')
  @MapResponse(UserEnterpriseResponseDto)
  @ApiOperation({ summary: 'Obtener vínculo user_enterprise por card_id (empresa)' })
  @ApiQuery({
    name: 'enterpriseId',
    required: true,
    description: 'ID de la empresa donde se valida el card_id.',
  })
  @ApiResponse({ status: 200, description: 'Vínculo obtenido correctamente.' })
  @ApiResponse({ status: 400, description: 'Falta enterpriseId o cardId inválido.' })
  @ApiResponse({ status: 404, description: 'No existe vínculo con ese card_id.' })
  @ApiOkResponse({
    type: UserEnterpriseResponseDto,
    description: 'Vínculo usuario–empresa (vista API, sin datos internos de empresa).',
  })
  async findByCardId(
    @Param('cardId') cardId: string,
    @Query('enterpriseId') enterpriseId: string,
  ): Promise<UserEnterprise> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    const parsedCardId = Number.parseInt(String(cardId), 10);
    if (!Number.isFinite(parsedCardId) || parsedCardId <= 0) {
      throw new HttpException('cardId inválido', HttpStatus.BAD_REQUEST);
    }
    return this.userEnterpriseService.findByEnterpriseCardId(
      enterpriseId,
      parsedCardId,
    );
  }
}

