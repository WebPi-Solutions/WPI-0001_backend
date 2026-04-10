/**
 * Opciones para la paginación de resultados
 */
export interface PaginationOptions {
  /**
   * Número de página (1-based)
   */
  page: number;
  
  /**
   * Cantidad de elementos por página
   */
  pageSize: number;
  
  /**
   * Campo por el que ordenar
   */
  sort?: string;
  
  /**
   * Dirección de ordenación
   */
  order?: 'ASC' | 'DESC';
}

/**
 * Respuesta paginada con elementos y total
 */
export interface PaginatedResponse<T> {
  /**
   * Elementos de la página actual
   */
  items: T[];
  
  /**
   * Total de elementos disponibles
   */
  total: number;
  
  /**
   * Página actual
   */
  currentPage: number;
  
  /**
   * Cantidad total de páginas
   */
  totalPages: number;
} 