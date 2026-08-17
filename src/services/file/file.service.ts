import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { fromBuffer } from 'pdf2pic';
import { PDFDocument } from 'pdf-lib';
import { MulterFile } from 'multer';
import { OcrService } from '../ocr/ocr.service';

/**
 * Dimensiones de una página PDF expresadas en píxeles para la conversión a imagen.
 */
interface PdfPagePixelDimensions {
  /** Ancho de la página en píxeles */
  width: number;
  /** Alto de la página en píxeles */
  height: number;
}

/**
 * Resultado del procesamiento de un PDF de gasto para IA.
 */
export interface ProcessedAiSpentPdfResult {
  /** Nombre original del archivo */
  originalName: string;
  /** Tamaño del archivo en megabytes */
  sizeInMegabytes: number;
  /** Texto OCR extraído del documento */
  extractedText: string;
  /** Mensaje de confirmación */
  message: string;
}

/**
 * Servicio de gestión de archivos de gasto: validación, páginas, conversión a imagen y OCR.
 */
@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);

  /**
   * Densidad de conversión PDF → imagen (DPI).
   */
  private readonly pdfConversionDensity = 300;

  /**
   * Dimensión máxima en píxeles para evitar imágenes excesivamente grandes.
   */
  private readonly maxImageDimensionPixels = 3508;

  /**
   * Número máximo de páginas por defecto si la variable de entorno no es válida.
   */
  private readonly defaultMaxOcrSpentPages = 3;

  constructor(private readonly ocrService: OcrService) {}

  /**
   * Valida, convierte y extrae el texto OCR de un PDF de gasto.
   * Si el documento supera `MAX_OCR_SPENT_PAGES`, solo se procesan las primeras páginas.
   * @param file Archivo PDF recibido
   * @returns Metadatos del archivo y texto extraído
   */
  async processAiSpentPdf(file: MulterFile): Promise<ProcessedAiSpentPdfResult> {
    this.validatePdfFile(file);

    const originalName = file.originalname;
    const sizeInMegabytes = this.convertBytesToMegabytes(file.size);

    this.logger.log(
      `Archivo recibido para subida de gastos con IA. Nombre: ${originalName}. Tamaño: ${sizeInMegabytes} MB`,
    );

    try {
      const totalPages = await this.getNumberOfPages(file.buffer);
      const pagesToProcess = this.getPagesToProcessCount(totalPages);

      this.logger.log(
        `PDF de gasto con ${totalPages} página(s). Se procesarán ${pagesToProcess} página(s) con OCR`,
      );

      const pageTexts: string[] = [];
      for (let pageNumber = 1; pageNumber <= pagesToProcess; pageNumber++) {
        const pageText = await this.extractTextFromPdfPage(file.buffer, pageNumber);
        pageTexts.push(pageText);
      }

      const extractedText = this.joinPageTexts(pageTexts);
      this.logger.log(`Texto OCR extraído del gasto ${originalName}:\n${extractedText}`);

      return {
        originalName,
        sizeInMegabytes,
        extractedText,
        message: 'Archivo recibido correctamente',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(`Error al procesar el PDF de gasto: ${error.message}`, error.stack);
      throw new HttpException(
        `Error al procesar el PDF de gasto: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Valida que el archivo exista, sea un PDF y tenga contenido.
   * @param file Archivo a validar
   */
  validatePdfFile(file: MulterFile): void {
    if (!file) {
      throw new HttpException('No se ha proporcionado ningún archivo', HttpStatus.BAD_REQUEST);
    }

    if (file.mimetype !== 'application/pdf') {
      this.logger.warn(`Tipo de archivo no permitido: ${file.mimetype}`);
      throw new HttpException('Solo se permiten archivos PDF', HttpStatus.BAD_REQUEST);
    }

    if (!file.buffer || file.buffer.length === 0) {
      throw new HttpException('No se ha podido leer el contenido del PDF', HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Convierte un tamaño en bytes a megabytes con dos decimales.
   * @param sizeInBytes Tamaño en bytes
   * @returns Tamaño en megabytes
   */
  convertBytesToMegabytes(sizeInBytes: number): number {
    const bytesInOneMegabyte = 1024 * 1024;
    return Number((sizeInBytes / bytesInOneMegabyte).toFixed(2));
  }

  /**
   * Obtiene el número total de páginas del PDF.
   * @param pdfBuffer Contenido binario del PDF
   * @returns Número de páginas del documento
   */
  async getNumberOfPages(pdfBuffer: Buffer): Promise<number> {
    const pdfDocument = await PDFDocument.load(pdfBuffer);
    return pdfDocument.getPageCount();
  }

  /**
   * Extrae el texto OCR de una página concreta del PDF.
   * @param pdfBuffer Contenido binario del PDF
   * @param pageNumber Número de página (base 1)
   * @returns Texto reconocido en la página
   */
  private async extractTextFromPdfPage(pdfBuffer: Buffer, pageNumber: number): Promise<string> {
    this.logger.log(`Convirtiendo la página ${pageNumber} del PDF a imagen para OCR`);
    const imageBuffer = await this.convertPdfPageToImage(pdfBuffer, pageNumber);
    return this.ocrService.extractTextFromImage(imageBuffer);
  }

  /**
   * Convierte una página del PDF a imagen PNG en memoria.
   * @param pdfBuffer Contenido binario del PDF
   * @param pageNumber Número de página (base 1)
   * @returns Buffer de la imagen PNG
   */
  private async convertPdfPageToImage(pdfBuffer: Buffer, pageNumber: number): Promise<Buffer> {
    const pageDimensions = await this.getPagePixelDimensions(pdfBuffer, pageNumber - 1);
    const convert = fromBuffer(pdfBuffer, {
      format: 'png',
      density: this.pdfConversionDensity,
      width: pageDimensions.width,
      height: pageDimensions.height,
    });

    const conversionResult = await convert(pageNumber, { responseType: 'buffer' });
    if (!conversionResult.buffer || conversionResult.buffer.length === 0) {
      throw new Error(`El buffer de la imagen de la página ${pageNumber} está vacío`);
    }

    return conversionResult.buffer;
  }

  /**
   * Calcula cuántas páginas se deben procesar según el total y el máximo configurado.
   * @param totalPages Número de páginas del documento
   * @returns Número de páginas a procesar
   */
  private getPagesToProcessCount(totalPages: number): number {
    if (totalPages < 1) {
      throw new HttpException('El PDF no contiene páginas', HttpStatus.BAD_REQUEST);
    }

    const maxOcrSpentPages = this.getMaxOcrSpentPages();
    if (totalPages > maxOcrSpentPages) {
      this.logger.warn(
        `El PDF tiene ${totalPages} páginas y supera MAX_OCR_SPENT_PAGES=${maxOcrSpentPages}. Se procesarán solo las ${maxOcrSpentPages} primeras`,
      );
      return maxOcrSpentPages;
    }

    return totalPages;
  }

  /**
   * Lee el máximo de páginas OCR desde `MAX_OCR_SPENT_PAGES`.
   * @returns Número máximo de páginas a procesar
   */
  private getMaxOcrSpentPages(): number {
    const parsedValue = Number.parseInt(process.env.MAX_OCR_SPENT_PAGES ?? '', 10);
    if (Number.isNaN(parsedValue) || parsedValue < 1) {
      this.logger.warn(
        `MAX_OCR_SPENT_PAGES no es válida. Se usará el valor por defecto ${this.defaultMaxOcrSpentPages}`,
      );
      return this.defaultMaxOcrSpentPages;
    }

    return parsedValue;
  }

  /**
   * Obtiene las dimensiones en píxeles de una página, respetando la rotación.
   * @param pdfBuffer Contenido binario del PDF
   * @param pageIndex Índice de la página (base 0)
   * @returns Ancho y alto en píxeles
   */
  private async getPagePixelDimensions(
    pdfBuffer: Buffer,
    pageIndex: number,
  ): Promise<PdfPagePixelDimensions> {
    const pdfDocument = await PDFDocument.load(pdfBuffer);
    const page = pdfDocument.getPage(pageIndex);
    const { width: widthInPoints, height: heightInPoints } = page.getSize();
    const rotationAngle = page.getRotation().angle;
    const isLandscapeRotation = rotationAngle === 90 || rotationAngle === 270;
    const widthPoints = isLandscapeRotation ? heightInPoints : widthInPoints;
    const heightPoints = isLandscapeRotation ? widthInPoints : heightInPoints;

    return this.convertPdfPointsToPixels(widthPoints, heightPoints);
  }

  /**
   * Convierte dimensiones en puntos PDF a píxeles, acotando el tamaño máximo.
   * @param widthInPoints Ancho en puntos
   * @param heightInPoints Alto en puntos
   * @returns Dimensiones en píxeles
   */
  private convertPdfPointsToPixels(
    widthInPoints: number,
    heightInPoints: number,
  ): PdfPagePixelDimensions {
    let width = Math.round((widthInPoints * this.pdfConversionDensity) / 72);
    let height = Math.round((heightInPoints * this.pdfConversionDensity) / 72);
    const largestDimension = Math.max(width, height);

    if (largestDimension > this.maxImageDimensionPixels) {
      const scaleFactor = this.maxImageDimensionPixels / largestDimension;
      width = Math.round(width * scaleFactor);
      height = Math.round(height * scaleFactor);
    }

    return { width, height };
  }

  /**
   * Concatena el texto de varias páginas en un único bloque.
   * @param pageTexts Textos reconocidos por página
   * @returns Texto total extraído
   */
  private joinPageTexts(pageTexts: string[]): string {
    return pageTexts
      .map((pageText, index) => `--- Página ${index + 1} ---\n${pageText}`.trim())
      .join('\n\n');
  }
}
