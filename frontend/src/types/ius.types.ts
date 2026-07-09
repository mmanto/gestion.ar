/**
 * Tipos para el JSON de configuración libre de un agente (bot.config.ius_config)
 * y su validación. No hay un schema fijo — cada bot define su propia estructura
 * (ver docs/ius_system_prompt.json) — por eso se modela como JSON genérico.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  field: string;
  message: string;
  severity: ValidationSeverity;
}

export interface ValidationReport {
  success: boolean;
  structural: ValidationIssue[];
  semantic: ValidationIssue[];
}
