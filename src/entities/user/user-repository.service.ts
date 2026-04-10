import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { User } from './user.entity';
import { DeleteResult, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryBuilderService, QueryFilterOptions, QueryRelation } from 'src/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { UserEnterprise } from './user-enterprise.entity';
import { CreateUserEnterpriseDto } from './dto/create-user-enterprise.dto';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UserRepository {
  private readonly logger = new Logger(UserRepository.name);

  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
    @InjectRepository(UserEnterprise) private userEnterpriseRepository: Repository<UserEnterprise>
  ) {}

  /**
   * Crea un nuevo usuario
   * @param user - El usuario a crear (puede ser parcial, sin id, createdAt, updatedAt ni relaciones)
   * @returns El usuario creado
   */
  create(user: Partial<User>): Promise<User> {
    return this.userRepository.save(user);
  }

  /**
   * Cuenta los usuarios con filtros y relaciones usando QueryBuilderService
   * @param filter - Filtros a aplicar
   * @param relations - Las relaciones a incluir para aplicar filtros con relaciones
   * @returns El número de usuarios que coinciden con los filtros
   */
  async count(
    filter: Record<string, any> = {},
    relations?: string[]
  ): Promise<number> {
    // Convertir las relaciones de string[] a QueryRelation[] si se proporcionan
    const queryRelations: QueryRelation[] | undefined = relations 
      ? relations.map(relation => ({
          property: relation,
          alias: relation,
          isLeftJoinAndSelect: false // Solo necesitamos el join para filtrar, no seleccionar
        }))
      : undefined;

    // Usar QueryBuilderService para hacer el count con filtros y relaciones
    return QueryBuilderService.getCount(
      this.userRepository,
      'user',
      filter,
      queryRelations
    );
  }

  /**
   * Obtiene todos los usuarios con paginación, filtros y ordenación
   * @param page - Número de página
   * @param pageSize - Tamaño de página
   * @param sort - Campo por el que ordenar
   * @param order - Dirección de ordenación
   * @param filter - Filtros a aplicar
   * @param relations - Las relaciones a incluir
   * @returns Respuesta paginada con los usuarios
   */
  findAll(
    page: number = 1,
    pageSize: number = 10,
    sort: string = 'name',
    order: 'ASC' | 'DESC' = 'ASC',
    filter: Record<string, any> = {},
    relations?: string[]
  ): Promise<PaginatedResponse<User>> {
    // Configurar opciones para el QueryBuilderService
    const options: QueryFilterOptions = {
      page,
      pageSize,
      sort,
      order,
      filter,
      relations: (relations || []).map(relation => ({
        property: relation,
        alias: relation,
        isLeftJoinAndSelect: true
      }))
    };

    // Usar el servicio genérico para construir la consulta
    return QueryBuilderService.getPaginatedResults(
      this.userRepository,
      'user',
      options
    );
  }

  /**
   * Obtiene un usuario por su ID
   * @param id - El ID del usuario a buscar
   * @param relations - Las relaciones a incluir
   * @returns El usuario si se encuentra, de lo contrario null
   */
  findById(id: string, relations?: string[]): Promise<User> {
    this.logger.log(`Buscando usuario por ID: ${id}${relations ? `, incluyendo relaciones: [${relations.join(', ')}]` : ''}`);

    return this.userRepository.findOne({ where: { id }, relations });
  }

  /**
   * Obtiene un usuario por su email
   * @param email - El email del usuario a buscar
   * @returns El usuario si se encuentra, de lo contrario null
   */
  async findByEmail(email: string, relations?: string[]): Promise<User | null> {
    this.logger.log(`Buscando usuario por email: ${email}${relations ? `, incluyendo relaciones: [${relations.join(', ')}]` : ''}`);
    
    const user = await this.userRepository.findOne({ where: { email }, relations });
    
    if (user) {
      this.logger.log(`Usuario encontrado: ${user.email} (ID: ${user.id})`);
    } else {
      this.logger.log(`No se encontró ningún usuario con email: ${email}`);
    }
    
    return user;
  }

  /**
   * Actualiza un usuario existente por su ID
   * @param id - El ID del usuario a actualizar
   * @param user - El usuario con datos actualizados (puede ser parcial)
   * @returns El usuario actualizado
   */
  async updateById(id: string, user: Partial<User>): Promise<User> {
    // Obtiene el usuario a actualizar
    const userToUpdate = await this.userRepository.findOne({ where: { id } });

    // Si el usuario no existe, se lanza un error
    if (!userToUpdate) {
      throw new HttpException('Usuario no encontrado', HttpStatus.NOT_FOUND);
    }

    // Actualiza el usuario
    await this.userRepository.save({ ...userToUpdate, ...user });

    // Devuelve el usuario actualizado
    return this.findById(id);
  }

  /**
   * Cuenta cuántas empresas tiene vinculadas un usuario.
   * @param userId - ID del usuario
   * @returns Número de vinculaciones user_enterprise
   */
  async countUserEnterprisesByUserId(userId: string): Promise<number> {
    return this.userEnterpriseRepository.count({ where: { userId } });
  }

  /**
   * Elimina la vinculación de un usuario con una empresa.
   * @param userId - ID del usuario
   * @param enterpriseId - ID de la empresa
   * @returns Resultado de la eliminación
   */
  async removeUserFromEnterprise(userId: string, enterpriseId: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando vinculación usuario ${userId} - empresa ${enterpriseId}`);
    return this.userEnterpriseRepository.delete({ userId, enterpriseId });
  }

  /**
   * Elimina un usuario por su ID (incluye user_enterprise por restricción FK).
   * @param id - El ID del usuario a eliminar
   * @returns El resultado de la operación de eliminación
   */
  async deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando usuario por ID: ${id}`);
    await this.userEnterpriseRepository.delete({ userId: id });
    return this.userRepository.delete(id);
  }

  /**
   * Comprueba si un usuario ya tiene acceso a una empresa.
   * @param userId - ID del usuario
   * @param enterpriseId - ID de la empresa
   * @returns La vinculación si existe, null en caso contrario
   */
  async findUserEnterpriseByUserAndEnterprise(
    userId: string,
    enterpriseId: string
  ): Promise<UserEnterprise | null> {
    this.logger.log(`Comprobando si el usuario ${userId} ya tiene acceso a la empresa ${enterpriseId}`);
    const link = await this.userEnterpriseRepository.findOne({
      where: { userId, enterpriseId }
    });
    if (link) {
      this.logger.log(`El usuario ${userId} ya tiene acceso a la empresa ${enterpriseId}`);
    } else {
      this.logger.log(`El usuario ${userId} no tiene acceso a la empresa ${enterpriseId}`);
    }
    return link ?? null;
  }

  /**
   * Añade un usuario a una empresa
   * @param userEnterprise - El usuario a añadir
   * @returns El usuario añadido
   */
  async addUserToEnterprise(userEnterprise: CreateUserEnterpriseDto): Promise<UserEnterprise> {
    this.logger.log(`Vinculando usuario ${userEnterprise.userId} con empresa ${userEnterprise.enterpriseId} (Rol: ${userEnterprise.role})`);
    
    try {
      const result = await this.userEnterpriseRepository.save(userEnterprise);
      this.logger.log(`Usuario ${userEnterprise.userId} vinculado exitosamente a la empresa ${userEnterprise.enterpriseId}`);
      return result;
    } catch (error) {
      this.logger.error(`Error al vincular usuario ${userEnterprise.userId} con empresa ${userEnterprise.enterpriseId}: ${error.message || JSON.stringify(error)}`);
      throw error;
    }
  }
}