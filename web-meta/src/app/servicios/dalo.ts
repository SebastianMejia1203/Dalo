import { Injectable, computed, signal } from '@angular/core';
import { findById, matchSpanishText } from '../adapters';
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
const CLAVE_AJUSTES = 'dalo-meta-ajustes';

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
  private solicitudCamara = 0;
  private vistaPrevia: HTMLVideoElement | null = null;
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
    const solicitud = ++this.solicitudCamara;
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
      const stream = await medios.getUserMedia({ video, audio: false });
      if (solicitud !== this.solicitudCamara) {
        stream.getTracks().forEach(pista => pista.stop());
        return;
      }
      this.stream = stream;
      this.camara.set('activa');
      if (this.vistaPrevia) {
        this.vistaPrevia.srcObject = this.stream;
        await this.vistaPrevia.play().catch(() => undefined);
        this.verificarEncuadre();
      }
    } catch (error) {
      if (solicitud !== this.solicitudCamara) return;
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
    this.solicitudCamara++;
    this.stream?.getTracks().forEach((pista) => pista.stop());
    this.stream = null;
    if (this.vistaPrevia) this.vistaPrevia.srcObject = null;
    this.camara.set('apagada');
    this.faseLsc.set('reposo');
    this.candidataId.set(null);
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
  confirmarCandidata(): void {
    const id = this.candidataId();
    if (!id || this.faseLsc() !== 'candidata') return;
    this.confirmadoId.set(id);
    this.turnos.update(turnos => [...turnos, findById(id)?.significado ?? id]);
    this.faseLsc.set('confirmada');
  }
  repetirCaptura(): void {
    this.candidataId.set(null);
    this.confirmadoId.set(null);
    this.faseLsc.set('reposo');
  }
  nuevaExpresion(): void { this.repetirCaptura(); }

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
