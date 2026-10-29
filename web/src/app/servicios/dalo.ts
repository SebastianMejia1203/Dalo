import { Injectable, computed, inject, signal } from '@angular/core';
import { findById, matchSpanishText } from '../adapters';
import type { SecuenciaMundo } from '../reconocimiento/caracteristicas-lsc';
import { ModeloReconocimientoService } from './modelo-reconocimiento';
import type { FotogramaVivo } from './seguimiento';

/** Un fotograma de landmarks mundiales dentro de la ventana automática. */
export interface FotogramaVentana {
  poseMundo: FotogramaVivo['poseMundo'];
  manoIzquierdaMundo: FotogramaVivo['manoIzquierdaMundo'];
  manoDerechaMundo: FotogramaVivo['manoDerechaMundo'];
}

const VENTANA_MAX = 120;
const MIN_FOTOGRAMAS_VENTANA = 24;
const UMBRAL_PROBABILIDAD = 0.55;

export type Direccion = 'lsc-es' | 'es-lsc';
export type Vista = 'comunicar' | 'expresiones' | 'ajustes';
export type EstadoCamara = 'apagada' | 'solicitando' | 'activa' | 'permiso-denegado' | 'no-disponible';
export type FaseLsc = 'reposo' | 'grabando' | 'analizando' | 'candidata' | 'ambigua' | 'desconocida' | 'confirmada';
export type EstadoEsl = 'reposo' | 'directa' | 'ambigua' | 'fuera' | 'vacio';
export type TamanoTexto = 'normal' | 'grande' | 'muy-grande';

export interface ResultadoEsl {
  estado: EstadoEsl;
  id: string | null;
  ids: string[];
}

export interface DeteccionDispositivos {
  camaras: MediaDeviceInfo[];
  microfonos: MediaDeviceInfo[];
  mensaje: string;
}

export interface AjustesDalo {
  camaraId: string;
  microfonoId: string;
  voz: string;
  velocidad: number;
  tamanoTexto: TamanoTexto;
}

const AJUSTES_POR_DEFECTO: AjustesDalo = { camaraId: '', microfonoId: '', voz: '', velocidad: 1, tamanoTexto: 'normal' };
const CLAVE_AJUSTES = 'dalo-ajustes';

/** Estado compartido de la aplicación. */
@Injectable({ providedIn: 'root' })
export class DaloService {
  readonly direccion = signal<Direccion>('lsc-es');
  readonly vista = signal<Vista>('comunicar');

  readonly camara = signal<EstadoCamara>('apagada');
  readonly mensajeCamara = signal('');
  readonly avisoEncuadre = signal(false);

  readonly faseLsc = signal<FaseLsc>('reposo');
  readonly candidataId = signal<string | null>(null);
  readonly confirmadoId = signal<string | null>(null);
  readonly duracionGrabacion = signal(0);
  readonly vozSilenciada = signal(false);
  readonly turnos = signal<string[]>([]);

  /** Detección automática LSC → Español sin botón de captura. */
  readonly deteccionAutomatica = signal(true);
  readonly mensajeAuto = signal('');
  readonly modeloListo = signal(false);
  readonly fotogramasAuto = signal(0);

  readonly resultadoEsl = signal<ResultadoEsl>({ estado: 'reposo', id: null, ids: [] });
  readonly avisoEsl = signal('');
  readonly mensajeCopiado = signal('');
  /** Texto sugerido desde el catálogo; el comunicador lo toma y lo limpia. */
  readonly textoSugerido = signal('');

  readonly ajustes = signal<AjustesDalo>(DaloService.leerAjustes());

  readonly significadoCandidato = computed(() => {
    const id = this.candidataId();
    return id ? (findById(id)?.significado ?? '') : '';
  });
  readonly significadoConfirmado = computed(() => {
    const id = this.confirmadoId();
    return id ? (findById(id)?.significado ?? '') : '';
  });
  readonly camaraLista = computed(() => this.camara() === 'activa' || this.faseLsc() !== 'reposo');

  private stream: MediaStream | null = null;
  private vistaPrevia: HTMLVideoElement | null = null;
  private inicioGrabacion = 0;
  private temporizador: ReturnType<typeof setInterval> | null = null;
  private readonly reconocimiento = inject(ModeloReconocimientoService);
  private ventanaAuto: FotogramaVentana[] = [];
  private analisisEnCurso = false;
  /** Tras emitir, no se acepta otra seña hasta que las manos bajan (fin del segmento). */
  private esperandoFinSegmento = false;
  private prediccionPreviaSegmento: string | null = null;
  private candidataDesdeMs = 0;
  private ultimoAnalisisMs = 0;
  private enfriamientoHastaMs = 0;
  private ultimoFotogramaRef: object | null = null;
  private ultimaCandidataAuto: string | null = null;
  private sinManosDesdeMs: number | null = null;
  private retornoReposo: ReturnType<typeof setTimeout> | null = null;

