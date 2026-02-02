import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { User } from './user.entity';
import { DeleteResult, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryBuilderService, QueryFilterOptions } from 'src/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { UserEnterprise } from './user-enterprise.entity';
import { CreateUserEnterpriseDto } from './dto/create-user-enterprise.dto';
import { FirebaseService } from 'src/services/firebase/firebase.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UserRepository {
  private readonly logger = new Logger(UserRepository.name);

  constructor(@InjectRepository(User) private userRepository: Repository<User>,
              @InjectRepository(UserEnterprise) private userEnterpriseRepository: Repository<UserEnterprise>,
              private firebaseService: FirebaseService){}

  /**
   * Crea un nuevo usuario
   * @param user - El usuario a crear
   * @returns El usuario creado
   */
  async create(user: CreateUserDto): Promise<User> {
    this.logger.log(`Iniciando creación de usuario en repositorio: ${user.email}`);

    try {
      this.logger.log(`Comprobando si el usuario ${user.email} existe en Firebase`);
      const firebase_user = await this.firebaseService.getUserByEmail(user.email)

      // Si el usuario ya existe en firebase, actualiza su contraseña, ya que si ha llegado aquí, es porque el usuario no existe en la base de datos
      if(firebase_user){
        this.logger.log(`Usuario ${user.email} encontrado en Firebase, actualizando contraseña`);
        await this.firebaseService.updateUserPassword(user.email, user.password)
      }
    }
    // Si el usuario no existe en firebase, obtendremos un error, por lo que lo capturamos y creamos el usuario
    catch(error){
      try{
        // Si el usuario no existe en firebase, lo crea
        this.logger.log(`Usuario ${user.email} no encontrado en Firebase, creando nuevo usuario`);
        await this.firebaseService.createUser(user.email, user.password)
        this.logger.log(`Usuario ${user.email} creado exitosamente en Firebase`);
      }
      catch(error){
        this.logger.error(`Error al crear usuario ${user.email} en Firebase: ${error.message || JSON.stringify(error)}`);
        throw new HttpException('Error al dar de alta el usuario en el proveedor de autenticación', HttpStatus.INTERNAL_SERVER_ERROR)
      }
    }

    this.logger.log(`Eliminando contraseña del objeto usuario antes de guardar en base de datos`);
    delete user.password;

    this.logger.log(`Guardando usuario ${user.email} en la base de datos`);
    const savedUser = await this.userRepository.save(user);
    this.logger.log(`Usuario ${user.email} guardado exitosamente en la base de datos con ID: ${savedUser.id}`);
    
    return savedUser;
  }

  /**
   * Obtiene todos los usuarios
   * @param relations - Las relaciones a incluir
   * @returns Los usuarios
   */
  findAll(
    page: number = 1,
    pageSize: number = 10,
    sort: string = 'name',
    order: 'ASC' | 'DESC' = 'ASC',
    filter: Record<string, any> = {},
    relations?: string[]
  ): Promise<PaginatedResponse<User>> {
    this.logger.log(`Obteniendo listado paginado de usuarios - Página ${page}, Tamaño: ${pageSize}, Ordenación: ${sort} ${order}`);
    
    if (Object.keys(filter).length > 0) {
      this.logger.log(`Filtros aplicados: ${JSON.stringify(filter)}`);
    }

    // Configurar opciones para el QueryBuilderService
    const options: QueryFilterOptions = {
      page,
      pageSize,
      sort,
      order,
      filter,
      relations: (relations || []).map(relation => ({
        property: relation,
        alias: relation
      }))
    };

    if (relations && relations.length > 0) {
      this.logger.log(`Incluyendo relaciones: ${relations.join(', ')}`);
    }

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
   * @returns El usuario si se encuentra, de lo contrario null
   */
  async findById(id: string, relations?: string[]): Promise<User> {
    this.logger.log(`Buscando usuario con ID: ${id}${relations ? `, incluyendo relaciones: [${relations.join(', ')}]` : ''}`);
    
    const user = await this.userRepository.findOne({ where: { id }, relations });
    
    if (user) {
      this.logger.log(`Usuario encontrado: ${user.email} (ID: ${user.id})`);
    } else {
      this.logger.log(`No se encontró ningún usuario con ID: ${id}`);
    }
    
    return user;
  }

  /**
   * Finds a user by their email address
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
   * Updates an existing user by their ID
   * @param id - El ID del usuario a actualizar
   * @param userData - Datos parciales del usuario a actualizar
   * @returns El usuario actualizado
   */
  async updateById(id: string, userData: Partial<User>): Promise<User> {
    this.logger.log(`Iniciando actualización de usuario con ID: ${id}`);
    this.logger.log(`Datos de actualización: ${JSON.stringify(userData)}`);
    
    // Obtiene el usuario a actualizar
    this.logger.log(`Comprobando si el usuario con ID ${id} existe`);
    const userToUpdate = await this.userRepository.findOne({ where: { id } });
    
    // Si el usuario no existe, se lanza un error
    if (!userToUpdate) {
      this.logger.warn(`Intento de actualizar usuario inexistente con ID: ${id}`);
      throw new HttpException('Usuario no encontrado', HttpStatus.NOT_FOUND);
    }
    
    // Actualiza el usuario
    this.logger.log(`Actualizando datos del usuario ${userToUpdate.email} (ID: ${id})`);
    await this.userRepository.save({ ...userToUpdate, ...userData });
    this.logger.log(`Usuario ${userToUpdate.email} (ID: ${id}) actualizado correctamente`);

    // Devuelve el usuario actualizado con las relaciones incluidas
    this.logger.log(`Obteniendo datos actualizados del usuario ${id}`);
    return this.findById(id);
  }

  /**
   * Deletes a user
   * @param id - El ID del usuario a eliminar
   * @returns El usuario eliminado
   */
  async deleteById(id: string): Promise<DeleteResult> {
    const user = await this.findById(id)
    if(!user){
      this.logger.warn(`Intento de eliminar usuario inexistente con ID: ${id}`);
      throw new HttpException('El usuario no existe', HttpStatus.NOT_FOUND);
    }

    this.logger.log(`Iniciando eliminación de usuario con ID: ${id} y email: ${user.email}`);
    
    try {
      const result = await this.userRepository.delete(id);
      this.logger.log(`Usuario con ID: ${id} eliminado de la base de datos. Registros afectados: ${result.affected}`);

      try {
        await this.firebaseService.deleteUser(user.email)
        this.logger.log(`Usuario con ID: ${id} y email: ${user.email} eliminado de Firebase`);
      }
      catch(error){
        this.logger.error(`Error al eliminar usuario con ID ${id} y email: ${user.email} de Firebase: ${error.message || JSON.stringify(error)}`);
        throw new HttpException('Error al eliminar usuario de Firebase', HttpStatus.INTERNAL_SERVER_ERROR)
      }

      return result;
    } catch (error) {
      this.logger.error(`Error al eliminar usuario con ID ${id} y email: ${user.email}: ${error.message || JSON.stringify(error)}`);
      throw error;
    }
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