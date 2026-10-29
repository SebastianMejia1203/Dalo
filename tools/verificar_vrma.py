"""Verifica un .vrma contra su video de referencia (datos LSC-54).

Comprueba, por cinematica directa sobre el propio clip:
1. Reposo intacto: sin giro con la mano abajo (puerta cerrada -> giro ~0).
2. Giro axial (sobre el propio eje) dominante frente al oleaje lateral
   dentro de la ventana activa (mano arriba).
3. Numero de ciclos del giro dentro de la ventana.
4. Dedos: abanico abierto (mas o menos) o juntos (bano).
Uso: python tools/verificar_vrma.py --clip web/public/avatar/masomenos.vrma
"""
import argparse
import json
import math
import statistics
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from suavizar_vrma import (
    altura_muneca,
    continuidad,
    puerta_altura,
    qconj,
    qmul,
    qnorm,
)


def cargar(p):
    with open(p, "rb") as f:
        data = f.read()
    assert data[:4] == b"glTF"
    largo = struct.unpack("<I", data[12:16])[0]
    js = json.loads(data[20:20 + largo])
    inicio = 20 + largo
    largo_bin = struct.unpack("<I", data[inicio:inicio + 4])[0]
    return js, data[inicio + 8:inicio + 8 + largo_bin]


def leer(js, bindata, idx):
    a = js["accessors"][idx]
    bv = js["bufferViews"][a["bufferView"]]
    off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    n = a["count"]
    nc = {"SCALAR": 1, "VEC4": 4, "VEC3": 3}[a["type"]]
    return [list(struct.unpack("<%df" % nc, bindata[off + k * 4 * nc:off + (k + 1) * 4 * nc]))
            for k in range(n)]


def ang(a, b):
    d = min(1.0, abs(sum(x * y for x, y in zip(a, b))))
    return math.degrees(2 * math.acos(d))


def verificar(ruta):
    js, bd = cargar(ruta)
    anim = js["animations"][0]
    chmap = {}
    for ch in anim["channels"]:
        chmap[(js["nodes"][ch["target"]["node"]].get("name"), ch["target"]["path"])] = ch["sampler"]
    alturas = altura_muneca(js, bd)
    puerta = puerta_altura(alturas)
    n = len(alturas)
    qs = leer(js, bd, anim["samplers"][chmap[("RightHand", "rotation")]]["output"])
    q0 = qnorm(qs[0])
    giro_abs = []
    for q in qs:
        dev = qnorm(qmul(qconj(q0), qnorm(q)))
        w = max(-1.0, min(1.0, dev[3]))
        a = 2 * math.acos(w)
        ex, ey, ez = dev[:3]
        nn = math.sqrt(ex * ex + ey * ey + ez * ez) or 1e-9
        giro_abs.append(math.degrees(a) * abs(ez / nn) if a > 1e-9 else 0.0)
    h0, h1 = min(alturas), max(alturas)
    ventana = [i for i, h in enumerate(alturas) if h > h0 + 0.7 * (h1 - h0)]
    # Fuera de la ventana la mano se reorienta una sola vez al subir/bajar
    # (rampa suave); lo prohibido es que OSCILE (giros repetidos) con la mano
    # abajo. Se mide el residuo tras quitar la tendencia lineal por tramo.
    residuo_max = 0.0
    for tramo in ([i for i in range(n) if i < ventana[0]],
                  [i for i in range(n) if i > ventana[-1]]):
        if len(tramo) < 3:
            continue
        vals = [giro_abs[i] for i in tramo]
        base0, base1 = vals[0], vals[-1]
        for j, v in enumerate(vals):
            u = j / max(1, len(vals) - 1)
            residuo_max = max(residuo_max, abs(v - (base0 + (base1 - base0) * u)))
    fuera = residuo_max
    seg = [qs[i] for i in ventana]
    m = qnorm([sum(c) / len(seg) for c in zip(*seg)])
    inv = qconj(m)
    tw, sw, s = [], [], []
    for q in seg:
        dev = qnorm(qmul(inv, qnorm(q)))
        w = max(-1.0, min(1.0, dev[3]))
        a = 2 * math.acos(w)
        ex, ey, ez = dev[:3]
        nn = math.sqrt(ex * ex + ey * ey + ez * ez) or 1e-9
        axl = abs(ez / nn)
        tw.append(math.degrees(a) * axl if a > 1e-9 else 0.0)
        sw.append(math.degrees(a) * (1 - axl) if a > 1e-9 else 0.0)
        s.append(math.degrees(a) * math.copysign(1, dev[2]) if a > 1e-6 else 0.0)
    cruces = sum(1 for a, b in zip(s, s[1:]) if a * b < 0 and abs(a - b) > 3)
    qi = leer(js, bd, anim["samplers"][chmap[("RightIndexProximal", "rotation")]]["output"])
    ql = leer(js, bd, anim["samplers"][chmap[("RightLittleProximal", "rotation")]]["output"])
    mid = len(qi) // 2
    return {
        "giro_con_mano_abajo_max": round(fuera, 1),
        "ventana_activa": [ventana[0], ventana[-1]],
        "giro_axial_max": round(max(tw), 1),
        "giro_axial_medio": round(statistics.mean(tw), 1),
        "lateral_max": round(max(sw), 1),
        "lateral_medio": round(statistics.mean(sw), 1),
        "ciclos_aprox": round(cruces / 2, 1),
        "abanico_dedos": round(ang(qi[mid], ql[mid]), 1),
        "reposo_deriva": round(ang(qs[0], qs[-1]), 1),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--clip", type=Path, required=True)
    args = ap.parse_args()
    informe = verificar(args.clip)
    print(json.dumps({"clip": str(args.clip), **informe}, ensure_ascii=False, indent=1))
    errores = []
    if informe["giro_con_mano_abajo_max"] > 5.0:
        errores.append("la muneca oscila con la mano abajo")
    if informe["reposo_deriva"] > 3.0:
        errores.append("el reposo deriva")
    if informe["giro_axial_max"] < 2 * informe["lateral_max"]:
        errores.append("el oleaje lateral domina al giro axial")
    if errores:
        print("FALLO: " + "; ".join(errores))
        raise SystemExit(1)
    print("OK")


if __name__ == "__main__":
    main()
