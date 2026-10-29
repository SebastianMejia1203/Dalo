"""Genera el fixture de paridad Python/TypeScript de características v2.

Toma una secuencia `.npz` real y escribe un JSON con los landmarks
mundiales de entrada y la matriz de características calculada por
Python. La prueba de la web debe reproducirla con su implementación.

Uso:
    .venv\\Scripts\\python.exe tools/reconocimiento/generar_fixture_paridad.py \
        --secuencia data/reconocimiento/secuencias/chao/1_0.npz \
        --salida web/src/app/reconocimiento/paridad-fixture.json
"""

import argparse
import json
from pathlib import Path
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import caracteristicas  # noqa: E402


def a_listas(array: np.ndarray):
    return np.where(np.isfinite(array), np.round(array, 6), None).tolist()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--secuencia", type=Path, required=True)
    parser.add_argument("--salida", type=Path, required=True)
    args = parser.parse_args()
    with np.load(args.secuencia) as datos:
        entrada = {clave: datos[clave] for clave in datos.files}
    esperado = caracteristicas.extraer_caracteristicas(entrada)
    fixture = {
        "fuente": str(args.secuencia),
        "nombres": caracteristicas.NOMBRES,
        "entrada": {
            "pose_mundo": a_listas(entrada["pose_mundo"]),
            "mano_izquierda_mundo": a_listas(entrada["mano_izquierda_mundo"]),
            "mano_derecha_mundo": a_listas(entrada["mano_derecha_mundo"]),
        },
        "esperado": a_listas(esperado),
    }
    args.salida.parent.mkdir(parents=True, exist_ok=True)
    args.salida.write_text(json.dumps(fixture), encoding="utf-8")
    print(f"Fixture escrito en {args.salida}: {esperado.shape[0]} fotogramas, {esperado.shape[1]} características")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
