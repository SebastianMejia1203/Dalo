import { Injectable, inject, signal } from "@angular/core";
import { API_URL } from "./api-url";
import { encodeWav } from "./audio-wav";

@Injectable({
  providedIn: "root",
})
export class VozMeta {
  private readonly apiUrl = inject(API_URL);
  readonly estado = signal<
    "reposo" | "preparando" | "grabando" | "transcribiendo"
  >("reposo");
  readonly texto = signal("");
  readonly error = signal("");
  private generation = 0;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private processor: AudioWorkletNode | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private abort: AbortController | null = null;
  private chunks: Float32Array[] = [];
  private rate = 48000;

  async iniciar(deviceId = ""): Promise<void> {
    if (this.estado() !== "reposo") return;
    const generation = ++this.generation;
    this.texto.set("");
    this.error.set("");
    this.chunks = [];
    this.estado.set("preparando");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId
          ? { deviceId: { exact: deviceId }, channelCount: 1 }
          : { channelCount: 1 },
        video: false,
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      const context = new AudioContext();
      this.context = context;
      this.rate = context.sampleRate;
      await context.audioWorklet.addModule("/audio-recorder.worklet.js");
      if (generation !== this.generation) return;
      const processor = new AudioWorkletNode(context, "dalo-audio-recorder");
      this.processor = processor;
      processor.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (generation === this.generation && this.estado() === "grabando")
          this.chunks.push(event.data);
      };
      const source = context.createMediaStreamSource(stream);
      source.connect(processor);
      processor.connect(context.destination);
      await context.resume();
      if (generation !== this.generation) return;
      this.estado.set("grabando");
      this.timer = setTimeout(() => void this.finalizar(), 15000);
    } catch {
      if (generation === this.generation) {
        this.liberar();
        this.estado.set("reposo");
        this.error.set(
          "No se pudo iniciar el micrófono. Revisa permisos o escribe el mensaje.",
        );
      }
    }
  }

  async finalizar(): Promise<void> {
    if (this.estado() !== "grabando") return;
    const generation = this.generation;
    this.estado.set("transcribiendo");
    this.liberar();
    const abort = new AbortController();
    this.abort = abort;
    try {
      const wav = encodeWav(this.chunks, this.rate);
      this.chunks = [];
      const response = await fetch(`${this.apiUrl}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "audio/wav" },
        body: wav,
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(65000)]),
      });
      const body = (await response.json()) as {
        transcript?: string;
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error || "No se pudo transcribir el audio.");
      if (generation !== this.generation) return;
      if (typeof body.transcript !== "string")
        throw new Error("La transcripción de Meta no es válida.");
      this.texto.set(body.transcript);
      if (!body.transcript.trim())
        this.error.set("No se detectó voz. Repite el dictado.");
    } catch (error) {
      if (generation === this.generation && !abort.signal.aborted)
        this.error.set(
          error instanceof Error
            ? error.message
            : "No se pudo transcribir el audio.",
        );
    } finally {
      if (generation === this.generation) {
        this.estado.set("reposo");
        this.abort = null;
      }
    }
  }

  private liberar(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.processor) {
      this.processor.port.onmessage = null;
      this.processor.disconnect();
      this.processor = null;
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.context) {
      void this.context.close().catch(() => {});
      this.context = null;
    }
  }
  cancelar(): void {
    this.generation++;
    this.abort?.abort();
    this.abort = null;
    this.liberar();
    this.chunks = [];
    this.texto.set("");
    this.estado.set("reposo");
  }
}
