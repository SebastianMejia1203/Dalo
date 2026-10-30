import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { toSignal } from "@angular/core/rxjs-interop";
import { LucideAngularModule } from "lucide-angular";
import { findById, normalizeSpanish } from "../adapters";
import { AvatarLsc } from "../avatar-lsc/avatar-lsc";
import { MetaService } from "../servicios/meta";
import { DALO_CATALOG } from "../catalog";
import { DaloService } from "../servicios/dalo";
import { VozMeta } from "../servicios/voz-meta";

@Component({
  selector: "app-comunicador",
  imports: [ReactiveFormsModule, LucideAngularModule, AvatarLsc],
  templateUrl: "./comunicador.html",
  styleUrl: "./comunicador.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Comunicador implements OnDestroy {
  protected readonly dalo = inject(DaloService);
  protected readonly meta = inject(MetaService);
  protected readonly voz = inject(VozMeta);
  protected readonly texto = new FormControl("", { nonNullable: true });
  protected readonly catalogo = DALO_CATALOG;
  protected readonly textoEscrito = toSignal(this.texto.valueChanges, {
    initialValue: this.texto.value,
  });
  protected readonly sugerencias = computed(() => {
    const consulta = normalizeSpanish(this.textoEscrito());
    if (!consulta)
      return [
        { id: "hola", nombre: "Hola" },
        { id: "gracias", nombre: "Gracias" },
        { id: "ayuda", nombre: "Ayudar" },
      ];
    return this.catalogo.filter((entrada) =>
      [entrada.nombre, ...entrada.formulaciones].some((formulacion) =>
        normalizeSpanish(formulacion).includes(consulta),
      ),
    );
  });
  protected readonly avisoVoz = signal("");
  protected readonly esperada = new FormControl("", { nonNullable: true });
  protected readonly clases = computed(() => [
    ...(
      this.meta.contexto()?.catalog ??
      this.catalogo.filter((entrada) => entrada.reconocible)
    ).map((entrada) => entrada.id),
    "otra",
  ]);
  protected readonly entradaEsl = computed(() => {
    const id = this.dalo.resultadoEsl().id;
    return id ? findById(id) : null;
  });
  protected readonly opcionesAmbiguas = computed(() =>
    this.dalo
      .resultadoEsl()
      .ids.flatMap((id) => (findById(id) ? [findById(id)!] : [])),
  );
  private readonly videoRef =
    viewChild<ElementRef<HTMLVideoElement>>("vistaPrevia");
  constructor() {
    effect(() =>
      this.dalo.enlazarVistaPrevia(this.videoRef()?.nativeElement ?? null),
    );
    effect(() => {
      const texto = this.dalo.textoSugerido();
      if (texto) {
        this.texto.setValue(texto);
        this.dalo.tomarTextoSugerido();
        this.dalo.buscarEnLsc(texto);
      }
    });
    void this.meta.comprobar();
    void this.meta.cargarContexto();
    effect(() => {
      const texto = this.voz.texto();
      if (texto) {
        this.texto.setValue(texto);
        this.dalo.buscarEnLsc(texto);
      }
    });
  }
  ngOnDestroy(): void {
    this.voz.cancelar();
    this.meta.cancelar();
    this.dalo.apagarCamara();
  }
  protected async capturar(): Promise<void> {
    const video = this.videoRef()?.nativeElement;
    if (!video) return;
    this.dalo.repetirCaptura();
    const resultado = await this.meta.capturar(video, this.esperada.value);
    if (!resultado) return;
    this.dalo.candidataId.set(
      resultado.clase === "otra" ? null : resultado.clase,
    );
    this.dalo.faseLsc.set(
      resultado.clase === "otra" ? "desconocida" : "candidata",
    );
  }
  protected repetirCaptura(): void {
    this.dalo.repetirCaptura();
    this.meta.resultado.set(null);
  }
  protected apagarCamara(): void {
    this.meta.cancelar();
    this.dalo.apagarCamara();
  }
  protected cambiarDireccion(direccion: "lsc-es" | "es-lsc"): void {
    this.voz.cancelar();
    this.apagarCamara();
    this.dalo.cambiarDireccion(direccion);
  }
  protected buscarTexto(evento: Event): void {
    this.dalo.buscarEnLsc((evento.target as HTMLTextAreaElement).value);
  }
  protected usarMicrofono(): void {
    if (this.voz.estado() === "grabando") void this.voz.finalizar();
    else void this.voz.iniciar(this.dalo.ajustes().microfonoId);
  }

  protected accesoRapido(id: string): void {
    const entrada = findById(id);
    if (!entrada) return;
    this.texto.setValue(entrada.formulaciones[0]);
    this.dalo.buscarEnLsc(entrada.formulaciones[0]);
  }

  protected copiarConfirmado(): void {
    const texto = this.dalo.significadoConfirmado();
    if (texto) void this.dalo.copiarTexto(texto);
  }

  protected escucharConfirmado(): void {
    const texto = this.dalo.significadoConfirmado();
    if (texto) this.avisoVoz.set(this.dalo.hablar(texto));
  }

  protected cambiarVelocidad(video: HTMLVideoElement, evento: Event): void {
    const selector = evento.target as HTMLSelectElement | null;
    if (selector) video.playbackRate = Number(selector.value);
  }
}
