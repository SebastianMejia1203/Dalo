"""Convierte secuencias de LSC-54 en animaciones VRM (.vrma) editables.

Lee los landmarks simplificados de web/public/avatar/*.json (derivados de
LSC-54), replica la matematica de retargeting de Dalo (apuntado de huesos +
correccion de giro de la palma) y hornea rotaciones locales por fotograma
en un glB valido con la extension VRMC_vrm_animation 1.0.

La animacion NO reutiliza el JSON de landmarks en tiempo de ejecucion: el
vrma contiene sus propios nodos de reposo (copiados del .vrm del avatar),
sus pistas de rotacion y sus tiempos. Se abre en Blender con el complemento
VRM (importar animacion VRMA) y se reproduce en Dalo con el reproductor
.vrma, independiente del avatar y del JSON.

Solo biblioteca estandar. No modifica el dataset ni el .vrm original.
"""

import argparse
import json
import math
import struct
import sys
from pathlib import Path

ASPECTO_FUENTE = 640 / 360

# Huesos animados (nombres humanoides VRM 1.0, los mismos que usa three-vrm
# de forma normalizada) en orden jerarquico: los padres van antes.
HUESOS_ANIMADOS = [
    "leftShoulder", "rightShoulder",
    "leftUpperArm", "rightUpperArm",
    "leftLowerArm", "rightLowerArm",
    "leftHand", "rightHand",
]
DEDOS = ["Thumb", "Index", "Middle", "Ring", "Little"]
SEGMENTOS_DEDO = {
    "Thumb": ["Metacarpal", "Proximal", "Distal"],
    "Index": ["Proximal", "Intermediate", "Distal"],
    "Middle": ["Proximal", "Intermediate", "Distal"],
    "Ring": ["Proximal", "Intermediate", "Distal"],
    "Little": ["Proximal", "Intermediate", "Distal"],
}
for _lado in ("left", "right"):
    for _dedo in DEDOS:
        for _seg in SEGMENTOS_DEDO[_dedo]:
            HUESOS_ANIMADOS.append(f"{_lado}{_dedo}{_seg}")

# Hijo de referencia de cada hueso, identico a HIJO_PRINCIPAL de Dalo.
HIJO_TS = {
    "leftShoulder": "leftUpperArm", "rightShoulder": "rightUpperArm",
    "leftUpperArm": "leftLowerArm", "rightUpperArm": "rightLowerArm",
    "leftLowerArm": "leftHand", "rightLowerArm": "rightHand",
    "leftHand": "leftMiddleProximal", "rightHand": "rightMiddleProximal",
}
for _lado in ("left", "right"):
    HIJO_TS[f"{_lado}ThumbMetacarpal"] = f"{_lado}ThumbProximal"
    HIJO_TS[f"{_lado}ThumbProximal"] = f"{_lado}ThumbDistal"
    for _dedo in ("Index", "Middle", "Ring", "Little"):
        _segs = SEGMENTOS_DEDO[_dedo]
        HIJO_TS[f"{_lado}{_dedo}{_segs[0]}"] = f"{_lado}{_dedo}{_segs[1]}"
        HIJO_TS[f"{_lado}{_dedo}{_segs[1]}"] = f"{_lado}{_dedo}{_segs[2]}"
# Como en Dalo: el distal del pulgar no se anima (queda en reposo).
SALTAR = {"leftThumbDistal", "rightThumbDistal"}

PADRE_VRM1 = {
    "hips": None, "spine": "hips", "chest": "spine", "upperChest": "chest",
    "leftShoulder": "upperChest", "rightShoulder": "upperChest",
    "leftUpperArm": "leftShoulder", "rightUpperArm": "rightShoulder",
    "leftLowerArm": "leftUpperArm", "rightLowerArm": "rightUpperArm",
    "leftHand": "leftLowerArm", "rightHand": "rightLowerArm",
}
for _lado in ("left", "right"):
    PADRE_VRM1[f"{_lado}ThumbMetacarpal"] = f"{_lado}Hand"
    PADRE_VRM1[f"{_lado}ThumbProximal"] = f"{_lado}ThumbMetacarpal"
    PADRE_VRM1[f"{_lado}ThumbDistal"] = f"{_lado}ThumbProximal"
    for _dedo in ("Index", "Middle", "Ring", "Little"):
        _segs = SEGMENTOS_DEDO[_dedo]
        PADRE_VRM1[f"{_lado}{_dedo}{_segs[0]}"] = f"{_lado}Hand"
        PADRE_VRM1[f"{_lado}{_dedo}{_segs[1]}"] = f"{_lado}{_dedo}{_segs[0]}"
        PADRE_VRM1[f"{_lado}{_dedo}{_segs[2]}"] = f"{_lado}{_dedo}{_segs[1]}"

