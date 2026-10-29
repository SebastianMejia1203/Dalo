import { Injectable, computed, signal } from '@angular/core';
import { FilesetResolver, HolisticLandmarker } from '@mediapipe/tasks-vision';

/** Punto normalizado (0..1) devuelto por el modelo. */
export interface Punto {
  x: number;
  y: number;
  z: number;
  visibility?: number;
  presence?: number;
}

/** Una muestra temporal de la captura: puntos + marcas de tiempo. */
export interface Muestra {
  /** Marca temporal de pared (ms desde época) para inspección. */
  t: number;
  /** Tiempo del video (s) cuando se detectó. */
  vt: number;
  rostro: Punto[] | null;
  manoIzquierda: Punto[] | null;
  manoDerecha: Punto[] | null;
  pose: Punto[] | null;
}

/** Fotograma en vivo para mover el avatar (tuplas compatibles con PuntoAvatar). */
export interface FotogramaVivo {
  aspecto?: number;
  pose: ([number, number, number] | null)[];
  manoIzquierda: ([number, number, number] | null)[] | null;
  manoDerecha: ([number, number, number] | null)[] | null;
  /** Landmarks mundiales (metros) sin filtrar: entrada del modelo entrenado. */
  poseMundo?: ([number, number, number] | null)[];
  manoIzquierdaMundo?: ([number, number, number] | null)[] | null;
  manoDerechaMundo?: ([number, number, number] | null)[] | null;
}

export type EstadoModelo = 'inactivo' | 'cargando' | 'listo' | 'error';

export interface ResumenSeguimiento {
  rostro: number;
  manoIzquierda: number;
  manoDerecha: number;
  pose: number;
  fps: number;
}

const URL_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm';
const URL_MODELO =
  'https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/latest/holistic_landmarker.task';

export const BORDES_MANO: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export const BORDES_POSE: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10],
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [24, 26], [25, 27], [26, 28], [27, 29], [28, 30],
  [29, 31], [30, 32],
];

function aPuntos(valor: unknown, confianzaPose = false): Punto[] | null {
  if (!Array.isArray(valor)) return null;
  if (valor.length === 0) return null;
  const primero = valor[0] as unknown;
  const lista = Array.isArray(primero) ? (primero as unknown[]) : valor;
  const puntos: Punto[] = [];
  for (const item of lista) {
    // Conserva el índice anatómico aunque una entrada no sea válida.
    if (typeof item !== 'object' || item === null) {
      puntos.push({ x: 0, y: 0, z: 0, visibility: 0 });
      continue;
    }
    const rec = item as Record<string, unknown>;
    const x = rec['x'];
    const y = rec['y'];
    if (typeof x !== 'number' || typeof y !== 'number') {
      puntos.push({ x: 0, y: 0, z: 0, visibility: 0 });
      continue;
    }
    const z = rec['z'];
    const visibility = rec['visibility'];
    const presence = rec['presence'];
    puntos.push({
      x,
      y,
      z: typeof z === 'number' ? z : 0,
      // Solo pose aporta confianza por articulación; manos/rostro pueden
      // traer cero como valor por defecto cuando el modelo omite el campo.
      ...(confianzaPose && typeof visibility === 'number' ? { visibility } : {}),
      ...(confianzaPose && typeof presence === 'number' ? { presence } : {}),
    });
  }
  return puntos.length > 0 ? puntos : null;
}

function puntoFiable(p: Punto): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)
    && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1
    && (p.visibility === undefined || p.visibility >= 0.65)
    && (p.presence === undefined || p.presence >= 0.65);
}

/** Filtro temporal adaptativo: amortigua ruido pequeño y responde al movimiento. */
class FiltroPuntos {
  private anterior: Punto[] | null = null;
  private tiempo = 0;

