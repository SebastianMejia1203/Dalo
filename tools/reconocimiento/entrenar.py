"""Clasificador temporal (GRU) con validación LOSO.

Entrena dejando fuera a un participante por turno: ninguna persona
evaluada aporta clips de entrenamiento en su turno. Incluye recorte del
segmento activo (sin reposo inicial/final), aumento por espejo y por
velocidad, y ponderación de clases.

Uso:
    .venv\\Scripts\\python.exe tools/reconocimiento/entrenar.py \
        --secuencias-dir data/reconocimiento/secuencias \
        --salida data/reconocimiento/informe-entrenamiento.json
"""

import argparse
from collections import Counter
import json
from pathlib import Path
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import caracteristicas  # noqa: E402

CLASES = ["chao", "perfecto", "hola", "gracias", "esperar", "losiento", "bienvenido", "perdon", "otra"]
SENAS_OTRA = {"apoyar", "ayudar"}
TODAS_LAS_SENAS = {"chao", "perfecto", "hola", "gracias", "esperar", "losiento", "bienvenido", "perdon", "apoyar", "ayudar"}


def configurar_clases(nombres: list[str]) -> list[str]:
    """Fija las clases activas: las pedidas más `otra` con el resto de señas."""
    global CLASES, SENAS_OTRA
    pedidas = [n for n in nombres if n != "otra"]
    CLASES = pedidas + ["otra"]
    SENAS_OTRA = TODAS_LAS_SENAS - set(pedidas)
    return CLASES


def recortar_segmento_activo(secuencia: np.ndarray, indice: dict, margen: int = 3) -> np.ndarray:
    """Conserva desde la primera hasta la última actividad de manos."""
    presencia = np.maximum(
        secuencia[:, indice["presencia_mano_izquierda"]],
        secuencia[:, indice["presencia_mano_derecha"]],
    )
    velocidad = np.maximum(
        np.abs(secuencia[:, indice["velocidad_muneca_izquierda_x"]]),
        np.abs(secuencia[:, indice["velocidad_muneca_derecha_x"]]),
    )
    activos = np.where((presencia > 0.5) | (velocidad > 0.05))[0]
    if len(activos) == 0:
        return secuencia
    inicio = max(0, int(activos[0]) - margen)
    fin = min(len(secuencia), int(activos[-1]) + margen + 1)
    return secuencia[inicio:fin]


def _nombre_espejo(nombre: str) -> str:
    if "izquierda" in nombre:
        return nombre.replace("izquierda", "derecha")
    if "derecha" in nombre:
        return nombre.replace("derecha", "izquierda")
    return nombre


def espejar_secuencia(secuencia: np.ndarray, indice: dict) -> np.ndarray:
    """Refleja la secuencia: intercambia manos y niega el eje x."""
    salida = np.zeros_like(secuencia)
    for nombre, columna in indice.items():
        destino = indice[_nombre_espejo(nombre)]
        signo = -1.0 if nombre.endswith("_x") else 1.0
        salida[:, destino] = secuencia[:, columna] * signo
    return salida


def ocluir_mano(clip: np.ndarray, lado: str, indice: dict) -> np.ndarray:
    """Simula la pérdida de una mano (p. ej. al juntarla con la otra en Ayuda)."""
    salida = clip.copy()
    for nombre, columna in indice.items():
        if nombre.startswith(f"mano_{lado}_") or nombre == f"contacto_pulgar_indice_{lado}":
            salida[:, columna] = 0.0
    salida[:, indice[f"presencia_mano_{lado}"]] = 0.0
    return salida


def preparar_clip(secuencia: np.ndarray, indice: dict, fotogramas: int = 48, factor_velocidad: float = 1.0) -> np.ndarray:
    recorte = recortar_segmento_activo(secuencia, indice)
    if factor_velocidad != 1.0:
        intermedio = max(8, int(round(len(recorte) * factor_velocidad)))
        recorte = caracteristicas.remuestrear_secuencia(recorte, intermedio)
    clip = caracteristicas.remuestrear_secuencia(recorte, fotogramas)
    return np.nan_to_num(clip, nan=0.0).astype(np.float32)


