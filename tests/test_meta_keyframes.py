import importlib.util
from pathlib import Path
import unittest

PATH = Path(__file__).resolve().parents[1] / 'tools/meta-evaluation/prepare.py'
spec = importlib.util.spec_from_file_location('meta_prepare', PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class KeyframeTests(unittest.TestCase):
    def test_sin_movimiento_cubre_secuencia_completa_en_orden(self):
        indices = module.select_indices([0] * 60, 12)
        self.assertEqual(len(indices), 12)
        self.assertEqual(indices, sorted(set(indices)))
        self.assertEqual(indices[0], 0)
        self.assertEqual(indices[-1], 59)

    def test_movimiento_concentrado_conserva_inicio_final_y_fases_activas(self):
        scores = [0] * 30 + [1, 3, 5, 10, 5, 3, 1] * 3 + [0] * 30
        indices = module.select_indices(scores, 12)
        self.assertEqual(len(indices), 12)
        self.assertEqual(indices, sorted(set(indices)))
        self.assertLessEqual(indices[0], 30)
        self.assertGreaterEqual(indices[-1], 50)
        self.assertGreaterEqual(sum(30 <= index <= 50 for index in indices), 8)

    def test_clip_corto_no_inventa_fotogramas(self):
        self.assertEqual(module.select_indices([0, 2, 0], 12), [0, 1, 2])

    def test_vacio_falla_explicitamente(self):
        with self.assertRaises(ValueError):
            module.select_indices([], 12)


if __name__ == '__main__':
    unittest.main()
