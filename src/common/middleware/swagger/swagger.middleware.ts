import { Request, Response, NextFunction } from 'express';

export function swaggerMiddleware(req: Request, res: Response, next: NextFunction) {
  // Credenciales (usuario y contraseña) de autenticación
  const SWAGGER_USER = process.env.SWAGGER_USER || 'admin';
  const SWAGGER_PASSWORD = process.env.SWAGGER_PASSWORD || 'admin';

  // Extrae las credenciales del encabezado Authorization
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    // Si no hay encabezado de autorización o no es Basic, solicita la autenticación
    res.setHeader('WWW-Authenticate', 'Basic realm="WebPi Solutions API Documentation"');
    res.status(401).send('Se requiere autenticación para acceder a esta documentación.');
    return;
  }
  
  // Decodifica las credenciales
  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');
  
  // Verifica las credenciales
  if (username === SWAGGER_USER && password === SWAGGER_PASSWORD) {
    next(); // Continúa si las credenciales son correctas
  } else {
    // Solicita autenticación nuevamente si las credenciales son incorrectas
    res.setHeader('WWW-Authenticate', 'Basic realm="WebPi Solutions API Documentation"');
    res.status(401).send('Credenciales inválidas.');
  }
}