"""Correspondencia de huesos del avatar con el estandar humanoide VRM 1.0.

Lee el .vrm original (VRM 0.x, solo lectura), normaliza los nombres como hace
three-vrm (el pulgar 0.x Proximal/Intermediate pasa a Metacarpal/Proximal) y
comprueba que todos los huesos que animan los .vrma de Dalo existan en el
avatar. Tambien lista que huesos del estandar 1.0 faltan en el avatar, como
guia para la conversion a VRM 1.0 en Blender (no se inventa ningun binario).

Uso:
    python tools/reporte_huesos_vrm.py --avatar web/public/avatar/avatar-sample-1.vrm \
        --salida data/inspection/correspondencia-huesos.json
"""

import argparse
import json
import sys
from pathlib import Path

# Estandar humanoide VRM 1.0 (VRMC_vrm-1.0).
HUESOS_VRM1 = [
    "hips", "spine", "chest", "upperChest", "neck", "head",
    "leftEye", "rightEye", "jaw",
    "leftUpperLeg", "leftLowerLeg", "leftFoot", "leftToes",
    "rightUpperLeg", "rightLowerLeg", "rightFoot", "rightToes",
    "leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand",
    "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand",
]
for _lado in ("left", "right"):
    HUESOS_VRM1.append(f"{_lado}ThumbMetacarpal")
    HUESOS_VRM1.append(f"{_lado}ThumbProximal")
    HUESOS_VRM1.append(f"{_lado}ThumbDistal")
    for _dedo in ("Index", "Middle", "Ring", "Little"):
        HUESOS_VRM1.append(f"{_lado}{_dedo}Proximal")
        HUESOS_VRM1.append(f"{_lado}{_dedo}Intermediate")
        HUESOS_VRM1.append(f"{_lado}{_dedo}Distal")

# Huesos que animan los .vrma de Dalo (tools/lsc54_to_vrma.py).
HUESOS_ANIMADOS = [
    "leftShoulder", "rightShoulder", "leftUpperArm", "rightUpperArm",
    "leftLowerArm", "rightLowerArm", "leftHand", "rightHand",
]
DEDOS = ["Thumb", "Index", "Middle", "Ring", "Little"]
SEGS = {"Thumb": ["Metacarpal", "Proximal", "Distal"],
        "Index": ["Proximal", "Intermediate", "Distal"],
        "Middle": ["Proximal", "Intermediate", "Distal"],
        "Ring": ["Proximal", "Intermediate", "Distal"],
        "Little": ["Proximal", "Intermediate", "Distal"]}
for _lado in ("left", "right"):
    for _dedo in DEDOS:
        for _seg in SEGS[_dedo]:
            HUESOS_ANIMADOS.append(f"{_lado}{_dedo}{_seg}")

RENOMBRE_PULGAR_0X = {"Proximal": "Metacarpal", "Intermediate": "Proximal", "Distal": "Distal"}


def normalizar_0x_a_1x(nombre_0x):
    for lado in ("left", "right"):
        if nombre_0x.startswith(lado + "Thumb"):
            seg = nombre_0x[len(lado) + len("Thumb"):]
            return lado + "Thumb" + RENOMBRE_PULGAR_0X[seg]
    return nombre_0x


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--avatar", type=Path, required=True)
    ap.add_argument("--salida", type=Path, required=True)
    args = ap.parse_args()

    with open(args.avatar, "rb") as f:
        data = f.read()
    assert data[:4] == b"glTF", "no es un GLB"
    import struct
    largo = struct.unpack("<I", data[12:16])[0]
    js = json.loads(data[20:20 + largo])
    huesos_0x = [h["bone"] for h in js["extensions"]["VRM"]["humanoid"]["humanBones"]]
    normalizados = sorted({normalizar_0x_a_1x(h) for h in huesos_0x})

    faltan_1x = [h for h in HUESOS_VRM1 if h not in normalizados]
    animados_faltan = [h for h in HUESOS_ANIMADOS if h not in normalizados]
    informe = {
        "avatar": str(args.avatar.resolve()),
        "huesos_0x": len(huesos_0x),
        "huesos_normalizados": len(normalizados),
        "huesos_animados_vrma": len(HUESOS_ANIMADOS),
        "animados_sin_correspondencia": animados_faltan,
        "faltan_en_avatar_vs_vrm1": faltan_1x,
        "nota_conversion": ("La copia a VRM 1.0 debe hacerse en Blender "
                            "(importar el .vrm 0.x con el complemento VRM y exportar como VRM 1.0): "
                            "reescribir materiales y spring bones a mano es propenso a error y no se hace aqui."),
    }
    if args.salida.parent != args.avatar.resolve().parent:
        args.salida.parent.mkdir(parents=True, exist_ok=True)
        args.salida.write_text(json.dumps(informe, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(informe, ensure_ascii=False, indent=2))
    if animados_faltan:
        print("Faltan huesos animados: no se puede continuar.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
