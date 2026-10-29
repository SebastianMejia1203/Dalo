"""Static checks for the Dalo Angular interface (no browser needed).

Verifies INTERFAZ.md rules: light mode, clean layout, camera/message on the
left and result on the right, visible Expresiones/Ajustes buttons, example
data separated from future integrations, honest simulated states.
"""

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "web" / "src" / "app"


def read(relative):
    return (APP / relative).read_text(encoding="utf-8")


class WebInterfaceTests(unittest.TestCase):
    def test_angular_structure_no_vanilla_js(self):
        self.assertTrue((APP / "catalog.ts").is_file())
        self.assertTrue((APP / "adapters.ts").is_file())
        self.assertTrue((APP / "servicios" / "dalo.ts").is_file())
        js_files = [p for p in APP.rglob("*.js") if ".spec." not in p.name]
        self.assertEqual(js_files, [], f"vanilla JS files found: {js_files}")

    def test_standalone_signals_onpush_native_control_flow(self):
        for name in ["app.ts", "comunicador/comunicador.ts",
                     "expresiones/expresiones.ts", "ajustes/ajustes.ts"]:
            src = read(name)
            self.assertIn("ChangeDetectionStrategy.OnPush", name + ": " + src)
            self.assertNotIn("standalone: false", src)
        self.assertIn("signal(", read("servicios/dalo.ts"))
        self.assertIn("computed(", read("servicios/dalo.ts"))
        for name in ["app.ts", "comunicador/comunicador.ts",
                     "expresiones/expresiones.ts", "ajustes/ajustes.ts"]:
            self.assertIn("inject(", read(name), name)
        for name in ["app.html", "comunicador/comunicador.html",
                     "expresiones/expresiones.html", "ajustes/ajustes.html"]:
            src = read(name)
            self.assertNotIn("*ngIf", src, name)
            self.assertNotIn("*ngFor", src, name)
            self.assertNotIn("ngClass", src, name)
            self.assertNotIn("ngStyle", src, name)

    def test_no_any_type(self):
        for path in APP.rglob("*.ts"):
            if ".spec." in path.name:
                continue
            tokens = re.findall(r"[A-Za-z_]+", path.read_text(encoding="utf-8"))
            self.assertNotIn("any", tokens, str(path))

    def test_header_has_expresiones_and_ajustes(self):
        html = read("app.html")
        self.assertIn("nav-expresiones", html)
        self.assertIn("nav-ajustes", html)
        self.assertIn("Daló.", html)

    def test_direction_tabs(self):
        html = read("comunicador/comunicador.html")
        self.assertIn("tab-lsc-es", html)
        self.assertIn("tab-es-lsc", html)
        self.assertIn("Señas → Español", html)
        self.assertIn("Español → Señas", html)

    def test_camera_states_designed(self):
        html = read("comunicador/comunicador.html")
        service = read("servicios/dalo.ts")
        for text in ["Activar cámara", "Nueva captura", "Finalizar captura",
                     "Cancelar", "Apagar cámara", "Reintentar"]:
            self.assertIn(text, html, text)
        for state in ["permiso-denegado", "no-disponible", "solicitando"]:
            self.assertIn(state, service, state)
        self.assertIn("Incluye rostro y ambas manos", html)

    def test_lsc_result_confirm_repeat_before_output(self):
        html = read("comunicador/comunicador.html")
        for text in ["¿Quisiste decir", "Confirmar", "Repetir", "Resultado confirmado",
                     "Copiar texto", "Escuchar aquí", "Nueva expresión",
                     "No pude reconocer esta expresión"]:
            self.assertIn(text, html, text)
        # No confidence percentages presented as real accuracy.
        for name in ["comunicador/comunicador.html", "servicios/dalo.ts", "adapters.ts"]:
            src = read(name).lower()
            self.assertNotIn("confianza", src, name)
            self.assertNotIn("porcentaje", src, name)

    def test_spanish_direct_match_shows_video_or_placeholder(self):
        html = read("comunicador/comunicador.html")
        self.assertIn("¿Qué quieres comunicar?", html)
        self.assertIn("Buscar expresión", html)
        self.assertIn("Video aún no disponible", html)
        self.assertIn("Ver información", html)
        # The Spanish input sentence is never echoed as if it were a translation.
        self.assertNotIn("Traducción", html)

    def test_catalog_separates_data_from_integrations(self):
        catalog = read("catalog.ts")
        self.assertIn("Catálogo de expresiones", catalog)
        self.assertIn("animacionUrl", catalog)
        self.assertIn("avatar/hola.vrma", catalog)
        html = read("comunicador/comunicador.html")
        self.assertIn("animacionUrl", html)
        for word in ["hola", "gracias", "ayuda", "repetir", "chao"]:
            self.assertIn(f"id: '{word}'", catalog)
        self.assertIn("videoUrl: null", catalog)
        self.assertIn("En preparación", catalog)
        adapters = read("adapters.ts")
        self.assertIn("matchSpanishText", adapters)
        self.assertIn("recognizeTurn", adapters)
        self.assertIn("Punto de intercambio", adapters)

    def test_no_models_payments_or_keys_connected(self):
        for path in APP.rglob("*.ts"):
            if ".spec." in path.name:
                continue
            src = path.read_text(encoding="utf-8").lower()
            for marker in ["api_key", "apikey", "sk-", "stripe", "mercadopago"]:
                self.assertNotIn(marker, src, f"{path}: {marker}")
        html = read("comunicador/comunicador.html")
        self.assertNotIn("MediaPipe", html)

    def test_light_theme_and_responsive_layout(self):
        css = (ROOT / "web" / "src" / "styles.css").read_text(encoding="utf-8")
        self.assertIn("color-scheme: light", css)
        self.assertIn("--acento", css)
        comp_css = read("comunicador/comunicador.css")
        self.assertIn("display: grid;", comp_css)
        self.assertIn("grid-template-columns: 7fr 5fr", comp_css)
        self.assertIn("@media (max-width: 720px)", comp_css)
        self.assertIn("grid-template-columns: 1fr", comp_css)
        index = (ROOT / "web" / "src" / "index.html").read_text(encoding="utf-8")
        self.assertIn('lang="es"', index)

    def test_avatar_por_puntos_en_panel_lsc(self):
        self.assertTrue((APP / "avatar-lsc" / "avatar-lsc.ts").is_file())
        self.assertTrue((ROOT / "tools" / "extract_lsc54_avatar.py").is_file())
        catalog = read("catalog.ts")
        self.assertIn("avatarUrl", catalog)
        for nombre in ["hola", "gracias", "ayuda", "chao", "esperar", "losiento"]:
            self.assertIn(f"avatarUrl: 'avatar/{nombre}.json'", catalog)
            self.assertTrue((ROOT / "web" / "public" / "avatar" / f"{nombre}.json").is_file())
        html = read("comunicador/comunicador.html")
        self.assertIn("app-avatar-lsc", html)
        self.assertIn("Avatar 3D (modelo AvatarSample_1 de VRoid, CC0)", html)
        self.assertTrue((ROOT / "web" / "public" / "avatar" / "avatar-sample-1.vrm").is_file())
        avatar = read("avatar-lsc/avatar-lsc.ts")
        self.assertIn("ChangeDetectionStrategy.OnPush", avatar)
        self.assertIn("input<", avatar)
        self.assertIn("OrbitControls", avatar)
        self.assertIn("focoPechoCara", avatar)
        self.assertIn("modelo-avatar", avatar)
        servicio = read("avatar-lsc/modelo-avatar.ts")
        self.assertIn("precargar", servicio)
        self.assertIn("OrbitControls", servicio)
        self.assertIn("providedIn: 'root'", servicio)
        self.assertIn("precargar", read("comunicador/comunicador.ts"))
        for control in ["Pausar", "Reproducir", "Repetir", "Velocidad", "Fotograma",
                        "Acercar la vista", "Alejar la vista", "Girar a la izquierda",
                        "Girar a la derecha", "Subir la vista", "Bajar la vista",
                        "Restablecer vista",
                        "Arrastra sobre el avatar para girarlo"]:
            self.assertIn(control, read("avatar-lsc/avatar-lsc.html"))

    def test_settings_cover_devices_voice_text_size(self):
        html = read("ajustes/ajustes.html")
        for text in ["Cámara", "Micrófono", "Voz", "Velocidad", "Tamaño del texto",
                     "Probar voz", "Dispositivos", "Detectar dispositivos", "paquete de voz",
                     "suena en este equipo"]:
            self.assertIn(text, html, text)


if __name__ == "__main__":
    unittest.main()
