"""Extract lightweight avatar sequences from LSC-54 landmark JSON.

Reads the (potentially huge) LSC-54 JSON in binary chunks to locate the
first occurrence of each requested expression key, captures only that
repetition's balanced JSON object, and writes one small JSON per sign with
pose + hand landmarks (the 478-point face mesh is dropped), missing values
linearly interpolated, rounded to 4 decimals. Standard library only.
The dataset is never modified and output must live outside it.
"""

import argparse
import json
import math
from pathlib import Path
import re
import sys

GROUPS = {"pose": "pose", "l_hand": "manoIzquierda", "r_hand": "manoDerecha"}


def find_first_offsets(source, patterns, chunk_size=1 << 20):
    """Return {name: byte offset} of the first occurrence of each pattern."""
    remaining = dict(patterns)
    offsets = {}
    overlap = max(len(p) for p in patterns.values())
    carry = b""
    read_total = 0
    with source.open("rb") as stream:
        while remaining:
            chunk = stream.read(chunk_size)
            if not chunk:
                break
            buffer = carry + chunk
            buffer_start = read_total - len(carry)
            read_total += len(chunk)
            for name in list(remaining):
                index = buffer.find(remaining[name])
                if index >= 0:
                    offsets[name] = buffer_start + index
                    del remaining[name]
            carry = buffer[-overlap:]
    if remaining:
        raise ValueError(f"No se encontraron las expresiones: {sorted(remaining)}")
    return offsets


def capture_sequence(source, offset, video, repeticion, max_bytes):
    """Parse the repetition object that follows the expression key at offset."""
    with source.open("rb") as stream:
        stream.seek(offset)
        text = stream.read(max_bytes).decode("utf-8")
    header = re.compile(
        r'"' + re.escape(video) + r'"\s*:\s*\{\s*"'
        + re.escape(repeticion) + r'"\s*:\s*\{'
    )
    match = header.search(text)
    if not match:
        raise ValueError(f"No se encontro {video}/{repeticion} tras la expresion.")
    start = match.end() - 1
    depth = 0
    quoted = escaped = False
    for index in range(start, len(text)):
        char = text[index]
        if quoted:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                quoted = False
        elif char == '"':
            quoted = True
        elif char in "{[":
            depth += 1
        elif char in "}]":
            depth -= 1
            if depth == 0:
                return json.loads(text[start:index + 1])
    raise ValueError("La secuencia supera el limite de lectura por expresion.")


def interpolate(values):
    """Linearly interpolate None gaps; fill edges with the nearest value."""
    known = [i for i, value in enumerate(values) if value is not None]
    if not known:
        return list(values)
    result = list(values)
    for i in range(len(result)):
        if result[i] is not None:
            continue
        previous = max((k for k in known if k < i), default=None)
        following = min((k for k in known if k > i), default=None)
        if previous is None:
            result[i] = values[following]
        elif following is None:
            result[i] = values[previous]
        else:
            ratio = (i - previous) / (following - previous)
            result[i] = values[previous] + (values[following] - values[previous]) * ratio
    return result


def _series(frames, group, count, axis):
    series = []
    for index in range(count):
        values = []
        for frame in frames:
            coords = frame.get(group, {}).get(axis, [])
            value = coords[index] if index < len(coords) else None
            values.append(value if isinstance(value, (int, float)) and math.isfinite(value) else None)
        series.append(interpolate(values))
    return series


