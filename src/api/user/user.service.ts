import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { CreateUserEnterpriseDto } from 'src/entities/user/dto/create-user-enterprise.dto';
import { CreateUserDto } from 'src/entities/user/dto/create-user.dto';
import { UserEnterprise } from 'src/entities/user/user-enterprise.entity';
import { UserRepository } from 'src/entities/user/user-repository.service';
import { User } from 'src/entities/user/user.entity';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { DeleteResult } from 'typeorm';
import { FirebaseService } from 'src/services/firebase/firebase.service';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly firebaseService: FirebaseService
  ) {}

  /**
   * Crea un nuevo usuario y lo vincula a una empresa, o vincula un usuario existente a la empresa.
   * Si el usuario ya existe (por email), solo se crea la vinculación con la empresa solicitada.
   * @param user - El usuario a crear o datos para vincular empresa
   * @returns El usuario creado o el usuario existente con la nueva vinculación
   */
  async create(user: CreateUserDto): Promise<User> {
    this.logger.log(`Iniciando proceso de creación/vinculación de usuario: ${user.email}`);
    this.logger.log(`Datos recibidos:`, JSON.stringify({ ...user, password: user.password ? '[REDACTED]' : undefined }, null, 2));

    // Verifica si el usuario tiene una única empresa en el momento de la creación/vinculación
    if (!user.userEnterprises?.length || user.userEnterprises.length !== 1) {
      this.logger.error(`Usuario ${user.email} debe estar vinculado a una única empresa. Empresas recibidas: ${user.userEnterprises?.length ?? 0}`);
      throw new HttpException('El usuario debe estar vinculado a una única empresa.', HttpStatus.BAD_REQUEST);
    }
    this.logger.log(`Usuario ${user.email} tiene vinculación válida a una empresa`);

    const enterpriseId = user.userEnterprises[0].enterprise?.id ?? user.userEnterprises[0].enterpriseId;
    if (!enterpriseId) {
      this.logger.error(`No se pudo obtener el ID de la empresa para el usuario ${user.email}`);
      throw new HttpException('Debe especificar la empresa a la que vincular el usuario.', HttpStatus.BAD_REQUEST);
    }

    const role = user.userEnterprises[0].role;

    // Verifica si el usuario ya existe por email
    const existingUser = await this.userRepository.findByEmail(user.email, ['userEnterprises', 'userEnterprises.enterprise']);

    if (existingUser) {
      this.logger.log(`Usuario ${user.email} ya existe en el sistema (ID: ${existingUser.id}). Procediendo a vincular con la empresa`);

      // Comprueba si ya tiene acceso a esta empresa
      const existingLink = await this.userRepository.findUserEnterpriseByUserAndEnterprise(existingUser.id, enterpriseId);
      if (existingLink) {
        this.logger.log(`El usuario ${existingUser.email} ya tiene acceso a la empresa ${enterpriseId}. Operación idempotente.`);
        return existingUser;
      }

      // Vincula el usuario existente a la nueva empresa
      const userEnterprise: CreateUserEnterpriseDto = {
        userId: existingUser.id,
        enterpriseId,
        role,
      };
      this.logger.log(`Vinculando usuario existente ${existingUser.id} a empresa ${enterpriseId}`);

      await this.userRepository.addUserToEnterprise(userEnterprise);
      this.logger.log(`Usuario ${existingUser.email} vinculado exitosamente a la empresa ${enterpriseId}`);

      return this.userRepository.findById(existingUser.id, ['userEnterprises', 'userEnterprises.enterprise']);
    }

    // Usuario nuevo: requiere contraseña para registro en Firebase y base de datos
    if (!user.password?.trim()) {
      this.logger.error(`Contraseña obligatoria para crear un nuevo usuario: ${user.email}`);
      throw new HttpException('La contraseña es obligatoria para crear un nuevo usuario.', HttpStatus.BAD_REQUEST);
    }
    this.logger.log(`Usuario ${user.email} no existe, continuando con la creación`);

    // Verificar que el email no exista ya en Firebase
    const emailExistsInFirebase = await this.firebaseService.verifyUserExistsByEmail(user.email);
    if (emailExistsInFirebase) {
      this.logger.error(`Ya existe un usuario en Firebase con el email: ${user.email}`);
      throw new HttpException(
        `Ya existe un usuario en Firebase con el email: ${user.email}`,
        HttpStatus.CONFLICT
      );
    }

    const flags = { database: false, databaseId: null as string | null };

    try {
      // 1. Crear usuario en base de datos
      const newUser = await this.userRepository.create(user);
      flags.database = true;
      flags.databaseId = newUser.id;
      this.logger.log(`Usuario creado en base de datos con ID: ${newUser.id}`);

      // 2. Vincula el usuario a la empresa
      const userEnterprise: CreateUserEnterpriseDto = {
        userId: newUser.id,
        enterpriseId,
        role,
      };
      this.logger.log(`Vinculando usuario ${newUser.id} a empresa ${enterpriseId}`);
      await this.userRepository.addUserToEnterprise(userEnterprise);
      this.logger.log(`Usuario ${newUser.id} vinculado exitosamente a la empresa`);

      // 3. Crear usuario en Firebase
      const firebaseUser = await this.firebaseService.createUser(user.email, user.password);
      if (firebaseUser) {
        this.logger.log(`Usuario creado en Firebase exitosamente con UID: ${firebaseUser.uid}`);
      }

      this.logger.log(`Proceso de creación completado para usuario ${newUser.email} (ID: ${newUser.id})`);
      return newUser;
    } catch (error) {
      this.logger.error(`Error al crear usuario ${user.email}:`, error);

      // Rollback: eliminar de base de datos si se creó
      if (flags.database && flags.databaseId) {
        try {
          await this.userRepository.deleteById(flags.databaseId);
          this.logger.log(`Usuario eliminado de base de datos tras error (rollback)`);
        } catch (rollbackError) {
          this.logger.error(`Error al hacer rollback en base de datos:`, rollbackError);
        }
      }

      throw error;
    }
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
   * Desvincula un usuario de una empresa.
   * Si el usuario solo tiene esa empresa vinculada, se elimina por completo (BD y Firebase).
   * Si tiene más empresas, solo se elimina la relación con la empresa indicada.
   * @param userId - ID del usuario
   * @param enterpriseId - ID de la empresa de la que se desvincula
   * @returns Resultado de la operación
   */
  async unlinkUserFromEnterprise(userId: string, enterpriseId: string): Promise<DeleteResult> {
    this.logger.log(`Iniciando desvinculación de usuario ${userId} de empresa ${enterpriseId}`);

    const user = await this.userRepository.findById(userId);
    if (!user) {
      this.logger.warn(`No se encontró ningún usuario con ID: ${userId}`);
      throw new HttpException('Usuario no encontrado', HttpStatus.NOT_FOUND);
    }

    const linkExists = await this.userRepository.findUserEnterpriseByUserAndEnterprise(userId, enterpriseId);
    if (!linkExists) {
      this.logger.warn(`El usuario ${userId} no está vinculado a la empresa ${enterpriseId}`);
      throw new HttpException('El usuario no está vinculado a esta empresa', HttpStatus.BAD_REQUEST);
    }

    const enterpriseCount = await this.userRepository.countUserEnterprisesByUserId(userId);
    this.logger.log(`Usuario ${userId} tiene ${enterpriseCount} empresa(s) vinculada(s)`);

    if (enterpriseCount === 1) {
      this.logger.log(`Usuario con una única empresa: eliminación completa (BD y Firebase)`);
      return this.deleteUserCompletely(userId);
    }

    this.logger.log(`Usuario con varias empresas: solo se elimina la vinculación con ${enterpriseId}`);
    return this.userRepository.removeUserFromEnterprise(userId, enterpriseId);
  }

  /**
   * Elimina un usuario por completo (BD y Firebase).
   * Solo se usa internamente cuando el usuario tiene una única empresa vinculada.
   * @param id - El ID del usuario a eliminar
   * @returns El resultado de la eliminación
   */
  private async deleteUserCompletely(id: string): Promise<DeleteResult> {
    const userToDelete = await this.userRepository.findById(id);
    if (!userToDelete) {
      throw new HttpException('Usuario no encontrado', HttpStatus.NOT_FOUND);
    }

    try {
      if (await this.firebaseService.verifyUserExistsByEmail(userToDelete.email)) {
        this.logger.log(`Eliminando usuario ${userToDelete.email} (ID: ${id}) en Firebase...`);
        await this.firebaseService.deleteUser(userToDelete.email);
        this.logger.log(`Usuario eliminado de Firebase exitosamente`);
      } else {
        this.logger.warn(`El usuario ${userToDelete.email} no existe en Firebase. Eliminación omitida`);
      }

      const result = await this.userRepository.deleteById(id);
      this.logger.log(`Usuario ${id} eliminado de BD. Filas afectadas: ${result.affected}`);
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
