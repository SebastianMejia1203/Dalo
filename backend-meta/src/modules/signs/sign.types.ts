export interface CatalogEntry {
  id: string;
  nombre: string;
  significado: string;
  intencion: string;
}
export interface SignDefinition extends CatalogEntry {
  descripcion: string;
  activa: boolean;
  orden: number;
  ordenDescripcion: number;
  categoria?: string;
}
export interface RecognitionSpec {
  classes: string[] | null;
  schema: Record<string, unknown>;
  promptVersion: string;
  prompt: string;
  description: string;
  task?: string;
}