def cargar_dataset(secuencias_dir: Path) -> list[dict]:
    indice = {n: i for i, n in enumerate(caracteristicas.NOMBRES)}
    clips = []
    for carpeta in sorted(secuencias_dir.iterdir()):
        if not carpeta.is_dir():
            continue
        if carpeta.name in CLASES and carpeta.name != "otra":
            clase = carpeta.name
        elif carpeta.name in SENAS_OTRA:
            clase = "otra"
        else:
            continue
        for ruta in sorted(carpeta.glob("*.npz")):
            clips.append(
                {
                    "clase": clase,
                    "sena_origen": carpeta.name,
                    "participante": ruta.stem.split("_")[0],
                    "ruta": str(ruta),
                    "secuencia": caracteristicas.cargar_secuencia(ruta),
                }
            )
    return clips, indice


def construir_modelo(torch, dimension: int, ocultas: int = 64, clases: int = 3):
    class ClasificadorGRU(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.gru = torch.nn.GRU(dimension, ocultas, batch_first=True)
            self.salida = torch.nn.Sequential(
                torch.nn.Dropout(0.2),
                torch.nn.Linear(ocultas * 2, clases),
            )

        def forward(self, x):
            salidas, oculto = self.gru(x)
            ultimo = oculto[-1]
            medio = salidas.mean(dim=1)
            return self.salida(torch.cat([ultimo, medio], dim=1))

    return ClasificadorGRU()


def entrenar_fold(torch, entrenamiento: list[dict], indice: dict, epocas: int, semilla: int):
    torch.manual_seed(semilla)
    np.random.seed(semilla)
    rng = np.random.default_rng(semilla)
    ejemplos = []
    for clip in entrenamiento:
        base = clip["secuencia"]
        ejemplos.append((preparar_clip(base, indice), clip["clase"]))
        ejemplos.append((espejar_secuencia(preparar_clip(base, indice), indice), clip["clase"]))
        ejemplos.append((preparar_clip(base, indice, factor_velocidad=0.8), clip["clase"]))
        ejemplos.append((preparar_clip(base, indice, factor_velocidad=1.25), clip["clase"]))
        lado = "izquierda" if rng.random() < 0.5 else "derecha"
        ejemplos.append((ocluir_mano(preparar_clip(base, indice), lado, indice), clip["clase"]))
    x = np.stack([e[0] for e in ejemplos])
    media = x.mean(axis=(0, 1), keepdims=True)
    desviacion = x.std(axis=(0, 1), keepdims=True)
    desviacion = np.where(desviacion < 1e-4, 1.0, desviacion)
    x = ((x - media) / desviacion).astype(np.float32)
    y = np.array([CLASES.index(e[1]) for e in ejemplos], dtype=np.int64)
    conteo = Counter(y.tolist())
    pesos = np.array([1.0 / conteo.get(i, 1) for i in range(len(CLASES))], dtype=np.float32)
    pesos = pesos / pesos.mean()

    modelo = construir_modelo(torch, x.shape[2], clases=len(CLASES))
    criterio = torch.nn.CrossEntropyLoss(weight=torch.tensor(pesos))
    optimizador = torch.optim.Adam(modelo.parameters(), lr=1e-3, weight_decay=1e-4)
    tensor_x = torch.tensor(x)
    tensor_y = torch.tensor(y)
    n = len(tensor_x)
    for _ in range(epocas):
        permutacion = torch.randperm(n)
        for inicio in range(0, n, 32):
            lote = permutacion[inicio : inicio + 32]
            optimizador.zero_grad()
            perdida = criterio(modelo(tensor_x[lote]), tensor_y[lote])
            perdida.backward()
            optimizador.step()
    return modelo, media.astype(np.float32), desviacion.astype(np.float32)


def predecir(torch, modelo, media, desviacion, clip: np.ndarray) -> tuple[int, np.ndarray]:
    media_v = np.asarray(media).reshape(-1)
    desviacion_v = np.asarray(desviacion).reshape(-1)
    x = ((clip - media_v) / desviacion_v).astype(np.float32)
    with torch.no_grad():
        logitos = modelo(torch.tensor(x[None, :, :]))
        probabilidades = torch.softmax(logitos, dim=1).numpy()[0]
    return int(np.argmax(probabilidades)), probabilidades


def evaluar_loso(clips: list[dict], indice: dict, epocas: int) -> dict:
    import torch

    participantes = sorted({c["participante"] for c in clips}, key=lambda p: int(p) if p.isdigit() else 0)
    predicciones = []
    for numero, participante in enumerate(participantes):
        entrenamiento = [c for c in clips if c["participante"] != participante]
        prueba = [c for c in clips if c["participante"] == participante and c["clase"] in CLASES]
        if not prueba:
            continue
        modelo, media, desviacion = entrenar_fold(torch, entrenamiento, indice, epocas, semilla=42 + numero)
        for clip in prueba:
            preparado = preparar_clip(clip["secuencia"], indice)
            clase_idx, probabilidades = predecir(torch, modelo, media, desviacion, preparado)
            predicciones.append(
                {
                    "clase_real": clip["clase"],
                    "sena_origen": clip["sena_origen"],
                    "clase_predicha": CLASES[clase_idx],
                    "probabilidad": round(float(probabilidades[clase_idx]), 4),
                    "participante": participante,
                    "ruta": clip["ruta"],
                }
            )
        print(f"fold participante {participante}: ok", flush=True)
    confusion = {real: Counter() for real in CLASES}
    aciertos, totales = Counter(), Counter()
    for p in predicciones:
        confusion[p["clase_real"]][p["clase_predicha"]] += 1
        totales[p["clase_real"]] += 1
        if p["clase_real"] == p["clase_predicha"]:
            aciertos[p["clase_real"]] += 1
    return {
        "metodo": "GRU temporal, LOSO por participante, recorte activo, espejo y velocidad",
        "clips": len(predicciones),
        "precision_global": round(sum(aciertos.values()) / len(predicciones), 4) if predicciones else None,
        "por_clase": {
            clase: {
                "aciertos": aciertos[clase],
                "total": totales[clase],
                "recuperacion": round(aciertos[clase] / totales[clase], 4) if totales[clase] else None,
            }
            for clase in CLASES
        },
        "confusion": {real: dict(confusion[real]) for real in CLASES},
        "errores": [p for p in predicciones if p["clase_real"] != p["clase_predicha"]],
        "predicciones": predicciones,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--secuencias-dir", type=Path, required=True)
    parser.add_argument("--salida", type=Path, required=True)
    parser.add_argument("--epocas", type=int, default=50)
    parser.add_argument("--clases", default="chao,perfecto,hola,gracias,esperar,losiento,bienvenido,perdon",
                        help="Señas con clase propia, separadas por comas.")
    args = parser.parse_args()
    configurar_clases([c.strip() for c in args.clases.split(",") if c.strip()])
    clips, indice = cargar_dataset(args.secuencias_dir)
    if not clips:
        print("No hay clips para entrenar.", file=sys.stderr)
        return 1
    conteo = Counter(c["clase"] for c in clips)
    print(f"Clips por clase: {dict(conteo)}")
    informe = evaluar_loso(clips, indice, args.epocas)
    args.salida.parent.mkdir(parents=True, exist_ok=True)
    args.salida.write_text(json.dumps(informe, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Precisión global LOSO: {informe['precision_global']}")
    for clase, datos in informe["por_clase"].items():
        print(f"{clase}: {datos['aciertos']}/{datos['total']} (recuperación {datos['recuperacion']})")
    print(f"Confusión: {informe['confusion']}")
    print(f"Informe escrito en {args.salida}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
