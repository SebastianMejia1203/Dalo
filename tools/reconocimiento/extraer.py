"""Reprocesa videos de LSC-54 con Holistic Landmarker (mismo modelo que la web).

Guarda por video un `.npz` con landmarks de imagen y mundiales de pose y
manos (sin rostro), usando NaN para los puntos ausentes, y un informe JSON
con porcentajes de detección por grupo. No modifica el dataset original.

Uso:
    .venv\\Scripts\\python.exe tools/reconocimiento/extraer.py \
        --inventario data/reconocimiento/inventario.json \
        --raiz "data/LSC-54/RawVideos/Videos Courtesy" \
        --modelo data/reconocimiento/modelos/holistic_landmarker.task \
        --salida-dir data/reconocimiento/secuencias
"""

import argparse
import hashlib
import json
from pathlib import Path
import sys

import numpy as np


def landmarks_a_array(puntos, cantidad: int, visibilidad: bool = True) -> np.ndarray:
    """Convierte una lista de landmarks en un array (cantidad, 3|4) con NaN."""
    columnas = 4 if visibilidad else 3
    salida = np.full((cantidad, columnas), np.nan, dtype=np.float32)
    if not puntos:
        return salida
    for indice, punto in enumerate(list(puntos)[:cantidad]):
        salida[indice, 0] = float(punto.x)
        salida[indice, 1] = float(punto.y)
        salida[indice, 2] = float(punto.z)
        if visibilidad:
            salida[indice, 3] = float(getattr(punto, "visibility", np.nan))
    return salida


def _primer_grupo(grupos):
    """Las listas de resultados pueden venir como lista de grupos o grupo plano."""
    if not grupos:
        return None
    primero = grupos[0]
    if primero is None:
        return None
    # Un landmark tiene x/y; un grupo es una lista de landmarks.
    if hasattr(primero, "x"):
        return grupos
    return primero


class ExtractorHolistic:
    """Sesión de extracción: un landmarker y marcas monótonas entre videos.

    MediaPipe en modo VIDEO exige que la marca temporal crezca durante
    toda la sesión, así que cada video continúa donde terminó el anterior.
    """

    def __init__(self, modelo: Path):
        import cv2
        import mediapipe as mp

        self._cv2 = cv2
        self._mp = mp
        opciones = mp.tasks.vision.HolisticLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=str(modelo)),
            running_mode=mp.tasks.vision.RunningMode.VIDEO,
        )
        self._landmarker = mp.tasks.vision.HolisticLandmarker.create_from_options(opciones)
        self._siguiente_ms = 0

    def __enter__(self) -> "ExtractorHolistic":
        return self

    def __exit__(self, *exc) -> None:
        self._landmarker.close()

    def extraer(self, ruta: Path) -> tuple[dict, dict]:
        cv2 = self._cv2
        mp = self._mp
        captura = cv2.VideoCapture(str(ruta))
        if not captura.isOpened():
            raise ValueError(f"No se pudo abrir el video: {ruta}")
        fps = float(captura.get(cv2.CAP_PROP_FPS)) or 30.0
        base_ms = self._siguiente_ms

        pose, pose_mundo = [], []
        mano_i, mano_d, mano_i_mundo, mano_d_mundo = [], [], [], []
        presentes = {"pose": 0, "mano_izquierda": 0, "mano_derecha": 0}
        total = 0
        try:
            while True:
                ok, fotograma = captura.read()
                if not ok:
                    break
                rgb = cv2.cvtColor(fotograma, cv2.COLOR_BGR2RGB)
                imagen = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                marca_ms = base_ms + int(round(total * 1000.0 / fps))
                resultado = self._landmarker.detect_for_video(imagen, marca_ms)
                total += 1
                grupo_pose = _primer_grupo(resultado.pose_landmarks)
                grupo_pose_mundo = _primer_grupo(resultado.pose_world_landmarks)
                grupo_i = _primer_grupo(resultado.left_hand_landmarks)
                grupo_d = _primer_grupo(resultado.right_hand_landmarks)
                grupo_i_m = _primer_grupo(resultado.left_hand_world_landmarks)
                grupo_d_m = _primer_grupo(resultado.right_hand_world_landmarks)
                if grupo_pose:
                    presentes["pose"] += 1
                if grupo_i:
                    presentes["mano_izquierda"] += 1
                if grupo_d:
                    presentes["mano_derecha"] += 1
                pose.append(landmarks_a_array(grupo_pose, 33))
                pose_mundo.append(landmarks_a_array(grupo_pose_mundo, 33, visibilidad=False))
                mano_i.append(landmarks_a_array(grupo_i, 21, visibilidad=False))
                mano_d.append(landmarks_a_array(grupo_d, 21, visibilidad=False))
                mano_i_mundo.append(landmarks_a_array(grupo_i_m, 21, visibilidad=False))
                mano_d_mundo.append(landmarks_a_array(grupo_d_m, 21, visibilidad=False))
        finally:
            captura.release()
        if total == 0:
            raise ValueError(f"El video no tiene fotogramas legibles: {ruta}")
        # El siguiente video continúa después del último fotograma de este.
        self._siguiente_ms = base_ms + int(round(total * 1000.0 / fps)) + 1000

        def apilar(lista):
            return np.stack(lista).astype(np.float32)

        datos = {
            "pose": apilar(pose),
            "pose_mundo": apilar(pose_mundo),
            "mano_izquierda": apilar(mano_i),
            "mano_derecha": apilar(mano_d),
            "mano_izquierda_mundo": apilar(mano_i_mundo),
            "mano_derecha_mundo": apilar(mano_d_mundo),
            "fps": np.array([fps], dtype=np.float32),
        }
        informe = {
            "fotogramas": total,
            "fps": fps,
            "pose_pct": round(100.0 * presentes["pose"] / total, 2),
            "mano_izquierda_pct": round(100.0 * presentes["mano_izquierda"] / total, 2),
            "mano_derecha_pct": round(100.0 * presentes["mano_derecha"] / total, 2),
        }
        return datos, informe


