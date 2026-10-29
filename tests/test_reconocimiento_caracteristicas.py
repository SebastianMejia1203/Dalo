from pathlib import Path
import runpy
import unittest

import numpy as np


MODULO = (
    Path(__file__).resolve().parents[1]
    / "tools"
    / "reconocimiento"
    / "caracteristicas.py"
)


def secuencia_sintetica(escala=1.0, desplazamiento=(0.0, 0.0, 0.0), contacto=True):
    """Un fotograma: hombros separados 0.4*escala y manos simples."""
    pose_mundo = np.full((1, 33, 3), np.nan, dtype=np.float32)
    c = np.array(desplazamiento, dtype=np.float32)
    pose_mundo[0, 11] = c + np.array([-0.2, 0.0, 0.0]) * escala
    pose_mundo[0, 12] = c + np.array([0.2, 0.0, 0.0]) * escala
    pose_mundo[0, 13] = c + np.array([-0.3, 0.2, 0.0]) * escala
    pose_mundo[0, 14] = c + np.array([0.3, 0.2, 0.0]) * escala
    pose_mundo[0, 15] = c + np.array([-0.3, 0.4, 0.0]) * escala
    pose_mundo[0, 16] = c + np.array([0.3, 0.4, 0.0]) * escala

    def mano(contacto_dedo):
        puntos = np.zeros((1, 21, 3), dtype=np.float32)
        puntos[0, :, 0] = np.arange(21, dtype=np.float32) * 0.01 * escala
        puntos[0, 9] = [0.0, -0.1 * escala, 0.0]
        if contacto_dedo:
            puntos[0, 4] = [0.08 * escala, 0.0, 0.0]
            puntos[0, 8] = [0.08 * escala, 0.0, 0.0]
        return puntos

    return {
        "pose_mundo": pose_mundo,
        "mano_izquierda_mundo": mano(contacto),
        "mano_derecha_mundo": mano(contacto),
        "mano_izquierda": np.zeros((1, 21, 3), dtype=np.float32),
        "mano_derecha": np.zeros((1, 21, 3), dtype=np.float32),
        "pose": np.zeros((1, 33, 4), dtype=np.float32),
    }


class CaracteristicasTests(unittest.TestCase):
    def setUp(self):
        self.modulo = runpy.run_path(str(MODULO))

    def test_invariante_a_traslacion_y_escala_del_torso(self):
        base = self.modulo["extraer_caracteristicas"](secuencia_sintetica())
        otra = self.modulo["extraer_caracteristicas"](
            secuencia_sintetica(escala=2.5, desplazamiento=(3.0, -1.0, 0.5))
        )
        self.assertEqual(base.shape, otra.shape)
        mascara = ~np.isnan(base[0])
        self.assertTrue(np.allclose(base[0][mascara], otra[0][mascara], atol=1e-5))

    def test_contacto_pulgar_indice_queda_cerca_de_cero(self):
        nombres = self.modulo["NOMBRES"]
        salida = self.modulo["extraer_caracteristicas"](secuencia_sintetica(contacto=True))
        indice = nombres.index("contacto_pulgar_indice_izquierda")
        self.assertAlmostEqual(float(salida[0, indice]), 0.0, places=5)
        lejos = self.modulo["extraer_caracteristicas"](secuencia_sintetica(contacto=False))
        self.assertGreater(float(lejos[0, indice]), 0.3)

    def test_mano_ausente_produce_nan_solo_en_su_bloque(self):
        datos = secuencia_sintetica()
        datos["mano_izquierda_mundo"][:] = np.nan
        datos["mano_izquierda"][:] = np.nan
        salida = self.modulo["extraer_caracteristicas"](datos)
        nombres = self.modulo["NOMBRES"]
        contacto_i = salida[0, nombres.index("contacto_pulgar_indice_izquierda")]
        contacto_d = salida[0, nombres.index("contacto_pulgar_indice_derecha")]
        self.assertTrue(np.isnan(contacto_i))
        self.assertFalse(np.isnan(contacto_d))

    def test_remuestreo_conserva_longitud_objetivo(self):
        secuencia = np.arange(10, dtype=np.float32).reshape(10, 1)
        salida = self.modulo["remuestrear_secuencia"](secuencia, 4)
        self.assertEqual(salida.shape, (4, 1))
        self.assertAlmostEqual(float(salida[0, 0]), 0.0)
        self.assertAlmostEqual(float(salida[-1, 0]), 9.0)


if __name__ == "__main__":
    unittest.main()
