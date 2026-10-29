"""Suaviza un .vrma y, opcionalmente, aplica giro axial de muneca.

Uso tipico (giro de Mas o Menos o Bano sin reabrir Blender)::

    python tools/suavizar_vrma.py --entrada web/public/avatar/masomenos.vrma \
        --giro-axial --ciclos 2.5 --grados-mano 50 --abrir-dedos 4

La herramienta:

1.  Aplica continuidad de hemisferio a cada pista de rotacion (evita flips
    de 180 grados entre fotogramas vecinos).
2.  Recorta picos atipicos de velocidad angular (despike): si un fotograma
    salta mucho mas que sus vecinos, se sustituye por el slerp intermedio.
3.  Suaviza con dos pasadas de media esferica (ventana 3, mezcla 0.35):
    quita el tembleque sin aplanar la sena.
4.  Con ``--giro-axial``, sustituye el oleaje lateral (saludo) por rotacion
    sobre el propio eje del hueso, con puerta por altura de la muneca
    (cinematica directa): fuera de la ventana activa (mano abajo o en
    transito) la pista no se toca, asi el giro nunca empieza antes de
    levantar la mano. Con ``--abrir-dedos`` abre los dedos en abanico.

Solo biblioteca estandar. Reescribe el archivo de salida con los mismos
nodos, tiempos y estructura; solo cambian los cuaterniones de rotacion.
Genera una copia de seguridad ``<nombre>.bak`` junto a la entrada cuando
la salida es la propia entrada.
"""

import argparse
import copy
import json
import math
import struct
import sys
from pathlib import Path


def qmul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return [
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    ]


def qconj(q):
    return [-q[0], -q[1], -q[2], q[3]]


def qnorm(q):
    n = math.sqrt(sum(c * c for c in q)) or 1.0
    return [c / n for c in q]


def qrot(q, v):
    x, y, z = qmul(qmul(q, [v[0], v[1], v[2], 0.0]), qconj(q))[:3]
    return [x, y, z]


def qdot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]


def slerp(a, b, t):
    d = max(-1.0, min(1.0, qdot(a, b)))
    if d > 0.9995:
        return qnorm([a[i] + (b[i] - a[i]) * t for i in range(4)])
    theta = math.acos(d)
    s = math.sin(theta)
    w0 = math.sin((1 - t) * theta) / s
    w1 = math.sin(t * theta) / s
    return [a[i] * w0 + b[i] * w1 for i in range(4)]


def angulo(a, b):
    return 2 * math.acos(max(-1.0, min(1.0, abs(qdot(a, b)))))


def envolvente(u):
    u = max(0.0, min(1.0, u))
    return math.sin(math.pi * u) ** 0.7


def cargar(ruta):
    with open(ruta, "rb") as f:
        data = f.read()
    assert data[:4] == b"glTF", "no es un glB"
    largo = struct.unpack("<I", data[12:16])[0]
    js = json.loads(data[20:20 + largo])
    inicio_bin = 20 + largo
    largo_bin = struct.unpack("<I", data[inicio_bin:inicio_bin + 4])[0]
    bindata = data[inicio_bin + 8:inicio_bin + 8 + largo_bin]
    return js, bindata


def leer_pista(js, bindata, indice_accesor):
    acc = js["accessors"][indice_accesor]
    vista = js["bufferViews"][acc["bufferView"]]
    off = vista.get("byteOffset", 0) + acc.get("byteOffset", 0)
    n = acc["count"]
    return [list(struct.unpack("<4f", bindata[off + k * 16:off + (k + 1) * 16])) for k in range(n)]


def continuidad(qs):
    out = [list(qs[0])]
    for q in qs[1:]:
        q = list(q)
        if qdot(out[-1], q) < 0:
            q = [-c for c in q]
        out.append(q)
    return out


def despike(qs, umbral=math.radians(20)):
    qs = [list(q) for q in qs]
    for i in range(1, len(qs) - 1):
        paso = angulo(qs[i - 1], qs[i]) + angulo(qs[i], qs[i + 1])
        directo = angulo(qs[i - 1], qs[i + 1])
        # Pico aislado: ir y volver cuesta mucho mas que el tramo directo.
        if paso > umbral and paso > 3 * directo + math.radians(5):
            qs[i] = slerp(qs[i - 1], qs[i + 1], 0.5)
    return qs


def suavizar(qs, mezcla=0.35, pasadas=2):
    qs = [qnorm(q) for q in qs]
    for _ in range(pasadas):
        nuevo = [qs[0]]
        for i in range(1, len(qs) - 1):
            centro = slerp(qs[i - 1], qs[i + 1], 0.5)
            nuevo.append(slerp(qs[i], centro, mezcla))
        nuevo.append(qs[-1])
        qs = [qnorm(q) for q in nuevo]
    return qs


