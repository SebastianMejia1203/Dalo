"""Check the exported first versions, rather than the text of their generator."""
import hashlib
import math
from pathlib import Path
import struct
import unittest

from test_vrma_generation import cargar_glb

ROOT = Path(__file__).resolve().parents[1]
IDS = ['bano', 'bien', 'buenasnoches', 'buenastardes', 'buenosdias',
       'comoesta', 'congusto', 'denada', 'excelente', 'invitar', 'mal',
       'masomenos', 'muchasgracias', 'muybien', 'muymal', 'necesitar', 'no',
       'permiso', 'porfavor', 'presentar', 'sentarse', 'si', 'tranquilo']


class CordialidadAssetsTests(unittest.TestCase):
    def test_each_expression_has_a_distinct_playable_editable_clip(self):
        hashes = set()
        for sign in IDS:
            with self.subTest(sign=sign):
                path = ROOT / f'web/public/avatar/{sign}.vrma'
                self.assertTrue(path.is_file(), f'Falta animación: {sign}')
                self.assertTrue((ROOT / f'web/public/Animaciones/{sign}.blend').is_file())
                hashes.add(hashlib.sha256(path.read_bytes()).hexdigest())
                js, binary = cargar_glb(path)
                self.assertEqual(js['extensions']['VRMC_vrm_animation']['specVersion'], '1.0')
                animation = js['animations'][0]
                self.assertGreaterEqual(len(animation['channels']), 38)

                def read(index, width):
                    accessor = js['accessors'][index]
                    view = js['bufferViews'][accessor['bufferView']]
                    offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
                    return [struct.unpack_from('<' + 'f' * width, binary, offset + i * 4 * width)
                            for i in range(accessor['count'])]

                moving = 0
                for channel in animation['channels']:
                    sampler = animation['samplers'][channel['sampler']]
                    times = [t[0] for t in read(sampler['input'], 1)]
                    self.assertGreater(len(times), 20)
                    self.assertGreater(times[-1], 1)
                    self.assertTrue(all(b > a for a, b in zip(times, times[1:])))
                    if channel['target']['path'] != 'rotation':
                        continue
                    values = read(sampler['output'], 4)
                    for q in values:
                        self.assertTrue(all(math.isfinite(x) for x in q))
                        self.assertAlmostEqual(sum(x*x for x in q), 1, places=4)
                    self.assertGreater(abs(sum(a*b for a, b in zip(values[0], values[-1]))), .9999)
                    for a, b in zip(values, values[1:]):
                        dot = min(1, abs(sum(x*y for x, y in zip(a, b))))
                        self.assertLess(math.degrees(2 * math.acos(dot)), 16)
                    if any(abs(sum(a*b for a, b in zip(values[0], q))) < .99 for q in values):
                        moving += 1
                # A flat hand may keep its finger joints fixed throughout the
                # sign. At least an arm and wrist must actually rotate.
                self.assertGreaterEqual(moving, 3, 'El clip debe mover un brazo y su muñeca')
        self.assertEqual(len(hashes), 23, 'Cada expresión debe tener su propio movimiento')


if __name__ == '__main__':
    unittest.main()
