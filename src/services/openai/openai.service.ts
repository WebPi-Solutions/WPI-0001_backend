import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { SpentConcept } from 'src/models/Concept';
import { spentConceptsSystemPrompt } from './prompts/spent-concepts.system.prompt';
import { buildSpentConceptsUserPrompt } from './prompts/spent-concepts.user.prompt';
import { spentIssuerSystemPrompt } from './prompts/spent-issuer.system.prompt';
import { spentConceptsResponseFormat } from './schemas/spent-concepts.schema';
import { spentIssuerResponseFormat } from './schemas/spent-issuer.schema';

/**
 * Consumo de tokens de una petición a OpenAI.
 */
export interface OpenAiTokenUsage {
  /** Tokens de entrada (prompt) */
  promptTokens: number;
  /** Tokens de salida (completion) */
  completionTokens: number;
  /** Tokens totales empleados */
  totalTokens: number;
}

/**
 * Resultado de la extracción del emisor de un gasto mediante OpenAI.
 */
export interface ExtractedSpentIssuerResult extends OpenAiTokenUsage {
  /** Nombre fiscal (razón social) del emisor, no la marca comercial */
  name: string;
  /** CIF/NIF del emisor sin prefijo de país */
  nifWithoutCountryPrefix: string;
  /** CIF/NIF del emisor con prefijo de país, o vacío si no aplica */
  nifWithCountryPrefix: string;
}

/**
 * Resultado de la extracción de conceptos de gasto mediante OpenAI.
 */
export interface ExtractedSpentConceptsResult extends OpenAiTokenUsage {
  /** Nombre del gasto, extraído de los conceptos de la factura actual */
  name: string;
  /** Fecha de emisión de la factura (YYYY-MM-DD) */
  issuedDate: string;
  /** Conceptos de gasto reconocidos en el texto */
  concepts: SpentConcept[];
  /** Subtotal total de la factura */
  totalSubtotal: number;
  /** IVA total de la factura */
  totalVAT: number;
  /** Retención IRPF total de la factura */
  totalIRPF: number;
  /** Total de la factura (subtotal - IRPF + IVA) */
  total: number;
}

/**
 * Contexto de la segunda llamada a OpenAI para extraer conceptos.
 */
export interface SpentConceptsExtractionContext {
  /** Conceptos completos de las últimas facturas del proveedor */
  historicalConcepts?: SpentConcept[];
  /** Nombres de las últimas facturas del proveedor, como referencia de estilo si la factura es de la misma línea */
  historicalSpentNames?: string[];
  /** CIF/NIF del emisor con prefijo de país (ejemplo: ESB66855701) */
  issuerNifWithCountryPrefix?: string;
}

/**
 * Respuesta JSON esperada del modelo para el emisor de un gasto.
 */
interface SpentIssuerModelResponse {
  /** Nombre del emisor */
  name: string;
  /** CIF/NIF sin prefijo de país */
  nifWithoutCountryPrefix: string;
  /** CIF/NIF con prefijo de país */
  nifWithCountryPrefix: string;
}

/**
 * Respuesta JSON esperada del modelo para los conceptos y totales de un gasto.
 */
interface SpentConceptsModelResponse {
  /** Nombre del gasto */
  name: string;
  /** Fecha de emisión (YYYY-MM-DD) */
  issuedDate: string;
  /** Lista de conceptos extraídos */
  concepts: SpentConcept[];
  /** Subtotal total de la factura */
  totalSubtotal: number;
  /** IVA total de la factura */
  totalVAT: number;
  /** Retención IRPF total de la factura */
  totalIRPF: number;
  /** Total de la factura (subtotal - IRPF + IVA) */
  total: number;
}

/**
 * Resultado interno de una petición estructurada a OpenAI.
 */
interface StructuredChatCompletionResult {
  /** Contenido textual de la respuesta */
  rawContent: string;
  /** Tokens empleados */
  tokenUsage: OpenAiTokenUsage;
}

/**
 * Tipo de petición no streaming a Chat Completions.
 */
type SpentChatCompletionRequest = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;