def simplify_sequence(sequence, *, expresion_id, nombre, fps, fuente, fps_verificado=False):
    """Convert a raw LSC-54 repetition into the avatar JSON format."""
    frame_keys = sorted(sequence, key=lambda v: int(v.removeprefix("frame_")))
    raw_frames = [sequence[key] for key in frame_keys]
    if not raw_frames:
        raise ValueError("La secuencia no tiene fotogramas.")
    interpolated = 0
    cleaned = {}
    for raw_name, out_name in GROUPS.items():
        count = max((len(f.get(raw_name, {}).get("x", [])) for f in raw_frames), default=0)
        axes = {axis: _series(raw_frames, raw_name, count, axis) for axis in ("x", "y", "z")}
        group_frames = []
        for frame_index in range(len(raw_frames)):
            points = []
            for point_index in range(count):
                coords = [axes[axis][point_index][frame_index] for axis in ("x", "y", "z")]
                if any(value is None for value in coords):
                    points.append(None)
                else:
                    points.append([round(float(value), 4) for value in coords])
            group_frames.append(points)
        cleaned[out_name] = group_frames
    for raw_name in GROUPS:
        for frame in raw_frames:
            for axis in ("x", "y", "z"):
                interpolated += sum(1 for v in frame.get(raw_name, {}).get(axis, []) if v is None)
    fotogramas = []
    for index in range(len(raw_frames)):
        mano_izquierda = cleaned["manoIzquierda"][index]
        mano_derecha = cleaned["manoDerecha"][index]
        fotogramas.append({
            "pose": cleaned["pose"][index],
            "manoIzquierda": mano_izquierda if any(p is not None for p in mano_izquierda) else None,
            "manoDerecha": mano_derecha if any(p is not None for p in mano_derecha) else None,
        })
    return {
        "version": 1,
        "id": expresion_id,
        "nombre": nombre,
        "fps": fps,
        "fpsVerificado": fps_verificado,
        "fuente": fuente,
        "totalFotogramas": len(fotogramas),
        "valoresNulosOriginales": interpolated,
        "notas": [
            "Puntos de pose y manos de LSC-54; malla facial de 478 puntos omitida.",
            "Valores faltantes interpolados linealmente entre fotogramas vecinos.",
            "FPS de reproduccion: 30 fps segun los videos originales; verificado solo si fpsVerificado es true.",
            "Sin validacion linguistica: no se ha comprobado que la repeticion elegida sea la forma canonica.",
        ],
        "fotogramas": fotogramas,
    }


def parse_target(text):
    if "=" not in text or "/" not in text:
        raise argparse.ArgumentTypeError("Formato: id=Categoria/Expresion")
    expresion_id, path = text.split("=", 1)
    categoria, expresion = path.split("/", 1)
    if not expresion_id or not categoria or not expresion:
        raise argparse.ArgumentTypeError("Formato: id=Categoria/Expresion")
    return expresion_id, categoria, expresion


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--source", choices=["sample.json", "datos.json"], default="datos.json")
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--signer", default="Signer_1")
    parser.add_argument("--video", default="vid_0")
    parser.add_argument("--repeticion", default="rep_0")
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument("--fps-verificado", action="store_true",
                        help="Marca el FPS como contrastado con el video original (conteo de fotogramas).")
    parser.add_argument("--max-mib", type=float, default=64,
                        help="Limite de lectura por secuencia, en millones binarios.")
    parser.add_argument("--target", action="append", required=True, type=parse_target,
                        metavar="id=Categoria/Expresion")
    args = parser.parse_args()
    if args.fps <= 0 or not math.isfinite(args.max_mib) or args.max_mib <= 0:
        parser.error("--fps y --max-mib deben ser positivos.")
    source = args.dataset / args.source
    output_dir = args.output_dir.resolve()
    dataset = args.dataset.resolve()
    if output_dir == dataset or dataset in output_dir.parents:
        parser.error("La salida debe estar fuera del dataset original.")
    with source.open("rb") as stream:
        first_key = re.match(rb'\s*\{\s*"([^"]+)"', stream.read(4096))
    if not first_key or first_key.group(1).decode("utf-8") != args.signer:
        parser.error(f"El primer firmante del archivo no es {args.signer}; "
                     "este extractor solo captura el primer firmante.")

    patterns = {eid: f'"{expresion}":'.encode("utf-8")
                for eid, _, expresion in args.target}
    offsets = find_first_offsets(source, patterns)
    max_bytes = max(1, int(args.max_mib * 1024 * 1024))
    output_dir.mkdir(parents=True, exist_ok=True)
    for expresion_id, categoria, expresion in args.target:
        sequence = capture_sequence(source, offsets[expresion_id],
                                    args.video, args.repeticion, max_bytes)
        result = simplify_sequence(
            sequence,
            expresion_id=expresion_id,
            nombre=expresion,
            fps=args.fps,
            fps_verificado=args.fps_verificado,
            fuente={"dataset": "LSC-54", "archivo": args.source, "firmante": args.signer,
                    "categoria": categoria, "expresion": expresion,
                    "video": args.video, "repeticion": args.repeticion},
        )
        destination = output_dir / f"{expresion_id}.json"
        destination.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")),
                               encoding="utf-8")
        print(f"{expresion_id}: {result['totalFotogramas']} fotogramas, "
              f"{result['valoresNulosOriginales']} valores nulos interpolados -> {destination}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)
