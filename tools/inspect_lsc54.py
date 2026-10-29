"""Read-only LSC-54 inspection using only Python's standard library."""

import argparse
import html
import json
import math
from pathlib import Path
import re
import sys
import zipfile


def first_sequence(source, max_chars):
    """Read only a bounded prefix ending at the first repetition object."""
    key = r'\{\s*("(?:[^"\\]|\\.)*")\s*:\s*'
    header = re.compile(r"\A\s*" + key * 5 + r"\{")
    prefix = ""
    read_chars = 0
    with source.open(encoding="utf-8-sig") as stream:
        while True:
            chunk = stream.read(min(8192, max_chars - read_chars))
            read_chars += len(chunk)
            prefix += chunk
            match = header.match(prefix)
            if match:
                path = [json.loads(value) for value in match.groups()]
                pending = prefix[match.end() - 1:]
                break
            if not chunk or read_chars >= max_chars:
                raise ValueError("No se encontro la secuencia dentro del limite de lectura.")
            if len(prefix) > 65536:
                raise ValueError("La estructura no coincide con los cinco niveles de LSC-54.")

        parts = []
        depth = 0
        quoted = escaped = False
        while True:
            for index, char in enumerate(pending):
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
                        parts.append(pending[:index + 1])
                        return path, json.loads("".join(parts))
            parts.append(pending)
            if read_chars >= max_chars:
                raise ValueError("La primera secuencia supera el limite de lectura.")
            pending = stream.read(min(8192, max_chars - read_chars))
            read_chars += len(pending)
            if not pending:
                raise ValueError("Archivo incompleto: no termina la primera secuencia.")


def video_inventory(root):
    entries = {}
    paths = set()
    for archive_path in sorted((root / "RawVideos").glob("*.zip")):
        with zipfile.ZipFile(archive_path) as archive:
            for info in archive.infolist():
                paths.add(info.filename.replace("\\", "/"))
    for file in (root / "RawVideos").rglob("*"):
        if file.is_file():
            paths.add(file.relative_to(root / "RawVideos").as_posix())
    seen = set()
    for path in sorted(paths):
        parts = path.split("/")
        if len(parts) < 5 or Path(parts[-1]).suffix.lower() not in {".avi", ".mp4", ".mov", ".mkv"}:
            continue
        identity = tuple(parts[-4:])
        if identity in seen:
            continue
        seen.add(identity)
        category, expression = parts[-3:-1]
        item = entries.setdefault(f"{category}/{expression}",
                                  {"videos": 0, "participants": set()})
        item["videos"] += 1
        item["participants"].add(parts[-4])
    return {key: {"videos": item["videos"], "participants": sorted(item["participants"])}
            for key, item in sorted(entries.items())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("data/inspection"))
    parser.add_argument("--source", choices=["sample.json", "datos.json"], default="sample.json")
    parser.add_argument("--max-mib", type=float, default=32,
                        help="Limite de caracteres leidos, en millones binarios; no carga el archivo completo.")
    args = parser.parse_args()
    if not math.isfinite(args.max_mib) or args.max_mib <= 0:
        parser.error("El limite debe ser un numero positivo y finito.")
    source = args.dataset / args.source
    output = args.output.resolve()
    dataset = args.dataset.resolve()
    if output == dataset or dataset in output.parents:
        parser.error("La salida debe estar fuera del dataset original.")

    path, sequence = first_sequence(source, max(1, int(args.max_mib * 1024 * 1024)))
    frame_keys = sorted(sequence, key=lambda value: int(value.removeprefix("frame_")))
    frames = [sequence[key] for key in frame_keys]
    if not frames:
        raise ValueError("La primera secuencia no tiene fotogramas.")
    groups = sorted({group for frame in frames for group in frame})
    outside = missing = 0
    for frame in frames:
        for coordinates in frame.values():
            for axis in ("x", "y"):
                for value in coordinates.get(axis, []):
                    if value is None:
                        missing += 1
                    elif math.isfinite(value) and not 0 <= value <= 1:
                        outside += 1
    report = {
        "source": str(source.resolve()),
        "source_bytes": source.stat().st_size,
        "sequence": {"path": path, "frames": len(frames), "frame_keys": frame_keys,
                     "groups": groups, "xy_outside_unit_interval": outside,
                     "missing_xy_values": missing},
        "inventory": video_inventory(args.dataset),
        "notes": ["Solo se inspecciono la primera repeticion del JSON.",
                  "El inventario cuenta rutas en carpetas y ZIP, sin duplicar copias con igual participante/categoria/expresion/archivo; no verifica calidad linguistica.",
                  "La velocidad de animacion es ilustrativa; no se ha verificado el FPS original.",
                  "No se ha verificado si rep_0 es un original o un aumento de datos.",
                  "Coordenadas fuera de [0,1] requieren revision; no prueban corrupcion."],
    }
    template = Path(__file__).with_name("landmark_viewer.html").read_text(encoding="utf-8")
    payload = json.dumps({"path": path, "frameKeys": frame_keys, "frames": frames},
                         ensure_ascii=True, allow_nan=False).replace("<", "\\u003c")
    viewer = template.replace("__TITLE__", html.escape(" / ".join(path)))
    viewer = viewer.replace("__PAYLOAD__", payload)
    output.mkdir(parents=True, exist_ok=True)
    (output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (output / "viewer.html").write_text(viewer, encoding="utf-8")
    print(json.dumps(report["sequence"], ensure_ascii=True, indent=2))
    print(f"Inventario: {len(report['inventory'])} combinaciones categoria/expresion")
    print(f"Visor: {output / 'viewer.html'}")
    print(f"Informe: {output / 'report.json'}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)
