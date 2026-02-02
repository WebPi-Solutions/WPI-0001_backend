import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { CreateUserEnterpriseDto } from 'src/entities/user/dto/create-user-enterprise.dto';
import { CreateUserDto } from 'src/entities/user/dto/create-user.dto';
import { UserEnterprise } from 'src/entities/user/user-enterprise.entity';
import { UserRepository } from 'src/entities/user/user-repository.service';
import { User } from 'src/entities/user/user.entity';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { DeleteResult } from 'typeorm';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(private readonly userRepository: UserRepository) {}

  /**
   * Crea un nuevo usuario y lo vincula a una empresa
   * @param user - El usuario a crear
   * @returns El usuario creado
   */
  async create(user: CreateUserDto): Promise<User> {
    this.logger.log(`Iniciando proceso de creación de usuario: ${user.email}`);
    this.logger.log(`Datos del usuario a crear:`, JSON.stringify(user, null, 2));
    
    // Verifica si el usuario ya existe
    this.logger.log(`Verificando si el usuario ${user.email} ya existe en el sistema`);
    const user_exists: User = (await this.userRepository.findByEmail(user.email)) as User;

    // Si el usuario ya existe, se lanza un error
    if(user_exists) {
      this.logger.warn(`Intento de crear usuario duplicado: ${user.email}`);
      throw new HttpException('El usuario ya existe', HttpStatus.CONFLICT);
    }
    this.logger.log(`Usuario ${user.email} no existe, continuando con la creación`);

    // Verifica si el usuario tiene una única empresa en el momento de la creación
    if(user.userEnterprises.length !== 1) {
      this.logger.error(`Usuario ${user.email} debe estar vinculado a una única empresa. Empresas recibidas: ${user.userEnterprises.length}`);
      throw new HttpException('El usuario debe estar vinculado a una única empresa.', HttpStatus.BAD_REQUEST);
    }
    this.logger.log(`Usuario ${user.email} tiene vinculación válida a una empresa`);

    // Crea el usuario
    this.logger.log(`Guardando usuario ${user.email} en la base de datos`);
    const newUser: User = await this.userRepository.create(user);
    this.logger.log(`Usuario creado exitosamente con ID: ${newUser.id}`);

    // Vincula el usuario a la empresa - IMPORTANTE: usar el newUser que ya tiene ID
    if(newUser) {
      const userEnterprise: CreateUserEnterpriseDto = {
        userId: newUser.id,
        enterpriseId: user.userEnterprises[0].enterprise.id,
        role: user.userEnterprises[0].role,
      };
      this.logger.log(`USERENTERPRISE: ${JSON.stringify(userEnterprise, null, 2)}`);
      
      this.logger.log(`Vinculando usuario ${newUser.id} a empresa ${userEnterprise.enterpriseId || 'ID no disponible'}`);
      this.logger.log(`Datos de la vinculación empresa-usuario:`, JSON.stringify(userEnterprise, null, 2));
      
      await this.userRepository.addUserToEnterprise(userEnterprise);
      this.logger.log(`Usuario ${newUser.id} vinculado exitosamente a la empresa`);
    }

    this.logger.log(`Proceso de creación completado exitosamente para usuario ${newUser.email} (ID: ${newUser.id})`);
    this.logger.log(`Datos finales del usuario creado:`, JSON.stringify({
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      status: newUser.status
    }, null, 2));

    // Retorna el usuario creado
    return newUser;
  }

  /**
   * Obtiene todos los usuarios
   * @param page - La página
   * @param pageSize - El tamaño de la página
   * @param sort - El campo por el que se ordenará
   * @param order - La dirección de la ordenación
   * @param filter - El filtro a aplicar
   * @param relations - Las relaciones a incluir
   * @returns Los usuarios
   */
  async findAll(
    page: number,
    pageSize: number,
    sort: string,
    order: 'ASC' | 'DESC',
    filter: Record<string, any>,
    relations?: string[]
  ): Promise<PaginatedResponse<User>> {
    this.logger.log(`Obteniendo usuarios paginados - Página: ${page}, Tamaño: ${pageSize}, Ordenación: ${sort} ${order}`);
    this.logger.log(`Filtros aplicados:`, JSON.stringify(filter, null, 2));
    
    const result = await this.userRepository.findAll(page, pageSize, sort, order, filter, relations);
    this.logger.log(`Usuarios obtenidos: ${result.items.length} de ${result.total}`);
    return result;
  }

  /**
   * Obtiene un usuario por su ID
   * @param id - El ID del usuario
   * @param relations - Las relaciones a incluir
   * @returns El usuario
   */
  findById(id: string, relations?: string[]): Promise<User> {
    this.logger.log(`Buscando usuario por ID: ${id}${relations ? ` con relaciones: [${relations.join(', ')}]` : ''}`);
    return this.userRepository.findById(id, relations);
  }

  /**
   * Obtiene un usuario por su email
   * @param email - El email del usuario
   * @param relations - Las relaciones a incluir
   * @returns El usuario
   */
  findByEmail(email: string, relations?: string[]): Promise<User | null> {
    this.logger.log(`Buscando usuario por email: ${email}${relations ? ` con relaciones: [${relations.join(', ')}]` : ''}`);
    return this.userRepository.findByEmail(email, relations);
  }

  /**
   * Actualiza un usuario por su ID
   * @param id - El ID del usuario
   * @param user - El usuario a actualizar
   * @returns El usuario actualizado
   */
  async updateById(id: string, user: User): Promise<User> {
    this.logger.log(`Iniciando actualización de usuario con ID: ${id}`);
    this.logger.log(`Datos a actualizar:`, JSON.stringify(user, null, 2));
    
    try {
      const updatedUser = await this.userRepository.updateById(id, user);
      this.logger.log(`Usuario ${id} actualizado exitosamente`);
      return updatedUser;
    } catch (error) {
      this.logger.error(`Error al actualizar usuario ${id}:`, error);
      throw error;
    }
  }

  /**
   * Elimina un usuario por su ID
   * @param id - El ID del usuario
   * @returns El resultado de la eliminación
   */
  async deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Iniciando eliminación de usuario con ID: ${id}`);
    
    try {
      const result = await this.userRepository.deleteById(id);
      this.logger.log(`Usuario ${id} eliminado exitosamente. Filas afectadas: ${result.affected}`);
      return result;
    } catch (error) {
      this.logger.error(`Error al eliminar usuario ${id}:`, error);
      throw error;
    }
  }

  /**
   * Añade un usuario a una empresa
   * @param userEnterprise - El usuario a añadir
   * @returns El usuario añadido
   */
  async addUserToEnterprise(userEnterprise: UserEnterprise): Promise<UserEnterprise> {
    this.logger.log(`Añadiendo usuario ${userEnterprise.user?.id || 'ID no disponible'} a empresa ${userEnterprise.enterprise?.id || 'ID no disponible'}`);
    this.logger.log(`Detalles de la vinculación:`, JSON.stringify({
      userId: userEnterprise.user?.id,
      enterpriseId: userEnterprise.enterprise?.id,
      role: userEnterprise.role
    }, null, 2));
    
    try {
      const result = await this.userRepository.addUserToEnterprise(userEnterprise);
      this.logger.log(`Vinculación empresa-usuario creada exitosamente`);
      return result;
    } catch (error) {
      this.logger.error(`Error al vincular usuario a empresa:`, error);
      throw error;
    }
  }
}