# Huesos 0.x del avatar -> nombre 1.0 (el pulgar cambio de nombre).
MAPA_PULGAR_0X_A_1X = {"Proximal": "Metacarpal", "Intermediate": "Proximal", "Distal": "Distal"}

# Articulaciones MediaPipe por dedo (base, ..., punta).
ARTICULACIONES = {
    "Thumb": [1, 2, 3, 4], "Index": [5, 6, 7, 8], "Middle": [9, 10, 11, 12],
    "Ring": [13, 14, 15, 16], "Little": [17, 18, 19, 20],
}
NUDILLOS = [5, 9, 13, 17]

# Signos verificados visualmente en Dalo (palmas al frente, pulgares fuera).
SIGNO_PALMA_DERECHA = -1.0
SIGNO_PALMA_MODELO = -1.0


# ---------- cuaterniones y vectores ----------

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
    x, y, z, w = q
    return [-x, -y, -z, w]


def qnorm(q):
    n = math.sqrt(sum(c * c for c in q)) or 1.0
    return [c / n for c in q]


def qset_from_unit(a, b):
    ax, ay, az = a
    bx, by, bz = b
    d = ax * bx + ay * by + az * bz
    if d >= 1.0:
        return [0.0, 0.0, 0.0, 1.0]
    if d <= -1.0:
        x, y, z = (1.0, 0.0, 0.0) if abs(ax) < 0.9 else (0.0, 1.0, 0.0)
        return [x, y, z, 0.0]
    s = math.sqrt((1.0 + d) * 2.0)
    inv = 1.0 / s
    return [
        (ay * bz - az * by) * inv,
        (az * bx - ax * bz) * inv,
        (ax * by - ay * bx) * inv,
        s * 0.5,
    ]


def qaxis(ux, uy, uz, ang):
    s = math.sin(ang / 2.0)
    return [ux * s, uy * s, uz * s, math.cos(ang / 2.0)]


def qrot(q, v):
    x, y, z = qmul(qmul(q, [v[0], v[1], v[2], 0.0]), qconj(q))[:3]
    return [x, y, z]


def vadd(a, b):
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]


def vsub(a, b):
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]


def vmul(a, s):
    return [a[0] * s, a[1] * s, a[2] * s]


def vdot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def vcross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def vlen(a):
    return math.sqrt(vdot(a, a)) or 1.0


def vnorm(a):
    return vmul(a, 1.0 / vlen(a))


def flip_vrm1_a_vrm0(q):
    """Conjugado de espejo VRM1<->VRM0 que aplica three-vrm (metaVersion 0)."""
    x, y, z, w = q
    return [-x, y, -z, w]


# ---------- reposo del .vrm ----------

def leer_glb_json(ruta):
    with open(ruta, "rb") as f:
        data = f.read()
    assert data[:4] == b"glTF", "no es un glB"
    largo_json = struct.unpack("<I", data[12:16])[0]
    return json.loads(data[20:20 + largo_json])