def media(qs):
    acc = [0.0, 0.0, 0.0, 0.0]
    ref = qs[0]
    for q in qs:
        q = list(q)
        if qdot(ref, q) < 0:
            q = [-c for c in q]
        acc = [acc[i] + q[i] for i in range(4)]
    return qnorm(acc)


def eje_largo_local(nodos, hueso, referencia):
    """Direccion del hueso en su espacio local, desde las translations en
    reposo: el hijo `referencia` cuelga del hueso a lo largo de su eje."""
    t_hueso = t_ref = None
    for nodo in nodos:
        if nodo.get("name") == hueso:
            t_hueso = nodo.get("translation", [0, 0, 0])
        if nodo.get("name") == referencia:
            t_ref = nodo.get("translation", [0, 0, 0])
    if t_hueso is None or t_ref is None:
        raise KeyError(f"sin reposo para {hueso}/{referencia}")
    eje = [t_ref[i] - 0.0 for i in range(3)]
    n = math.sqrt(sum(c * c for c in eje)) or 1.0
    return [c / n for c in eje]


def eje_abanico(nodos):
    """Eje perpendicular a los dedos para abrirlos en abanico (mas o menos):
    cruza la direccion de los dedos con el ancho de la mano, en reposo."""
    pos = {}
    for nodo in nodos:
        if nodo.get("name") in ("RightHand", "RightMiddleProximal",
                                 "RightIndexProximal", "RightLittleProximal"):
            pos[nodo["name"]] = nodo.get("translation", [0, 0, 0])
    dedos = list(pos["RightMiddleProximal"])
    # Las translations ya estan en el espacio de la mano (el padre del
    # nudillo medio es la mano): no hay que restar nada mas.
    ancho = [pos["RightIndexProximal"][i] - pos["RightLittleProximal"][i] for i in range(3)]
    n = math.sqrt(sum(c * c for c in dedos)) or 1.0
    dedos = [c / n for c in dedos]
    n = math.sqrt(sum(c * c for c in ancho)) or 1.0
    ancho = [c / n for c in ancho]
    eje = [dedos[1] * ancho[2] - dedos[2] * ancho[1],
           dedos[2] * ancho[0] - dedos[0] * ancho[2],
           dedos[0] * ancho[1] - dedos[1] * ancho[0]]
    n = math.sqrt(sum(c * c for c in eje)) or 1.0
    return [c / n for c in eje]


def orientar_abanico(eje, q_indice, q_medio):
    """Signo del eje que ABRE la mano: rotar el indice +5 debe separarlo del medio."""

    def rotar(q, e, grados):
        s = math.sin(math.radians(grados) / 2)
        giro = [e[0] * s, e[1] * s, e[2] * s, math.cos(math.radians(grados) / 2)]
        return qnorm(qmul(qnorm(q), giro))

    def ang(a, b):
        d = min(1.0, abs(sum(x * y for x, y in zip(a, b))))
        return math.degrees(2 * math.acos(d))

    if ang(rotar(q_indice, eje, 5.0), q_medio) >= ang(q_indice, q_medio):
        return eje
    return [-c for c in eje]


def altura_muneca(js, bindata, hueso="RightHand"):
    """Altura (Z mundo) de la muneca por fotograma, por cinematica directa.

    Sirve de puerta: el giro axial solo existe cuando la mano esta arriba
    (ventana activa); en reposo o durante la subida/bajada la puerta vale 0
    y la pista no se toca.
    """
    nodes = js["nodes"]
    anim = js["animations"][0]
    parent = {}
    for i, nodo in enumerate(nodes):
        for c in nodo.get("children", []):
            parent[c] = i
    tr = {}
    for ch in anim["channels"]:
        tr[(ch["target"]["node"], ch["target"]["path"])] = anim["samplers"][ch["sampler"]]

    def leer_acc(idx):
        a = js["accessors"][idx]
        bv = js["bufferViews"][a["bufferView"]]
        off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        n = a["count"]
        nc = {"SCALAR": 1, "VEC4": 4, "VEC3": 3}[a["type"]]
        return [list(struct.unpack("<%df" % nc, bindata[off + k * 4 * nc:off + (k + 1) * 4 * nc]))
                for k in range(n)]

    nframes = js["accessors"][anim["samplers"][0]["input"]]["count"]
    rest_q = [qnorm(n.get("rotation", [0, 0, 0, 1])) for n in nodes]
    rest_t = [n.get("translation", [0, 0, 0]) for n in nodes]
    rot_series = {}
    tra_series = {}
    for i in range(len(nodes)):
        if (i, "rotation") in tr:
            rot_series[i] = leer_acc(tr[(i, "rotation")]["output"])
        if (i, "translation") in tr:
            tra_series[i] = leer_acc(tr[(i, "translation")]["output"])
    idx = next(i for i, n in enumerate(nodes) if n.get("name") == hueso)
    raiz = js["scenes"][0]["nodes"][0]
    alturas = []
    for f in range(nframes):
        wq = {}
        wp = {}
        stack = [raiz]
        seen = set()
        while stack:
            i = stack.pop()
            if i in seen:
                continue
            seen.add(i)
            q = rot_series[i][f] if i in rot_series else rest_q[i]
            t = tra_series[i][f] if i in tra_series else rest_t[i]
            p = parent.get(i)
            if p is None or p not in wq:
                wq[i] = qnorm(q)
                wp[i] = list(t)
            else:
                wq[i] = qnorm(qmul(wq[p], q))
                r = qrot(wq[p], t)
                wp[i] = [wp[p][k] + r[k] for k in range(3)]
            stack.extend(nodes[i].get("children", []))
        alturas.append(wp[idx][2])
    return alturas


