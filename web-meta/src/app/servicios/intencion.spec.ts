import { TestBed } from "@angular/core/testing";
import { IntencionService } from "./intencion";
import { API_URL } from "./api-url";

describe("IntencionService", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("envía el texto al backend y conserva el resultado", async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: API_URL, useValue: "/api" }],
    });
    let cuerpo: unknown;
    vi.stubGlobal("fetch", async (_url: string, options: RequestInit) => {
      cuerpo = JSON.parse(options.body as string);
      return Response.json({
        id: "muybien",
        confianza: 0.9,
        motivo: "Todo salió muy bien",
        model: "muse-spark-1.3-contributor",
        latencyMs: 120,
        promptVersion: "lsc-intent-v1",
      });
    });
    const service = TestBed.inject(IntencionService);
    const resultado = await service.interpretar("  todo salió muy bien ");
    expect(cuerpo).toEqual({ text: "todo salió muy bien" });
    expect(resultado?.id).toBe("muybien");
    expect(service.resultado()?.promptVersion).toBe("lsc-intent-v1");
    expect(service.ocupado()).toBe(false);
  });

  it("un error del backend no inventa intención y deja error visible", async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: API_URL, useValue: "/api" }],
    });
    vi.stubGlobal("fetch", async () =>
      Response.json({ error: "Clave pendiente" }, { status: 503 }),
    );
    const service = TestBed.inject(IntencionService);
    expect(await service.interpretar("hola")).toBeNull();
    expect(service.resultado()).toBeNull();
    expect(service.error()).toContain("Clave pendiente");
  });

  it("ignora texto vacío sin llamar al backend", async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: API_URL, useValue: "/api" }],
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const service = TestBed.inject(IntencionService);
    expect(await service.interpretar("   ")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
