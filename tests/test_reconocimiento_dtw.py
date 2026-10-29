from pathlib import Path
import runpy
import unittest

import numpy as np


MODULO = (
    Path(__file__).resolve().parents[1]
    / "tools"
    / "reconocimiento"
    / "evaluar_dtw.py"
)


class DtwTests(unittest.TestCase):
    def setUp(self):
        self.modulo = runpy.run_path(str(MODULO))

    def test_distancia_cero_para_secuencias_identicas(self):
        secuencia = np.random.default_rng(7).normal(size=(20, 5)).astype(np.float32)
        self.assertAlmostEqual(self.modulo["distancia_dtw"](secuencia, secuencia), 0.0, places=5)

    def test_distancia_mayor_para_secuencias_distintas(self):
        rng = np.random.default_rng(7)
        a = rng.normal(size=(20, 5)).astype(np.float32)
        b = (rng.normal(size=(24, 5)) + 5.0).astype(np.float32)
        self.assertGreater(self.modulo["distancia_dtw"](a, b), 0.5)

    def test_distancia_tolera_nan_parciales(self):
        rng = np.random.default_rng(3)
        a = rng.normal(size=(16, 4)).astype(np.float32)
        b = a.copy()
        b[::3, 0] = np.nan
        distancia = self.modulo["distancia_dtw"](a, b)
        self.assertTrue(np.isfinite(distancia))
        self.assertLess(distancia, 0.2)


if __name__ == "__main__":
    unittest.main()
