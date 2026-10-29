"""Línea base DTW multirreferencia con validación por participante.

Clasifica cada secuencia contra todas las de entrenamiento (vecino más
cercano) y evalúa dejando fuera a un participante por turno (LOSO), de
modo que ninguna persona evaluada aparece en las referencias.

Uso:
    .venv\\Scripts\\python.exe tools/reconocimiento/evaluar_dtw.py \
        --secuencias-dir data/reconocimiento/secuencias \
        --salida data/reconocimiento/informe-dtw.json
"""

import argparse
from collections import Counter
import json
from pathlib import Path
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import caracteristicas  # noqa: E402

PENALIZACION_SIN_DATOS = 4.0
FRACCION_MINIMA_DIMENSIONES = 0.15


def matriz_costes(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Distancia por par de fotogramas ignorando dimensiones ausentes."""
    diferencia = a[:, None, :] - b[None, :, :]
    validas = np.isfinite(diferencia)
    conteo = validas.sum(axis=2)
    suma = np.where(validas, diferencia, 0.0) ** 2
    suma = suma.sum(axis=2)
    minimo = max(1, int(FRACCION_MINIMA_DIMENSIONES * a.shape[1]))
    coste = np.full(conteo.shape, PENALIZACION_SIN_DATOS, dtype=np.float64)
    suficientes = conteo >= minimo
    coste[suficientes] = np.sqrt(suma[suficientes] / conteo[suficientes])
    return coste


def distancia_dtw(a: np.ndarray, b: np.ndarray) -> float:
    costes = matriz_costes(np.asarray(a, dtype=np.float64), np.asarray(b, dtype=np.float64))
    n, m = costes.shape
    acumulado = np.full((n + 1, m + 1), np.inf)
    acumulado[0, 0] = 0.0
    for i in range(1, n + 1):
        fila = acumulado[i]
        anterior = acumulado[i - 1]
        coste_fila = costes[i - 1]
        for j in range(1, m + 1):
            fila[j] = coste_fila[j - 1] + min(anterior[j], fila[j - 1], anterior[j - 1])
    pasos = n + m
    return float(acumulado[n, m] / pasos)


def cargar_clips(secuencias_dir: Path, fotogramas: int) -> list[dict]:
    clips = []
    for carpeta in sorted(secuencias_dir.iterdir()):
        if not carpeta.is_dir():
            continue
        for ruta in sorted(carpeta.glob("*.npz")):
            participante = ruta.stem.split("_")[0]
            secuencia = caracteristicas.cargar_secuencia(ruta)
            clips.append(
                {
                    "sena": carpeta.name,
                    "participante": participante,
                    "ruta": str(ruta),
                    "secuencia": caracteristicas.remuestrear_secuencia(secuencia, fotogramas),
                }
            )
    return clips


def evaluar_loso(clips: list[dict]) -> dict:
    participantes = sorted({c["participante"] for c in clips}, key=lambda p: int(p) if p.isdigit() else 0)
    predicciones = []
    for participante in participantes:
        entrenamiento = [c for c in clips if c["participante"] != participante]
        prueba = [c for c in clips if c["participante"] == participante]
        if not prueba or not entrenamiento:
            continue
        for clip in prueba:
            distancias = sorted(
                (distancia_dtw(clip["secuencia"], ref["secuencia"]), ref["sena"])
                for ref in entrenamiento
            )
            predicciones.append(
                {
                    "sena_real": clip["sena"],
                    "sena_predicha": distancias[0][1],
                    "participante": participante,
                    "ruta": clip["ruta"],
                    "distancia": round(distancias[0][0], 4),
                    "margen": round(distancias[1][0] - distancias[0][0], 4) if len(distancias) > 1 else None,
                }
            )
    etiquetas = sorted({c["sena"] for c in clips})
    confusion = {real: Counter() for real in etiquetas}
    aciertos = Counter()
    totales = Counter()
    for p in predicciones:
        confusion[p["sena_real"]][p["sena_predicha"]] += 1
        totales[p["sena_real"]] += 1
        if p["sena_real"] == p["sena_predicha"]:
            aciertos[p["sena_real"]] += 1
    por_clase = {
        sena: {
            "aciertos": aciertos[sena],
            "total": totales[sena],
            "recuperacion": round(aciertos[sena] / totales[sena], 4) if totales[sena] else None,
        }
        for sena in etiquetas
    }
    total_aciertos = sum(aciertos.values())
    return {
        "metodo": "DTW 1-NN multirreferencia, validación LOSO por participante",
        "clips": len(predicciones),
        "precision_global": round(total_aciertos / len(predicciones), 4) if predicciones else None,
        "por_clase": por_clase,
        "confusion": {real: dict(confusion[real]) for real in etiquetas},
        "errores": [p for p in predicciones if p["sena_real"] != p["sena_predicha"]],
        "predicciones": predicciones,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--secuencias-dir", type=Path, required=True)
    parser.add_argument("--fotogramas", type=int, default=48)
    parser.add_argument("--salida", type=Path, required=True)
    args = parser.parse_args()
    clips = cargar_clips(args.secuencias_dir, args.fotogramas)
    if not clips:
        print("No hay secuencias para evaluar.", file=sys.stderr)
        return 1
    informe = evaluar_loso(clips)
    informe["fotogramas_por_secuencia"] = args.fotogramas
    args.salida.parent.mkdir(parents=True, exist_ok=True)
    args.salida.write_text(json.dumps(informe, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Clips evaluados: {informe['clips']}")
    print(f"Precisión global LOSO: {informe['precision_global']}")
    for sena, datos in informe["por_clase"].items():
        print(f"{sena}: {datos['aciertos']}/{datos['total']} (recuperación {datos['recuperacion']})")
    print(f"Confusión: {informe['confusion']}")
    print(f"Informe escrito en {args.salida}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
