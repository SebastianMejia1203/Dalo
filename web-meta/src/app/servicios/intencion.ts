import { Injectable, inject, signal } from "@angular/core";
import { API_URL } from "./api-url";

export interface ResultadoIntencion {
  id: string | null;
  confianza: number;
  motivo: string;
  model: string;
  latencyMs: number;
  promptVersion: string;
}

/**
 * Español libre → intención del catálogo, con Muse Spark desde el backend.
 * No traduce a LSC: solo elige una expresión existente o ninguna.
 */
@Injectable({ providedIn: "root" })
export class IntencionService {
  private readonly apiUrl = inject(API_URL);
  readonly ocupado = signal(false);
  readonly resultado = signal<ResultadoIntencion | null>(null);
  readonly error = signal("");
  /** Último texto interpretado, para mostrar la vía usada en la interfaz. */
  readonly texto = signal("");
  private abortador: AbortController | null = null;

  async interpretar(texto: string): Promise<ResultadoIntencion | null> {
    const limpio = texto.trim();
    if (!limpio) return null;
    this.abortador?.abort();
    const controller = new AbortController();
    this.abortador = controller;
    this.ocupado.set(true);
    this.error.set("");
    try {
      const response = await fetch(`${this.apiUrl}/intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: limpio }),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(20000),
        ]),
      });
      const body = (await response.json().catch(() => null)) as
        | ResultadoIntencion
        | { error?: string }
        | null;
      if (!response.ok)
        throw new Error(
          (body as { error?: string } | null)?.error ||
            "No se pudo interpretar el mensaje.",
        );
      const resultado = body as ResultadoIntencion;
      this.resultado.set(resultado);
      this.texto.set(limpio);
      return resultado;
    } catch (error) {
      if (controller.signal.aborted) return null;
      this.error.set(
        error instanceof Error
          ? error.message
          : "No se pudo interpretar el mensaje.",
      );
      return null;
    } finally {
      if (this.abortador === controller) {
        this.abortador = null;
        this.ocupado.set(false);
      }
    }
  }

  cancelar(): void {
    this.abortador?.abort();
    this.ocupado.set(false);
  }
}
