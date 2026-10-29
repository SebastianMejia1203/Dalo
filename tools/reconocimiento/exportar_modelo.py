"""Entrena el modelo final con todos los clips y lo exporta a ONNX.

La evaluación independiente vive en `entrenar.py` (LOSO). Este script
solo produce el artefacto para la web: `modelo.onnx` + `modelo.json`
con clases, nombres de características y normalización.

Uso:
    .venv\\Scripts\\python.exe tools/reconocimiento/exportar_modelo.py \
        --secuencias-dir data/reconocimiento/secuencias \
        --salida-dir web/public/modelo-reconocimiento
"""

import argparse
import json
from pathlib import Path
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import caracteristicas  # noqa: E402
import entrenar  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--secuencias-dir", type=Path, required=True)
    parser.add_argument("--salida-dir", type=Path, required=True)
    parser.add_argument("--epocas", type=int, default=60)
    parser.add_argument("--clases", default="chao,perfecto,hola,gracias,esperar,losiento,bienvenido,perdon",
                        help="Señas con clase propia, separadas por comas.")
    args = parser.parse_args()
    entrenar.configurar_clases([c.strip() for c in args.clases.split(",") if c.strip()])

    import torch

    clips, indice = entrenar.cargar_dataset(args.secuencias_dir)
    if not clips:
        print("No hay clips para entrenar.", file=sys.stderr)
        return 1
    modelo, media, desviacion = entrenar.entrenar_fold(
        torch, clips, indice, args.epocas, semilla=42
    )
    modelo.eval()
    args.salida_dir.mkdir(parents=True, exist_ok=True)
    ruta_onnx = args.salida_dir / "modelo.onnx"
    ejemplo = torch.zeros(1, 48, len(caracteristicas.NOMBRES), dtype=torch.float32)
    torch.onnx.export(
        modelo,
        ejemplo,
        str(ruta_onnx),
        input_names=["secuencia"],
        output_names=["logitos"],
        dynamic_axes={"secuencia": {0: "lote"}, "logitos": {0: "lote"}},
        opset_version=17,
    )
    # Un solo archivo: el exportador de Torch guarda los pesos en un
    # `.onnx.data` externo; se reincrusta para que la web sirva un único
    # archivo de modelo.
    import onnx

    modelo_onnx = onnx.load(str(ruta_onnx), load_external_data=True)
    onnx.save_model(modelo_onnx, str(ruta_onnx), save_as_external_data=False)
    externo = ruta_onnx.with_suffix(".onnx.data")
    if externo.exists():
        externo.unlink()
    metadatos = {
        "clases": entrenar.CLASES,
        "fotogramas": 48,
        "caracteristicas": caracteristicas.NOMBRES,
        "media": np.asarray(media).reshape(-1).tolist(),
        "desviacion": np.asarray(desviacion).reshape(-1).tolist(),
        "version_caracteristicas": 2,
    }
    (args.salida_dir / "modelo.json").write_text(
        json.dumps(metadatos, ensure_ascii=False), encoding="utf-8"
    )
    print(f"Modelo exportado en {ruta_onnx} ({ruta_onnx.stat().st_size} bytes)")
    print(f"Metadatos en {args.salida_dir / 'modelo.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
