# Node 20+ es obligatorio: @nestjs/typeorm 11 usa crypto.randomUUID() como global
# (disponible desde Node 19; en Node 18 provoca ReferenceError: crypto is not defined).
FROM --platform=linux/amd64 node:20-alpine AS build

# Establece el directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app

# Dependencias de sistema necesarias para OCR y conversión PDF → imagen.
# pdf2pic usa GraphicsMagick + Ghostscript; node-tesseract-ocr requiere Tesseract y los idiomas spa/eng.
COPY package*.json ./
RUN apk update && apk add --no-cache \
    graphicsmagick \
    imagemagick \
    ghostscript \
    tesseract-ocr \
    tesseract-ocr-data-eng \
    tesseract-ocr-data-spa \
    && npm install --legacy-peer-deps

# Copia el resto del código
COPY . .

# Build del proyecto
RUN npm run build

# Exponer el puerto
EXPOSE 3000

# Comando para iniciar la aplicación
CMD ["node", "dist/main.js"]