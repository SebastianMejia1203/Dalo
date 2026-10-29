"""Características v2 para reconocimiento de señas (compartidas con la web).

Entrada: las secuencias `.npz` producidas por `extraer.py` (landmarks
mundiales de pose y manos de Holistic Landmarker). Salida: una matriz
(fotogramas, características) con NaN donde el dato no fue detectado.

Bloques:
- Posición de codos y muñecas relativas al centro de hombros, escaladas
  por el ancho de hombros (invariante a posición y tamaño de la persona).
- Forma local de cada mano: puntos mundiales de la mano trasladados a su
  muñeca y escalados por la distancia muñeca→nudillo medio.
- Contacto: distancia pulgar–índice de cada mano y distancias entre
  muñecas, pulgares e índices de ambas manos.
- Velocidad de las muñecas y presencia de cada mano.
"""

from pathlib import Path

import numpy as np

HOMBRO_I, HOMBRO_D = 11, 12
CODO_I, CODO_D = 13, 14
MUNECA_I, MUNECA_D = 15, 16
PULGAR, INDICE, MEDIO = 4, 8, 9

EJES = ("x", "y", "z")


def _nombres() -> list[str]:
    nombres: list[str] = []
    for punto in ("codo_izquierda", "codo_derecha", "muneca_izquierda", "muneca_derecha"):
        nombres += [f"{punto}_{eje}" for eje in EJES]
    for lado in ("izquierda", "derecha"):
        for indice in range(21):
            nombres += [f"mano_{lado}_{indice}_{eje}" for eje in EJES]
    nombres += [
        "contacto_pulgar_indice_izquierda",
        "contacto_pulgar_indice_derecha",
        "distancia_munecas",
        "distancia_pulgares",
        "distancia_indices",
    ]
    for lado in ("izquierda", "derecha"):
        nombres += [f"velocidad_muneca_{lado}_{eje}" for eje in EJES]
    nombres += ["presencia_mano_izquierda", "presencia_mano_derecha"]
    return nombres


NOMBRES: list[str] = _nombres()
DIMENSION = len(NOMBRES)


def _presente(puntos: np.ndarray) -> bool:
    return bool(np.isfinite(puntos).any())


def _forma_mano(mundo: np.ndarray) -> tuple[np.ndarray, float]:
    """Puntos de la mano relativos a la muñeca y su escala (NaN si ausente)."""
    if not _presente(mundo):
        return np.full((21, 3), np.nan, dtype=np.float32), np.nan
    muneca = mundo[0]
    escala = float(np.linalg.norm(mundo[MEDIO] - muneca))
    if not np.isfinite(escala) or escala < 1e-6:
        return np.full((21, 3), np.nan, dtype=np.float32), np.nan
    return ((mundo - muneca) / escala).astype(np.float32), escala