def extraer_reposo(js):
    nodos = js["nodes"]
    padre = {}
    for i, nodo in enumerate(nodos):
        for hijo in nodo.get("children", []):
            padre[hijo] = i
    trs = []
    for nodo in nodos:
        t = nodo.get("translation", [0.0, 0.0, 0.0])
        r = qnorm(nodo.get("rotation", [0.0, 0.0, 0.0, 1.0]))
        s = nodo.get("scale", [1.0, 1.0, 1.0])
        if any(abs(c - 1.0) > 1e-6 for c in s):
            raise ValueError(f"escala no unitaria en nodo {nodo.get('name')}")
        trs.append((t, r))
    mundo_q = {}
    mundo_p = {}

    def componer(i):
        if i in mundo_q:
            return mundo_q[i], mundo_p[i]
        t, r = trs[i]
        if i in padre:
            pq, pp = componer(padre[i])
            # p_mundo = pp + pq * t ; q_mundo = pq * r
            rt = qrot(pq, t)
            mundo_q[i] = qnorm(qmul(pq, r))
            mundo_p[i] = [pp[0] + rt[0], pp[1] + rt[1], pp[2] + rt[2]]
        else:
            mundo_q[i] = list(r)
            mundo_p[i] = list(t)
        return mundo_q[i], mundo_p[i]

    for i in range(len(nodos)):
        componer(i)
    huesos_0x = {h["bone"]: h["node"] for h in js["extensions"]["VRM"]["humanoid"]["humanBones"]}
    return {"nodos": nodos, "padre": padre, "trs": trs, "mundo_q": mundo_q,
            "mundo_p": mundo_p, "huesos_0x": huesos_0x}


def nodo_para_hueso(reposo, hueso_1x):
    # Igual que three-vrm: el pulgar 0.x se renombra al normalizar
    # (Proximal->Metacarpal, Intermediate->Proximal, Distal queda igual),
    # asi que hay que resolverlo por el mapa ANTES del acceso directo.
    huesos_0x = reposo["huesos_0x"]
    lado = "left" if hueso_1x.startswith("left") else "right"
    resto = hueso_1x[len(lado):]
    if resto.startswith("Thumb"):
        seg = resto[len("Thumb"):]
        inv = {v: k for k, v in MAPA_PULGAR_0X_A_1X.items()}
        return huesos_0x[lado + "Thumb" + inv[seg]]
    if hueso_1x in huesos_0x:
        return huesos_0x[hueso_1x]
    raise KeyError(f"hueso sin correspondencia 0.x: {hueso_1x}")


def padre_efectivo(hueso, disponibles):
    p = PADRE_VRM1[hueso]
    while p is not None and p not in disponibles:
        p = PADRE_VRM1[p]
    return p


# ---------- secuencia y encuadre (replica de Dalo) ----------

def cargar_avatar_json(ruta):
    with open(ruta, encoding="utf-8") as f:
        return json.load(f)


def calcular_encuadre(secuencia):
    hombros = []
    anchos = []
    for frame in secuencia["fotogramas"]:
        pose = frame["pose"]
        hi, hd = pose[11], pose[12]
        if hi and hd:
            hombros.append([(hi[0] + hd[0]) / 2, (hi[1] + hd[1]) / 2, (hi[2] + hd[2]) / 2])
            anchos.append(math.hypot((hi[0] - hd[0]) * ASPECTO_FUENTE, hi[1] - hd[1]))
    n = max(len(hombros), 1)
    ox = sum(p[0] for p in hombros) / n
    oy = sum(p[1] for p in hombros) / n
    oz = sum(p[2] for p in hombros) / n
    ancho = (sum(anchos) / max(len(anchos), 1)) if anchos else 0.3
    return (ox, oy, oz), 0.85 / max(ancho, 0.05)


def a_vector(p, origen, escala):
    return [
        (p[0] - origen[0]) * ASPECTO_FUENTE * escala,
        -(p[1] - origen[1]) * escala,
        -(p[2] - origen[2]) * ASPECTO_FUENTE * escala,
    ]


def grupo_mundo(frame, grupo, origen, escala):
    lista = frame.get(grupo)
    if not lista:
        return []
    return [a_vector(p, origen, escala) if p else None for p in lista]


def centro(a, b):
    if a and b:
        return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
    return a or b


# ---------- retargeting (replica de avatar-lsc.ts) ----------