  aplicar(puntos: Punto[] | null, tiempo: number): Punto[] | null {
    const dt = tiempo - this.tiempo;
    const anterior = dt > 0 && dt < 0.25 ? this.anterior : null;
    this.tiempo = tiempo;
    this.anterior = puntos?.map((p, i) => {
      if (!puntoFiable(p)) return { x: 0, y: 0, z: 0, visibility: 0 };
      const previo = anterior?.[i];
      if (!previo || !puntoFiable(previo)) return { ...p };
      const distancia = Math.hypot(p.x - previo.x, p.y - previo.y, p.z - previo.z);
      // No acumula desplazamientos subpíxel estando en reposo.
      if (distancia < 0.003) return { ...previo, visibility: p.visibility, presence: p.presence };
      const frecuencia = 1.5 + 35 * distancia;
      const alpha = 1 - Math.exp(-2 * Math.PI * frecuencia * dt);
      return {
        ...p,
        x: previo.x + alpha * (p.x - previo.x),
        y: previo.y + alpha * (p.y - previo.y),
        z: previo.z + alpha * (p.z - previo.z),
      };
    }) ?? null;
    return this.anterior;
  }
}

function aTuplas(puntos: Punto[] | null): ([number, number, number] | null)[] | null {
  if (!puntos) return null;
  return puntos.map((p) => puntoFiable(p) ? [p.x, p.y, p.z] : null);
}

/** Mundiales: solo se exige finitud; las coordenadas son metros y salen del rango 0..1. */
function aTuplasMundo(puntos: Punto[] | null): ([number, number, number] | null)[] | null {
  if (!puntos) return null;
  return puntos.map((p) =>
    Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) ? [p.x, p.y, p.z] : null,
  );
}

/** Seguimiento corporal en vivo con Holistic Landmarker (manos, pose y rostro). */
@Injectable({ providedIn: 'root' })
export class SeguimientoService {
  readonly estadoModelo = signal<EstadoModelo>('inactivo');
  readonly mensajeModelo = signal('');
  readonly enVivo = signal(false);
  readonly capturando = signal(false);
  readonly muestras = signal<Muestra[]>([]);
  readonly resumen = signal<ResumenSeguimiento>({ rostro: 0, manoIzquierda: 0, manoDerecha: 0, pose: 0, fps: 0 });
  /** Último fotograma en vivo (para mover el avatar sin descargar JSON). */
  readonly fotogramaEnVivo = signal<FotogramaVivo | null>(null);

  readonly totalMuestras = computed(() => this.muestras().length);

  private landmarker: HolisticLandmarker | null = null;
  private cargaEnCurso: Promise<void> | null = null;
  private rafId = 0;
  private video: HTMLVideoElement | null = null;
  private lienzo: HTMLCanvasElement | null = null;
  private ultimoTiempoVideo = -1;
  private cuadros = 0;
  private marcaFps = 0;
  private inicioCapturaMs = 0;
  private filtros = this.crearFiltros();

  private crearFiltros(): Record<'rostro' | 'pose' | 'izquierda' | 'derecha', FiltroPuntos> {
    return { rostro: new FiltroPuntos(), pose: new FiltroPuntos(), izquierda: new FiltroPuntos(), derecha: new FiltroPuntos() };
  }