def extraer_caracteristicas(datos: dict) -> np.ndarray:
    pose_mundo = np.asarray(datos["pose_mundo"], dtype=np.float64)
    manos_mundo = {
        "izquierda": np.asarray(datos["mano_izquierda_mundo"], dtype=np.float64),
        "derecha": np.asarray(datos["mano_derecha_mundo"], dtype=np.float64),
    }
    total = pose_mundo.shape[0]
    salida = np.full((total, DIMENSION), np.nan, dtype=np.float32)
    indice = {nombre: i for i, nombre in enumerate(NOMBRES)}

    for t in range(total):
        hombro_i = pose_mundo[t, HOMBRO_I]
        hombro_d = pose_mundo[t, HOMBRO_D]
        if np.isfinite(hombro_i).all() and np.isfinite(hombro_d).all():
            centro = (hombro_i + hombro_d) / 2.0
            escala = float(np.linalg.norm(hombro_i - hombro_d))
            if escala >= 1e-6:
                for nombre, articulacion in (
                    ("codo_izquierda", CODO_I),
                    ("codo_derecha", CODO_D),
                    ("muneca_izquierda", MUNECA_I),
                    ("muneca_derecha", MUNECA_D),
                ):
                    punto = pose_mundo[t, articulacion]
                    if np.isfinite(punto).all():
                        relativo = (punto - centro) / escala
                        for eje in range(3):
                            salida[t, indice[f"{nombre}_{EJES[eje]}"]] = relativo[eje]
        formas: dict[str, np.ndarray] = {}
        escalas: dict[str, float] = {}
        for lado in ("izquierda", "derecha"):
            forma, escala_mano = _forma_mano(manos_mundo[lado][t])
            formas[lado] = forma
            escalas[lado] = escala_mano
            salida[t, indice[f"presencia_mano_{lado}"]] = 1.0 if np.isfinite(escala_mano) else 0.0
            if np.isfinite(forma).any():
                for punto in range(21):
                    for eje in range(3):
                        salida[t, indice[f"mano_{lado}_{punto}_{EJES[eje]}"]] = forma[punto, eje]
                contacto = float(np.linalg.norm(forma[PULGAR] - forma[INDICE]))
                salida[t, indice[f"contacto_pulgar_indice_{lado}"]] = contacto
        # Distancias entre manos en el marco del torso (muñecas de pose).
        muneca_i = pose_mundo[t, MUNECA_I]
        muneca_d = pose_mundo[t, MUNECA_D]
        if (
            np.isfinite(hombro_i).all()
            and np.isfinite(hombro_d).all()
            and np.isfinite(muneca_i).all()
            and np.isfinite(muneca_d).all()
        ):
            escala_torso = float(np.linalg.norm(hombro_i - hombro_d))
            if escala_torso >= 1e-6:
                salida[t, indice["distancia_munecas"]] = (
                    float(np.linalg.norm(muneca_i - muneca_d)) / escala_torso
                )
                # Punta global aproximada: muñeca de pose + punto mundial de
                # la mano (ambos mundos comparten ejes de cámara).
                for nombre, dedo in (("distancia_pulgares", PULGAR), ("distancia_indices", INDICE)):
                    forma_i, forma_d = formas["izquierda"], formas["derecha"]
                    if np.isfinite(forma_i).any() and np.isfinite(forma_d).any():
                        punta_i = muneca_i + forma_i[dedo] * escalas["izquierda"]
                        punta_d = muneca_d + forma_d[dedo] * escalas["derecha"]
                        salida[t, indice[nombre]] = float(np.linalg.norm(punta_i - punta_d)) / escala_torso
    # Velocidad de muñecas (diferencia entre fotogramas consecutivos).
    for lado, nombre in (("izquierda", "muneca_izquierda"), ("derecha", "muneca_derecha")):
        columnas = [indice[f"{nombre}_{eje}"] for eje in EJES]
        destino = [indice[f"velocidad_muneca_{lado}_{eje}"] for eje in EJES]
        posiciones = salida[:, columnas]
        velocidad = np.zeros_like(posiciones)
        if total > 1:
            velocidad[1:] = posiciones[1:] - posiciones[:-1]
            velocidad[0] = velocidad[1]
        salida[:, destino] = velocidad
    return salida


def remuestrear_secuencia(secuencia: np.ndarray, objetivo: int) -> np.ndarray:
    """Interpola linealmente a `objetivo` fotogramas, conservando NaN por tramo."""
    secuencia = np.asarray(secuencia, dtype=np.float64)
    if secuencia.shape[0] == 0 or objetivo <= 0:
        return np.empty((0, secuencia.shape[1] if secuencia.ndim == 2 else 0))
    if secuencia.shape[0] == objetivo:
        return secuencia.astype(np.float32)
    posiciones = np.linspace(0, secuencia.shape[0] - 1, objetivo)
    salida = np.empty((objetivo, secuencia.shape[1]), dtype=np.float64)
    x = np.arange(secuencia.shape[0])
    for columna in range(secuencia.shape[1]):
        valores = secuencia[:, columna]
        validos = np.isfinite(valores)
        if validos.sum() == 0:
            salida[:, columna] = np.nan
        elif validos.sum() == 1:
            salida[:, columna] = valores[validos][0]
        else:
            salida[:, columna] = np.interp(posiciones, x[validos], valores[validos])
            fuera = (posiciones < x[validos][0]) | (posiciones > x[validos][-1])
            # np.interp ya extiende los extremos con el valor más cercano.
            salida[fuera, columna] = salida[fuera, columna]
    return salida.astype(np.float32)


def cargar_secuencia(ruta: Path) -> np.ndarray:
    with np.load(ruta) as datos:
        return extraer_caracteristicas({clave: datos[clave] for clave in datos.files})
