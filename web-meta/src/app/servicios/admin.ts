import { Injectable, computed, inject, signal } from "@angular/core";
import { API_URL } from "./api-url";
import { findById } from "../adapters";
import type { Ensayo } from "./meta";

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

export interface SesionEvaluacion {
  id: number;
  codigo: string;
  notas: string;
  createdAt: string;
  total: number;
  correctos: number;
}

export interface AnalisisEnsayos {
  total: number;
  correctos: number;
  porClase: { esperada: string; intentos: number; aciertos: number }[];
  confusion: { real: string; predicha: string; veces: number }[];
  rechazo: { correctos: number; intentos: number } | null;
  erroresConfianzaAlta: Ensayo[];
  latenciaMedianaMs: number | null;
}

/** Estadística de los ensayos descargados de la app (sin imágenes). */
export function analizarEnsayos(ensayos: Ensayo[]): AnalisisEnsayos {
  const etiquetados = ensayos.filter((ensayo) => ensayo.esperada);
  const porEsperada = new Map<string, { intentos: number; aciertos: number }>();
  const confusion = new Map<string, number>();
  for (const ensayo of etiquetados) {
    const fila =
      porEsperada.get(ensayo.esperada) ?? { intentos: 0, aciertos: 0 };
    fila.intentos += 1;
    if (ensayo.clase === ensayo.esperada) fila.aciertos += 1;
    porEsperada.set(ensayo.esperada, fila);
    if (ensayo.clase !== ensayo.esperada) {
      const clave = `${ensayo.esperada}→${ensayo.clase}`;
      confusion.set(clave, (confusion.get(clave) ?? 0) + 1);
    }
  }
  const otra = etiquetados.filter((ensayo) => ensayo.esperada === "otra");
  const latencias = etiquetados
    .map((ensayo) => ensayo.latencyMs)
    .sort((a, b) => a - b);
  return {
    total: etiquetados.length,
    correctos: etiquetados.filter(
      (ensayo) => ensayo.clase === ensayo.esperada,
    ).length,
    porClase: [...porEsperada.entries()]
      .map(([esperada, fila]) => ({ esperada, ...fila }))
      .sort((a, b) => a.esperada.localeCompare(b.esperada)),
    confusion: [...confusion.entries()]
      .map(([clave, veces]) => {
        const [real, predicha] = clave.split("→");
        return { real, predicha, veces };
      })
      .sort((a, b) => b.veces - a.veces),
    rechazo: otra.length
      ? {
          correctos: otra.filter((ensayo) => ensayo.clase === "otra").length,
          intentos: otra.length,
        }
      : null,
    erroresConfianzaAlta: etiquetados.filter(
      (ensayo) => ensayo.clase !== ensayo.esperada && ensayo.confianza >= 0.8,
    ),
    latenciaMedianaMs: latencias.length
      ? latencias[Math.floor(latencias.length / 2)]
      : null,
  };
}

/**
 * Validación local: definiciones de señas del backend, registro de
 * validación y sesiones de evaluación en SQLite, y análisis de ensayos.
 */
@Injectable({ providedIn: "root" })
export class AdminService {
  private readonly apiUrl = inject(API_URL);
  readonly signos = signal<SignoAdmin[]>([]);
  readonly cargando = signal(false);
  readonly guardando = signal<string | null>(null);
  readonly error = signal("");
  readonly aviso = signal("");
  readonly tokenRequired = signal(false);
  readonly restartRequired = signal(false);
  readonly token = signal(
    (() => {
      try {
        return globalThis.sessionStorage?.getItem(CLAVE_TOKEN) ?? "";
      } catch {
        return "";
      }
    })(),
  );
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
  readonly sesiones = signal<SesionEvaluacion[]>([]);
  readonly cargandoSesiones = signal(false);

  private cabeceras(incluirJson = false): Record<string, string> {
    const cabeceras: Record<string, string> = {};
    const token = this.token();
    if (token) cabeceras["x-admin-token"] = token;
    if (incluirJson) cabeceras["Content-Type"] = "application/json";
    return cabeceras;
  }

  guardarToken(token: string): void {
    this.token.set(token);
    try {
      globalThis.sessionStorage?.setItem(CLAVE_TOKEN, token);
    } catch {
      // Sin almacenamiento de sesión, el token vive en memoria.
    }
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
        tokenRequired: boolean;
        signs: Omit<SignoAdmin, "conAvatar" | "reconocibleEnCatalogo">[];
      };
      this.tokenRequired.set(datos.tokenRequired);
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