  private static leerAjustes(): AjustesDalo {
    try {
      const raw = globalThis.localStorage?.getItem(CLAVE_AJUSTES);
      if (!raw) return { ...AJUSTES_POR_DEFECTO };
      const parsed = JSON.parse(raw) as Partial<AjustesDalo>;
      return { ...AJUSTES_POR_DEFECTO, ...parsed };
    } catch {
      return { ...AJUSTES_POR_DEFECTO };
    }
  }

  private guardarAjustes(): void {
    try {
      globalThis.localStorage?.setItem(CLAVE_AJUSTES, JSON.stringify(this.ajustes()));
    } catch {
      // La aplicación sigue funcionando sin persistencia.
    }
  }

  // ---- Navegación ----
  mostrarComunicar(): void {
    this.vista.set('comunicar');
  }

  mostrarExpresiones(): void {
    this.vista.set('expresiones');
  }

  abrirAjustes(): void {
    this.vista.set('ajustes');
  }

  cerrarAjustes(): void {
    this.vista.set('comunicar');
  }

  cambiarDireccion(direccion: Direccion): void {
    this.direccion.set(direccion);
  }

  usarEnBuscador(id: string): void {
    const entrada = findById(id);
    this.vista.set('comunicar');
    this.direccion.set('es-lsc');
    this.textoSugerido.set(entrada ? entrada.formulaciones[0] : '');
  }

  tomarTextoSugerido(): string {
    const texto = this.textoSugerido();
    if (texto) this.textoSugerido.set('');
    return texto;
  }

  // ---- Cámara ----
  enlazarVistaPrevia(video: HTMLVideoElement | null): void {
    this.vistaPrevia = video;
    if (video && this.stream) {
      video.srcObject = this.stream;
      void video.play().catch(() => undefined);
    }
  }

