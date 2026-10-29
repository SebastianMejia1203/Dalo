// Punto de intercambio para futuras integraciones.
// - matchSpanishText: se reemplazará por identificación de intención con backend/Meta.
// - recognizeTurn: se reemplazará por el clasificador temporal (MediaPipe + modelo).
// Ninguna función llama a modelos, entrenamiento ni servicios de pago.

import { DALO_CATALOG, Expresion } from './catalog';

export type CoincidenciaEspanol =
  | { kind: 'vacio' }
  | { kind: 'directa'; id: string; via: 'exacta' | 'contenida' }
  | { kind: 'ambigua'; ids: string[] }
  | { kind: 'fuera' };

export type ResultadoReconocimiento =
  | { kind: 'desconocida' }
  | { kind: 'candidata'; id: string }
  | { kind: 'ambigua' };

export function normalizeSpanish(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findById(id: string): Expresion | null {
  return DALO_CATALOG.find((e) => e.id === id) ?? null;
}

// Español -> LSC con el catálogo.
// Coincidencia de una sola intención: directa, sin confirmación.
// Varias intenciones en la misma frase: ambigua. Resto: fuera de catálogo.
export function matchSpanishText(rawText: string): CoincidenciaEspanol {
  const norm = normalizeSpanish(rawText);
  if (!norm) return { kind: 'vacio' };

  for (const entry of DALO_CATALOG) {
    if (entry.formulaciones.map(normalizeSpanish).includes(norm)) {
      return { kind: 'directa', id: entry.id, via: 'exacta' };
    }
  }

  const hits: string[] = [];
  for (const entry of DALO_CATALOG) {
    const found = entry.formulaciones.map(normalizeSpanish).some((f) => {
      if (!f) return false;
      return ` ${norm} `.includes(` ${f} `) || (norm.length >= 4 && f.includes(norm));
    });
    if (found) hits.push(entry.id);
  }
  if (hits.length === 1) return { kind: 'directa', id: hits[0], via: 'contenida' };
  if (hits.length > 1) return { kind: 'ambigua', ids: hits };
  return { kind: 'fuera' };
}

// LSC -> Español por duración. Regla para cubrir los tres estados sin modelo
// conectado: captura muy breve -> desconocida; breve normal -> candidata del
// catálogo; larga -> ambigüedad (pide repetir).
export function recognizeTurn(durationMs: number): ResultadoReconocimiento {
  if (durationMs < 1500) return { kind: 'desconocida' };
  if (durationMs <= 6000) return { kind: 'candidata', id: 'gracias' };
  return { kind: 'ambigua' };
}