  async guardarSigno(
    id: string,
    patch: { descripcion?: string; activa?: boolean },
  ): Promise<void> {
    this.guardando.set(id);
    this.aviso.set("");
    this.error.set("");
    try {
      const response = await fetch(`${this.apiUrl}/admin/signs/${id}`, {
        method: "PATCH",
        headers: this.cabeceras(true),
        body: JSON.stringify(patch),
        signal: AbortSignal.timeout(8000),
      });
      const data = (await this.respuestaOk(response)) as {
        changed?: boolean;
        restartRequired?: boolean;
        error?: string;
      };
      if (data?.restartRequired) this.restartRequired.set(true);
      this.aviso.set(
        data?.changed
          ? "Cambios guardados en el archivo de la seña. Reinicia el backend para aplicarlos al reconocimiento."
          : "Sin cambios que guardar.",
      );
      await this.cargar();
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : "No se pudo guardar.",
      );
    } finally {
      this.guardando.set(null);
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
      this.aviso.set(
        `Validación de ${revision.validador.trim()} guardada. Ya puedes verla en Registros.`,
      );
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

  async borrarRevision(idRegistro: number): Promise<void> {
    this.error.set("");
    try {
      const response = await fetch(
        `${this.apiUrl}/admin/revisions/${idRegistro}`,
        {
          method: "DELETE",
          headers: this.cabeceras(),
          signal: AbortSignal.timeout(8000),
        },
      );
      await this.respuestaOk(response);
      this.listaRevisiones.update((actuales) =>
        actuales.filter((revision) => revision.id !== idRegistro),
      );
      this.aviso.set("Registro borrado.");
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : "No se pudo borrar.",
      );
    }
  }

  exportarRevisiones(): string {
    return JSON.stringify({ revisiones: this.listaRevisiones() }, null, 2);
  }

  async importarRevisiones(texto: string): Promise<boolean> {
    let revisiones: unknown;
    try {
      const datos = JSON.parse(texto) as
        | Record<string, Revision>
        | { revisiones: unknown };
      if (!datos || typeof datos !== "object") return false;
      // Formato actual {revisiones:[...]}, histórico {id:{...}} o mapa suelto.
      revisiones =
        "revisiones" in datos ? datos.revisiones : datos;
      if (!revisiones || typeof revisiones !== "object") return false;
    } catch {
      return false;
    }
    this.error.set("");
    try {
      const response = await fetch(
        `${this.apiUrl}/admin/revisions/import`,
        {
          method: "POST",
          headers: this.cabeceras(true),
          body: JSON.stringify({ revisiones }),
          signal: AbortSignal.timeout(8000),
        },
      );
      await this.respuestaOk(response);
      await this.cargar();
      this.aviso.set("Revisiones importadas a la base de validación.");
      return true;
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : "No se pudo importar.",
      );
      return false;
    }
  }

  async cargarSesiones(): Promise<void> {
    this.cargandoSesiones.set(true);
    try {
      const response = await fetch(`${this.apiUrl}/admin/eval-sessions`, {
        headers: this.cabeceras(),
        signal: AbortSignal.timeout(8000),
      });
      const data = (await this.respuestaOk(response)) as {
        sessions: SesionEvaluacion[];
      };
      this.sesiones.set(data.sessions);
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : "No se pudo cargar.",
      );
    } finally {
      this.cargandoSesiones.set(false);
    }
  }

  async crearSesion(
    codigo: string,
    notas: string,
    ensayos: Ensayo[],
  ): Promise<boolean> {
    this.error.set("");
    try {
      const response = await fetch(`${this.apiUrl}/admin/eval-sessions`, {
        method: "POST",
        headers: this.cabeceras(true),
        body: JSON.stringify({ codigo, notas, ensayos }),
        signal: AbortSignal.timeout(15000),
      });
      await this.respuestaOk(response);
      await this.cargarSesiones();
      this.aviso.set(`Sesión ${codigo} guardada en la base de validación.`);
      return true;
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : "No se pudo guardar.",
      );
      return false;
    }
  }

  async ensayosDeSesion(id: number): Promise<Ensayo[]> {
    const response = await fetch(
      `${this.apiUrl}/admin/eval-sessions/${id}/trials`,
      {
        headers: this.cabeceras(),
        signal: AbortSignal.timeout(15000),
      },
    );
    const data = (await this.respuestaOk(response)) as { trials: Ensayo[] };
    return data.trials;
  }

  async borrarSesion(id: number): Promise<void> {
    this.error.set("");
    try {
      const response = await fetch(
        `${this.apiUrl}/admin/eval-sessions/${id}`,
        {
          method: "DELETE",
          headers: this.cabeceras(),
          signal: AbortSignal.timeout(8000),
        },
      );
      await this.respuestaOk(response);
      await this.cargarSesiones();
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : "No se pudo borrar.",
      );
    }
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
    if (response.status === 401)
      mensaje = "Token de validación incorrecto.";
    throw new Error(mensaje);
  }
}

const CLAVE_TOKEN = "dalo-admin-token";