/**
 * Servicio de OpenAI: extrae emisor y conceptos de gasto a partir del texto OCR de un PDF.
 */
@Injectable()
export class OpenaiService {
  private readonly logger = new Logger(OpenaiService.name);

  /**
   * Modelo de extracción de gastos, leído de `OPENAI_SPENTS_PROCESSING_MODEL`.
   */
  private readonly spentConceptsModel: string | null;

  /**
   * Esfuerzo de razonamiento. `none` basta para extraer datos ya presentes en el texto OCR.
   */
  private readonly spentConceptsReasoningEffort: OpenAI.ReasoningEffort = 'none';

  /**
   * Identificador de organización de OpenAI, si está configurado.
   */
  private readonly organizationId: string | null;

  /**
   * Cliente oficial de OpenAI, o nulo si faltan credenciales.
   */
  private readonly openaiClient: OpenAI | null;

  constructor() {
    this.spentConceptsModel = this.readSpentConceptsModelFromEnvironment();

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    const organizationId = process.env.OPENAI_ORG_ID?.trim();

    if (!apiKey || !organizationId) {
      this.logger.warn(
        'OPENAI_API_KEY u OPENAI_ORG_ID no están definidas: las llamadas a OpenAI permanecerán deshabilitadas',
      );
      this.organizationId = null;
      this.openaiClient = null;
      return;
    }

    this.organizationId = organizationId;
    this.openaiClient = new OpenAI({
      apiKey,
      organization: organizationId,
    });
  }

  /**
   * Extrae el nombre y el CIF/NIF del emisor a partir del texto OCR completo.
   * @param extractedText Texto reconocido en el PDF del gasto
   * @returns Datos del emisor y tokens empleados en la petición
   */
  async extractSpentIssuerFromText(extractedText: string): Promise<ExtractedSpentIssuerResult> {
    const normalizedText = this.requireNormalizedOcrText(
      extractedText,
      'No se ha recibido texto OCR para extraer el emisor con OpenAI',
      'No se ha podido extraer texto del PDF para analizarlo con IA',
    );

    try {
      const completionResult = await this.executeStructuredChatCompletion(
        this.buildStructuredRequestPayload(
          normalizedText,
          spentIssuerSystemPrompt,
          spentIssuerResponseFormat,
        ),
        'Extracción de emisor del gasto',
      );
      const issuer = this.parseSpentIssuerFromModelContent(completionResult.rawContent);

      this.logger.log(`Emisor extraído por OpenAI:\n${JSON.stringify(issuer, null, 2)}`);
      this.logTokenUsage('extracción de emisor', completionResult.tokenUsage);

      return {
        ...issuer,
        ...completionResult.tokenUsage,
      };
    } catch (error) {
      this.rethrowOpenAiHttpException(
        error,
        'Error al extraer el emisor del gasto con OpenAI',
        'Error al extraer el emisor del gasto con IA',
      );
    }
  }

  /**
   * Extrae los conceptos y los totales de una factura de gasto a partir del texto OCR.
   * Usa los conceptos históricos como ejemplo de formato y el CIF con prefijo para el IVA.
   * @param extractedText Texto reconocido en el PDF del gasto
   * @param extractionContext Conceptos históricos y CIF del emisor con prefijo de país
   * @returns Conceptos, totales de factura y tokens empleados en la petición
   */
  async extractSpentConceptsFromText(
    extractedText: string,
    extractionContext: SpentConceptsExtractionContext = {},
  ): Promise<ExtractedSpentConceptsResult> {
    const normalizedText = this.requireNormalizedOcrText(
      extractedText,
      'No se ha recibido texto OCR para extraer conceptos con OpenAI',
      'No se ha podido extraer texto del PDF para analizarlo con IA',
    );
    const normalizedContext = this.normalizeSpentConceptsExtractionContext(extractionContext);

    this.logger.debug(
      `Contexto de extracción de conceptos enviado a OpenAI: ${JSON.stringify(normalizedContext)}`,
    );

    try {
      const completionResult = await this.executeStructuredChatCompletion(
        this.buildStructuredRequestPayload(
          buildSpentConceptsUserPrompt({
            extractedText: normalizedText,
            issuerNifWithCountryPrefix: normalizedContext.issuerNifWithCountryPrefix,
            historicalSpentNames: normalizedContext.historicalSpentNames,
            historicalConcepts: normalizedContext.historicalConcepts,
          }),
          spentConceptsSystemPrompt,
          spentConceptsResponseFormat,
        ),
        'Extracción de conceptos del gasto',
      );
      const extractedInvoice = this.refineSpanishConceptBasePrices(
        this.parseSpentConceptsFromModelContent(completionResult.rawContent),
        normalizedContext.issuerNifWithCountryPrefix,
      );

      this.logger.log(
        `Respuesta de OpenAI (extracción de conceptos):\n${JSON.stringify(extractedInvoice, null, 2)}`,
      );
      this.logTokenUsage('extracción de conceptos', completionResult.tokenUsage);

      return {
        ...extractedInvoice,
        ...completionResult.tokenUsage,
      };
    } catch (error) {
      this.rethrowOpenAiHttpException(
        error,
        'Error al extraer conceptos de gasto con OpenAI',
        'Error al extraer los conceptos del gasto con IA',
      );
    }
  }