def extraer_video(ruta: Path, modelo: Path) -> tuple[dict, dict]:
    with ExtractorHolistic(modelo) as extractor:
        return extractor.extraer(ruta)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventario", type=Path, required=True)
    parser.add_argument("--raiz", type=Path, required=True, help="Carpeta 'Videos Courtesy'.")
    parser.add_argument("--modelo", type=Path, required=True)
    parser.add_argument("--salida-dir", type=Path, required=True)
    parser.add_argument("--senas", default="chao,perfecto", help="Lista separada por comas.")
    parser.add_argument("--limite", type=int, default=0, help="Máximo de videos por seña (0 = todos).")
    args = parser.parse_args()
    if not args.modelo.is_file():
        print(f"No existe el modelo: {args.modelo}", file=sys.stderr)
        return 1
    inventario = json.loads(args.inventario.read_text(encoding="utf-8"))
    senas = {s.strip() for s in args.senas.split(",") if s.strip()}
    seleccion = [v for v in inventario["videos"] if v["sena"] in senas]
    if args.limite > 0:
        por_sena: dict[str, int] = {}
        limitada = []
        for video in seleccion:
            cuenta = por_sena.get(video["sena"], 0)
            if cuenta < args.limite:
                limitada.append(video)
                por_sena[video["sena"]] = cuenta + 1
        seleccion = limitada
    if not seleccion:
        print("La selección de videos está vacía.", file=sys.stderr)
        return 1

    huella = hashlib.sha256(args.modelo.read_bytes()).hexdigest()
    args.salida_dir.mkdir(parents=True, exist_ok=True)
    informes = []
    # Una sesión por video: el grafo Holistic no admite cambios de
    # resolución dentro de una misma sesión (el dataset mezcla 640x360
    # y 640x480) y cada clip es independiente de los demás.
    for indice, video in enumerate(seleccion, start=1):
        ruta = args.raiz / video["ruta"]
        destino = (
            args.salida_dir
            / video["sena"]
            / f"{video['participante']}_{video['repeticion']}.npz"
        )
        destino.parent.mkdir(parents=True, exist_ok=True)
        registro = {"sena": video["sena"], "participante": video["participante"],
                    "repeticion": video["repeticion"], "ruta": video["ruta"]}
        try:
            datos, informe = extraer_video(ruta, args.modelo)
            np.savez_compressed(destino, **datos)
            registro.update(informe)
            registro["salida"] = str(destino)
            registro["error"] = None
        except Exception as error:  # Se registra y se continúa con el resto.
            registro["error"] = f"{type(error).__name__}: {error}"
        informes.append(registro)
        print(f"[{indice}/{len(seleccion)}] {registro['ruta']} -> "
              f"{registro.get('error') or 'ok'}", flush=True)
    informe_general = {
        "modelo": str(args.modelo),
        "modelo_sha256": huella,
        "total": len(informes),
        "con_error": sum(1 for i in informes if i["error"]),
        "videos": informes,
    }
    salida_informe = args.salida_dir / "informe-extraccion.json"
    salida_informe.write_text(json.dumps(informe_general, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Informe escrito en {salida_informe}")
    return 0 if informe_general["con_error"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