  async asegurarModelo(): Promise<boolean> {
    if (this.landmarker) return true;
    if (this.cargaEnCurso) {
      await this.cargaEnCurso;
      return this.landmarker !== null;
    }
    this.estadoModelo.set('cargando');
    this.mensajeModelo.set('Cargando modelo de seguimiento…');
    this.cargaEnCurso = (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(URL_WASM);
        this.landmarker = await HolisticLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: URL_MODELO, delegate: 'GPU' },
          runningMode: 'VIDEO',
        });
        this.estadoModelo.set('listo');
        this.mensajeModelo.set('');
      } catch {
        this.landmarker = null;
        this.estadoModelo.set('error');
        this.mensajeModelo.set(
          'No se pudo cargar el modelo de seguimiento. Revisa tu conexión y pulsa «Reintentar».',
        );
      } finally {
        this.cargaEnCurso = null;
      }
    })();
    await this.cargaEnCurso;
    return this.landmarker !== null;
  }

  reintentarModelo(): void {
    this.estadoModelo.set('inactivo');
    this.mensajeModelo.set('');
    void this.asegurarModelo();
  }

  async iniciarSeguimiento(video: HTMLVideoElement, lienzo: HTMLCanvasElement): Promise<void> {
    this.video = video;
    this.lienzo = lienzo;
    const ok = await this.asegurarModelo();
    if (!ok || !this.landmarker) return;
    this.detenerBucle();
    this.enVivo.set(true);
    this.ultimoTiempoVideo = -1;
    this.filtros = this.crearFiltros();
    this.cuadros = 0;
    this.marcaFps = performance.now();
    const paso = (): void => {
      this.rafId = requestAnimationFrame(paso);
      this.procesarCuadro();
    };
    this.rafId = requestAnimationFrame(paso);
  }

  detenerSeguimiento(): void {
    this.detenerBucle();
    this.enVivo.set(false);
    this.capturando.set(false);
    this.fotogramaEnVivo.set(null);
    this.filtros = this.crearFiltros();
    const lienzo = this.lienzo;
    if (lienzo) {
      const ctx = lienzo.getContext('2d');
      ctx?.clearRect(0, 0, lienzo.width, lienzo.height);
    }
    this.video = null;
    this.lienzo = null;
  }

  iniciarCaptura(): void {
    this.muestras.set([]);
    this.inicioCapturaMs = Date.now();
    this.capturando.set(true);
  }

  detenerCaptura(): void {
    this.capturando.set(false);
  }

  limpiar(): void {
    this.muestras.set([]);
    this.capturando.set(false);
  }

  descargarJson(): void {
    const datos = this.muestras();
    const cuerpo = {
      generadoEn: new Date(this.inicioCapturaMs || Date.now()).toISOString(),
      modelo: 'holistic_landmarker',
      modeloUrl: URL_MODELO,
      totalMuestras: datos.length,
      muestras: datos,
    };
    const texto = JSON.stringify(cuerpo, null, 2);
    const blob = new Blob([texto], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    try {
      const enlace = document.createElement('a');
      const fecha = new Date().toISOString().replace(/[:.]/g, '-');
      enlace.href = url;
      enlace.download = `dalo-seguimiento-${fecha}.json`;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  private detenerBucle(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private procesarCuadro(): void {
    const video = this.video;
    const lienzo = this.lienzo;
    const modelo = this.landmarker;
    if (!video || !lienzo || !modelo) return;
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return;
    if (lienzo.width !== video.videoWidth || lienzo.height !== video.videoHeight) {
      lienzo.width = video.videoWidth;
      lienzo.height = video.videoHeight;
    }
    if (video.currentTime === this.ultimoTiempoVideo) {
      return;
    }
    this.ultimoTiempoVideo = video.currentTime;
    let resultado: unknown = null;
    try {
      resultado = modelo.detectForVideo(video, performance.now());
    } catch {
      return;
    }
    const rec = (resultado ?? {}) as Record<string, unknown>;
    const rostro = this.filtros.rostro.aplicar(aPuntos(rec['faceLandmarks']), video.currentTime);
    const izquierda = aPuntos(rec['leftHandLandmarks'] ?? rec['handLandmarks']);
    const derecha = aPuntos(rec['rightHandLandmarks']);
    // Algunos paquetes devuelven las manos como lista de manos; usa la 2.ª si solo hay una agrupada.
    let manoIzquierda = izquierda;
    let manoDerecha = derecha;
    if (!manoDerecha && rec['leftHandLandmarks'] === undefined) {
      const agrupadas = rec['handLandmarks'];
      if (Array.isArray(agrupadas) && agrupadas.length > 1) {
        manoDerecha = aPuntos((agrupadas as unknown[])[1]);
      }
    }
    const pose = this.filtros.pose.aplicar(aPuntos(rec['poseLandmarks'], true), video.currentTime);
    manoIzquierda = this.filtros.izquierda.aplicar(manoIzquierda, video.currentTime);
    manoDerecha = this.filtros.derecha.aplicar(manoDerecha, video.currentTime);

    this.cuadros += 1;
    const ahora = performance.now();
    if (ahora - this.marcaFps >= 1000) {
      const fps = Math.round((this.cuadros * 1000) / Math.max(1, ahora - this.marcaFps));
      this.resumen.set({
        rostro: rostro?.length ?? 0,
        manoIzquierda: manoIzquierda?.length ?? 0,
        manoDerecha: manoDerecha?.length ?? 0,
        pose: pose?.length ?? 0,
        fps,
      });
      this.cuadros = 0;
      this.marcaFps = ahora;
    } else {
      this.resumen.update((r) => ({
        ...r,
        rostro: rostro?.length ?? 0,
        manoIzquierda: manoIzquierda?.length ?? 0,
        manoDerecha: manoDerecha?.length ?? 0,
        pose: pose?.length ?? 0,
      }));
    }

    this.dibujar(lienzo, rostro, manoIzquierda, manoDerecha, pose);
    this.fotogramaEnVivo.set({
      aspecto: video.videoWidth / video.videoHeight,
      pose: aTuplas(pose) ?? [],
      manoIzquierda: aTuplas(manoIzquierda),
      manoDerecha: aTuplas(manoDerecha),
      poseMundo: aTuplasMundo(aPuntos(rec['poseWorldLandmarks'], true)) ?? [],
      manoIzquierdaMundo: aTuplasMundo(aPuntos(rec['leftHandWorldLandmarks'])),
      manoDerechaMundo: aTuplasMundo(aPuntos(rec['rightHandWorldLandmarks'])),
    });

    if (this.capturando()) {
      const muestra: Muestra = {
        t: Date.now(),
        vt: video.currentTime,
        rostro,
        manoIzquierda,
        manoDerecha,
        pose,
      };
      this.muestras.update((arr) => {
        // Limita la memoria: conserva como máximo ~30 s a 30 fps.
        const siguiente = [...arr, muestra];
        return siguiente.length > 900 ? siguiente.slice(siguiente.length - 900) : siguiente;
      });
    }
  }

  private dibujar(
    lienzo: HTMLCanvasElement,
    rostro: Punto[] | null,
    izquierda: Punto[] | null,
    derecha: Punto[] | null,
    pose: Punto[] | null,
  ): void {
    const ctx = lienzo.getContext('2d');
    if (!ctx) return;
    const w = lienzo.width;
    const h = lienzo.height;
    ctx.clearRect(0, 0, w, h);

    if (pose && pose.length > 0) {
      ctx.strokeStyle = 'rgba(14,124,62,0.85)';
      ctx.lineWidth = Math.max(2, w / 320);
      ctx.beginPath();
      for (const [a, b] of BORDES_POSE) {
        const p = pose[a];
        const q = pose[b];
        if (!p || !q || !puntoFiable(p) || !puntoFiable(q)) continue;
        ctx.moveTo(p.x * w, p.y * h);
        ctx.lineTo(q.x * w, q.y * h);
      }
      ctx.stroke();
      ctx.fillStyle = '#0e7c3e';
      for (const p of pose) {
        if (!puntoFiable(p)) continue;
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, Math.max(2, w / 160), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const dibujarMano = (mano: Punto[] | null, color: string): void => {
      if (!mano || mano.length === 0) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, w / 320);
      ctx.beginPath();
      for (const [a, b] of BORDES_MANO) {
        const p = mano[a];
        const q = mano[b];
        if (!p || !q || !puntoFiable(p) || !puntoFiable(q)) continue;
        ctx.moveTo(p.x * w, p.y * h);
        ctx.lineTo(q.x * w, q.y * h);
      }
      ctx.stroke();
      ctx.fillStyle = color;
      for (const p of mano) {
        if (!puntoFiable(p)) continue;
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, Math.max(2.5, w / 130), 0, Math.PI * 2);
        ctx.fill();
      }
    };
    dibujarMano(izquierda, '#1d4ed8');
    dibujarMano(derecha, '#b45309');

    if (rostro && rostro.length > 0) {
      ctx.fillStyle = 'rgba(23,34,46,0.75)';
      const r = Math.max(1, w / 480);
      for (const p of rostro) {
        if (!puntoFiable(p)) continue;
        ctx.fillRect(p.x * w - r / 2, p.y * h - r / 2, r, r);
      }
    }
  }
}