  /**
   * Ejecuta una petición estructurada a Chat Completions y registra configuración y payload.
   * @param requestPayload Cuerpo de la petición
   * @param operationName Nombre de la operación para los logs
   * @returns Contenido de la respuesta y tokens empleados
   */
  private async executeStructuredChatCompletion(
    requestPayload: SpentChatCompletionRequest,
    operationName: string,
  ): Promise<StructuredChatCompletionResult> {
    const openaiClient = this.getConfiguredOpenAiClient();

    this.logOpenAiRequestConfiguration(requestPayload, operationName);
    this.logOpenAiRequestPayload(requestPayload, operationName);

    const completion = await openaiClient.chat.completions.create(requestPayload);
    const rawContent = completion.choices[0]?.message?.content ?? '';

    return {
      rawContent,
      tokenUsage: this.extractTokenUsage(completion.usage),
    };
  }

  /**
   * Construye el cuerpo de una petición estructurada de extracción.
   * @param extractedText Texto OCR que se envía como mensaje de usuario
   * @param systemPrompt Instrucciones de sistema
   * @param responseFormat Schema JSON estricto de la respuesta
   * @returns Parámetros de `chat.completions.create`
   */
  private buildStructuredRequestPayload(
    extractedText: string,
    systemPrompt: string,
    responseFormat: OpenAI.ResponseFormatJSONSchema,
  ): SpentChatCompletionRequest {
    return {
      model: this.getConfiguredSpentConceptsModel(),
      reasoning_effort: this.spentConceptsReasoningEffort,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: extractedText,
        },
      ],
      response_format: responseFormat,
    };
  }

  /**
   * Registra la configuración que se va a enviar a la API de OpenAI.
   * @param requestPayload Cuerpo de la petición
   * @param operationName Nombre de la operación
   */
  private logOpenAiRequestConfiguration(
    requestPayload: SpentChatCompletionRequest,
    operationName: string,
  ): void {
    const jsonSchemaName = this.getResponseFormatSchemaName(requestPayload.response_format);
    const messageRoles = requestPayload.messages.map((message) => message.role);

    this.logger.log(
      `Configuración de la petición a OpenAI (${operationName}): ${JSON.stringify(
        {
          operationName,
          model: requestPayload.model,
          modelEnvironmentVariable: 'OPENAI_SPENTS_PROCESSING_MODEL',
          reasoningEffort: requestPayload.reasoning_effort,
          organizationId: this.organizationId,
          responseFormatType:
            requestPayload.response_format && 'type' in requestPayload.response_format
              ? requestPayload.response_format.type
              : undefined,
          responseFormatName: jsonSchemaName,
          messageCount: requestPayload.messages.length,
          messageRoles,
        },
        null,
        2,
      )}`,
    );
  }

  /**
   * Registra el contenido que se envía a OpenAI justo antes de la consulta.
   * @param requestPayload Cuerpo de la petición
   * @param operationName Nombre de la operación
   */
  private logOpenAiRequestPayload(
    requestPayload: SpentChatCompletionRequest,
    operationName: string,
  ): void {
    this.logger.log(
      `Contenido enviado a OpenAI (${operationName}):\n${JSON.stringify(requestPayload.messages, null, 2)}`,
    );
  }

  /**
   * Registra los tokens empleados en una operación.
   * @param operationName Nombre de la operación
   * @param tokenUsage Tokens de la respuesta
   */
  private logTokenUsage(operationName: string, tokenUsage: OpenAiTokenUsage): void {
    this.logger.log(
      `Tokens empleados por OpenAI (${operationName}): prompt=${tokenUsage.promptTokens}, completion=${tokenUsage.completionTokens}, total=${tokenUsage.totalTokens}`,
    );
  }

  /**
   * Normaliza el contexto de extracción de conceptos.
   * @param extractionContext Contexto recibido por el servicio
   * @returns Contexto con arrays y cadenas definidos
   */
  private normalizeSpentConceptsExtractionContext(
    extractionContext: SpentConceptsExtractionContext,
  ): Required<SpentConceptsExtractionContext> {
    return {
      historicalConcepts: Array.isArray(extractionContext.historicalConcepts)
        ? extractionContext.historicalConcepts
        : [],
      historicalSpentNames: Array.isArray(extractionContext.historicalSpentNames)
        ? extractionContext.historicalSpentNames
        : [],
      issuerNifWithCountryPrefix: extractionContext.issuerNifWithCountryPrefix?.trim() ?? '',
    };
  }

  /**
   * Interpreta el JSON del emisor devuelto por el modelo.
   * @param rawContent Contenido textual de la respuesta de OpenAI
   * @returns Nombre y CIF del emisor, con y sin prefijo de país
   */
  private parseSpentIssuerFromModelContent(
    rawContent: string,
  ): Pick<ExtractedSpentIssuerResult, 'name' | 'nifWithoutCountryPrefix' | 'nifWithCountryPrefix'> {
    const parsedResponse = this.parseJsonFromModelContent<SpentIssuerModelResponse>(
      rawContent,
      'OpenAI no ha devuelto datos del emisor del gasto',
    );

    return {
      name: typeof parsedResponse?.name === 'string' ? parsedResponse.name.trim() : '',
      nifWithoutCountryPrefix: this.normalizeIssuerNif(parsedResponse?.nifWithoutCountryPrefix),
      nifWithCountryPrefix: this.normalizeIssuerNif(parsedResponse?.nifWithCountryPrefix),
    };
  }

  /**
   * Interpreta el JSON de conceptos y totales devuelto por el modelo.
   * @param rawContent Contenido textual de la respuesta de OpenAI
   * @returns Conceptos de gasto y totales de la factura
   */
  private parseSpentConceptsFromModelContent(
    rawContent: string,
  ): Pick<
    ExtractedSpentConceptsResult,
    'name' | 'issuedDate' | 'concepts' | 'totalSubtotal' | 'totalVAT' | 'totalIRPF' | 'total'
  > {
    const parsedResponse = this.parseJsonFromModelContent<SpentConceptsModelResponse>(
      rawContent,
      'OpenAI no ha devuelto conceptos para el gasto',
    );

    if (!Array.isArray(parsedResponse?.concepts)) {
      this.logger.error('La respuesta de OpenAI no incluye un array de conceptos');
      throw new HttpException(
        'La respuesta de OpenAI no incluye un array de conceptos',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return {
      name: typeof parsedResponse.name === 'string' ? parsedResponse.name.trim() : '',
      issuedDate: this.normalizeIssuedDate(parsedResponse.issuedDate),
      concepts: parsedResponse.concepts.map((concept, conceptIndex) =>
        this.mapToSpentConcept(concept, conceptIndex),
      ),
      totalSubtotal: this.roundMonetaryAmount(this.toFiniteNumber(parsedResponse.totalSubtotal, 0)),
      totalVAT: this.roundMonetaryAmount(this.toFiniteNumber(parsedResponse.totalVAT, 0)),
      totalIRPF: this.roundMonetaryAmount(this.toFiniteNumber(parsedResponse.totalIRPF, 0)),
      total: this.roundMonetaryAmount(this.toFiniteNumber(parsedResponse.total, 0)),
    };
  }

  /**
   * Interpreta el JSON de una respuesta de OpenAI.
   * @param rawContent Contenido textual de la respuesta
   * @param emptyResponseMessage Mensaje si la respuesta viene vacía
   * @returns Objeto parseado
   */
  private parseJsonFromModelContent<ParsedResponse>(
    rawContent: string,
    emptyResponseMessage: string,
  ): ParsedResponse {
    if (!rawContent) {
      this.logger.error(emptyResponseMessage);
      throw new HttpException(emptyResponseMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    try {
      return JSON.parse(rawContent) as ParsedResponse;
    } catch (error) {
      this.logger.error(`La respuesta de OpenAI no es un JSON válido: ${error.message}`);
      throw new HttpException(
        'La respuesta de OpenAI no tiene un formato JSON válido',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Normaliza un objeto recibido de OpenAI al modelo `SpentConcept`.
   * La imputación no se extrae: siempre se fija a 100 % y el usuario la cambia en el frontend si aplica.
   * @param concept Concepto crudo recibido del modelo
   * @param conceptIndex Índice del concepto en el array (para logs)
   * @returns Concepto de gasto normalizado
   */
  private mapToSpentConcept(concept: SpentConcept, conceptIndex: number): SpentConcept {
    const mappedConcept = new SpentConcept();
    mappedConcept.name = typeof concept?.name === 'string' ? concept.name.trim() : '';
    mappedConcept.base_price = this.toFiniteNumber(concept?.base_price, 0);
    mappedConcept.vat = this.toFiniteNumber(concept?.vat, 0);
    mappedConcept.irpf = this.toFiniteNumber(concept?.irpf, 0);
    mappedConcept.quantity = this.toFiniteNumber(concept?.quantity, 1);
    mappedConcept.supplied = Boolean(concept?.supplied);
    mappedConcept.percentage = 100;

    if (!mappedConcept.name) {
      this.logger.warn(`El concepto en la posición ${conceptIndex} no tiene nombre; se usará un valor por defecto`);
      mappedConcept.name = `Concepto ${conceptIndex + 1}`;
    }

    return mappedConcept;
  }

  /**
   * Normaliza la fecha de emisión a formato YYYY-MM-DD.
   * Si no es válida, usa la fecha actual.
   * @param issuedDateValue Fecha recibida del modelo
   * @returns Fecha en formato YYYY-MM-DD
   */
  private normalizeIssuedDate(issuedDateValue: unknown): string {
    const rawIssuedDate = typeof issuedDateValue === 'string' ? issuedDateValue.trim() : '';
    const isoDateMatch = rawIssuedDate.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoDateMatch) {
      const parsedDate = new Date(`${isoDateMatch[1]}T00:00:00`);
      if (!Number.isNaN(parsedDate.getTime())) {
        return isoDateMatch[1];
      }
    }

    this.logger.warn(
      `Fecha de emisión no válida (${String(issuedDateValue)}); se usa la fecha actual`,
    );
    return this.formatDateAsIsoDay(new Date());
  }

  /**
   * Formatea una fecha como YYYY-MM-DD en hora local.
   * @param date Fecha a formatear
   * @returns Fecha en formato ISO de día
   */
  private formatDateAsIsoDay(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Normaliza un CIF/NIF: mayúsculas y sin espacios ni guiones.
   * @param nifValue Valor recibido del modelo
   * @returns NIF normalizado
   */
  private normalizeIssuerNif(nifValue: unknown): string {
    if (typeof nifValue !== 'string') {
      return '';
    }

    return nifValue.replace(/[\s.\-]/g, '').toUpperCase();
  }

  /**
   * Ajusta `base_price` de facturas españolas para que el IVA, el total y el redondeo a 2 decimales de pantalla cuadren.
   * @param extractedInvoice Conceptos y totales extraídos
   * @param issuerNifWithCountryPrefix CIF del emisor con prefijo de país
   * @returns Factura extraída, con la base refinada si aplica
   */
  private refineSpanishConceptBasePrices(
    extractedInvoice: Pick<
      ExtractedSpentConceptsResult,
      'name' | 'issuedDate' | 'concepts' | 'totalSubtotal' | 'totalVAT' | 'totalIRPF' | 'total'
    >,
    issuerNifWithCountryPrefix: string,
  ): Pick<
    ExtractedSpentConceptsResult,
    'name' | 'issuedDate' | 'concepts' | 'totalSubtotal' | 'totalVAT' | 'totalIRPF' | 'total'
  > {
    if (!this.isSpanishIssuerNif(issuerNifWithCountryPrefix)) {
      return extractedInvoice;
    }

    const taxableConcepts = extractedInvoice.concepts.filter((concept) => concept.vat > 0);
    if (taxableConcepts.length !== 1) {
      return extractedInvoice;
    }

    const taxableConcept = taxableConcepts[0];
    const refinedBasePrice = this.buildSpanishBasePriceThatMatchesPrintedVat(
      taxableConcept,
      extractedInvoice.totalSubtotal,
      extractedInvoice.totalVAT,
      extractedInvoice.total,
    );
    if (refinedBasePrice === null) {
      return extractedInvoice;
    }

    this.logger.log(
      `Ajuste de base española para cuadrar IVA y redondeo a 2 decimales: ${taxableConcept.base_price} → ${refinedBasePrice}`,
    );
    taxableConcept.base_price = refinedBasePrice;
    return extractedInvoice;
  }

  /**
   * Calcula una base con decimales extra que reproduce IVA, total y la base impresa a 2 decimales en pantalla.
   * @param concept Concepto con IVA
   * @param printedSubtotal Base impresa (2 decimales)
   * @param printedVat IVA total impreso
   * @param printedTotal Total impreso
   * @returns Base refinada, o null si la actual ya cuadra en pantalla
   */
  private buildSpanishBasePriceThatMatchesPrintedVat(
    concept: SpentConcept,
    printedSubtotal: number,
    printedVat: number,
    printedTotal: number,
  ): number | null {
    const quantity = concept.quantity || 1;
    const vatRate = concept.vat / 100;
    if (quantity === 0 || vatRate <= 0) {
      return null;
    }

    const roundedPrintedSubtotal = this.roundMonetaryAmount(printedSubtotal);
    const roundedPrintedVat = this.roundMonetaryAmount(printedVat);
    const lineBaseAmount = concept.base_price * quantity;
    const calculatedVat = this.roundMonetaryAmount(lineBaseAmount * vatRate);
    const calculatedSubtotal = this.roundMonetaryAmount(lineBaseAmount);

    if (calculatedVat === roundedPrintedVat && calculatedSubtotal === roundedPrintedSubtotal) {
      return null;
    }

    const irpfRate = (concept.irpf || 0) / 100;
    const totalFactor = 1 - irpfRate + vatRate;
    let preferredLineBase = lineBaseAmount;

    if (totalFactor > 0 && printedTotal !== 0) {
      preferredLineBase = printedTotal / totalFactor;
    } else if (roundedPrintedVat !== 0) {
      preferredLineBase = roundedPrintedVat / vatRate;
    }

    const refinedLineBase = this.pickLineBaseMatchingPrintedAmounts(
      preferredLineBase,
      roundedPrintedSubtotal,
      roundedPrintedVat,
      vatRate,
    );
    const refinedUnitPrice = this.roundToSixDecimalPlaces(refinedLineBase / quantity);

    this.logger.log(
      `Base española recalculada: actual=${concept.base_price}, subtotal pantalla=${calculatedSubtotal}, subtotal factura=${roundedPrintedSubtotal}, IVA calculado=${calculatedVat}, IVA factura=${roundedPrintedVat}, base ajustada=${refinedUnitPrice}`,
    );
    return refinedUnitPrice;
  }

  /**
   * Elige una base de línea que, al redondear a 2 decimales, coincide con la base y el IVA impresos.
   * El rango visual half-up de 5.88 es [5.875, 5.885): 5.884 se ve 5.88 y 5.885 se vería 5.89.
   * @param preferredLineBase Base preferida (normalmente total / (1 + IVA))
   * @param printedSubtotal Base impresa a 2 decimales
   * @param printedVat IVA impreso a 2 decimales
   * @param vatRate Tipo de IVA en tanto por uno
   * @returns Base de línea acotada al rango que cuadra en pantalla
   */
  private pickLineBaseMatchingPrintedAmounts(
    preferredLineBase: number,
    printedSubtotal: number,
    printedVat: number,
    vatRate: number,
  ): number {
    const displayMinimumInclusive = printedSubtotal - 0.005;
    const displayMaximumExclusive = printedSubtotal + 0.005;
    const vatMinimumInclusive = (printedVat - 0.005) / vatRate;
    const vatMaximumExclusive = (printedVat + 0.005) / vatRate;
    const rangeMinimumInclusive = Math.max(displayMinimumInclusive, vatMinimumInclusive);
    const rangeMaximumExclusive = Math.min(displayMaximumExclusive, vatMaximumExclusive);

    if (rangeMinimumInclusive >= rangeMaximumExclusive) {
      this.logger.warn(
        `No hay intersección entre base impresa ${printedSubtotal} e IVA ${printedVat}; se prioriza el redondeo visual`,
      );
      return this.clampAmountToHalfUpTwoDecimalRange(preferredLineBase, printedSubtotal);
    }

    const maximumAllowed = rangeMaximumExclusive - 0.000001;
    const clampedLineBase = Math.min(
      Math.max(preferredLineBase, rangeMinimumInclusive),
      maximumAllowed,
    );

    return this.clampAmountToHalfUpTwoDecimalRange(clampedLineBase, printedSubtotal);
  }

  /**
   * Ajusta un importe para que, redondeado a 2 decimales (half-up), coincida con el valor impreso.
   * Así 5.884 se ve 5.88 y 5.885 no se admite porque se vería 5.89.
   * @param amount Importe con decimales extra
   * @param printedTwoDecimals Importe impreso a 2 decimales
   * @returns Importe dentro del rango que se visualiza como `printedTwoDecimals`
   */
  private clampAmountToHalfUpTwoDecimalRange(
    amount: number,
    printedTwoDecimals: number,
  ): number {
    const minimumInclusive = printedTwoDecimals - 0.005;
    const maximumExclusive = printedTwoDecimals + 0.005;
    const maximumAllowed = maximumExclusive - 0.000001;
    const clampedAmount = Math.min(Math.max(amount, minimumInclusive), maximumAllowed);
    const roundedAmount = this.roundToSixDecimalPlaces(clampedAmount);

    if (this.roundMonetaryAmount(roundedAmount) === printedTwoDecimals) {
      return roundedAmount;
    }

    return this.roundToSixDecimalPlaces(maximumAllowed);
  }

  /**
   * Indica si el CIF del emisor corresponde a España.
   * @param issuerNifWithCountryPrefix CIF con prefijo de país
   * @returns true si el prefijo es ES
   */
  private isSpanishIssuerNif(issuerNifWithCountryPrefix: string): boolean {
    return issuerNifWithCountryPrefix.trim().toUpperCase().startsWith('ES');
  }

  /**
   * Redondea un importe a seis decimales para bases reconstruidas.
   * @param amount Importe a redondear
   * @returns Importe con como máximo seis decimales
   */
  private roundToSixDecimalPlaces(amount: number): number {
    return Math.round(amount * 1_000_000) / 1_000_000;
  }

  /**
   * Convierte un valor a número finito o usa el valor por defecto.
   * @param value Valor a convertir
   * @param defaultValue Valor si no es un número válido
   * @returns Número finito
   */
  private toFiniteNumber(value: unknown, defaultValue: number): number {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : defaultValue;
  }

  /**
   * Redondea un importe monetario a dos decimales.
   * @param amount Importe a redondear
   * @returns Importe con dos decimales
   */
  private roundMonetaryAmount(amount: number): number {
    return Math.round(amount * 100) / 100;
  }

  /**
   * Extrae el consumo de tokens de la respuesta de OpenAI.
   * @param usage Bloque de uso devuelto por el SDK
   * @returns Tokens de prompt, completion y total
   */
  private extractTokenUsage(
    usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined,
  ): OpenAiTokenUsage {
    const promptTokens = usage?.prompt_tokens ?? 0;
    const completionTokens = usage?.completion_tokens ?? 0;
    const totalTokens = usage?.total_tokens ?? promptTokens + completionTokens;

    return {
      promptTokens,
      completionTokens,
      totalTokens,
    };
  }

  /**
   * Valida y recorta el texto OCR. Lanza error HTTP si está vacío.
   * @param extractedText Texto OCR recibido
   * @param emptyLogMessage Mensaje de log si está vacío
   * @param emptyHttpMessage Mensaje HTTP si está vacío
   * @returns Texto recortado
   */
  private requireNormalizedOcrText(
    extractedText: string,
    emptyLogMessage: string,
    emptyHttpMessage: string,
  ): string {
    const normalizedText = extractedText?.trim() ?? '';
    if (!normalizedText) {
      this.logger.error(emptyLogMessage);
      throw new HttpException(emptyHttpMessage, HttpStatus.BAD_REQUEST);
    }

    return normalizedText;
  }

  /**
   * Repropaga un HttpException o envuelve el error de OpenAI.
   * @param error Error capturado
   * @param logMessage Mensaje de log
   * @param httpMessage Mensaje HTTP
   */
  private rethrowOpenAiHttpException(
    error: unknown,
    logMessage: string,
    httpMessage: string,
  ): never {
    if (error instanceof HttpException) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    this.logger.error(`${logMessage}: ${errorMessage}`, errorStack);
    throw new HttpException(`${httpMessage}: ${errorMessage}`, HttpStatus.INTERNAL_SERVER_ERROR);
  }

  /**
   * Obtiene el nombre del JSON schema del response_format, si existe.
   * @param responseFormat Formato de respuesta de la petición
   * @returns Nombre del schema o undefined
   */
  private getResponseFormatSchemaName(
    responseFormat: SpentChatCompletionRequest['response_format'],
  ): string | undefined {
    if (!responseFormat || !('json_schema' in responseFormat)) {
      return undefined;
    }

    return responseFormat.json_schema?.name;
  }

  /**
   * Lee el modelo de extracción de gastos desde `OPENAI_SPENTS_PROCESSING_MODEL`.
   * @returns Identificador del modelo, o nulo si no está definido
   */
  private readSpentConceptsModelFromEnvironment(): string | null {
    const modelName = process.env.OPENAI_SPENTS_PROCESSING_MODEL?.trim() ?? '';
    if (!modelName) {
      this.logger.warn(
        'OPENAI_SPENTS_PROCESSING_MODEL no está definida: no se podrá extraer datos de gasto con OpenAI',
      );
      return null;
    }

    this.logger.log(`Modelo de OpenAI para gastos leído de OPENAI_SPENTS_PROCESSING_MODEL: ${modelName}`);
    return modelName;
  }

  /**
   * Devuelve el modelo configurado para extraer datos de gasto.
   * @returns Identificador del modelo de OpenAI
   */
  private getConfiguredSpentConceptsModel(): string {
    if (!this.spentConceptsModel) {
      this.logger.error(
        'Se ha intentado llamar a OpenAI sin OPENAI_SPENTS_PROCESSING_MODEL en el entorno',
      );
      throw new HttpException(
        'El modelo de OpenAI para gastos no está configurado (OPENAI_SPENTS_PROCESSING_MODEL)',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return this.spentConceptsModel;
  }

  /**
   * Devuelve el cliente de OpenAI si las credenciales están configuradas.
   * @returns Cliente de OpenAI listo para usarse
   */
  private getConfiguredOpenAiClient(): OpenAI {
    if (!this.openaiClient) {
      this.logger.error(
        'Se ha intentado llamar a OpenAI sin OPENAI_API_KEY u OPENAI_ORG_ID en el entorno',
      );
      throw new HttpException(
        'El servicio de OpenAI no está disponible en este entorno',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return this.openaiClient;
  }
}
