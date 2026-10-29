"""Genera láminas de muestra: fotogramas del video con el esqueleto detectado.

Sirve para revisar visualmente que el reprocesamiento (Fase 2) sigue el
cuerpo y las manos. Uso:
    .venv\\Scripts\\python.exe tools/reconocimiento/muestra_visual.py \
        --video "...\\Chao\\0.avi" --secuencia data/reconocimiento/secuencias/chao/1_0.npz \
        --salida data/reconocimiento/muestras/chao-1-0.jpg
"""

import argparse
from pathlib import Path

import cv2
import numpy as np

BORDES_MANO = [
    (0, 1), (1, 2), (2, 3), (3, 4), (0, 5), (5, 6), (6, 7), (7, 8),
    (5, 9), (9, 10), (10, 11), (11, 12), (9, 13), (13, 14), (14, 15),
    (15, 16), (13, 17), (17, 18), (18, 19), (19, 20), (0, 17),
]
BORDES_POSE = [
    (11, 12), (11, 13), (13, 15), (12, 14), (14, 16), (11, 23), (12, 24), (23, 24),
]


def dibujar(fotograma: np.ndarray, puntos: np.ndarray, bordes, color) -> None:
    alto, ancho = fotograma.shape[:2]

    def valido(p):
        return np.isfinite(p).all() and 0.0 <= p[0] <= 1.0 and 0.0 <= p[1] <= 1.0

    for a, b in bordes:
        pa, pb = puntos[a], puntos[b]
        if valido(pa) and valido(pb):
            cv2.line(
                fotograma,
                (int(pa[0] * ancho), int(pa[1] * alto)),
                (int(pb[0] * ancho), int(pb[1] * alto)),
                color,
                2,
            )
    for p in puntos:
        if valido(p):
            cv2.circle(fotograma, (int(p[0] * ancho), int(p[1] * alto)), 3, color, -1)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video", type=Path, required=True)
    parser.add_argument("--secuencia", type=Path, required=True)
    parser.add_argument("--salida", type=Path, required=True)
    parser.add_argument("--muestras", type=int, default=6)
    args = parser.parse_args()

    with np.load(args.secuencia) as datos:
        pose = datos["pose"]
        mano_i = datos["mano_izquierda"]
        mano_d = datos["mano_derecha"]
    captura = cv2.VideoCapture(str(args.video))
    total = int(captura.get(cv2.CAP_PROP_FRAME_COUNT))
    indices = np.linspace(0, min(total, len(pose)) - 1, args.muestras).astype(int)
    paneles = []
    for indice in indices:
        captura.set(cv2.CAP_PROP_POS_FRAMES, int(indice))
        ok, fotograma = captura.read()
        if not ok:
            continue
        dibujar(fotograma, pose[indice], BORDES_POSE, (0, 200, 0))
        dibujar(fotograma, mano_i[indice], BORDES_MANO, (255, 80, 0))
        dibujar(fotograma, mano_d[indice], BORDES_MANO, (0, 80, 255))
        cv2.putText(
            fotograma,
            f"f{indice}",
            (8, 24),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (255, 255, 255),
            2,
        )
        paneles.append(fotograma)
    captura.release()
    if not paneles:
        print("No se pudieron leer fotogramas.")
        return 1
    columnas = 3
    filas = [paneles[i : i + columnas] for i in range(0, len(paneles), columnas)]
    ancho_fila = max(sum(p.shape[1] for p in fila) for fila in filas)
    lamina = np.full(
        (sum(max(p.shape[0] for p in fila) for fila in filas), ancho_fila, 3),
        255,
        dtype=np.uint8,
    )
    y = 0
    for fila in filas:
        x = 0
        altura = max(p.shape[0] for p in fila)
        for panel in fila:
            lamina[y : y + panel.shape[0], x : x + panel.shape[1]] = panel
            x += panel.shape[1]
        y += altura
    args.salida.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(args.salida), lamina)
    print(f"Lámina escrita en {args.salida} ({len(paneles)} fotogramas)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
