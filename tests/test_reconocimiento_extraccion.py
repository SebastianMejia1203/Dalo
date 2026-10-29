import importlib.util
from pathlib import Path
import runpy
import unittest

import numpy as np


RAIZ = Path(__file__).resolve().parents[1]
MODULO = RAIZ / "tools" / "reconocimiento" / "extraer.py"
MODELO = RAIZ / "data" / "reconocimiento" / "modelos" / "holistic_landmarker.task"
VIDEO_CHAO = (
    RAIZ
    / "data"
    / "LSC-54"
    / "RawVideos"
    / "Videos Courtesy"
    / "1"
    / "Cordialidad"
    / "Chao"
    / "0.avi"
)


class PuntoFalso:
    def __init__(self, x, y, z, visibility=0.9):
        self.x = x
        self.y = y
        self.z = z
        self.visibility = visibility


class ExtraccionTests(unittest.TestCase):
    def test_landmarks_a_array_rellena_ausentes_con_nan(self):
        modulo = runpy.run_path(str(MODULO))
        convertir = modulo["landmarks_a_array"]
        puntos = [PuntoFalso(0.1, 0.2, 0.3), PuntoFalso(0.4, 0.5, 0.6)]
        array = convertir(puntos, 3)
        self.assertEqual(array.shape, (3, 4))
        self.assertAlmostEqual(float(array[0, 0]), 0.1)
        self.assertTrue(np.isnan(array[2]).all())
        self.assertTrue(np.isnan(convertir(None, 2)).all())
        self.assertTrue(np.isnan(convertir([], 2)).all())

    @unittest.skipUnless(
        MODELO.is_file() and VIDEO_CHAO.is_file() and importlib.util.find_spec("mediapipe") is not None,
        "requiere el modelo Holistic, un video real de Chao y mediapipe instalado",
    )
    def test_extrae_dos_videos_con_el_mismo_landmarker(self):
        # MediaPipe en modo VIDEO exige marcas monótonas en toda la sesión:
        # el segundo video no puede reiniciar su marca en cero.
        modulo = runpy.run_path(str(MODULO))
        otro = VIDEO_CHAO.parent / "1.avi"
        with modulo["ExtractorHolistic"](MODELO) as extractor:
            _, informe1 = extractor.extraer(VIDEO_CHAO)
            _, informe2 = extractor.extraer(otro)
        self.assertGreater(informe1["fotogramas"], 10)
        self.assertGreater(informe2["fotogramas"], 10)

    @unittest.skipUnless(
        MODELO.is_file() and VIDEO_CHAO.is_file() and importlib.util.find_spec("mediapipe") is not None,
        "requiere el modelo Holistic, un video real de Chao y mediapipe instalado",
    )
    def test_extrae_un_video_real_de_chao(self):
        modulo = runpy.run_path(str(MODULO))
        datos, informe = modulo["extraer_video"](VIDEO_CHAO, MODELO)
        total = informe["fotogramas"]
        self.assertGreater(total, 10)
        self.assertEqual(datos["pose"].shape, (total, 33, 4))
        self.assertEqual(datos["mano_izquierda"].shape, (total, 21, 3))
        self.assertEqual(datos["pose_mundo"].shape, (total, 33, 3))
        self.assertEqual(datos["mano_derecha_mundo"].shape, (total, 21, 3))
        self.assertGreater(informe["pose_pct"], 90.0)
        manos = max(informe["mano_izquierda_pct"], informe["mano_derecha_pct"])
        self.assertGreater(manos, 50.0)


if __name__ == "__main__":
    unittest.main()
