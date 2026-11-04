import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { findById, matchSpanishText } from "../adapters";
import { AdminService, type Veredicto } from "../servicios/admin";
import { IntencionService } from "../servicios/intencion";
import { AvatarLsc } from "../avatar-lsc/avatar-lsc";

export const ETIQUETAS_VEREDICTO: Record<Veredicto, string> = {
  "sin-revisar": "Sin revisar",
  "se-entiende": "Se entiende",
  corregir: "Hay que corregir",
  "no-valida": "No es válida",
};

interface FilaIntencion {
  frase: string;
  local: string;
  meta: string;
  confianza: number | null;
  latenciaMs: number | null;
}

const FRASES_PRUEBA = [
  "buenas, ¿qué tal?",
  "todo salió muy bien",
  "perdona, ¿me esperas un momento?",
  "muchísimas gracias por tu ayuda",
  "quiero una pizza",
  "¿dónde queda el baño?",
  "estoy muy mal",
  "nos vemos mañana",
  "perdón, fue mi culpa",
  "bienvenidos a nuestra oficina",
  "¿puedo sentarme?",
  "te invito a un café",
  "¿cuánto cuesta esto?",
  "estoy más o menos",
  "con permiso, voy a pasar",
  "de nada, con gusto",
].join("\n");

export type PestanaAdmin = "senas" | "registros" | "intencion";

