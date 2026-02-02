# Utiliza una imagen de Node.js como base para tu aplicación Nest.js
FROM --platform=linux/amd64 node:18-alpine as build

# Establece el directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app

# Instala las dependencias
COPY package*.json ./
RUN apk update && npm install --legacy-peer-deps

# Copia el resto del código
COPY . .

# Build del proyecto
RUN npm run build

# Exponer el puerto
EXPOSE 3000

# Comando para iniciar la aplicación
CMD ["node", "dist/main.js"]