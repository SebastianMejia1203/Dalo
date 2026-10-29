import json
import subprocess
import sys
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "tools" / "reporte_huesos_vrm.py"
REPO = Path(__file__).resolve().parents[1]
AVATAR = REPO / "web" / "public" / "avatar" / "avatar-sample-1.vrm"

REQUERIDOS_ANIMACION = {
    "leftShoulder", "rightShoulder", "leftUpperArm", "rightUpperArm",
    "leftLowerArm", "rightLowerArm", "leftHand", "rightHand",
    "leftThumbMetacarpal", "leftThumbProximal", "leftThumbDistal",
    "rightThumbMetacarpal", "rightThumbProximal", "rightThumbDistal",
}


class VrmaBonesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not AVATAR.is_file():
            raise unittest.SkipTest("falta avatar-sample-1.vrm")

    def test_animados_resuelven_y_solo_falta_jaw(self):
        with tempfile.TemporaryDirectory() as temp:
            destino = Path(temp) / "correspondencia.json"
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--avatar", str(AVATAR),
                 "--salida", str(destino)],
                capture_output=True, text=True, encoding="utf-8",
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            informe = json.loads((destino).read_text(encoding="utf-8"))
            self.assertEqual(informe["animados_sin_correspondencia"], [])
            self.assertEqual(informe["faltan_en_avatar_vs_vrm1"], ["jaw"])
            for hueso in REQUERIDOS_ANIMACION:
                self.assertNotIn(hueso, informe["animados_sin_correspondencia"])

    def test_no_modifica_el_original(self):
        antes = AVATAR.stat().st_mtime_ns
        with tempfile.TemporaryDirectory() as temp:
            subprocess.run(
                [sys.executable, str(SCRIPT), "--avatar", str(AVATAR),
                 "--salida", str(Path(temp) / "c.json")],
                capture_output=True, text=True, encoding="utf-8",
            )
        self.assertEqual(AVATAR.stat().st_mtime_ns, antes)


if __name__ == "__main__":
    unittest.main()
