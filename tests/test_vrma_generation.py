import json
import math
import struct
import subprocess
import sys
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "tools" / "lsc54_to_vrma.py"
REPO = Path(__file__).resolve().parents[1]
AVATAR = REPO / "web" / "public" / "avatar" / "avatar-sample-1.vrm"
HOLA_JSON = REPO / "web" / "public" / "avatar" / "hola.json"


def cargar_glb(ruta):
    with open(ruta, "rb") as f:
        data = f.read()
    assert data[:4] == b"glTF"
    largo = struct.unpack("<I", data[12:16])[0]
    js = json.loads(data[20:20 + largo])
    binstart = 20 + largo
    largo_bin = struct.unpack("<I", data[binstart:binstart + 4])[0]
    return js, data[binstart + 8:binstart + 8 + largo_bin]


class VrmaGenerationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not AVATAR.is_file() or not HOLA_JSON.is_file():
            raise unittest.SkipTest("faltan avatar-sample-1.vrm u hola.json")

    def generar(self, destino, *args):
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--avatar", str(AVATAR), *args,
             "--salida", str(destino)],
            capture_output=True, text=True, encoding="utf-8",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_tecnica_corta_valida(self):
        with tempfile.TemporaryDirectory() as temp:
            destino = Path(temp) / "prueba-tecnica.vrma"
            informe = self.generar(destino, "--modo", "tecnica", "--hola", str(HOLA_JSON))
            self.assertEqual(informe["fotogramas"], 60)
            self.assertEqual(informe["huesos"], 38)
            self.assertTrue(informe["tiempos_monotonos"])
            self.assertLess(informe["desviacion_norma_max"], 1e-5)
            js, bindata = cargar_glb(destino)
            ext = js["extensions"]["VRMC_vrm_animation"]
            self.assertEqual(ext["specVersion"], "1.0")
            self.assertIn("VRMC_vrm_animation", js["extensionsUsed"])
            self.assertEqual(len(ext["humanoid"]["humanBones"]), 41)
            anim = js["animations"][0]
            self.assertEqual(len(anim["channels"]), 38)
            # Cada canal apunta a un nodo declarado en el mapa humanoide
            # (caderas, columna y pecho van sin canal: quedan en reposo).
            nodos = {c["target"]["node"] for c in anim["channels"]}
            nombres = {js["nodes"][i]["name"] for i in nodos}
            self.assertTrue(nombres < set(ext["humanoid"]["humanBones"]))
            self.assertEqual(len(nombres), 38)
            # Tiempos crecientes de 0 a la duracion y cuaterniones unitarios.
            acc_t = js["accessors"][anim["samplers"][0]["input"]]
            n = acc_t["count"]
            tiempos = struct.unpack("<%df" % n, bindata[:4 * n])
            self.assertAlmostEqual(tiempos[0], 0.0)
            self.assertGreater(tiempos[-1], 1.9)
            for ch in anim["channels"]:
                acc = js["accessors"][anim["samplers"][ch["sampler"]]["output"]]
                self.assertEqual(acc["type"], "VEC4")
                self.assertEqual(acc["count"], n)
                off = js["bufferViews"][acc["bufferView"]]["byteOffset"]
                for k in range(n):
                    q = struct.unpack("<4f", bindata[off + 16 * k:off + 16 * (k + 1)])
                    self.assertTrue(all(math.isfinite(c) for c in q))
                    self.assertAlmostEqual(sum(c * c for c in q), 1.0, places=5)

    def test_senia_hola_valida_y_mas_corta(self):
        with tempfile.TemporaryDirectory() as temp:
            destino = Path(temp) / "hola.vrma"
            informe = self.generar(destino, "--modo", "senia", "--entrada", str(HOLA_JSON))
            self.assertEqual(informe["fotogramas"], 33)
            self.assertEqual(informe["huesos"], 38)

    def test_todos_los_canales_son_alcanzables_desde_caderas(self):
        with tempfile.TemporaryDirectory() as temp:
            destino = Path(temp) / "hola.vrma"
            self.generar(destino, "--modo", "senia", "--entrada", str(HOLA_JSON))
            js, _ = cargar_glb(destino)
            pendientes = list(js["scenes"][js["scene"]]["nodes"])
            visitados = set()
            while pendientes:
                nodo = pendientes.pop()
                self.assertNotIn(nodo, visitados, "Ciclo o hueso con varios padres")
                visitados.add(nodo)
                pendientes.extend(js["nodes"][nodo].get("children", []))
            animados = {c["target"]["node"] for c in js["animations"][0]["channels"]}
            self.assertTrue(animados <= visitados,
                            "Blender no puede importar huesos fuera del arbol de caderas")

    def test_no_modifica_originales(self):
        antes_avatar = AVATAR.stat().st_mtime_ns
        antes_json = HOLA_JSON.stat().st_mtime_ns
        with tempfile.TemporaryDirectory() as temp:
            self.generar(Path(temp) / "x.vrma", "--modo", "tecnica", "--hola", str(HOLA_JSON))
        self.assertEqual(AVATAR.stat().st_mtime_ns, antes_avatar)
        self.assertEqual(HOLA_JSON.stat().st_mtime_ns, antes_json)


if __name__ == "__main__":
    unittest.main()
