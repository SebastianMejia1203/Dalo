import { analizarEnsayos } from "./admin";
import type { Ensayo } from "./meta";

const ensayo = (parcial: Partial<Ensayo>): Ensayo => ({
  clase: "hola",
  confianza: 0.9,
  motivo: "x",
  model: "muse-spark-1.3-contributor",
  latencyMs: 1000,
  promptVersion: "lsc-motion-v4-11",
  esperada: "hola",
  fecha: "2026-11-02",
  ...parcial,
});

describe("analizarEnsayos", () => {
  it("resume aciertos, confusiones, rechazo y latencia sin contar no etiquetados", () => {
    const analisis = analizarEnsayos([
      ensayo({}),
      ensayo({ clase: "chao", confianza: 0.85, latencyMs: 3000 }),
      ensayo({ esperada: "otra", clase: "otra", latencyMs: 2000 }),
      ensayo({ esperada: "otra", clase: "bien", confianza: 0.5 }),
      ensayo({ esperada: "" }),
    ]);
    expect(analisis.total).toBe(4);
    expect(analisis.correctos).toBe(2);
    expect(analisis.porClase).toEqual([
      { esperada: "hola", intentos: 2, aciertos: 1 },
      { esperada: "otra", intentos: 2, aciertos: 1 },
    ]);
    expect(analisis.confusion).toEqual([
      { real: "hola", predicha: "chao", veces: 1 },
      { real: "otra", predicha: "bien", veces: 1 },
    ]);
    expect(analisis.rechazo).toEqual({ correctos: 1, intentos: 2 });
    expect(analisis.erroresConfianzaAlta).toHaveLength(1);
    expect(analisis.latenciaMedianaMs).toBe(2000);
  });

  it("sin ensayos etiquetados devuelve un análisis vacío", () => {
    const analisis = analizarEnsayos([ensayo({ esperada: "" })]);
    expect(analisis.total).toBe(0);
    expect(analisis.rechazo).toBeNull();
    expect(analisis.latenciaMedianaMs).toBeNull();
  });
});