class Retarget:
    def __init__(self, reposo, hueso_a_nodo, disponibles):
        self.reposo = reposo
        self.hueso_a_nodo = hueso_a_nodo
        self.disponibles = disponibles
        self.rest_local = {}
        self.rest_dir_padre = {}
        for hueso in HUESOS_ANIMADOS:
            nodo = hueso_a_nodo[hueso]
            t, r = reposo["trs"][nodo]
            self.rest_local[hueso] = list(r)
            pef = padre_efectivo(hueso, disponibles)
            pw = reposo["mundo_q"][hueso_a_nodo[pef]] if pef else [0, 0, 0, 1]
            # direccion de reposo (hueso -> hijo de referencia) en espacio
            # del padre; las falanges distales (salvo pulgar) continuan la
            # direccion de su padre, igual que en Dalo.
            if hueso in SALTAR:
                continue
            hijo = HIJO_TS.get(hueso)
            if hijo is not None:
                d = vnorm(vsub(reposo["mundo_p"][self.hueso_a_nodo[hijo]],
                               reposo["mundo_p"][nodo]))
                self.rest_dir_padre[hueso] = qrot(qconj(pw), d)
            else:
                self.rest_dir_padre[hueso] = self.rest_dir_padre[PADRE_VRM1[hueso]]
        # eje de la palma en espacio local (reposo)
        self.u_local = {}
        for lado in ("left", "right"):
            mano = hueso_a_nodo[f"{lado}Hand"]
            medio = hueso_a_nodo[f"{lado}MiddleProximal"]
            pulgar = hueso_a_nodo[f"{lado}ThumbProximal"]
            pm = reposo["mundo_p"][mano]
            dd = vnorm(vsub(reposo["mundo_p"][medio], pm))
            dp = vnorm(vsub(reposo["mundo_p"][pulgar], pm))
            n = vnorm(vcross(dd, dp))
            u = qrot(qconj(reposo["mundo_q"][mano]), n)
            self.u_local[lado] = vmul(u, SIGNO_PALMA_MODELO)

    def apuntar(self, hueso, desde, hacia, mundo_q):
        """Devuelve (local, mundo) del hueso; mundo_q se actualiza en sitio."""
        pef = padre_efectivo(hueso, self.disponibles)
        pq = mundo_q[pef] if pef else [0, 0, 0, 1]
        objetivo = vnorm(vsub(hacia, desde))
        objetivo = qrot(qconj(pq), objetivo)
        giro = qset_from_unit(self.rest_dir_padre[hueso], objetivo)
        local = qnorm(qmul(giro, self.rest_local[hueso]))
        mundo_q[hueso] = qnorm(qmul(pq, local))
        return local

    def corregir_rol(self, lado, muneca, centro_nud, normal_mundo, mundo_q):
        hueso = f"{lado}Hand"
        pef = padre_efectivo(hueso, self.disponibles)
        pq = mundo_q[pef] if pef else [0, 0, 0, 1]
        inv = qconj(pq)
        eje = vnorm(qrot(inv, vnorm(vsub(centro_nud, muneca))))
        objetivo = qrot(inv, vnorm(normal_mundo))
        if hueso not in mundo_q:
            return None
        local_aim = qmul(inv, mundo_q[hueso])
        actual = qrot(local_aim, self.u_local[lado])
        a = vnorm(vsub(actual, vmul(eje, vdot(actual, eje))))
        b = vnorm(vsub(objetivo, vmul(eje, vdot(objetivo, eje))))
        ang = math.atan2(vdot(vcross(a, b), eje), vdot(a, b))
        twist = qaxis(eje[0], eje[1], eje[2], ang)
        local = self._local_actual(hueso, mundo_q)
        local = qnorm(qmul(twist, local))
        mundo_q[hueso] = qnorm(qmul(pq, local))
        return local

    def _local_actual(self, hueso, mundo_q):
        pef = padre_efectivo(hueso, self.disponibles)
        pq = mundo_q[pef] if pef else [0, 0, 0, 1]
        return qmul(qconj(pq), mundo_q[hueso])


