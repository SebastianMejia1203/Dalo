import { TestBed } from "@angular/core/testing";
import { DaloService } from "./dalo";

describe("ciclo de cámara Meta", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("libera el permiso tardío si se abandona la cámara antes de que responda", async () => {
    let resolver!: (stream: MediaStream) => void;
    const stop = vi.fn();
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: () =>
          new Promise<MediaStream>((resolve) => {
            resolver = resolve;
          }),
      },
    });
    const service = TestBed.inject(DaloService);
    const apertura = service.activarCamara();
    service.apagarCamara();
    resolver({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    await apertura;
    expect(service.camara()).toBe("apagada");
    expect(stop).toHaveBeenCalledOnce();
  });
  it("solo confirma una candidata y conserva el significado en el historial", () => {
    const service = TestBed.inject(DaloService);
    service.candidataId.set("hola");
    service.confirmarCandidata();
    expect(service.turnos()).toEqual([]);
    service.faseLsc.set("candidata");
    service.confirmarCandidata();
    expect(service.significadoConfirmado()).toBe("Hola");
    expect(service.turnos()).toEqual(["Hola"]);
    service.confirmarCandidata();
    expect(service.turnos()).toEqual(["Hola"]);
  });
});