def puerta_altura(alturas, inicio=0.45, fin=0.8):
    """Puerta suave 0->1 con la altura: 0 en reposo, 1 en la ventana activa."""
    h0, h1 = min(alturas), max(alturas)
    recorrido = (h1 - h0) or 1.0
    puerta = []
    for h in alturas:
        u = (h - h0) / recorrido
        u = 0.0 if u <= inicio else (1.0 if u >= fin else (u - inicio) / (fin - inicio))
        puerta.append(u * u * (3 - 2 * u))
    return puerta


def giro_axial(qs, eje_local, ciclos, amplitud_rad, puerta, suprimir_lateral=0.85):
    """Giro sobre el propio eje del hueso (pronacion/supinacion real).

    `puerta` vale 1 solo cuando la mano esta arriba (ventana activa) y 0 en
    reposo o en transito: fuera de la ventana la pista no se toca, asi el
    giro nunca empieza antes de levantar la mano. Dentro de la ventana se
    atenua la oscilacion lateral previa (saludo) acercando cada fotograma a
    su base lenta, y sobre ella se compone el giro axial con `ciclos`
    completos entre la apertura y el cierre de la puerta. Multiplicar por la
    derecha = girar en el espacio local del hueso, sobre su propio eje.
    """
    n = len(qs)
    lenta = suavizar(continuidad(qs), mezcla=0.5, pasadas=3)
    # Coordenada activa: 0 al terminar de subir, 1 al empezar a bajar. Los
    # `ciclos` completos ocurren con la mano arriba (puerta > 0.3); en
    # reposo el giro es exactamente 0.
    plenos = [i for i, g in enumerate(puerta) if g > 0.3]
    u0 = plenos[0] / max(1, n - 1) if plenos else 0.0
    u1 = plenos[-1] / max(1, n - 1) if plenos else 1.0
    out = []
    for i, q in enumerate(qs):
        u = i / max(1, n - 1)
        g = puerta[i]
        q_base = slerp(qnorm(q), lenta[i], suprimir_lateral * g)
        v = 0.0 if u1 <= u0 else max(0.0, min(1.0, (u - u0) / (u1 - u0)))
        ang = amplitud_rad * math.sin(2 * math.pi * ciclos * v) * g
        s = math.sin(ang / 2)
        giro = [eje_local[0] * s, eje_local[1] * s, eje_local[2] * s, math.cos(ang / 2)]
        out.append(qnorm(qmul(q_base, giro)))
    return continuidad(out)


def limitar_pendiente(qs, max_grados=14.0, pasadas=4):
    """Recorta la velocidad angular pico entre fotogramas vecinos.

    Norma del proyecto (<16 grados por fotograma): cada paso que la supera
    se recorta de forma exacta acercando ambos fotogramas hacia su punto
    medio esferico lo justo para quedar en el tope. Se repite porque al
    recortar un paso pueden crecer sus vecinos; con 4 pasadas converge.
    La amplitud del gesto apenas se resiente (redondeo del pico).
    """
    qs = [list(q) for q in qs]
    tope = math.radians(max_grados)
    for _ in range(pasadas):
        for i in range(len(qs) - 1):
            a = qnorm(qs[i])
            b = qnorm(qs[i + 1])
            d = min(1.0, abs(sum(x * y for x, y in zip(a, b))))
            paso = 2 * math.acos(d)
            if paso > tope and paso > 1e-9:
                t = 1.0 - tope / paso
                medio = slerp(a, b, 0.5)
                qs[i] = qnorm(slerp(a, medio, t))
                qs[i + 1] = qnorm(slerp(b, medio, t))
    return continuidad(qs)


