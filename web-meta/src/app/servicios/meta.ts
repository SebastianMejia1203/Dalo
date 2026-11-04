import { Injectable, computed, inject, signal } from "@angular/core";
import { API_URL } from "./api-url";

export interface ResultadoMeta {
  clase: string;
  confianza: number;
  motivo: string;
  model: string;
  latencyMs: number;
  promptVersion: string;
  resumen?: string;
}
interface ContextoMeta {
  model: string;
  promptVersion: string;
  instructions: string;
  catalog: {
    id: string;
    nombre: string;
    significado: string;
    intencion: string;
  }[];
}
@Injectable({ providedIn: "root" })
export class MetaService {
  private readonly apiUrl = inject(API_URL);
  readonly configurada = signal(false);
  readonly ocupado = signal(false);
  readonly grabando = signal(false);
  readonly preparandoCaptura = signal(false);
  readonly segundosRestantes = signal(3);
  readonly resultado = signal<ResultadoMeta | null>(null);
  readonly estado = signal("Comprobando conexión…");
  readonly error = signal("");
  readonly resumenModelo = signal("");
  readonly contexto = signal<ContextoMeta | null>(null);
  readonly errorContexto = signal("");
  readonly pasos = signal<{ mensaje: string; ms: number; etapa?: string }[]>([]);
  readonly fotogramas = signal<string[]>([]);
  readonly videoCapturado = signal<string | null>(null);
  readonly transcurrido = signal(0);
  readonly segundos = computed(() => (this.transcurrido() / 1000).toFixed(1));
  /** Estado de la última comprobación de conexión, para la UI. */
  readonly comprobando = signal(false);
  readonly ultimaComprobacion = signal("");
  private abortador: AbortController | null = null;
  private inicio = 0;

  private registrar(mensaje: string, etapa?: string): void {
    this.estado.set(mensaje);
    this.pasos.update((pasos) => [
      ...pasos,
      {
        mensaje,
        ms: Math.max(0, Math.round(performance.now() - this.inicio)),
        etapa,
      },
    ]);
  }

  async cargarContexto(): Promise<void> {
    this.errorContexto.set("");
    try {
      const response = await fetch(`${this.apiUrl}/context`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error();
      this.contexto.set((await response.json()) as ContextoMeta);
    } catch {
      this.errorContexto.set(
        "No se pudo cargar el contexto. Comprueba que el backend esté actualizado.",
      );
    }
  }

  async comprobar(): Promise<void> {
    this.error.set("");
    this.comprobando.set(true);
    this.estado.set("Comprobando conexión…");
    try {
      const response = await fetch(`${this.apiUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error();
      const health = (await response.json()) as {
        configured: boolean;
        model: string;
      };
      this.configurada.set(health.configured === true);
      this.estado.set(
        health.configured
          ? `Conectado · ${health.model}`
          : "Sin clave API en el backend",
      );
    } catch {
      this.configurada.set(false);
      this.estado.set("Sin conexión");
      this.error.set(
        "No se pudo conectar al backend. Inícialo y comprueba la conexión.",
      );
    } finally {
      this.comprobando.set(false);
      this.ultimaComprobacion.set(
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    }
  }

  async enviar(
    frames: string[],
    signal: AbortSignal,
    videoDataUrl?: string,
  ): Promise<ResultadoMeta> {
    this.resultado.set(null);
    this.resumenModelo.set("");
    if (!this.inicio) this.inicio = performance.now();
    this.registrar(
      videoDataUrl
        ? "Enviando video completo al backend…"
        : "Enviando fotogramas al backend…",
    );
    const reloj = setInterval(
      () => this.transcurrido.set(Math.round(performance.now() - this.inicio)),
      100,
    );
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await fetch(`${this.apiUrl}/recognize/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(videoDataUrl ? { videoDataUrl } : { frames }),
        signal,
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error || "No se pudo analizar la captura.");
      }
      if (!response.body)
        throw new Error("El backend no entregó un flujo de respuesta.");
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let result: ResultadoMeta | null = null;
      while (true) {
        const chunk = await reader.read();
        signal.throwIfAborted();
        buffer += chunk.done
          ? decoder.decode()
          : decoder.decode(chunk.value, { stream: true });
        let index;
        while ((index = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, index);
          buffer = buffer.slice(index + 1);
          if (!line.trim()) continue;
          const event = JSON.parse(line) as {
            type: string;
            stage?: string;
            message?: string;
            text?: string;
            result?: ResultadoMeta;
          };
          if (event.type === "stage" && event.message)
            this.registrar(event.message, event.stage);
          if (event.type === "summary" && typeof event.text === "string")
            this.resumenModelo.set(event.text);
          if (event.type === "error")
            throw new Error(event.message || "Meta no completó el análisis.");
          if (event.type === "result" && event.result) result = event.result;
        }
        if (buffer.length > 256000)
          throw new Error("Respuesta demasiado grande.");
        if (chunk.done) break;
      }
      if (!result || buffer.trim())
        throw new Error(
          "La conexión se interrumpió antes del resultado final.",
        );
      this.resultado.set(result);
      this.registrar("Respuesta validada. Revisa la propuesta.");
      return result;
    } finally {
      clearInterval(reloj);
      this.transcurrido.set(Math.round(performance.now() - this.inicio));
      await reader?.cancel().catch(() => {});
      reader?.releaseLock();
    }
  }

