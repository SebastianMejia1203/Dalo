import json
import math
import struct
import subprocess
import sys
import tempfile
from pathlib import Path
import unittest

REPO = Path(__file__).resolve().parents[1]
SCRIPT = REPO / "tools" / "suavizar_vrma.py"
MASOMENOS = REPO / "web" / "public" / "avatar" / "masomenos.vrma"


def cargar(ruta):
    with open(ruta, "rb") as f:
        data = f.read()
    assert data[:4] == b"glTF"
    largo = struct.unpack("<I", data[12:16])[0]
    js = json.loads(data[20:20 + largo])
    inicio = 20 + largo
    largo_bin = struct.unpack("<I", data[inicio:inicio + 4])[0]
    return js, data[inicio + 8:inicio + 8 + largo_bin]


def leer(js, bindata, idx):
    acc = js["accessors"][idx]
    vista = js["bufferViews"][acc["bufferView"]]
    off = vista.get("byteOffset", 0) + acc.get("byteOffset", 0)
    n = acc["count"]
    nc = {"SCALAR": 1, "VEC4": 4, "VEC3": 3}[acc["type"]]
    return [struct.unpack("<%df" % nc, bindata[off + k * 4 * nc:off + (k + 1) * 4 * nc])
            for k in range(n)]


def canal_rotacion(js, nombre):
    anim = js["animations"][0]
    for ch in anim["channels"]:
        if js["nodes"][ch["target"]["node"]].get("name") == nombre \
                and ch["target"]["path"] == "rotation":
            return anim["samplers"][ch["sampler"]]["output"]
    raise KeyError(nombre)


class SuavizadoVrmaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not MASOMENOS.is_file() or not SCRIPT.is_file():
            raise unittest.SkipTest("falta masomenos.vrma o la herramienta")

    def test_suavizado_conserva_estructura_y_norma(self):
        with tempfile.TemporaryDirectory() as temp:
            destino = Path(temp) / "masomenos.vrma"
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--entrada", str(MASOMENOS),
                 "--salida", str(destino)],
                capture_output=True, text=True, encoding="utf-8",
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            js_antes, _ = cargar(MASOMENOS)
            js, bindata = cargar(destino)
            # Estructura intacta: mismos canales y tiempos monotonos.
            self.assertEqual(len(js["animations"][0]["channels"]),
                             len(js_antes["animations"][0]["channels"]))
            self.assertEqual(
                js["extensions"]["VRMC_vrm_animation"]["specVersion"], "1.0")
            # Cuaterniones unitarios y finitos en cada pista de rotacion.
            for ch in js["animations"][0]["channels"]:
                if ch["target"]["path"] != "rotation":
                    continue
                for q in leer(js, bindata, js["animations"][0]["samplers"][ch["sampler"]]["output"]):
                    self.assertTrue(all(math.isfinite(c) for c in q))
                    self.assertAlmostEqual(sum(c * c for c in q), 1.0, places=5)
            # Tiempos monotonos crecientes.
            acc_t = js["accessors"][js["animations"][0]["samplers"][0]["input"]]
            n_t = acc_t["count"]
            bv = js["bufferViews"][acc_t["bufferView"]]
            import struct as struct_mod
            tiempos = struct_mod.unpack(
                "<%df" % n_t, bindata[bv.get("byteOffset", 0):bv.get("byteOffset", 0) + 4 * n_t])
            self.assertTrue(all(b > a for a, b in zip(tiempos, tiempos[1:])))

    def test_solo_suavizado_no_colapsa_las_pistas(self):
        with tempfile.TemporaryDirectory() as temp:
            destino = Path(temp) / "suave.vrma"
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--entrada", str(MASOMENOS),
                 "--salida", str(destino)],
                capture_output=True, text=True, encoding="utf-8",
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            js, bindata = cargar(destino)
            self.assertEqual(len(js["animations"][0]["channels"]), 53)

    def test_giro_axial_predomina_sobre_el_oleaje_lateral(self):
        # Mas o menos: la muneca debe girar sobre su propio eje (twist),
        # no oscilar de izquierda a derecha (swing lateral como saludando),
        # y solo con la mano arriba. Criterio del proyecto
        # (tools/verificar_vrma.py) sobre el clip distribuido, mas humo de
        # la herramienta con la receta documentada.
        sys.path.insert(0, str(REPO / "tools"))
        from verificar_vrma import verificar
        informe = verificar(MASOMENOS)
        self.assertLess(informe["giro_con_mano_abajo_max"], 5.0)
        self.assertGreater(informe["giro_axial_max"], 30.0)
        self.assertGreater(
            informe["giro_axial_max"], informe["lateral_max"] * 1.5)
        self.assertGreater(informe["abanico_dedos"], 8.0)
        self.assertLess(informe["reposo_deriva"], 3.0)
        with tempfile.TemporaryDirectory() as temp:
            destino = Path(temp) / "axial.vrma"
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--entrada", str(MASOMENOS),
                 "--salida", str(destino), "--giro-axial", "--ciclos", "2",
                 "--grados-mano", "28", "--grados-antebrazo", "10",
                 "--abrir-dedos", "4"],
                capture_output=True, text=True, encoding="utf-8",
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            js, _ = cargar(destino)
            self.assertEqual(len(js["animations"][0]["channels"]), 53)


if __name__ == "__main__":
    unittest.main()