def abrir_abanico(qs_por_dedo, eje_abanico, grados_por_dedo, puerta):
    """Separa los dedos en abanico (mas o menos: mano abierta).

    `grados_por_dedo`: {hueso: grados} con signo (indice +, menique -).
    La apertura sigue la misma puerta de altura: intacta en reposo.
    """
    out = {}
    for hueso, qs in qs_por_dedo.items():
        delta = math.radians(grados_por_dedo.get(hueso, 0.0))
        serie = []
        for q, g in zip(qs, puerta):
            ang = delta * g
            s = math.sin(ang / 2)
            giro = [eje_abanico[0] * s, eje_abanico[1] * s, eje_abanico[2] * s,
                    math.cos(ang / 2)]
            serie.append(qnorm(qmul(qnorm(q), giro)))
        out[hueso] = continuidad(serie)
    return out


def escribir(ruta, js, bindata_nuevo):
    crudo = json.dumps(js, separators=(",", ":")).encode("utf-8")
    while len(crudo) % 4:
        crudo += b" "
    while len(bindata_nuevo) % 4:
        bindata_nuevo += b"\x00"
    with open(ruta, "wb") as f:
        f.write(b"glTF" + struct.pack("<II", 2, 12 + 8 + len(crudo) + 8 + len(bindata_nuevo)))
        f.write(struct.pack("<I", len(crudo)) + b"JSON" + crudo)
        f.write(struct.pack("<I", len(bindata_nuevo)) + b"BIN\x00" + bytes(bindata_nuevo))


