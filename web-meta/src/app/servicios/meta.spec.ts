import { TestBed } from "@angular/core/testing";
import { MetaService, ResultadoMeta } from "./meta";
import { API_URL } from "./api-url";
describe("MetaService", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("usa la API configurada para conexión, contexto y reconocimiento", async () => {
    TestBed.configureTestingModule({ providers: [{ provide: API_URL, useValue: '/servicios/api' }] });
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      if (url.endsWith('/recognize/stream')) return new Response(JSON.stringify({ type: 'result', result: { clase: 'hola' } }) + '\n');
      return Response.json({ configured: true });
    });
    const service = TestBed.inject(MetaService);
    await service.comprobar();
    await service.cargarContexto();
    await service.enviar(['jpeg'], '', new AbortController().signal);
    expect(urls).toContain('/servicios/api/health');
    expect(urls).toContain('/servicios/api/context');
    expect(urls).toContain('/servicios/api/recognize/stream');
  });
  it("cancelar durante la cuenta previa impide grabar o enviar el video", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const service = TestBed.inject(MetaService);
    service.configurada.set(true);
    const pending = service.capturar({ readyState: 2, videoWidth: 640, videoHeight: 480 } as HTMLVideoElement, "");
    expect(service.preparandoCaptura()).toBe(true);
    expect(service.grabando()).toBe(false);
    service.cancelar();
    expect(await pending).toBeNull();
    expect(service.preparandoCaptura()).toBe(false);
    expect(service.grabando()).toBe(false);
    expect(service.ocupado()).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("envía solo el video, sin adjuntar fotogramas ni etiqueta esperada", async () => {
    vi.stubGlobal("fetch", async (_url: string, options: RequestInit) => {
      expect(JSON.parse(options.body as string)).toEqual({
        videoDataUrl: "data:video/webm;base64,AAAA",
      });
      return new Response(
        JSON.stringify({
          type: "result",
          result: {
            clase: "hola",
            confianza: 0.8,
            motivo: "Movimiento",
            model: "muse-spark-1.3-contributor",
            latencyMs: 10,
            promptVersion: "lsc-motion-v3",
          },
        }) + "\n",
      );
    });
    await TestBed.inject(MetaService).enviar(
      [],
      "perdon",
      new AbortController().signal,
      "data:video/webm;base64,AAAA",
    );
  });
  it("muestra configuración pendiente sin inventar un resultado", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({ configured: false, model: "muse-spark-1.3" }),
    );
    const service = TestBed.inject(MetaService);
    await service.comprobar();
    expect(service.configurada()).toBe(false);
    expect(service.resultado()).toBeNull();
    expect(service.estado()).toContain("pendiente");
  });
  it("no confunde un backend caído con clave pendiente", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    const service = TestBed.inject(MetaService);
    await service.comprobar();
    expect(service.configurada()).toBe(false);
    expect(service.error()).toContain("backend");
  });
  it("calcula aciertos solo sobre capturas etiquetadas", () => {
    const service = TestBed.inject(MetaService);
    const resultado: ResultadoMeta = {
      clase: "hola",
      confianza: 0.8,
      motivo: "Movimiento",
      model: "muse-spark-1.3",
      latencyMs: 123,
      promptVersion: "v1",
    };
    service.ensayos.set([
      { ...resultado, esperada: "hola", fecha: "2026-10-29" },
      { ...resultado, esperada: "gracias", clase: "otra", fecha: "2026-10-29" },
      { ...resultado, esperada: "", fecha: "2026-10-29" },
    ]);
    expect(service.resumen()).toBe("1/2 aciertos en capturas etiquetadas");
  });
  it("registra resultado y latencia sin filtrar la etiqueta al backend", async () => {
    vi.stubGlobal("fetch", async (_url: string, options: RequestInit) => {
      expect(JSON.parse(options.body as string)).toEqual({ frames: ["jpeg"] });
      const result = {
        clase: "hola",
        confianza: 0.8,
        motivo: "Movimiento",
        model: "muse-spark-1.3",
        latencyMs: 123,
        promptVersion: "v1",
      };
      return new Response(JSON.stringify({ type: "result", result }) + "\n", {
        headers: { "Content-Type": "application/x-ndjson" },
      });
    });
    const service = TestBed.inject(MetaService);
    await service.enviar(["jpeg"], "gracias", new AbortController().signal);
    expect(service.resultado()?.clase).toBe("hola");
    expect(service.ensayos()[0].esperada).toBe("gracias");
    expect(service.resumen()).toBe("0/1 aciertos en capturas etiquetadas");
  });
  it("un error de Meta no crea un ensayo exitoso ni reutiliza una propuesta", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({ error: "Clave pendiente" }, { status: 503 }),
    );
    const service = TestBed.inject(MetaService);
    await expect(
      service.enviar(["jpeg"], "hola", new AbortController().signal),
    ).rejects.toThrow("Clave pendiente");
    expect(service.ensayos()).toEqual([]);
    expect(service.resultado()).toBeNull();
  });
  it("muestra el resumen público antes de terminar y conserva eventos partidos entre bytes", async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const encoder = new TextEncoder();
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          new ReadableStream({
            async start(controller) {
              const data = encoder.encode(
                JSON.stringify({
                  type: "stage",
                  message: "Meta aceptó la petición.",
                  elapsedMs: 10,
                }) +
                  "\n" +
                  JSON.stringify({
                    type: "summary",
                    text: "Mano y orientación visibles.",
                    elapsedMs: 20,
                  }) +
                  "\n",
              );
              controller.enqueue(data.slice(0, data.length - 4));
              controller.enqueue(data.slice(data.length - 4));
              await gate;
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: "result",
                    result: {
                      clase: "otra",
                      confianza: 0.2,
                      motivo: "No distingue",
                      model: "muse-spark-1.3",
                      latencyMs: 25,
                      promptVersion: "v1",
                    },
                  }) + "\n",
                ),
              );
              controller.close();
            },
          }),
          { headers: { "Content-Type": "application/x-ndjson" } },
        ),
    );
    const service = TestBed.inject(MetaService);
    const pending = service.enviar(["jpeg"], "", new AbortController().signal);
    try {
      await vi.waitFor(() =>
        expect(service.resumenModelo()).toBe("Mano y orientación visibles."),
      );
      expect(service.resultado()).toBeNull();
      expect(service.ensayos()).toEqual([]);
      finish();
      await pending;
      expect(service.resultado()?.clase).toBe("otra");
    } finally {
      finish();
      await pending.catch(() => {});
    }
  });
  it("no registra un resultado si la conexión termina sin evento final", async () => {
    vi.stubGlobal(
      "fetch",
      async () => new Response('{"type":"summary","text":"Observando"}\n'),
    );
    const service = TestBed.inject(MetaService);
    await expect(
      service.enviar(["jpeg"], "", new AbortController().signal),
    ).rejects.toThrow();
    expect(service.resultado()).toBeNull();
    expect(service.ensayos()).toEqual([]);
  });
});
