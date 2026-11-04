import { Injectable, computed, inject, signal } from "@angular/core";
import { API_URL } from "./api-url";
import { findById } from "../adapters";

export interface SignoAdmin {
  id: string;
  nombre: string;
  significado: string;
  intencion: string;
  descripcion: string;
  activa: boolean;
  categoria: string;
  conAvatar: boolean;
  reconocibleEnCatalogo: boolean;
}

export type Veredicto = "sin-revisar" | "se-entiende" | "corregir" | "no-valida";

export interface Revision {
  veredicto: Veredicto;
  notas: string;
  validador: string;
  fecha: string;
}

export interface RevisionGuardada extends Revision {
  id: number;
  signId: string;
  updatedAt?: string;
}

/** Validación pública: señas del backend y registros en SQLite. */
@Injectable({ providedIn: "root" })
export class AdminService {
  private readonly apiUrl = inject(API_URL);
  readonly signos = signal<SignoAdmin[]>([]);
  readonly cargando = signal(false);
  readonly error = signal("");
  readonly aviso = signal("");
  /** Todos los registros de validación, del más reciente al más antiguo. */
  readonly listaRevisiones = signal<RevisionGuardada[]>([]);
  readonly guardandoRevision = signal<string | null>(null);
  readonly revisadas = computed(
    () =>
      new Set(
        this.listaRevisiones()
          .filter((revision) => revision.veredicto !== "sin-revisar")
          .map((revision) => revision.signId),
      ).size,
  );
  private cabeceras(incluirJson = false): Record<string, string> {
    return incluirJson
      ? { "Content-Type": "application/json" }
      : {};
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set("");
    try {
      const [signos, revisiones] = await Promise.all([
        fetch(`${this.apiUrl}/admin/signs`, {
          headers: this.cabeceras(),
          signal: AbortSignal.timeout(8000),
        }).then(this.respuestaOk),
        fetch(`${this.apiUrl}/admin/revisions`, {
          headers: this.cabeceras(),
          signal: AbortSignal.timeout(8000),
        }).then(this.respuestaOk),
      ]);
      const datos = signos as {
        signs: Omit<SignoAdmin, "conAvatar" | "reconocibleEnCatalogo">[];
      };
      this.signos.set(
        datos.signs.map((signo) => {
          const entrada = findById(signo.id);
          return {
            ...signo,
            conAvatar: !!(entrada?.animacionUrl || entrada?.avatarUrl),
            reconocibleEnCatalogo: entrada?.reconocible ?? false,
          };
        }),
      );
      this.listaRevisiones.set(
        (revisiones as { revisions: RevisionGuardada[] }).revisions ?? [],
      );
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : "Error de validación.",
      );
    } finally {
      this.cargando.set(false);
    }
  }

  async guardarRevision(id: string, revision: Revision): Promise<boolean> {
    this.error.set("");
    this.aviso.set("");
    this.guardandoRevision.set(id);
    try {
      const response = await fetch(`${this.apiUrl}/admin/revisions/${id}`, {
        method: "POST",
        headers: this.cabeceras(true),
        body: JSON.stringify(revision),
        signal: AbortSignal.timeout(8000),
      });
      const data = (await this.respuestaOk(response)) as {
        revision: RevisionGuardada;
      };
      this.listaRevisiones.update((actuales) => [
        data.revision,
        ...actuales,
      ]);
      this.aviso.set("Validación guardada.");
      return true;
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : "No se pudo guardar.",
      );
      return false;
    } finally {
      this.guardandoRevision.set(null);
    }
  }

  /** Registros de una seña, del más reciente al más antiguo. */
  revisionesDe(id: string): RevisionGuardada[] {
    return this.listaRevisiones().filter(
      (revision) => revision.signId === id,
    );
  }

  conteoRevisiones(id: string): number {
    return this.revisionesDe(id).length;
  }

  revisionDe(id: string): Revision {
    return (
      this.revisionesDe(id)[0] ?? {
        veredicto: "sin-revisar" as Veredicto,
        notas: "",
        validador: "",
        fecha: "",
      }
    );
  }

  private async respuestaOk(response: Response): Promise<unknown> {
    if (response.ok) return response.json();
    let mensaje = "No se pudo completar la petición.";
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) mensaje = body.error;
    } catch {
      // Se conserva el mensaje genérico.
    }
    throw new Error(mensaje);
  }
}