def procesar(entrada, salida, mezcla=0.35, axial=None, abanico=None):
    js, bindata = cargar(entrada)
    js = copy.deepcopy(js)
    anim = js["animations"][0]
    # Localiza el canal de cada hueso por su nombre de nodo.
    canal_por_hueso = {}
    for ch in anim["channels"]:
        nombre = js["nodes"][ch["target"]["node"]].get("name")
        canal_por_hueso[nombre] = ch["sampler"]
    bin_nuevo = bytearray(bindata)
    tocadas = 0
    max_desv_antes = {}
    max_desv_despues = {}

    def escribir_pista(nombre, qs):
        acc_idx = anim["samplers"][canal_por_hueso[nombre]]["output"]
        acc = js["accessors"][acc_idx]
        vista = js["bufferViews"][acc["bufferView"]]
        off = vista.get("byteOffset", 0) + acc.get("byteOffset", 0)
        for k, q in enumerate(qs):
            struct.pack_into("<4f", bin_nuevo, off + k * 16, *q)

    def leer_pista_nombre(nombre):
        acc_idx = anim["samplers"][canal_por_hueso[nombre]]["output"]
        return leer_pista(js, bindata, acc_idx)

    # Giro axial: sustituye la oscilacion lateral (saludo) por rotacion sobre
    # el propio eje; usa las pistas originales ya suavizadas.
    abanico_aplicado = []
    if axial:
        puerta = puerta_altura(altura_muneca(js, bindata))
        for hueso, cfg in axial.items():
            if hueso not in canal_por_hueso:
                continue
            qs = suavizar(despike(continuidad(leer_pista_nombre(hueso))), mezcla=mezcla)
            base_media = media(qs[int(len(qs) * 0.25):int(len(qs) * 0.75)])
            max_desv_antes[hueso] = round(math.degrees(max(angulo(base_media, q) for q in qs)), 1)
            eje = eje_largo_local(js["nodes"], hueso, cfg["hijo"])
            qs_pre = list(qs)
            qs = giro_axial(qs, eje, cfg["ciclos"], math.radians(cfg["grados"]),
                            puerta, cfg.get("suprimir", 0.85))
            # Suavizado final ligero: recorta la pendiente pico entre
            # fotogramas vecinos (norma del proyecto: <16 grados) sin
            # aplanar la oscilacion. Donde la puerta es 0 se restaura exacto.
            qs = suavizar(continuidad(qs), mezcla=0.15, pasadas=1)
            qs = limitar_pendiente(qs)
            qs = [pre if g < 0.01 else nuevo for pre, nuevo, g in zip(qs_pre, qs, puerta)]
            escribir_pista(hueso, qs)
            tocadas += 1
            max_desv_despues[hueso] = round(math.degrees(max(angulo(media(qs), q) for q in qs)), 1)
        if abanico:
            eje_ab = eje_abanico(js["nodes"])
            qs_dedos = {}
            for hueso in list(abanico) + ["RightMiddleProximal"]:
                if hueso not in canal_por_hueso or hueso in qs_dedos:
                    continue
                qs_dedos[hueso] = suavizar(
                    despike(continuidad(leer_pista_nombre(hueso))), mezcla=mezcla)
            mid = len(next(iter(qs_dedos.values()))) // 2
            eje_ab = orientar_abanico(
                eje_ab, qs_dedos["RightIndexProximal"][mid],
                qs_dedos["RightMiddleProximal"][mid])
            for hueso, qs in abrir_abanico(qs_dedos, eje_ab, abanico, puerta).items():
                escribir_pista(hueso, qs)
                tocadas += 1
                abanico_aplicado.append(hueso)

    for ch in anim["channels"]:
        nombre = js["nodes"][ch["target"]["node"]].get("name")
        if axial and nombre in axial:
            continue  # Ya procesado arriba.
        if abanico and nombre in abanico:
            continue
        if ch.get("target", {}).get("path") != "rotation":
            continue
        acc_idx = anim["samplers"][ch["sampler"]]["output"]
        acc = js["accessors"][acc_idx]
        if acc.get("type") != "VEC4":
            continue
        vista = js["bufferViews"][acc["bufferView"]]
        off = vista.get("byteOffset", 0) + acc.get("byteOffset", 0)
        qs = leer_pista(js, bindata, acc_idx)
        base_media = media(continuidad(qs))
        max_desv_antes[nombre] = round(math.degrees(max(angulo(base_media, q) for q in qs)), 1)
        qs = continuidad(qs)
        qs = despike(qs)
        qs = suavizar(qs, mezcla=mezcla)
        qs = [qnorm(q) for q in continuidad(qs)]
        max_desv_despues[nombre] = round(math.degrees(max(angulo(media(qs), q) for q in qs)), 1)
        for k, q in enumerate(qs):
            struct.pack_into("<4f", bin_nuevo, off + k * 16, *q)
        tocadas += 1
    escribir(salida, js, bin_nuevo)
    return {
        "pistas": tocadas,
        "giro_axial": sorted(axial) if axial else [],
        "abanico": sorted(abanico_aplicado),
        "desviacion_max_mano_antes": {h: max_desv_antes.get(h) for h in list(axial or {})},
        "desviacion_max_mano_despues": {h: max_desv_despues.get(h) for h in list(axial or {})},
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--entrada", type=Path, required=True)
    ap.add_argument("--salida", type=Path, default=None)
    ap.add_argument("--giro-axial", action="store_true",
                    help="gira la muneca sobre su propio eje (mas o menos, bano)")
    ap.add_argument("--ciclos", type=float, default=2.5)
    ap.add_argument("--grados-mano", type=float, default=50.0)
    ap.add_argument("--grados-antebrazo", type=float, default=15.0)
    ap.add_argument("--abrir-dedos", type=float, default=0.0,
                    help="abanico extra de indice/menique en grados (mas o menos)")
    ap.add_argument("--mezcla", type=float, default=0.35)
    args = ap.parse_args()
    if not args.entrada.is_file():
        ap.error(f"archivo inexistente: {args.entrada}")
    salida = args.salida or args.entrada
    if salida == args.entrada:
        respaldo = args.entrada.with_suffix(args.entrada.suffix + ".bak")
        if not respaldo.is_file():
            respaldo.write_bytes(args.entrada.read_bytes())
            print(f"respaldo: {respaldo}")
    axial = None
    if args.giro_axial:
        axial = {
            "RightHand": {"hijo": "RightMiddleProximal", "ciclos": args.ciclos,
                          "grados": args.grados_mano, "suprimir": 0.95},
            "RightLowerArm": {"hijo": "RightHand", "ciclos": args.ciclos,
                              "grados": args.grados_antebrazo, "suprimir": 0.8},
        }
    abanico = None
    if args.abrir_dedos:
        abanico = {"RightIndexProximal": args.abrir_dedos,
                   "RightRingProximal": -args.abrir_dedos * 0.5,
                   "RightLittleProximal": -args.abrir_dedos}
    informe = procesar(args.entrada, salida, mezcla=args.mezcla,
                       axial=axial, abanico=abanico)
    print(json.dumps({"entrada": str(args.entrada), "salida": str(salida), **informe},
                     ensure_ascii=False, indent=1))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, AssertionError) as error:
        print(f"Error: {error}", file=sys.stderr)
        raise SystemExit(1)
