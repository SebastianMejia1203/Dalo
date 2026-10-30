import { TestBed } from "@angular/core/testing";
import { Comunicador } from "./comunicador";
import { DaloService } from "../servicios/dalo";
import { appConfig } from "../app.config";
import { MetaService } from "../servicios/meta";

describe("navegación de captura", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("encuentra la seña al escribir sin pulsar un botón de búsqueda", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ configured: false }));
    TestBed.configureTestingModule({
      imports: [Comunicador],
      providers: appConfig.providers,
    });
    const fixture = TestBed.createComponent(Comunicador);
    const dalo = TestBed.inject(DaloService);
    dalo.cambiarDireccion("es-lsc");
    fixture.detectChanges();
    const campo = fixture.nativeElement.querySelector(
      "#texto-es",
    ) as HTMLTextAreaElement;
    campo.value = "hola";
    campo.dispatchEvent(new Event("input"));
    expect(dalo.resultadoEsl().estado).toBe("directa");
    expect(dalo.resultadoEsl().id).toBe("hola");
    expect(fixture.nativeElement.querySelector("#btn-buscar")).toBeNull();
    fixture.destroy();
  });
  it("muestra la cuenta antes de grabar y retira el indicador rojo al interpretar", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ configured: true }));
    TestBed.configureTestingModule({
      imports: [Comunicador],
      providers: appConfig.providers,
    });
    const fixture = TestBed.createComponent(Comunicador);
    fixture.detectChanges();
    await fixture.whenStable();
    const meta = TestBed.inject(MetaService);
    TestBed.inject(DaloService).camara.set("activa");
    meta.ocupado.set(true);
    meta.preparandoCaptura.set(true);
    meta.segundosRestantes.set(3);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector(".preparacion-en-camara strong")
        .textContent,
    ).toContain("3");
    meta.segundosRestantes.set(1);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector(".preparacion-en-camara strong")
        .textContent,
    ).toContain("1");
    expect(fixture.nativeElement.querySelector(".punto-grabacion")).toBeNull();
    meta.preparandoCaptura.set(false);
    meta.grabando.set(true);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector(".punto-grabacion"),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector(".preparacion-en-camara"),
    ).toBeNull();
    meta.grabando.set(false);
    meta.videoCapturado.set("blob:test");
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector(".punto-grabacion")).toBeNull();
    expect(
      fixture.nativeElement.querySelector(".captura-completa").textContent,
    ).toContain("Video capturado");
    expect(
      fixture.nativeElement.querySelector(".progreso-captura").textContent,
    ).toContain("Paso 2 de 2");
    meta.videoCapturado.set(null);
    fixture.destroy();
  });
  it("las etiquetas de evaluación siguen el catálogo del backend al añadir palabras", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({ configured: false, model: "muse-spark-1.3-contributor" }),
    );
    TestBed.configureTestingModule({
      imports: [Comunicador],
      providers: appConfig.providers,
    });
    const fixture = TestBed.createComponent(Comunicador);
    fixture.detectChanges();
    await fixture.whenStable();
    TestBed.inject(MetaService).contexto.set({
      model: "muse-spark-1.3-contributor",
      promptVersion: "test",
      instructions: "LSC",
      catalog: [
        {
          id: "bien",
          nombre: "Bien",
          significado: "Bien",
          intencion: "Expresar bienestar",
        },
        { id: "si", nombre: "Sí", significado: "Sí", intencion: "Afirmar" },
      ],
    });
    fixture.detectChanges();
    const options = Array.from(
      (fixture.nativeElement.querySelector("#esperada") as HTMLSelectElement)
        .options,
    ).map((option) => option.value);
    expect(options).toContain("bien");
    expect(options).toContain("si");
    expect(options).toContain("otra");
    expect(options).not.toContain("perdon");
    fixture.destroy();
  });
  it("apaga la cámara al cambiar a Español → Señas", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({ configured: false, model: "muse-spark-1.3" }),
    );
    TestBed.configureTestingModule({
      imports: [Comunicador],
      providers: appConfig.providers,
    });
    const fixture = TestBed.createComponent(Comunicador);
    const dalo = TestBed.inject(DaloService);
    fixture.detectChanges();
    await fixture.whenStable();
    dalo.camara.set("activa");
    (
      fixture.nativeElement.querySelector("#tab-es-lsc") as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(dalo.direccion()).toBe("es-lsc");
    expect(dalo.camara()).toBe("apagada");
    fixture.destroy();
  });
});