def resolver_fotograma(retarget, frame, mundo_q_base):
    mundo_q = dict(mundo_q_base)
    locales = {}
    pose = frame["pose_m"]
    izq = frame["izq_m"]
    der = frame["der_m"]
    hombros = centro(pose[11], pose[12])

    def ap(h, d, hcia):
        if d and hcia:
            locales[h] = retarget.apuntar(h, d, hcia, mundo_q)

    ap("leftShoulder", hombros, pose[11])
    ap("rightShoulder", hombros, pose[12])
    ap("leftUpperArm", pose[11], pose[13])
    ap("rightUpperArm", pose[12], pose[14])
    ap("leftLowerArm", pose[13], pose[15])
    ap("rightLowerArm", pose[14], pose[16])

    for lado, mano in (("left", izq), ("right", der)):
        if not mano or not mano[0]:
            continue
        nud = [mano[i] for i in NUDILLOS]
        if any(p is None for p in nud):
            continue
        cn = [sum(c) / 4 for c in zip(*nud)]
        locales[f"{lado}Hand"] = retarget.apuntar(f"{lado}Hand", mano[0], cn, mundo_q)
        normal = vnorm(vcross(vsub(mano[5], mano[0]), vsub(mano[17], mano[0])))
        if lado == "right":
            normal = vmul(normal, SIGNO_PALMA_DERECHA)
        locales[f"{lado}Hand"] = retarget.corregir_rol(lado, mano[0], cn, normal, mundo_q)

        for dedo in DEDOS:
            arts = ARTICULACIONES[dedo]
            segs = SEGMENTOS_DEDO[dedo]
            for (a, b), seg in zip(zip(arts[:-1], arts[1:]), segs):
                if f"{lado}{dedo}{seg}" in SALTAR:
                    continue
                if mano[a] and mano[b]:
                    locales[f"{lado}{dedo}{seg}"] = retarget.apuntar(
                        f"{lado}{dedo}{seg}", mano[a], mano[b], mundo_q)
    return locales


# ---------- escritura del .vrma ----------

def construir_nodos(reposo, hueso_a_nodo):
    orden = ["hips", "spine", "chest"] + HUESOS_ANIMADOS
    nodos = []
    indice = {}
    hijos = {h: [] for h in orden}
    # Include static ancestors: Blender traverses only the tree rooted at hips.
    # Omitting spine/chest edges leaves every animated arm/finger unreachable.
    for h in orden:
        p = padre_efectivo(h, set(orden))
        if p is not None:
            hijos[p].append(h)
    for h in orden:
        nodo = hueso_a_nodo[h]
        t, r = reposo["trs"][nodo]
        entrada = {"name": h, "translation": [float(v) for v in t],
                   "rotation": [float(v) for v in r]}
        if hijos[h]:
            entrada["children"] = []
        nodos.append(entrada)
        indice[h] = len(nodos) - 1
    for h in orden:
        for c in hijos[h]:
            nodos[indice[h]]["children"].append(indice[c])
    # quitar 'children' vacios salvo cadena necesaria
    for n in nodos:
        if "children" in n and not n["children"]:
            del n["children"]
    return nodos, indice


