// Características v2 para el modelo entrenado (espejo de
// `tools/reconocimiento/caracteristicas.py`). La prueba de paridad
// (`caracteristicas-lsc.spec.ts`) verifica que esta implementación
// reproduce la matriz calculada por Python sobre una secuencia real.

export type PuntoMundo = [number, number, number];

export interface SecuenciaMundo {
  poseMundo: (PuntoMundo | null)[][];
  manoIzquierdaMundo: (PuntoMundo | null)[][];
  manoDerechaMundo: (PuntoMundo | null)[][];
}

const EJES = ['x', 'y', 'z'] as const;

function construirNombres(): string[] {
  const nombres: string[] = [];
  for (const punto of ['codo_izquierda', 'codo_derecha', 'muneca_izquierda', 'muneca_derecha']) {
    for (const eje of EJES) nombres.push(`${punto}_${eje}`);
  }
  for (const lado of ['izquierda', 'derecha']) {
    for (let indice = 0; indice < 21; indice++) {
      for (const eje of EJES) nombres.push(`mano_${lado}_${indice}_${eje}`);
    }
  }
  nombres.push(
    'contacto_pulgar_indice_izquierda',
    'contacto_pulgar_indice_derecha',
    'distancia_munecas',
    'distancia_pulgares',
    'distancia_indices',
  );
  for (const lado of ['izquierda', 'derecha']) {
    for (const eje of EJES) nombres.push(`velocidad_muneca_${lado}_${eje}`);
  }
  nombres.push('presencia_mano_izquierda', 'presencia_mano_derecha');
  return nombres;
}

export const NOMBRES_CARACTERISTICAS: readonly string[] = construirNombres();
export const DIMENSION_CARACTERISTICAS = NOMBRES_CARACTERISTICAS.length;
const INDICE: ReadonlyMap<string, number> = new Map(
  NOMBRES_CARACTERISTICAS.map((nombre, i) => [nombre, i] as const),
);

const HOMBRO_I = 11;
const HOMBRO_D = 12;
const ARTICULACIONES: ReadonlyArray<readonly [string, number]> = [
  ['codo_izquierda', 13],
  ['codo_derecha', 14],
  ['muneca_izquierda', 15],
  ['muneca_derecha', 16],
];
const PULGAR = 4;
const INDICE_DEDO = 8;
const MEDIO = 9;

function distancia(a: PuntoMundo, b: PuntoMundo): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

interface FormaMano {
  puntos: (PuntoMundo | null)[];
  escala: number;
}

function formaMano(mundo: (PuntoMundo | null)[]): FormaMano {
  const vacia: FormaMano = {
    puntos: Array.from({ length: 21 }, () => null),
    escala: Number.NaN,
  };
  if (!mundo || !mundo.some((p) => p !== null)) return vacia;
  const muneca = mundo[0];
  const medio = mundo[MEDIO];
  if (!muneca || !medio) return vacia;
  const escala = distancia(medio, muneca);
  if (!Number.isFinite(escala) || escala < 1e-6) return vacia;
  return {
    puntos: mundo.map((p) =>
      p
        ? [
            (p[0] - muneca[0]) / escala,
            (p[1] - muneca[1]) / escala,
            (p[2] - muneca[2]) / escala,
          ]
        : null,
    ),
    escala,
  };
}

