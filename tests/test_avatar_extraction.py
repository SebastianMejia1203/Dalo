import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "tools" / "extract_lsc54_avatar.py"


def make_dataset(root):
    dataset = root / "dataset"
    dataset.mkdir()
    sequence = {
        "frame_1": {
            "pose": {"x": [0.5, None], "y": [0.5, 0.6], "z": [0.0, 0.0]},
            "l_hand": {"x": [None], "y": [None], "z": [None]},
            "r_hand": {"x": [0.2], "y": [0.3], "z": [0.0]},
            "face": {"x": [0.1] * 478, "y": [0.1] * 478, "z": [0.0] * 478},
        },
        "frame_0": {
            "pose": {"x": [0.4, 0.7], "y": [0.4, 0.6], "z": [0.0, 0.0]},
            "l_hand": {"x": [None], "y": [None], "z": [None]},
            "r_hand": {"x": [0.1], "y": [0.3], "z": [0.0]},
            "face": {"x": [0.1] * 478, "y": [0.1] * 478, "z": [0.0] * 478},
        },
        "frame_2": {
            "pose": {"x": [0.6, 0.9], "y": [0.6, 0.6], "z": [0.0, 0.0]},
            "l_hand": {"x": [None], "y": [None], "z": [None]},
            "r_hand": {"x": [0.3], "y": [0.3], "z": [0.0]},
            "face": {"x": [0.1] * 478, "y": [0.1] * 478, "z": [0.0] * 478},
        },
    }
    data = {"Signer_1": {"Cordialidad": {"Ayudar": {"vid_0": {"rep_0": sequence}}}}}
    (dataset / "datos.json").write_text(json.dumps(data), encoding="utf-8")
    return dataset


class AvatarExtractionTests(unittest.TestCase):
    def test_extracts_simplified_interpolated_sequence_without_face(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            dataset = make_dataset(root)
            output = root / "avatar"
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--dataset", str(dataset),
                 "--output-dir", str(output), "--target", "ayuda=Cordialidad/Ayudar"],
                capture_output=True, text=True, encoding="utf-8",
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            data = json.loads((output / "ayuda.json").read_text(encoding="utf-8"))
            self.assertEqual(data["id"], "ayuda")
            self.assertEqual(data["totalFotogramas"], 3)
            self.assertEqual(data["fuente"]["expresion"], "Ayudar")
            first = data["fotogramas"][0]
            self.assertNotIn("rostro", first)
            self.assertEqual(len(first["pose"]), 2)
            self.assertIsNone(first["manoIzquierda"])
            # frame_1 pose x[1] was None between 0.7 and 0.9 -> interpolated 0.8
            self.assertEqual(data["fotogramas"][1]["pose"][1][0], 0.8)
            self.assertGreater(data["valoresNulosOriginales"], 0)

    def test_refuses_output_inside_dataset(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            dataset = make_dataset(root)
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--dataset", str(dataset),
                 "--output-dir", str(dataset / "avatar"), "--target", "ayuda=Cordialidad/Ayudar"],
                capture_output=True, text=True, encoding="utf-8",
            )
            self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
