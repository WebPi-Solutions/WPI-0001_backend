/** Configuración inicial que se asigna a cada empresa nueva. */
export interface DefaultEnterpriseSetting {
  key: string;
  value: string;
  editable: boolean;
}

/** Valores base de configuración por empresa. */
export const DEFAULT_ENTERPRISE_SETTINGS: readonly DefaultEnterpriseSetting[] =
  [
    { key: 'document.footer', value: '', editable: true },
    { key: 'document.left', value: '', editable: true },
    { key: 'document.right', value: '', editable: true },
  ];
