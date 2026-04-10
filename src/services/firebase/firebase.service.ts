import { Injectable, Logger } from '@nestjs/common';
import { firebaseAdmin } from 'src/middleware/firebase/firebase.service';

@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name);

  /**
   * Genera una contraseña aleatoria
   * @returns La contraseña generada
   */
  generateRandomPassword() {
    const length = 12
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    let password = ""
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length))
    }
    return password
  }

  async createUser(email: string, password: string) {
    try {
      const userRecord = await firebaseAdmin.auth().createUser({
        email,
        password,
      });
      return userRecord;
    } catch (error) {
      throw new Error(`Error creating user: ${error.message}`);
    }
  }

  async getUserByEmail(email: string) {
    try {
      const userRecord = await firebaseAdmin.auth().getUserByEmail(email);
      return userRecord;
    } catch (error) {
      throw new Error(`Error fetching user by email: ${error.message}`);
    }
  }

  /**
   * Verifica si existe un usuario con el email en Firebase
   * @param email - El email del usuario a verificar
   * @returns true si el usuario existe, false en caso contrario
   */
  async verifyUserExistsByEmail(email: string): Promise<boolean> {
    try {
      this.logger.log(`Verificando si existe un usuario con el email: ${email} en Firebase`);
      await firebaseAdmin.auth().getUserByEmail(email);
      this.logger.log(`El usuario ${email} existe en Firebase`);
      return true;
    } catch {
      this.logger.log(`El usuario ${email} no existe en Firebase`);
      return false;
    }
  }

  async updateUserPassword(email: string, new_password: string) {
    try {
      const userRecord = await this.getUserByEmail(email);
      const updatedUserRecord = await firebaseAdmin.auth().updateUser(userRecord.uid, {
        password: new_password,
      });
      console.log(`Contraseña del usuario ${email} actualizada a ${new_password}`);
      return updatedUserRecord;
    } catch (error) {
      throw new Error(`Error updating user password: ${error.message}`);
    }
  }

  async updateUserEmail(old_email: string, new_email: string) {
    try {
      const userRecord = await this.getUserByEmail(old_email);
      const updatedUserRecord = await firebaseAdmin.auth().updateUser(userRecord.uid, {
        email: new_email,
      });
      console.log(`Correo del usuario ${old_email} modificado a ${new_email}`);
      return updatedUserRecord;
    } catch (error) {
      throw new Error(`Error updating user email: ${error.message}`);
    }
  }

  async deleteUser(email: string) {
    try {
      const userRecord = await this.getUserByEmail(email);
      await firebaseAdmin.auth().deleteUser(userRecord.uid);
      console.log(`Usuario ${email} eliminado`);
    } catch (error) {
      throw new Error(`Error deleting user: ${error.message}`);
    }
  }
}