@Component({
  selector: "app-admin",
  imports: [FormsModule, AvatarLsc],
  templateUrl: "./admin.html",
  styleUrl: "./admin.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Admin {
  protected readonly admin = inject(AdminService);
  protected readonly intencion = inject(IntencionService);

  protected readonly pestana = signal<PestanaAdmin>("senas");
  protected readonly filtro = signal("todas");
  protected readonly busqueda = signal("");
  protected readonly seleccionada = signal<string | null>(null);
  protected readonly veredictos = signal<Record<string, Veredicto>>({});
  protected readonly notas = signal<Record<string, string>>({});
  protected readonly validador = signal(
    (() => {
      try {
        return globalThis.localStorage?.getItem("dalo-validador") ?? "";
      } catch {
        return "";
      }
    })(),
  );
  protected readonly filtroRegistro = signal("todos");
  protected readonly busquedaRegistro = signal("");
  protected readonly fraseUnica = signal("");
  protected readonly frasesLote = signal(FRASES_PRUEBA);
  protected readonly filas = signal<FilaIntencion[]>([]);
  protected readonly probandoLote = signal(false);

  protected readonly signosFiltrados = computed(() => {
    const filtro = this.filtro();
    const consulta = this.busqueda().trim().toLowerCase();
    return this.admin.signos().filter((signo) => {
      if (filtro === "activas" && !signo.activa) return false;
      if (filtro === "candidatas" && signo.activa) return false;
      if (
        filtro === "sin-revisar" &&
        this.admin.revisionDe(signo.id).veredicto !== "sin-revisar"
      )
        return false;
      if (
        consulta &&
        !`${signo.nombre} ${signo.id}`.toLowerCase().includes(consulta)
      )
        return false;
      return true;
    });
  });
  protected readonly signoSeleccionado = computed(() => {
    const id =
      this.seleccionada() ?? this.signosFiltrados()[0]?.id ?? null;
    return this.admin.signos().find((signo) => signo.id === id) ?? null;
  });
  protected readonly registrosFiltrados = computed(() => {
    const filtro = this.filtroRegistro();
    const consulta = this.busquedaRegistro().trim().toLowerCase();
    return this.admin.listaRevisiones().filter((revision) => {
      if (filtro !== "todos" && revision.veredicto !== filtro) return false;
      if (!consulta) return true;
      const nombre =
        this.admin.signos().find((s) => s.id === revision.signId)?.nombre ??
        revision.signId;
      return `${nombre} ${revision.signId} ${revision.validador} ${revision.notas}`
        .toLowerCase()
        .includes(consulta);
    });
  });
  protected readonly conteoVeredicto = computed(() => {
    const conteo: Record<string, number> = {};
    for (const revision of this.admin.listaRevisiones())
      conteo[revision.veredicto] = (conteo[revision.veredicto] ?? 0) + 1;
    return conteo;
  });
  protected readonly activas = computed(
    () => this.admin.signos().filter((signo) => signo.activa).length,
  );
  protected readonly conAvatar = computed(
    () => this.admin.signos().filter((signo) => signo.conAvatar).length,
  );

  constructor() {
    void this.admin.cargar();
  }

  protected elegir(id: string): void {
    this.seleccionada.set(id);
  }

  protected irAPestana(pestana: PestanaAdmin): void {
    this.pestana.set(pestana);
  }

  protected veredictoDe(id: string): Veredicto {
    // Cada registro nuevo parte sin elegir: no hereda el veredicto anterior.
    return this.veredictos()[id] ?? "sin-revisar";
  }

  protected etiquetaVeredicto(veredicto: Veredicto): string {
    return ETIQUETAS_VEREDICTO[veredicto] ?? veredicto;
  }

  protected entradaCatalogo(id: string) {
    return findById(id);
  }

  protected guardarValidador(nombre: string): void {
    this.validador.set(nombre);
    try {
      globalThis.localStorage?.setItem("dalo-validador", nombre);
    } catch {
      // Sin almacenamiento local, el nombre vive en la sesión de la página.
    }
  }

  protected puedeGuardarRevision(id: string): boolean {
    return (
      this.validador().trim().length > 0 &&
      this.veredictoDe(id) !== "sin-revisar" &&
      this.admin.guardandoRevision() !== id
    );
  }

  protected elegirVeredicto(id: string, evento: Event): void {
    const valor = (evento.target as HTMLSelectElement).value as Veredicto;
    this.veredictos.update((actuales) => ({ ...actuales, [id]: valor }));
  }

  protected notaDe(id: string): string {
    return this.notas()[id] ?? "";
  }

  protected editarNota(id: string, evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;
    this.notas.update((actuales) => ({ ...actuales, [id]: valor }));
  }

  protected async guardarRevision(id: string): Promise<void> {
    if (!this.puedeGuardarRevision(id)) return;
    const ok = await this.admin.guardarRevision(id, {
      veredicto: this.veredictoDe(id),
      notas: this.notaDe(id),
      validador: this.validador().trim(),
      fecha: "",
    });
    if (ok) {
      // El formulario queda listo para validar la siguiente seña.
      this.veredictos.update((actuales) => {
        const copia = { ...actuales };
        delete copia[id];
        return copia;
      });
      this.notas.update((actuales) => {
        const copia = { ...actuales };
        delete copia[id];
        return copia;
      });
    }
  }

  protected nombreSena(id: string): string {
    return (
      this.admin.signos().find((signo) => signo.id === id)?.nombre ??
      findById(id)?.nombre ??
      id
    );
  }

  protected verSena(id: string): void {
    this.seleccionada.set(id);
    this.irAPestana("senas");
  }

  protected nombreCatalogo(id: string | null): string {
    if (!id) return "fuera del catálogo";
    return findById(id)?.nombre ?? id;
  }

  private resultadoLocal(frase: string): string {
    const resultado = matchSpanishText(frase);
    if (resultado.kind === "directa")
      return this.nombreCatalogo(resultado.id);
    if (resultado.kind === "ambigua")
      return `ambigua (${resultado.ids.map((id) => this.nombreCatalogo(id)).join(", ")})`;
    if (resultado.kind === "fuera") return "fuera del catálogo";
    return "—";
  }

  protected async probarUnica(): Promise<void> {
    const frase = this.fraseUnica().trim();
    if (!frase) return;
    const resultado = await this.intencion.interpretar(frase);
    if (resultado)
      this.filas.set([
        {
          frase,
          local: this.resultadoLocal(frase),
          meta: this.nombreCatalogo(resultado.id),
          confianza: resultado.confianza,
          latenciaMs: resultado.latencyMs,
        },
      ]);
  }

  protected async probarLote(): Promise<void> {
    const frases = this.frasesLote()
      .split("\n")
      .map((frase) => frase.trim())
      .filter(Boolean)
      .slice(0, 30);
    if (!frases.length) return;
    this.probandoLote.set(true);
    const filas: FilaIntencion[] = [];
    try {
      for (const frase of frases) {
        const resultado = await this.intencion.interpretar(frase);
        filas.push({
          frase,
          local: this.resultadoLocal(frase),
          meta: resultado
            ? this.nombreCatalogo(resultado.id)
            : "sin respuesta",
          confianza: resultado?.confianza ?? null,
          latenciaMs: resultado?.latencyMs ?? null,
        });
        this.filas.set([...filas]);
      }
    } finally {
      this.probandoLote.set(false);
    }
  }

}
