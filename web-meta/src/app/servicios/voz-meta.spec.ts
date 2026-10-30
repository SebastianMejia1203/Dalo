import { TestBed } from "@angular/core/testing";
import { VozMeta } from "./voz-meta";
import { API_URL } from "./api-url";
describe("dictado Meta", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("envía dictado a la API configurada", async () => {
    TestBed.configureTestingModule({ providers: [{ provide: API_URL, useValue: '/servicios/api' }] });
    let destination = '';
    vi.stubGlobal('fetch', async (url: string) => {
      destination = url;
      return Response.json({ transcript: 'Hola' });
    });
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
    vi.stubGlobal('AudioContext', class {
      sampleRate = 48000;
      destination = {};
      audioWorklet = { addModule: async () => {} };
      createMediaStreamSource() { return { connect() {} }; }
      async resume() {}
      async close() {}
    });
    let audioPort: { onmessage: ((event: MessageEvent<Float32Array>) => void) | null } = { onmessage: null };
    vi.stubGlobal('AudioWorkletNode', class {
      port = audioPort;
      connect() {}
      disconnect() {}
    });
    const service = TestBed.inject(VozMeta);
    await service.iniciar();
    audioPort.onmessage!(new MessageEvent('message', { data: new Float32Array([0, 0.5, -0.5, 0]) }));
    await service.finalizar();
    expect(destination).toBe('/servicios/api/transcribe');
    expect(service.texto()).toBe('Hola');
  });
  it("no deja abierto el micrófono si el permiso llega después de cancelar", async () => {
    let resolve!: (stream: MediaStream) => void;
    const stop = vi.fn();
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: () =>
          new Promise<MediaStream>((r) => {
            resolve = r;
          }),
      },
    });
    const service = TestBed.inject(VozMeta);
    const pending = service.iniciar();
    service.cancelar();
    resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    await pending;
    expect(stop).toHaveBeenCalledOnce();
    expect(service.estado()).toBe("reposo");
  });
});