  async activarCamara(): Promise<void> {
    if (this.camara() === 'solicitando') return;
    this.mensajeCamara.set('');
    this.avisoEncuadre.set(false);
    const medios = globalThis.navigator?.mediaDevices;
    if (!medios) {
      this.camara.set('no-disponible');
      this.mensajeCamara.set('Este navegador no expone cámara. Prueba en Chrome o Edge de escritorio por HTTPS o localhost.');
      return;
    }
    this.camara.set('solicitando');
    try {
      const video = this.ajustes().camaraId
        ? { deviceId: { exact: this.ajustes().camaraId } }
        : { facingMode: 'user' };
      this.stream = await medios.getUserMedia({ video, audio: false });
      this.camara.set('activa');
      if (this.vistaPrevia) {
        this.vistaPrevia.srcObject = this.stream;
        await this.vistaPrevia.play().catch(() => undefined);
        this.verificarEncuadre();
      }
    } catch (error) {
      this.stream = null;
      const nombre = error instanceof DOMException ? error.name : 'Error';
      if (nombre === 'NotAllowedError' || nombre === 'SecurityError') {
        this.camara.set('permiso-denegado');
        this.mensajeCamara.set(
          'Permiso de cámara rechazado. Actívalo en el icono de la barra del navegador y pulsa «Reintentar».',
        );
      } else if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError') {
        this.camara.set('no-disponible');
        this.mensajeCamara.set('No se encontró una cámara disponible. Conecta una cámara o elige otra en Ajustes.');
      } else if (nombre === 'NotReadableError' || nombre === 'AbortError') {
        this.camara.set('no-disponible');
        this.mensajeCamara.set(
          'La cámara está ocupada por otra aplicación (por ejemplo, la videollamada). Libérala o elige otra en Ajustes.',
        );
      } else {
        this.camara.set('no-disponible');
        this.mensajeCamara.set(`No se pudo activar la cámara (${nombre}). Reintenta o elige otra en Ajustes.`);
      }
    }
  }

  verificarEncuadre(): void {
    const video = this.vistaPrevia;
    if (!video) return;
    this.avisoEncuadre.set(video.videoWidth === 0 || video.videoHeight === 0);
  }

  apagarCamara(): void {
    this.detenerCaptura();
    this.stream?.getTracks().forEach((pista) => pista.stop());
    this.stream = null;
    if (this.vistaPrevia) this.vistaPrevia.srcObject = null;
    this.camara.set('apagada');
    this.faseLsc.set('reposo');
    this.candidataId.set(null);
    this.limpiarVentanaAuto();
  }

  // ---- Detección automática LSC → Español (sin botón de captura) ----
  marcarModeloListo(listo: boolean): void {
    this.modeloListo.set(listo);
  }

  alternarDeteccionAutomatica(): void {
    const siguiente = !this.deteccionAutomatica();
    this.deteccionAutomatica.set(siguiente);
    this.limpiarVentanaAuto();
    if (!siguiente) {
      this.mensajeAuto.set('Detección en pausa. Reanúdala para seguir traduciendo.');
    } else {
      this.enfriamientoHastaMs = Date.now() + 500;
      this.mensajeAuto.set('');
    }
  }

  /** Recibe cada fotograma en vivo y propone una palabra sin captura manual. */
  alimentarFotograma(
    fotograma: FotogramaVivo | null,
    ahoraMs: number = Date.now(),
  ): void {
    if (!this.deteccionAutomatica() || this.camara() !== 'activa') return;
    const fase = this.faseLsc();
    // Un resultado visible no detiene la cámara ni la próxima detección.
    if (fase === 'grabando' || fase === 'analizando') return;
    if (fotograma === null) return;
    // El mismo objeto no representa un fotograma nuevo (p. ej. si un efecto
    // se reejecuta por un cambio de fase): se ignora para no duplicar.
    if (fotograma === this.ultimoFotogramaRef) return;
    this.ultimoFotogramaRef = fotograma;
    // Una propuesta sin confirmar deja de bloquear tras 8 s: la siguiente
    // seña puede reemplazarla, pero la propuesta visible no desaparece
    // hasta que eso ocurra o la persona actúe.
    if (
      this.faseLsc() === 'candidata' &&
      this.candidataDesdeMs > 0 &&
      ahoraMs - this.candidataDesdeMs > 8000
    ) {
      this.ultimaCandidataAuto = null;
      this.candidataDesdeMs = ahoraMs;
      this.esperandoFinSegmento = false;
      this.prediccionPreviaSegmento = null;
      // Se conserva solo la cola reciente: la seña en curso no se pierde.
      this.ventanaAuto = this.ventanaAuto.slice(-24);
      this.fotogramasAuto.set(this.ventanaAuto.length);
    }
    // No acumula durante el intervalo de separación para evitar reutilizar
    // la cola de la seña que acaba de reconocerse.
    if (ahoraMs < this.enfriamientoHastaMs) return;
    const manoVisible = (mano: ([number, number, number] | null)[] | null | undefined): boolean =>
      mano?.some((p) => p !== null && p.every(Number.isFinite)) ?? false;
    const hayManos =
      manoVisible(fotograma.manoIzquierdaMundo ?? fotograma.manoIzquierda) ||
      manoVisible(fotograma.manoDerechaMundo ?? fotograma.manoDerecha);
    if (!hayManos) {
      this.sinManosDesdeMs ??= ahoraMs;
      if (ahoraMs - this.sinManosDesdeMs >= 400) {
        // Fin del segmento: última oportunidad de clasificarlo completo.
        if (!this.esperandoFinSegmento && this.ventanaAuto.length >= 16 && !this.analisisEnCurso) {
          if (this.modeloListo() && this.reconocimiento.listas) {
            void this.analizarVentana(ahoraMs, true);
          }
        }
        this.ventanaAuto = [];
        this.fotogramasAuto.set(0);
        this.esperandoFinSegmento = false;
        this.prediccionPreviaSegmento = null;
        this.ultimoAnalisisMs = 0;
      }
      this.mensajeAuto.set('Muestra una seña con rostro y manos visibles. Sigo detectando.');
      return;
    }
    this.sinManosDesdeMs = null;
    // Ya se emitió una propuesta en este segmento: las manos deben bajar
    // antes de aceptar la siguiente seña (evita mezclar dos señas).
    if (this.esperandoFinSegmento) return;
    this.ventanaAuto.push({
      poseMundo: fotograma.poseMundo ? [...fotograma.poseMundo] : [],
      manoIzquierdaMundo: fotograma.manoIzquierdaMundo ? [...fotograma.manoIzquierdaMundo] : null,
      manoDerechaMundo: fotograma.manoDerechaMundo ? [...fotograma.manoDerechaMundo] : null,
    });
    this.fotogramasAuto.set(this.ventanaAuto.length);
    if (!this.modeloListo() || !this.reconocimiento.listas) {
      this.mensajeAuto.set('Cargando el modelo de reconocimiento…');
      return;
    }
    if (this.ventanaAuto.length >= VENTANA_MAX) {
      // Segmento demasiado largo (p. ej. postura sostenida): se clasifica
      // y se cierra en lugar de crecer sin fin.
      void this.analizarVentana(ahoraMs, true);
      this.ventanaAuto = [];
      this.fotogramasAuto.set(0);
      return;
    }
    if (this.ventanaAuto.length < MIN_FOTOGRAMAS_VENTANA) {
      this.mensajeAuto.set('Muestra una seña con rostro y manos visibles.');
      return;
    }
    if (this.analisisEnCurso || ahoraMs - this.ultimoAnalisisMs < 250) return;
    this.ultimoAnalisisMs = ahoraMs;
    void this.analizarVentana(ahoraMs, false);
  }

  private async analizarVentana(ahoraMs: number, esFinal: boolean): Promise<void> {
    if (this.analisisEnCurso) return;
    this.analisisEnCurso = true;
    try {
      const secuencia: SecuenciaMundo = {
        poseMundo: this.ventanaAuto.map((f) => f.poseMundo ?? []),
        manoIzquierdaMundo: this.ventanaAuto.map((f) => f.manoIzquierdaMundo ?? []),
        manoDerechaMundo: this.ventanaAuto.map((f) => f.manoDerechaMundo ?? []),
      };
      const prediccion = await this.reconocimiento.clasificar(secuencia);
      if (!prediccion) return;
      const fase = this.faseLsc();
      if (prediccion.clase !== 'otra' && prediccion.probabilidad >= UMBRAL_PROBABILIDAD) {
        // La misma seña ya propuesta no se vuelve a emitir en este segmento.
        if (prediccion.clase === this.ultimaCandidataAuto) {
          this.esperandoFinSegmento = true;
          return;
        }
        // En curso de segmento se exige estabilidad: la misma clase en
        // dos análisis seguidos. Al cierre del segmento basta uno.
        if (!esFinal && prediccion.clase !== this.prediccionPreviaSegmento) {
          this.prediccionPreviaSegmento = prediccion.clase;
          return;
        }
        this.ultimaCandidataAuto = prediccion.clase;
        this.candidataId.set(prediccion.clase);
        this.confirmadoId.set(null);
        this.faseLsc.set('candidata');
        this.candidataDesdeMs = ahoraMs;
        this.mensajeAuto.set('');
        this.enfriamientoHastaMs = ahoraMs + 500;
        this.ventanaAuto = [];
        this.fotogramasAuto.set(0);
        this.esperandoFinSegmento = true;
        this.prediccionPreviaSegmento = null;
        return;
      }
      this.prediccionPreviaSegmento = null;
      if (!esFinal) return;
      // Conserva la última propuesta/confirmación mientras busca la siguiente;
      // un fotograma incompleto no borra un resultado que la persona está leyendo.
      if (fase === 'candidata' || fase === 'confirmada') return;
      this.candidataId.set(null);
      this.faseLsc.set('desconocida');
      this.mensajeAuto.set('');
      this.programarRetornoReposo();
    } finally {
      this.analisisEnCurso = false;
    }
  }

  exportarVentanaAuto(): FotogramaVentana[] {
    return [...this.ventanaAuto];
  }

  private limpiarVentanaAuto(reiniciarResultado = true): void {
    this.ventanaAuto = [];
    this.fotogramasAuto.set(0);
    this.ultimoAnalisisMs = 0;
    this.ultimoFotogramaRef = null;
    this.sinManosDesdeMs = null;
    this.esperandoFinSegmento = false;
    this.prediccionPreviaSegmento = null;
    this.candidataDesdeMs = 0;
    if (reiniciarResultado) this.ultimaCandidataAuto = null;
    if (this.retornoReposo) {
      clearTimeout(this.retornoReposo);
      this.retornoReposo = null;
    }
  }

  private programarRetornoReposo(): void {
    if (this.retornoReposo) clearTimeout(this.retornoReposo);
    this.retornoReposo = setTimeout(() => {
      if (this.faseLsc() === 'desconocida' || this.faseLsc() === 'ambigua') {
        this.faseLsc.set('reposo');
        this.candidataId.set(null);
      }
      this.retornoReposo = null;
    }, 4000);
  }

  async detectarDispositivos(): Promise<DeteccionDispositivos> {
    const medios = globalThis.navigator?.mediaDevices;
    if (!medios?.getUserMedia || !medios?.enumerateDevices) {
      return {
        camaras: [],
        microfonos: [],
        mensaje: 'Este navegador no expone cámaras ni micrófonos. Prueba en Chrome o Edge de escritorio.',
      };
    }
    const flujos: MediaStream[] = [];
    try {
      flujos.push(await medios.getUserMedia({ video: true, audio: true }));
    } catch {
      for (const restricciones of [{ video: true }, { audio: true }]) {
        try {
          flujos.push(await medios.getUserMedia(restricciones));
        } catch {
          // Ese dispositivo no está disponible o se rechazó su permiso.
        }
      }
    }
    let camaras: MediaDeviceInfo[] = [];
    let microfonos: MediaDeviceInfo[] = [];
    try {
      const todos = await medios.enumerateDevices();
      camaras = todos.filter((d) => d.kind === 'videoinput');
      microfonos = todos.filter((d) => d.kind === 'audioinput');
    } catch {
      // Se conserva la lista vacía con el mensaje correspondiente.
    } finally {
      flujos.forEach((flujo) => flujo.getTracks().forEach((pista) => pista.stop()));
    }
    if (camaras.length === 0 && microfonos.length === 0) {
      return {
        camaras,
        microfonos,
        mensaje: 'No se detectó ningún dispositivo o se rechazó el permiso. Revísalo en el navegador y reintenta.',
      };
    }
    if (!this.ajustes().camaraId && camaras[0]?.deviceId) this.guardarCamara(camaras[0].deviceId);
    if (!this.ajustes().microfonoId && microfonos[0]?.deviceId) this.guardarMicrofono(microfonos[0].deviceId);
    const n = (total: number, uno: string, varios: string) => `${total} ${total === 1 ? uno : varios}`;
    return {
      camaras,
      microfonos,
      mensaje: `Se detectaron ${n(camaras.length, 'cámara', 'cámaras')} y ${n(microfonos.length, 'micrófono', 'micrófonos')}.`,
    };
  }

  async listarCamaras(): Promise<MediaDeviceInfo[]> {
    try {
      const medios = globalThis.navigator?.mediaDevices;
      if (!medios?.enumerateDevices) return [];
      return (await medios.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    } catch {
      return [];
    }
  }

  async listarMicrofonos(): Promise<MediaDeviceInfo[]> {
    try {
      const medios = globalThis.navigator?.mediaDevices;
      if (!medios?.enumerateDevices) return [];
      return (await medios.enumerateDevices()).filter((d) => d.kind === 'audioinput');
    } catch {
      return [];
    }
  }

  // ---- LSC -> Español (captura de secuencia real; sin asignación de palabras) ----
  iniciarGrabacion(): void {
    if (this.camara() !== 'activa' || this.faseLsc() !== 'reposo') return;
    this.candidataId.set(null);
    this.confirmadoId.set(null);
    this.faseLsc.set('grabando');
    this.inicioGrabacion = Date.now();
    this.duracionGrabacion.set(0);
    this.detenerTemporizador();
    this.temporizador = setInterval(() => {
      this.duracionGrabacion.set((Date.now() - this.inicioGrabacion) / 1000);
    }, 250);
  }

  finalizarGrabacion(): void {
    if (this.faseLsc() !== 'grabando') return;
    this.detenerCaptura();
    // Etapa de seguimiento real: conserva la secuencia de puntos en memoria
    // y vuelve a reposo para inspección/descarga. No asigna palabras.
    this.faseLsc.set('reposo');
  }

  cancelarGrabacion(): void {
    this.detenerCaptura();
    this.faseLsc.set('reposo');
    this.duracionGrabacion.set(0);
  }

  confirmarCandidata(): void {
    const id = this.candidataId();
    if (!id || this.faseLsc() !== 'candidata') return;
    this.confirmadoId.set(id);
    this.faseLsc.set('confirmada');
    this.mensajeCopiado.set('');
    const significado = findById(id)?.significado ?? '';
    if (significado) this.turnos.update((turnos) => [...turnos, significado]);
    this.limpiarVentanaAuto(false);
    this.enfriamientoHastaMs = Date.now() + 500;
  }

  repetirCaptura(): void {
    this.detenerCaptura();
    this.candidataId.set(null);
    this.confirmadoId.set(null);
    this.duracionGrabacion.set(0);
    this.faseLsc.set('reposo');
    this.mensajeAuto.set('');
    this.limpiarVentanaAuto();
    this.enfriamientoHastaMs = Date.now() + 1000;
  }

  nuevaExpresion(): void {
    this.candidataId.set(null);
    this.confirmadoId.set(null);
    this.mensajeCopiado.set('');
    this.faseLsc.set('reposo');
    this.mensajeAuto.set('');
    this.limpiarVentanaAuto();
    this.enfriamientoHastaMs = Date.now() + 1000;
  }

  private detenerCaptura(): void {
    this.detenerTemporizador();
  }

  private detenerTemporizador(): void {
    if (this.temporizador) {
      clearInterval(this.temporizador);
      this.temporizador = null;
    }
  }

  // ---- Español -> LSC ----
  buscarEnLsc(texto: string): void {
    this.avisoEsl.set('');
    const coincidencia = matchSpanishText(texto);
    if (coincidencia.kind === 'vacio') {
      this.resultadoEsl.set({ estado: 'vacio', id: null, ids: [] });
      this.avisoEsl.set('Escribe una expresión para buscarla en el catálogo.');
    } else if (coincidencia.kind === 'directa') {
      // Coincidencia clara: muestra directa, sin confirmación.
      this.resultadoEsl.set({ estado: 'directa', id: coincidencia.id, ids: [] });
    } else if (coincidencia.kind === 'ambigua') {
      this.resultadoEsl.set({ estado: 'ambigua', id: null, ids: coincidencia.ids });
    } else {
      this.resultadoEsl.set({ estado: 'fuera', id: null, ids: [] });
    }
  }

  elegirOpcionAmbigua(id: string): void {
    this.resultadoEsl.set({ estado: 'directa', id, ids: [] });
  }

  // ---- Salida en español ----
  async copiarTexto(texto: string): Promise<void> {
    try {
      await globalThis.navigator.clipboard.writeText(texto);
      this.mensajeCopiado.set('Texto copiado. Pégalo en el chat de la reunión.');
    } catch {
      this.mensajeCopiado.set('No se pudo copiar automáticamente: selecciona el texto y cópialo manualmente.');
    }
  }

  obtenerVoces(): SpeechSynthesisVoice[] {
    try {
      const sintesis = globalThis.speechSynthesis;
      return sintesis ? sintesis.getVoices() : [];
    } catch {
      return [];
    }
  }

  hablar(texto: string): string {
    if (this.vozSilenciada()) return 'Voz silenciada: actívala para escuchar el resultado aquí.';
    const sintesis = (() => {
      try {
        return globalThis.speechSynthesis ?? null;
      } catch {
        return null;
      }
    })();
    if (!sintesis || !texto) return 'La voz de salida no está disponible en este navegador.';
    sintesis.cancel();
    const mensaje = new SpeechSynthesisUtterance(texto);
    mensaje.lang = 'es-CO';
    mensaje.rate = this.ajustes().velocidad;
    const voces = sintesis.getVoices();
    const guardada = this.ajustes().voz;
    const voz = guardada ? (voces.find((v) => v.name === guardada) ?? null) : this.vozEspanola(voces);
    if (voz) mensaje.voice = voz;
    sintesis.speak(mensaje);
    return '';
  }

  /** Con "Automática", prefiere es-CO, luego cualquier español, y si no la voz del sistema. */
  private vozEspanola(voces: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
    return (
      voces.find((v) => v.lang.toLowerCase().startsWith('es-co')) ??
      voces.find((v) => v.lang.toLowerCase().startsWith('es')) ??
      null
    );
  }

  // ---- Ajustes ----
  alternarSilencio(): void {
    this.vozSilenciada.update((v) => !v);
  }

  guardarCamara(id: string): void {
    this.ajustes.update((a) => ({ ...a, camaraId: id }));
    this.guardarAjustes();
  }

  guardarMicrofono(id: string): void {
    this.ajustes.update((a) => ({ ...a, microfonoId: id }));
    this.guardarAjustes();
  }

  guardarVoz(nombre: string): void {
    this.ajustes.update((a) => ({ ...a, voz: nombre }));
    this.guardarAjustes();
  }

  guardarVelocidad(velocidad: number): void {
    this.ajustes.update((a) => ({ ...a, velocidad }));
    this.guardarAjustes();
  }

  guardarTamanoTexto(tamano: TamanoTexto): void {
    this.ajustes.update((a) => ({ ...a, tamanoTexto: tamano }));
    this.guardarAjustes();
  }
}
