import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { LucideAngularModule } from 'lucide-angular';
import { findById, normalizeSpanish } from '../adapters';
import { AvatarLsc } from '../avatar-lsc/avatar-lsc';
import { AvatarVivo } from '../avatar-vivo/avatar-vivo';
import { DALO_CATALOG } from '../catalog';
import { DaloService } from '../servicios/dalo';
import { ModeloReconocimientoService } from '../servicios/modelo-reconocimiento';
import { SeguimientoService } from '../servicios/seguimiento';

interface ReconocimientoActivo {
  stop(): void;
}

type ConstructorReconocimiento = new () => {
  lang: string;
  interimResults: boolean;
  onresult: ((evento: { results: Array<Array<{ transcript: string }>> }) => void) | null;
  onerror: ((evento: unknown) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

@Component({
  selector: 'app-comunicador',
  imports: [ReactiveFormsModule, LucideAngularModule, AvatarLsc, AvatarVivo],
  templateUrl: './comunicador.html',
  styleUrl: './comunicador.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Comunicador implements OnDestroy {
  protected readonly dalo = inject(DaloService);
  protected readonly seguimiento = inject(SeguimientoService);
  protected readonly modelo = inject(ModeloReconocimientoService);
  protected readonly texto = new FormControl('', { nonNullable: true });
  protected readonly catalogo = DALO_CATALOG;
  protected readonly textoEscrito = toSignal(this.texto.valueChanges, { initialValue: this.texto.value });
  protected readonly sugerencias = computed(() => {
    const consulta = normalizeSpanish(this.textoEscrito());
    if (!consulta) return [
      { id: 'hola', nombre: 'Hola' },
      { id: 'gracias', nombre: 'Gracias' },
      { id: 'ayuda', nombre: 'Ayudar' },
    ];
    return this.catalogo.filter((entrada) =>
      [entrada.nombre, ...entrada.formulaciones]
        .some((formulacion) => normalizeSpanish(formulacion).includes(consulta)),
    );
  });
  protected readonly expresionesReconocibles = computed(() => {
    const clases = this.modelo.metadatos()?.clases ?? [];
    const ids = clases.length
      ? clases.filter((c) => c !== 'otra')
      : DALO_CATALOG.filter((e) => e.reconocible).map((e) => e.id);
    return ids.map((id) => findById(id)?.nombre ?? id).join(', ');
  });
  protected readonly escuchando = signal(false);
  protected readonly avisoMicrofono = signal('');
  protected readonly avisoVoz = signal('');
  /** Vista de la captura en Señas → Español: cámara con puntos o avatar en vivo. */
  protected readonly vistaLsc = signal<'camara' | 'avatar'>('camara');
  /** Qué capas muestra la cámara: video, video + esqueleto o solo esqueleto. */
  protected readonly modoCamara = signal<'video' | 'mixto' | 'esqueleto'>('mixto');
  protected readonly indicacionCamara = computed(() => {
    if (!this.dalo.deteccionAutomatica()) return 'Detección en pausa.';
    if (this.seguimiento.estadoModelo() === 'cargando' || this.modelo.cargando()) return 'Preparando la cámara…';
    if (!this.dalo.modeloListo() && this.modelo.errorCarga()) return 'Reconocimiento no disponible. Vuelve a cargar el modelo.';
    const manos = this.seguimiento.resumen();
    return manos.manoIzquierda + manos.manoDerecha === 0 ? 'Muestra tus manos frente a la cámara.' : 'Haz una seña.';
  });

  protected readonly entradaEsl = computed(() => {
    const id = this.dalo.resultadoEsl().id;
    return id ? findById(id) : null;
  });
  protected readonly opcionesAmbiguas = computed(() =>
    this.dalo.resultadoEsl().ids.flatMap((id) => (findById(id) ? [findById(id)!] : [])),
  );
  protected readonly textoEstadoCamara = computed(() => {
    switch (this.dalo.camara()) {
      case 'solicitando':
        return 'Solicitando acceso…';
      case 'permiso-denegado':
        return 'Cámara bloqueada por permiso';
      case 'no-disponible':
        return 'Cámara no disponible';
      case 'activa':
        return this.dalo.deteccionAutomatica()
          ? 'Detección automática activa'
          : 'Detección en pausa';
      default:
        return 'Activa la cámara para comenzar.';
    }
  });
  protected readonly textoAuto = computed(() => {
    if (this.dalo.camara() !== 'activa') return '';
    if (this.modelo.cargando()) return 'Cargando el modelo de reconocimiento…';
    if (this.modelo.errorCarga() && !this.dalo.modeloListo())
      return this.modelo.errorCarga();
    if (!this.dalo.deteccionAutomatica()) return 'Detección en pausa.';
    if (this.dalo.mensajeAuto()) return this.dalo.mensajeAuto();
    if (this.dalo.faseLsc() === 'reposo') return 'Haz una seña frente a la cámara; se identifica sola.';
    return '';
  });
  protected readonly textoSeguimiento = computed(() => {
    const estado = this.seguimiento.estadoModelo();
    if (estado === 'cargando') return 'Cargando seguimiento…';
    if (estado === 'error') return 'Seguimiento no disponible';
    if (estado === 'listo') {
      const r = this.seguimiento.resumen();
      if (!this.seguimiento.enVivo()) return 'Seguimiento listo';
      return `Rostro ${r.rostro} · Manos ${r.manoIzquierda}/${r.manoDerecha} · Cuerpo ${r.pose} · ${r.fps} fps`;
    }
    return 'Iniciando seguimiento…';
  });
  /** Fotograma en vivo para el avatar (puntos del cuerpo desde la cámara). */
  protected readonly fotogramaAvatar = computed(() => {
    const vivo = this.seguimiento.fotogramaEnVivo();
    if (!vivo) return null;
    return vivo;
  });

  private readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('vistaPrevia');
  private readonly lienzoRef = viewChild<ElementRef<HTMLCanvasElement>>('lienzo');
  private reconocimiento: ReconocimientoActivo | null = null;

  constructor() {
    effect(() => {
      this.dalo.enlazarVistaPrevia(this.videoRef()?.nativeElement ?? null);
    });
    effect(() => {
      const video = this.videoRef()?.nativeElement ?? null;
      const lienzo = this.lienzoRef()?.nativeElement ?? null;
      const estado = this.dalo.camara();
      if (estado === 'activa' && video && lienzo) {
        void this.seguimiento.iniciarSeguimiento(video, lienzo);
      } else {
        this.seguimiento.detenerSeguimiento();
      }
    });
    effect(() => {
      const sugerido = this.dalo.textoSugerido();
      if (!sugerido) return;
      this.texto.setValue(sugerido);
      this.dalo.tomarTextoSugerido();
      this.dalo.buscarEnLsc(sugerido);
    });
    // Detección automática: cada fotograma en vivo alimenta la ventana del
    // servicio; cuando hay una seña completa se propone sola, sin captura.
    effect(() => {
      const vivo = this.seguimiento.fotogramaEnVivo();
      if (this.dalo.camara() !== 'activa') return;
      // El estado del clasificador no representa un fotograma nuevo.
      untracked(() => this.dalo.alimentarFotograma(vivo));
    });
    void this.cargarModelo();
  }

  ngOnDestroy(): void {
    this.seguimiento.detenerSeguimiento();
    this.dalo.apagarCamara();
  }

  private async cargarModelo(): Promise<void> {
    try {
      const listo = await this.modelo.cargar();
      this.dalo.marcarModeloListo(listo);
    } catch {
      this.dalo.marcarModeloListo(false);
    }
  }

  protected reintentarReferencias(): void {
    void this.cargarModelo();
  }

  protected repetirCaptura(): void {
    this.seguimiento.limpiar();
    this.dalo.repetirCaptura();
  }

  protected apagarCamara(): void {
    this.seguimiento.detenerSeguimiento();
    this.seguimiento.limpiar();
    this.dalo.apagarCamara();
  }

  protected descargarVentana(): void {
    const ventana = this.dalo.exportarVentanaAuto();
    if (ventana.length === 0) return;
    const cuerpo = {
      generadoEn: new Date().toISOString(),
      modelo: 'holistic_landmarker',
      totalMuestras: ventana.length,
      muestras: ventana.map((f, i) => ({
        t: i,
        vt: i / 30,
        rostro: null,
        manoIzquierda: (f.manoIzquierdaMundo ?? []).map((p) =>
          p ? { x: p[0], y: p[1], z: p[2] } : null,
        ),
        manoDerecha: (f.manoDerechaMundo ?? []).map((p) =>
          p ? { x: p[0], y: p[1], z: p[2] } : null,
        ),
        pose: (f.poseMundo ?? []).map((p) => (p ? { x: p[0], y: p[1], z: p[2] } : null)),
      })),
    };
    const blob = new Blob([JSON.stringify(cuerpo, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    try {
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `dalo-automatico-${Date.now()}.json`;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  protected reintentarModelo(): void {
    this.seguimiento.reintentarModelo();
    const video = this.videoRef()?.nativeElement ?? null;
    const lienzo = this.lienzoRef()?.nativeElement ?? null;
    if (video && lienzo && this.dalo.camara() === 'activa') {
      void this.seguimiento.iniciarSeguimiento(video, lienzo);
    }
  }

  protected buscar(): void {
    this.dalo.buscarEnLsc(this.texto.value);
  }

  protected accesoRapido(id: string): void {
    const entrada = findById(id);
    if (!entrada) return;
    this.texto.setValue(entrada.formulaciones[0]);
    this.dalo.buscarEnLsc(entrada.formulaciones[0]);
  }

  protected usarMicrofono(): void {
    if (this.escuchando()) {
      this.reconocimiento?.stop();
      return;
    }
    const ctor = (window as unknown as { webkitSpeechRecognition?: ConstructorReconocimiento })
      .webkitSpeechRecognition;
    if (!ctor) {
      this.avisoMicrofono.set('Este navegador no ofrece dictado por voz. Escribe la expresión.');
      return;
    }
    this.avisoMicrofono.set('La voz se procesa en este equipo.');
    try {
      const reconocimiento = new ctor();
      reconocimiento.lang = 'es-CO';
      reconocimiento.interimResults = false;
      reconocimiento.onresult = (evento) => {
        const texto = evento.results[0]?.[0]?.transcript ?? '';
        if (texto) {
          this.texto.setValue(texto);
          this.dalo.buscarEnLsc(texto);
        }
      };
      reconocimiento.onerror = () => {
        this.avisoMicrofono.set('No se pudo captar la voz. Revisa el micrófono o escribe la expresión.');
        this.escuchando.set(false);
      };
      reconocimiento.onend = () => {
        this.reconocimiento = null;
        this.escuchando.set(false);
      };
      this.reconocimiento = reconocimiento;
      reconocimiento.start();
      this.escuchando.set(true);
    } catch {
      this.avisoMicrofono.set('No se pudo iniciar el micrófono en este navegador.');
      this.escuchando.set(false);
    }
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

  protected cambiarVistaLsc(modo: 'camara' | 'avatar'): void {
    this.vistaLsc.set(modo);
  }

  protected cambiarModoCamara(modo: 'video' | 'mixto' | 'esqueleto'): void {
    this.modoCamara.set(modo);
  }
}
