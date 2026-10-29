from pathlib import Path
import runpy
import unittest

import numpy as np


RAIZ = Path(__file__).resolve().parents[1]
MODULO = RAIZ / "tools" / "reconocimiento" / "entrenar.py"


class EntrenamientoTests(unittest.TestCase):
    def setUp(self):
        self.modulo = runpy.run_path(str(MODULO))
        import sys

        sys.path.insert(0, str(RAIZ / "tools" / "reconocimiento"))
        import caracteristicas

        self.caracteristicas = caracteristicas
        self.indice = {n: i for i, n in enumerate(caracteristicas.NOMBRES)}

    def secuencia_con_reposo(self, fotogramas=60, inicio=20, fin=40):
        secuencia = np.zeros((fotogramas, self.caracteristicas.DIMENSION), dtype=np.float32)
        secuencia[inicio:fin, self.indice["presencia_mano_derecha"]] = 1.0
        secuencia[inicio:fin, self.indice["muneca_derecha_x"]] = 0.5
        return secuencia

    def test_recorte_activo_elimina_reposo_largo(self):
        secuencia = self.secuencia_con_reposo()
        recorte = self.modulo["recortar_segmento_activo"](secuencia, self.indice)
        self.assertLess(len(recorte), 30)
        self.assertGreaterEqual(float(recorte[:, self.indice["presencia_mano_derecha"]].sum()), 18.0)

    def test_espejo_intercambia_manos_y_niega_x(self):
        secuencia = np.zeros((2, self.caracteristicas.DIMENSION), dtype=np.float32)
        secuencia[:, self.indice["muneca_izquierda_x"]] = 0.4
        secuencia[:, self.indice["presencia_mano_izquierda"]] = 1.0
        espejo = self.modulo["espejar_secuencia"](secuencia, self.indice)
        self.assertAlmostEqual(float(espejo[0, self.indice["muneca_derecha_x"]]), -0.4)
        self.assertAlmostEqual(float(espejo[0, self.indice["presencia_mano_derecha"]]), 1.0)
        self.assertAlmostEqual(float(espejo[0, self.indice["presencia_mano_izquierda"]]), 0.0)

    def test_preparar_clip_devuelve_tamano_fijo_sin_nan(self):
        secuencia = self.secuencia_con_reposo()
        secuencia[25, self.indice["mano_derecha_4_x"]] = np.nan
        clip = self.modulo["preparar_clip"](secuencia, self.indice, fotogramas=48)
        self.assertEqual(clip.shape, (48, self.caracteristicas.DIMENSION))
        self.assertTrue(np.isfinite(clip).all())

    def test_cargar_dataset_mapea_cada_sena_a_su_clase(self):
        import tempfile

        with tempfile.TemporaryDirectory() as temp:
            raiz = Path(temp)
            for sena in ("chao", "esperar", "losiento", "bienvenido", "perdon", "ayudar", "apoyar"):
                carpeta = raiz / sena
                carpeta.mkdir()
                np.savez_compressed(
                    carpeta / "1_0.npz",
                    pose_mundo=np.zeros((5, 33, 3), dtype=np.float32),
                    mano_izquierda_mundo=np.zeros((5, 21, 3), dtype=np.float32),
                    mano_derecha_mundo=np.zeros((5, 21, 3), dtype=np.float32),
                )
            clips, _ = self.modulo["cargar_dataset"](raiz)
            por_clase = {c["sena_origen"]: c["clase"] for c in clips}
            self.assertEqual(
                por_clase,
                {
                    "chao": "chao",
                    "esperar": "esperar",
                    "losiento": "losiento",
                    "bienvenido": "bienvenido",
                    "perdon": "perdon",
                    "ayudar": "otra",
                    "apoyar": "otra",
                },
            )

    def test_ocluir_mano_anula_solo_esa_mano(self):
        clip = np.ones((4, self.caracteristicas.DIMENSION), dtype=np.float32)
        ocluido = self.modulo["ocluir_mano"](clip, "izquierda", self.indice)
        self.assertEqual(float(ocluido[0, self.indice["presencia_mano_izquierda"]]), 0.0)
        self.assertEqual(float(ocluido[0, self.indice["mano_izquierda_4_x"]]), 0.0)
        self.assertEqual(float(ocluido[0, self.indice["contacto_pulgar_indice_izquierda"]]), 0.0)
        self.assertEqual(float(ocluido[0, self.indice["presencia_mano_derecha"]]), 1.0)
        self.assertEqual(float(ocluido[0, self.indice["mano_derecha_4_x"]]), 1.0)
        # El clip original no se modifica.
        self.assertEqual(float(clip[0, self.indice["presencia_mano_izquierda"]]), 1.0)

    def test_configurar_clases_mueve_ayudar_y_apoyar_a_otra(self):
        clases = self.modulo["configurar_clases"](
            ["chao", "perfecto", "hola", "gracias", "esperar", "losiento", "bienvenido", "perdon"]
        )
        self.assertEqual(
            clases,
            ["chao", "perfecto", "hola", "gracias", "esperar", "losiento", "bienvenido", "perdon", "otra"],
        )
        self.assertEqual(self.modulo["SENAS_OTRA"], {"apoyar", "ayudar"})

    def test_evaluar_loso_cubre_todas_las_clases_configuradas(self):
        fuente = MODULO.read_text(encoding="utf-8")
        self.assertIn('c["clase"] in CLASES', fuente)


if __name__ == "__main__":
    unittest.main()
