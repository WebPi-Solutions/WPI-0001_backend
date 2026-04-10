import { Injectable, NestMiddleware, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { firebaseAdmin } from './firebase.service';
import { User } from 'src/entities/user/user.entity';
import { UserRepository } from 'src/entities/user/user-repository.service';

//Creamos esta interfaz para poder acceder al dato 'user' que será el correo obtenido de firebase en los siguientes controllers.
declare global {
  namespace Express {
    interface Request {
      user?: User; // Define la propiedad user en el tipo Request
    }
  }
}

@Injectable()
export class FirebaseMiddleware implements NestMiddleware {
  constructor(private userRepository: UserRepository){}

  async use(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Falta autenticación');
    }

    const token = authHeader.split('Bearer ')[1];

    if (!token) {
      throw new UnauthorizedException('Solicitud no autenticada');
    }

    try {
      req.user = undefined
      const decodedToken = await firebaseAdmin.auth().verifyIdToken(token);

      // Busca el usuario en la base de datos
      const user: User = await this.userRepository.findByEmail(decodedToken.email);
      if(user){
        req.user = user
        next()
      }
      else {
        throw new HttpException('Usuario desconocido', HttpStatus.UNAUTHORIZED)
      }
    } catch (error) {
      console.error("Error al obtener el usuario en el middeware", error)
     
      throw new ForbiddenException('Usuario sin acceso');
    }
  }
}