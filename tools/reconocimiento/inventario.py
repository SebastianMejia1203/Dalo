"""Inventario de videos LSC-54 para las señas objetivo del reconocimiento.

Recorre `Videos Courtesy/<participante>/Cordialidad/<sena>/*.avi`, sondea
cada video con OpenCV cuando está disponible y escribe un JSON con el
detalle por video y un resumen por seña. No modifica el dataset.

Uso:
    python tools/reconocimiento/inventario.py \
        --raiz "data/LSC-54/RawVideos/Videos Courtesy" \
        --salida data/reconocimiento/inventario.json
"""

import argparse
import json
from pathlib import Path
import sys

SENAS = {
    "chao": "Chao",
    "perfecto": "Perfecto",
    "hola": "Hola",
    "bienvenido": "Bienvenido",
    "gracias": "Gracias",
    "ayudar": "Ayudar",
    "apoyar": "Apoyar",
    "perdon": "Perdon",
    "esperar": "Esperar",
    "losiento": "Lo siento",
}


def sondear(ruta: Path) -> dict:
    """Metadatos básicos del video; `legible` es False si no se puede abrir."""
    datos = {
        "ancho": None,
        "alto": None,
        "fps": None,
        "fotogramas": None,
        "duracion_s": None,
        "legible": False,
    }
    try:
        import cv2
    except ImportError:
        return datos
    captura = cv2.VideoCapture(str(ruta))
    try:
        if not captura.isOpened():
            return datos
        fotogramas = int(captura.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = float(captura.get(cv2.CAP_PROP_FPS))
        datos.update(
            ancho=int(captura.get(cv2.CAP_PROP_FRAME_WIDTH)) or None,
            alto=int(captura.get(cv2.CAP_PROP_FRAME_HEIGHT)) or None,
            fps=round(fps, 3) if fps > 0 else None,
            fotogramas=fotogramas if fotogramas > 0 else None,
            duracion_s=round(fotogramas / fps, 3) if fotogramas > 0 and fps > 0 else None,
            legible=True,
        )
        return datos
    finally:
        captura.release()


def construir_inventario(raiz: Path, sondear_videos: bool = True, senas: dict | None = None) -> dict:
    videos: list[dict] = []
    resumen: dict[str, dict] = {}
    for sena_id, nombre in (senas or {"chao": SENAS["chao"], "perfecto": SENAS["perfecto"]}).items():
        encontrados: list[Path] = []
        for participante in sorted(raiz.iterdir(), key=lambda p: p.name):
            carpeta = participante / "Cordialidad" / nombre
            if carpeta.is_dir():
                encontrados.extend(sorted(carpeta.glob("*.avi")))
        if not encontrados:
            raise ValueError(f"No se encontraron videos para la sena {sena_id} en {raiz}")
        por_participante: dict[str, int] = {}
        for ruta in encontrados:
            participante = ruta.parent.parent.parent.name
            tallo = ruta.stem
            repeticion = int(tallo) if tallo.isdigit() else None
            registro = {
                "sena": sena_id,
                "participante": participante,
                "repeticion": repeticion,
                "ruta": str(ruta.relative_to(raiz)),
                "bytes": ruta.stat().st_size,
            }
            if sondear_videos:
                registro.update(sondear(ruta))
            videos.append(registro)
            por_participante[participante] = por_participante.get(participante, 0) + 1
        resumen[sena_id] = {
            "participantes": len(por_participante),
            "videos": len(encontrados),
            "por_participante": dict(sorted(por_participante.items(), key=lambda par: int(par[0]) if par[0].isdigit() else 0)),
        }
    videos.sort(key=lambda v: (v["sena"], int(v["participante"]) if str(v["participante"]).isdigit() else 0, v["repeticion"] if v["repeticion"] is not None else -1))
    return {"resumen": resumen, "videos": videos}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raiz", type=Path, required=True, help="Carpeta 'Videos Courtesy'.")
    parser.add_argument("--salida", type=Path, required=True, help="JSON de salida.")
    parser.add_argument("--sin-sondear", action="store_true", help="No abrir los videos con OpenCV.")
    parser.add_argument("--senas", default="chao,perfecto", help="Lista separada por comas.")
    args = parser.parse_args()
    if not args.raiz.is_dir():
        print(f"La raíz no existe: {args.raiz}", file=sys.stderr)
        return 1
    elegidas = {}
    for sena_id in (s.strip() for s in args.senas.split(",")):
        if not sena_id:
            continue
        if sena_id not in SENAS:
            print(f"Sena no reconocida: {sena_id}. Opciones: {', '.join(SENAS)}", file=sys.stderr)
            return 1
        elegidas[sena_id] = SENAS[sena_id]
    try:
        inventario = construir_inventario(args.raiz, sondear_videos=not args.sin_sondear, senas=elegidas)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 1
    args.salida.parent.mkdir(parents=True, exist_ok=True)
    args.salida.write_text(json.dumps(inventario, ensure_ascii=False, indent=1), encoding="utf-8")
    for sena_id, datos in inventario["resumen"].items():
        print(f"{sena_id}: {datos['videos']} videos, {datos['participantes']} participantes")
    print(f"Inventario escrito en {args.salida}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
