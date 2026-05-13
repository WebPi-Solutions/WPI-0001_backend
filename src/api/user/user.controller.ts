import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MapResponse } from 'src/common/decorators/map-response.decorator';
import { UserResponseDto } from 'src/entities/user/dto/user-response.dto';
import { User } from 'src/entities/user/user.entity';
import { UserService } from './user.service';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { CreateUserDto } from 'src/entities/user/dto/create-user.dto';

@ApiTags('Usuarios')
@Controller('users')
export class UserController {

  constructor(private readonly userService: UserService){}

  /**
   * Crea un nuevo usuario
   * @param user - El usuario a crear
   * @returns El usuario creado
   */
  @Post()
  @MapResponse(UserResponseDto)
  @ApiOperation({ summary: 'Create un nuevo usuario' })
  @ApiOkResponse({ type: UserResponseDto, description: 'Usuario creado o vinculado (vista API).' })
  @ApiResponse({ status: 201, description: 'El usuario ha sido creado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async create(@Body() user: CreateUserDto) {
    return this.userService.create(user);
  }

  /**
   * Obtiene todos los usuarios
   * @returns Los usuarios
   */
  @Get()
  @MapResponse(UserResponseDto)
  @ApiOperation({ summary: 'Obtener todos los usuarios' })
  @ApiOkResponse({ description: 'Listado paginado (cada ítem como UserResponseDto).' })
  @ApiResponse({ status: 200, description: 'Los usuarios han sido obtenidos correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findAll(
    @Query('enterpriseId') enterpriseId: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 10,
    @Query('sort') sort: string = 'name',
    @Query('order') order: 'ASC' | 'DESC' = 'ASC',
    @Query('filter') filter?: string,
    @Query('relations') relations?: string,
  ): Promise<PaginatedResponse<User>> {
    if(!enterpriseId) throw new HttpException('Es obligatorio especificar el ID de la empresa', HttpStatus.BAD_REQUEST);

    const pageNumber = Number(page);
    const pageSizeNumber = Number(pageSize);

    // Parsear las relaciones si existen
    const relationsArray = relations ? relations.split(',') : [];

    let filterObj = {
      'userEnterprises.enterpriseId': enterpriseId
    };

    // Parsear el filtro si existe
    if (filter) {
      try {
        filterObj = {
          ...JSON.parse(filter),
          ...filterObj
        };
      } catch (error) {
        console.error('Error parsing filter JSON:', error);
      }
    }

    console.log(filterObj);

    return this.userService.findAll(pageNumber, pageSizeNumber, sort, order, filterObj, relationsArray)
  }

  /**
   * Obtiene el usuario actual
   * @returns El usuario actual
   */
  @Get('myself')
  @MapResponse(UserResponseDto)
  @ApiOperation({ summary: 'Obtener el usuario actual' })
  @ApiOkResponse({ type: UserResponseDto, description: 'Usuario autenticado (vista API).' })
  @ApiResponse({ status: 200, description: 'El usuario ha sido obtenido correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findMyself(@Req() req: Request) {
    return this.userService.findByEmail(req.user.email, ['userEnterprises', 'userEnterprises.enterprise']);
  }

  /**
   * Obtiene un usuario por el identificador de tarjeta (`card_id`) asignado en el vínculo `user_enterprise`
   * dentro de la empresa indicada.
   *
   * @param enterpriseId - Empresa activa (obligatoria)
   * @param cardId - Identificador numérico de tarjeta
   * @returns Usuario encontrado (si existe vínculo)
   */
  @Get('card/:cardId')
  @MapResponse(UserResponseDto)
  @ApiOperation({ summary: 'Obtener un usuario por card_id (empresa)' })
  @ApiQuery({
    name: 'enterpriseId',
    required: true,
    description: 'ID de la empresa donde se valida el card_id.',
  })
  @ApiResponse({ status: 200, description: 'Usuario obtenido correctamente.' })
  @ApiResponse({ status: 400, description: 'Falta enterpriseId o cardId inválido.' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  @ApiOkResponse({ type: UserResponseDto, description: 'Usuario resuelto por tarjeta (vista API).' })
  async findByCardId(
    @Param('cardId') cardId: string,
    @Query('enterpriseId') enterpriseId: string,
    @Query('relations') relations?: string,
  ): Promise<User> {
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
    const relationsArray = relations ? relations.split(',') : [];
    return this.userService.findByEnterpriseCardId(
      enterpriseId,
      parsedCardId,
      relationsArray,
    );
  }

  /**
   * Obtiene un usuario por su email
   * @param email - El email del usuario
   * @returns El usuario
   */
  @Get('email/:email')
  @MapResponse(UserResponseDto)
  @ApiOperation({ summary: 'Obtener un usuario por su email' })
  @ApiOkResponse({ type: UserResponseDto, description: 'Usuario encontrado (vista API).' })
  @ApiResponse({ status: 200, description: 'El usuario ha sido obtenido correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findByEmail(@Param('email') email: string, @Query('relations') relations?: string) {
    const relationsArray = relations ? relations.split(',') : [];
    return this.userService.findByEmail(email, relationsArray);
  }

  /**
   * Obtiene un usuario por su id
   * @param id - El id del usuario
   * @returns El usuario
   */
  @Get(':id')
  @MapResponse(UserResponseDto)
  @ApiOperation({ summary: 'Obtener un usuario por su id' })
  @ApiOkResponse({ type: UserResponseDto, description: 'Usuario encontrado (vista API).' })
  @ApiResponse({ status: 200, description: 'El usuario ha sido obtenido correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findById(@Param('id') id: string, @Query('relations') relations?: string) {
    const relationsArray = relations ? relations.split(',') : [];
    return this.userService.findById(id, relationsArray);
  }

  /**
   * Actualiza un usuario por su id
   * @param id - El id del usuario
   * @param user - El usuario a actualizar
   * @returns El usuario actualizado
   */
  @Patch(':id')
  @MapResponse(UserResponseDto)
  @ApiOperation({ summary: 'Actualizar un usuario por su id' })
  @ApiQuery({
    name: 'enterpriseId',
    required: false,
    description:
      'Empresa activa. Obligatorio si el cuerpo incluye defaultScheduleId (validación de la plantilla de horario).',
  })
  @ApiResponse({ status: 200, description: 'El usuario ha sido actualizado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  @ApiOkResponse({ type: UserResponseDto, description: 'Usuario actualizado (vista API).' })
  async updateById(
    @Param('id') id: string,
    @Body() user: User,
    @Query('enterpriseId') enterpriseId?: string,
  ) {
    return this.userService.updateById(id, user, enterpriseId);
  }

  /**
   * Desvincula un usuario de una empresa.
   * Si el usuario solo tiene esa empresa, se elimina por completo (BD y Firebase).
   * Si tiene más empresas, solo se elimina la relación con la empresa indicada.
   */
  @Delete(':id/enterprise/:enterpriseId')
  @ApiOperation({ summary: 'Desvincular usuario de una empresa' })
  @ApiResponse({ status: 200, description: 'Usuario desvinculado o eliminado correctamente.' })
  @ApiResponse({ status: 400, description: 'El usuario no está vinculado a esta empresa.' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async unlinkUserFromEnterprise(
    @Param('id') id: string,
    @Param('enterpriseId') enterpriseId: string
  ) {
    return this.userService.unlinkUserFromEnterprise(id, enterpriseId);
  }
}
