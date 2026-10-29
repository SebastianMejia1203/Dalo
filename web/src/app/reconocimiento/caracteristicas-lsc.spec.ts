import { describe, expect, it } from 'vitest';
import {
  NOMBRES_CARACTERISTICAS,
  PuntoMundo,
  extraerCaracteristicas,
  prepararClip,
} from './caracteristicas-lsc';
import fixture from './paridad-fixture.json';

type PuntoJson = [number, number, number] | null;

function aPuntos(grupo: unknown): (PuntoMundo | null)[][] {
  const filas = grupo as unknown as (PuntoJson[] | null)[];
  return filas.map((fila) =>
    (fila ?? []).map((p) => (p === null ? null : ([p[0], p[1], p[2]] as PuntoMundo))),
  );
}

describe('caracteristicas-lsc (paridad con Python v2)', () => {
  it('usa los mismos nombres y orden de características que Python', () => {
    expect(NOMBRES_CARACTERISTICAS).toEqual(fixture.nombres);
    expect(NOMBRES_CARACTERISTICAS.length).toBe(151);
  });

  it('reproduce la matriz de características de una secuencia real', () => {
    const entrada = {
      poseMundo: aPuntos(fixture.entrada.pose_mundo),
      manoIzquierdaMundo: aPuntos(fixture.entrada.mano_izquierda_mundo),
      manoDerechaMundo: aPuntos(fixture.entrada.mano_derecha_mundo),
    };
    const salida = extraerCaracteristicas(entrada);
    const esperado = fixture.esperado as (number | null)[][];
    expect(salida.length).toBe(esperado.length);
    let comparadas = 0;
    for (let t = 0; t < esperado.length; t++) {
      for (let d = 0; d < esperado[t].length; d++) {
        const e = esperado[t][d];
        const s = salida[t][d];
        if (e === null) {
          expect(Number.isNaN(s), `fotograma ${t} dimensión ${d} debería ser NaN`).toBe(true);
        } else {
          expect(Math.abs(s - e), `fotograma ${t} dimensión ${d}`).toBeLessThan(2e-4);
          comparadas += 1;
        }
      }
    }
    expect(comparadas).toBeGreaterThan(1000);
  });

  it('prepararClip devuelve 48 fotogramas finitos', () => {
    const entrada = {
      poseMundo: aPuntos(fixture.entrada.pose_mundo),
      manoIzquierdaMundo: aPuntos(fixture.entrada.mano_izquierda_mundo),
      manoDerechaMundo: aPuntos(fixture.entrada.mano_derecha_mundo),
    };
    const clip = prepararClip(extraerCaracteristicas(entrada));
    expect(clip.length).toBe(48);
    expect(clip[0].length).toBe(151);
    expect(clip.flat().every((v) => Number.isFinite(v))).toBe(true);
  });
});
