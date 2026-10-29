import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = (
    Path(__file__).resolve().parents[1]
    / "tools"
    / "reconocimiento"
    / "inventario.py"
)


class InventarioReconocimientoTests(unittest.TestCase):
    def test_inventario_clasifica_videos_por_participante_y_sena(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "Videos Courtesy"
            for participante, sena, nombres in (
                ("1", "Chao", ("0.avi", "1.avi", "2.avi")),
                ("17", "Chao", ("0.avi", "3.avi")),
                ("1", "Perfecto", ("0.avi",)),
                ("1", "Hola", ("0.avi",)),
            ):
                carpeta = root / participante / "Cordialidad" / sena
                carpeta.mkdir(parents=True)
                for nombre in nombres:
                    (carpeta / nombre).write_bytes(b"video")

            salida = Path(temp) / "inventario.json"
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--raiz",
                    str(root),
                    "--salida",
                    str(salida),
                ],
                capture_output=True,
                text=True,
                encoding="utf-8",
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            datos = json.loads(salida.read_text(encoding="utf-8"))
            self.assertEqual(datos["resumen"]["chao"]["participantes"], 2)
            self.assertEqual(datos["resumen"]["chao"]["videos"], 5)
            self.assertEqual(datos["resumen"]["perfecto"]["participantes"], 1)
            self.assertEqual(datos["resumen"]["perfecto"]["videos"], 1)
            self.assertNotIn("hola", datos["resumen"])
            chao17 = [
                v
                for v in datos["videos"]
                if v["sena"] == "chao" and v["participante"] == "17"
            ]
            self.assertEqual([v["repeticion"] for v in chao17], [0, 3])

    def test_inventario_incluye_senas_negativas_si_se_piden(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "Videos Courtesy"
            for sena in ("Chao", "Perfecto", "Hola"):
                carpeta = root / "1" / "Cordialidad" / sena
                carpeta.mkdir(parents=True)
                (carpeta / "0.avi").write_bytes(b"video")

            salida = Path(temp) / "inventario.json"
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--raiz",
                    str(root),
                    "--salida",
                    str(salida),
                    "--senas",
                    "chao,perfecto,hola",
                ],
                capture_output=True,
                text=True,
                encoding="utf-8",
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            datos = json.loads(salida.read_text(encoding="utf-8"))
            self.assertEqual(datos["resumen"]["hola"]["videos"], 1)

    def test_inventario_falla_si_falta_una_sena(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "Videos Courtesy"
            carpeta = root / "1" / "Cordialidad" / "Chao"
            carpeta.mkdir(parents=True)
            (carpeta / "0.avi").write_bytes(b"video")

            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--raiz",
                    str(root),
                    "--salida",
                    str(Path(temp) / "inventario.json"),
                ],
                capture_output=True,
                text=True,
                encoding="utf-8",
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("perfecto", result.stderr.lower())


if __name__ == "__main__":
    unittest.main()