/** Matriz (fotogramas × 151) con NaN donde el dato no fue detectado. */
export function extraerCaracteristicas(secuencia: SecuenciaMundo): number[][] {
  const total = secuencia.poseMundo.length;
  const salida: number[][] = Array.from({ length: total }, () =>
    Array.from({ length: DIMENSION_CARACTERISTICAS }, () => Number.NaN),
  );
  const idx = (nombre: string): number => INDICE.get(nombre) as number;

  for (let t = 0; t < total; t++) {
    const pose = secuencia.poseMundo[t] ?? [];
    const hombroI = pose[HOMBRO_I] ?? null;
    const hombroD = pose[HOMBRO_D] ?? null;
    let centro: PuntoMundo | null = null;
    let escalaTorso = Number.NaN;
    if (hombroI && hombroD) {
      centro = [
        (hombroI[0] + hombroD[0]) / 2,
        (hombroI[1] + hombroD[1]) / 2,
        (hombroI[2] + hombroD[2]) / 2,
      ];
      escalaTorso = distancia(hombroI, hombroD);
      if (escalaTorso >= 1e-6) {
        for (const [nombre, articulacion] of ARTICULACIONES) {
          const punto = pose[articulacion] ?? null;
          if (!punto || !centro) continue;
          for (let eje = 0; eje < 3; eje++) {
            salida[t][idx(`${nombre}_${EJES[eje]}`)] = (punto[eje] - centro[eje]) / escalaTorso;
          }
        }
      } else {
        escalaTorso = Number.NaN;
      }
    }
    const formas: Record<'izquierda' | 'derecha', FormaMano> = {
      izquierda: formaMano(secuencia.manoIzquierdaMundo[t] ?? []),
      derecha: formaMano(secuencia.manoDerechaMundo[t] ?? []),
    };
    for (const lado of ['izquierda', 'derecha'] as const) {
      const forma = formas[lado];
      salida[t][idx(`presencia_mano_${lado}`)] = Number.isFinite(forma.escala) ? 1 : 0;
      if (!forma.puntos.some((p) => p !== null)) continue;
      for (let punto = 0; punto < 21; punto++) {
        const p = forma.puntos[punto];
        if (!p) continue;
        for (let eje = 0; eje < 3; eje++) {
          salida[t][idx(`mano_${lado}_${punto}_${EJES[eje]}`)] = p[eje];
        }
      }
      const pulgar = forma.puntos[PULGAR];
      const indiceDedo = forma.puntos[INDICE_DEDO];
      if (pulgar && indiceDedo) {
        salida[t][idx(`contacto_pulgar_indice_${lado}`)] = distancia(pulgar, indiceDedo);
      }
    }
    const munecaI = pose[15] ?? null;
    const munecaD = pose[16] ?? null;
    if (hombroI && hombroD && munecaI && munecaD && Number.isFinite(escalaTorso)) {
      salida[t][idx('distancia_munecas')] = distancia(munecaI, munecaD) / escalaTorso;
      const pares: ReadonlyArray<readonly [string, number]> = [
        ['distancia_pulgares', PULGAR],
        ['distancia_indices', INDICE_DEDO],
      ];
      for (const [nombre, dedo] of pares) {
        const formaI = formas.izquierda;
        const formaD = formas.derecha;
        const pi = formaI.puntos[dedo];
        const pd = formaD.puntos[dedo];
        if (!pi || !pd) continue;
        const puntaI: PuntoMundo = [
          munecaI[0] + pi[0] * formaI.escala,
          munecaI[1] + pi[1] * formaI.escala,
          munecaI[2] + pi[2] * formaI.escala,
        ];
        const puntaD: PuntoMundo = [
          munecaD[0] + pd[0] * formaD.escala,
          munecaD[1] + pd[1] * formaD.escala,
          munecaD[2] + pd[2] * formaD.escala,
        ];
        salida[t][idx(nombre)] = distancia(puntaI, puntaD) / escalaTorso;
      }
    }
  }
  // Velocidad de muñecas.
  for (const [lado, nombre] of [
    ['izquierda', 'muneca_izquierda'],
    ['derecha', 'muneca_derecha'],
  ] as const) {
    const columnas = EJES.map((eje) => idx(`${nombre}_${eje}`));
    const destino = EJES.map((eje) => idx(`velocidad_muneca_${lado}_${eje}`));
    for (let t = 0; t < total; t++) {
      for (let eje = 0; eje < 3; eje++) {
        if (total <= 1) {
          salida[t][destino[eje]] = 0;
        } else if (t === 0) {
          salida[t][destino[eje]] = salida[1][columnas[eje]] - salida[0][columnas[eje]];
        } else {
          salida[t][destino[eje]] =
            salida[t][columnas[eje]] - salida[t - 1][columnas[eje]];
        }
      }
    }
  }
  return salida;
}

/** Interpola linealmente a `objetivo` fotogramas (NaN solo si no hay datos). */
export function remuestrearSecuencia(secuencia: number[][], objetivo: number): number[][] {
  if (secuencia.length === 0 || objetivo <= 0) return [];
  if (secuencia.length === objetivo) return secuencia.map((fila) => [...fila]);
  const dimensiones = secuencia[0].length;
  const salida: number[][] = Array.from({ length: objetivo }, () =>
    Array.from({ length: dimensiones }, () => Number.NaN),
  );
  for (let columna = 0; columna < dimensiones; columna++) {
    const validos: number[] = [];
    for (let t = 0; t < secuencia.length; t++) {
      if (Number.isFinite(secuencia[t][columna])) validos.push(t);
    }
    if (validos.length === 0) continue;
    for (let i = 0; i < objetivo; i++) {
      const posicion = (i * (secuencia.length - 1)) / (objetivo - 1 || 1);
      if (validos.length === 1) {
        salida[i][columna] = secuencia[validos[0]][columna];
        continue;
      }
      let siguiente = validos.findIndex((v) => v >= posicion);
      if (siguiente === -1) siguiente = validos.length - 1;
      const b = validos[siguiente];
      const a = siguiente === 0 ? b : validos[siguiente - 1];
      if (a === b || posicion <= a) {
        salida[i][columna] = secuencia[a][columna];
      } else if (posicion >= b) {
        salida[i][columna] = secuencia[b][columna];
      } else {
        const fraccion = (posicion - a) / (b - a);
        salida[i][columna] =
          secuencia[a][columna] + (secuencia[b][columna] - secuencia[a][columna]) * fraccion;
      }
    }
  }
  return salida;
}

/** Recorta el reposo inicial/final conservando la actividad de manos. */
export function recortarSegmentoActivo(secuencia: number[][], margen = 3): number[][] {
  const idx = (nombre: string): number => INDICE.get(nombre) as number;
  const activos: number[] = [];
  for (let t = 0; t < secuencia.length; t++) {
    const presencia = Math.max(
      secuencia[t][idx('presencia_mano_izquierda')],
      secuencia[t][idx('presencia_mano_derecha')],
    );
    const velocidad = Math.max(
      Math.abs(secuencia[t][idx('velocidad_muneca_izquierda_x')]),
      Math.abs(secuencia[t][idx('velocidad_muneca_derecha_x')]),
    );
    if (presencia > 0.5 || velocidad > 0.05) activos.push(t);
  }
  if (activos.length === 0) return secuencia;
  const inicio = Math.max(0, activos[0] - margen);
  const fin = Math.min(secuencia.length, activos[activos.length - 1] + margen + 1);
  return secuencia.slice(inicio, fin);
}

/** Clip listo para el modelo: recorte, remuestreo a 48 y NaN sustituidos por 0. */
export function prepararClip(secuencia: number[][], fotogramas = 48): number[][] {
  const recorte = recortarSegmentoActivo(secuencia);
  const clip = remuestrearSecuencia(recorte, fotogramas);
  return clip.map((fila) => fila.map((v) => (Number.isFinite(v) ? v : 0)));
}