  private async prepararCaptura(signal: AbortSignal): Promise<void> {
    this.preparandoCaptura.set(true);
    try {
      for (const segundo of [3, 2, 1]) {
        signal.throwIfAborted();
        this.segundosRestantes.set(segundo);
        await new Promise<void>((resolve, reject) => {
          const cancelar = () => {
            clearTimeout(timer);
            reject(signal.reason);
          };
          const timer = setTimeout(() => {
            signal.removeEventListener("abort", cancelar);
            resolve();
          }, 1000);
          signal.addEventListener("abort", cancelar, { once: true });
        });
      }
      signal.throwIfAborted();
    } finally {
      this.preparandoCaptura.set(false);
    }
  }

  private grabarVideo(
    video: HTMLVideoElement,
    signal: AbortSignal,
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!(video.srcObject instanceof MediaStream))
        throw new Error("No hay un flujo de cámara activo.");
      if (typeof MediaRecorder === "undefined")
        throw new Error("Este navegador no permite grabar video.");
      const mime = ["video/webm;codecs=vp8", "video/webm", "video/mp4"].find(
        (type) => MediaRecorder.isTypeSupported(type),
      );
      if (!mime) throw new Error("No hay un formato de grabación compatible.");
      const recorder = new MediaRecorder(
        new MediaStream(video.srcObject.getVideoTracks()),
        { mimeType: mime, videoBitsPerSecond: 1000000 },
      );
      const chunks: BlobPart[] = [];
      const cleanup = () => {
        this.grabando.set(false);
        clearTimeout(timer);
        clearInterval(tick);
        signal.removeEventListener("abort", cancel);
      };
      const cancel = () => {
        cleanup();
        if (recorder.state !== "inactive") recorder.stop();
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, 3000);
      const tick = setInterval(() => {
        this.transcurrido.set(Math.round(performance.now() - this.inicio));
        this.estado.set(`Grabando video · ${this.segundos()} / 3 s`);
      }, 100);
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        cleanup();
        reject(new Error("No se pudo grabar el video."));
      };
      recorder.onstop = () => {
        cleanup();
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }
        const blob = new Blob(chunks, {
          type: mime.startsWith("video/mp4") ? "video/mp4" : "video/webm",
        });
        if (blob.size) resolve(blob);
        else reject(new Error("La grabación de video quedó vacía."));
      };
      signal.addEventListener("abort", cancel, { once: true });
      try {
        signal.throwIfAborted();
        recorder.start();
        this.grabando.set(true);
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }

  async capturar(
    video: HTMLVideoElement,
  ): Promise<ResultadoMeta | null> {
    if (this.ocupado() || !this.configurada()) return null;
    const controller = new AbortController();
    this.abortador = controller;
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(70000),
    ]);
    this.ocupado.set(true);
    this.error.set("");
    this.resultado.set(null);
    this.inicio = performance.now();
    this.pasos.set([]);
    this.fotogramas.set([]);
    if (this.videoCapturado()) URL.revokeObjectURL(this.videoCapturado()!);
    this.videoCapturado.set(null);
    this.resumenModelo.set("");
    this.transcurrido.set(0);
    this.registrar("Preparación iniciada. Espera a que comience la grabación.");
    try {
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight)
        throw new Error("Espera a que la cámara muestre imagen.");
      this.estado.set(
        "Prepárate: la grabación comienza después de la cuenta regresiva.",
      );
      await this.prepararCaptura(signal);
      this.inicio = performance.now();
      this.transcurrido.set(0);
      this.registrar("Grabación iniciada. Realiza tu seña ahora.");
      const blob = await this.grabarVideo(video, signal);
      signal.throwIfAborted();
      this.videoCapturado.set(URL.createObjectURL(blob));
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("No se pudo leer el video."));
        reader.readAsDataURL(blob);
      });
      signal.throwIfAborted();
      this.estado.set("Analizando video con Meta…");
      const result = await this.enviar([], signal, dataUrl);
      this.estado.set(
        result.clase === "otra"
          ? "Seña no reconocida."
          : "Propuesta recibida. Confirma si es correcta.",
      );
      return result;
    } catch (error) {
      if (!controller.signal.aborted) {
        this.estado.set("Captura sin resultado.");
        this.error.set(
          error instanceof Error
            ? error.message
            : "No se pudo completar la captura.",
        );
      }
      return null;
    } finally {
      this.ocupado.set(false);
      if (this.abortador === controller) this.abortador = null;
    }
  }

  cancelar(): void {
    this.abortador?.abort();
    this.resultado.set(null);
    this.estado.set("Captura cancelada.");
    if (this.videoCapturado()) URL.revokeObjectURL(this.videoCapturado()!);
    this.videoCapturado.set(null);
  }
}