def escribir_vrma(ruta, nodos, indice_nodo, claves_por_hueso, tiempos, fps):
    # claves_por_hueso: hueso -> [quat, ...] (q_track ya convertidos)
    datos_bin = bytearray()
    vistas = []
    accesores = []

    def agregar(datos, tipo):
        nonlocal datos_bin
        while len(datos_bin) % 4:
            datos_bin.append(0)
        off = len(datos_bin)
        datos_bin.extend(datos)
        comp = {"SCALAR": 1, "VEC4": 4}[tipo]
        vistas.append({"buffer": 0, "byteOffset": off, "byteLength": len(datos)})
        accesores.append({"bufferView": len(vistas) - 1, "componentType": 5126,
                          "count": len(datos) // (4 * comp), "type": tipo})
        return len(accesores) - 1

    acc_tiempo = agregar(struct.pack("<%df" % len(tiempos), *tiempos), "SCALAR")
    accesores[acc_tiempo]["min"] = [tiempos[0]]
    accesores[acc_tiempo]["max"] = [tiempos[-1]]
    canales = []
    muestreadores = []
    for hueso, claves in claves_por_hueso.items():
        plano = [c for q in claves for c in q]
        acc_q = agregar(struct.pack("<%df" % len(plano), *plano), "VEC4")
        muestreadores.append({"input": acc_tiempo, "output": acc_q})
        canales.append({"sampler": len(muestreadores) - 1,
                        "target": {"node": indice_nodo[hueso], "path": "rotation"}})
    huesos_ext = {h: {"node": indice_nodo[h]} for h in (["hips", "spine", "chest"] + list(claves_por_hueso))}
    js = {
        "asset": {"version": "2.0", "generator": "Dalo lsc54_to_vrma.py"},
        "nodes": nodos,
        "scenes": [{"nodes": [indice_nodo["hips"]]}],
        "scene": 0,
        "buffers": [{"byteLength": len(datos_bin)}],
        "bufferViews": vistas,
        "accessors": accesores,
        "animations": [{"samplers": muestreadores, "channels": canales}],
        "extensionsUsed": ["VRMC_vrm_animation"],
        "extensions": {"VRMC_vrm_animation": {"specVersion": "1.0",
                                             "humanoid": {"humanBones": huesos_ext}}},
    }
    crudo = json.dumps(js, separators=(",", ":")).encode("utf-8")
    while len(crudo) % 4:
        crudo += b" "
    while len(datos_bin) % 4:
        datos_bin.append(0)
    with open(ruta, "wb") as f:
        f.write(b"glTF" + struct.pack("<II", 2, 12 + 8 + len(crudo) + 8 + len(datos_bin)))
        f.write(struct.pack("<I", len(crudo)) + b"JSON" + crudo)
        f.write(struct.pack("<I", len(datos_bin)) + b"BIN\x00" + bytes(datos_bin))


# ---------- programa principal ----------

def preparar_datos(reposo, secuencia):
    hueso_a_nodo = {h: nodo_para_hueso(reposo, h)
                     for h in (["hips", "spine", "chest"] + HUESOS_ANIMADOS)}
    disponibles = set(hueso_a_nodo)
    # VRMUtils.rotateVRM0 gira la escena pi sobre Y en tiempo de ejecucion;
    # los cuaterniones mundo del retargeting en vivo la incluyen (igual que
    # en Dalo). El reposo authored para el .vrma queda sin ella, como lo
    # compone el loader desde los nodos del propio archivo.
    giro_escena = [0.0, 1.0, 0.0, 0.0]
    mundo_q_base = {}
    for h in ("hips", "spine", "chest"):
        mundo_q_base[h] = qnorm(qmul(giro_escena, reposo["mundo_q"][hueso_a_nodo[h]]))
    for h in HUESOS_ANIMADOS:
        mundo_q_base[h] = qnorm(qmul(giro_escena, reposo["mundo_q"][hueso_a_nodo[h]]))
    return hueso_a_nodo, disponibles, mundo_q_base, secuencia["fotogramas"]


def secuencia_tecnica(secuencia_hola):
    """Onda cuadrada corta: pose completa de Hola f16 frente a reposo total."""
    base = secuencia_hola["fotogramas"][16]
    nulos_pose = [None] * len(base["pose"])
    nulos_mano = [None] * 21
    frames = []
    for _ in range(30):
        frames.append({"pose": base["pose"], "manoIzquierda": base["manoIzquierda"],
                       "manoDerecha": base["manoDerecha"]})
    for _ in range(30):
        frames.append({"pose": nulos_pose, "manoIzquierda": nulos_mano, "manoDerecha": nulos_mano})
    return {"id": "tecnica", "fps": 30, "fotogramas": frames}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--avatar", type=Path, required=True, help=".vrm original (solo lectura)")
    ap.add_argument("--entrada", type=Path, help="secuencia avatar JSON (modo senia)")
    ap.add_argument("--modo", choices=["tecnica", "senia"], default="senia")
    ap.add_argument("--hola", type=Path, help="hola.json para la pose de la prueba tecnica")
    ap.add_argument("--salida", type=Path, required=True)
    ap.add_argument("--fps", type=float, default=30.0)
    args = ap.parse_args()

    for p in (args.avatar, args.entrada if args.modo == "senia" else args.hola):
        if p is None or not p.is_file():
            ap.error(f"archivo inexistente: {p}")

    reposo = extraer_reposo(leer_glb_json(args.avatar))
    if args.modo == "tecnica":
        secuencia = secuencia_tecnica(cargar_avatar_json(args.hola))
    else:
        secuencia = cargar_avatar_json(args.entrada)

    hueso_a_nodo, disponibles, mundo_q_base, frames = preparar_datos(reposo, secuencia)
    retarget = Retarget(reposo, hueso_a_nodo, disponibles)

    # mundo en reposo para P_v y W_v (grafo propio del vrma, raiz en caderas)
    mundo_reposo_q = {}
    for h in ["hips", "spine", "chest"] + HUESOS_ANIMADOS:
        mundo_reposo_q[h] = list(reposo["mundo_q"][hueso_a_nodo[h]])

    fps = float(secuencia.get("fps", args.fps))
    tiempos = [i / fps for i in range(len(frames))]
    claves = {h: [] for h in HUESOS_ANIMADOS}
    origen, escala = calcular_encuadre(secuencia)
    for fr in frames:
        fm = {"pose_m": grupo_mundo(fr, "pose", origen, escala),
              "izq_m": grupo_mundo(fr, "manoIzquierda", origen, escala),
              "der_m": grupo_mundo(fr, "manoDerecha", origen, escala)}
        locales = resolver_fotograma(retarget, fm, mundo_q_base)
        for h in HUESOS_ANIMADOS:
            if h in locales:
                qd = locales[h]
            else:
                qd = retarget.rest_local[h]
            pef = padre_efectivo(h, disponibles)
            pv = mundo_reposo_q[pef] if pef else [0, 0, 0, 1]
            wv = mundo_reposo_q[h]
            q_track = qmul(qconj(pv), qmul(flip_vrm1_a_vrm0(qd), wv))
            claves[h].append(qnorm(q_track))

    nodos, indice_nodo = construir_nodos(reposo, hueso_a_nodo)
    escribir_vrma(args.salida, nodos, indice_nodo, claves, tiempos, fps)

    # informe de verificacion
    compro = verificar(args.salida)
    print(json.dumps({"salida": str(args.salida), "fps": fps,
                      "fotogramas": len(frames), "huesos": len(claves),
                      "duracion": round(tiempos[-1], 3), **compro},
                     ensure_ascii=False, indent=1))


def verificar(ruta):
    with open(ruta, "rb") as f:
        data = f.read()
    assert data[:4] == b"glTF"
    ln = struct.unpack("<I", data[12:16])[0]
    js = json.loads(data[20:20 + ln])
    ext = js.get("extensions", {}).get("VRMC_vrm_animation", {})
    assert ext.get("specVersion") == "1.0", "specVersion debe ser 1.0"
    assert "VRMC_vrm_animation" in js.get("extensionsUsed", [])
    hb = ext["humanoid"]["humanBones"]
    anim = js["animations"][0]
    assert len(anim["channels"]) == len(HUESOS_ANIMADOS), "un canal por hueso"
    nodos_por_indice = {c["target"]["node"] for c in anim["channels"]}
    assert all(js["nodes"][i].get("name") in hb for i in nodos_por_indice)
    assert all(set(hb[nm].keys()) == {"node"} for nm in hb)
    binstart = 20 + ln
    cl = struct.unpack("<I", data[binstart:binstart + 4])[0]
    bindata = data[binstart + 8:binstart + 8 + cl]

    def leer(idx):
        a = js["accessors"][idx]
        bv = js["bufferViews"][a["bufferView"]]
        off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        n = a["count"]
        nc = {"SCALAR": 1, "VEC4": 4}[a["type"]]
        return [struct.unpack("<%df" % nc, bindata[off + k * 4 * nc:off + (k + 1) * 4 * nc])
                for k in range(n)]

    tiempos = leer(anim["samplers"][0]["input"])
    mono = all(b[0] > a[0] for a, b in zip(tiempos, tiempos[1:]))
    max_desv = 0.0
    for ch in anim["channels"]:
        for q in leer(anim["samplers"][ch["sampler"]]["output"]):
            n = math.sqrt(sum(c * c for c in q))
            max_desv = max(max_desv, abs(n - 1.0))
            assert all(math.isfinite(c) for c in q), "quaternion no finito"
    return {"tiempos_monotonos": mono, "canales": len(anim["channels"]),
            "desviacion_norma_max": round(max_desv, 6)}


if __name__ == "__main__":
    main()
