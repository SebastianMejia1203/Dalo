# Daló · interfaz web

Interfaz de Daló: cabecera, comunicador, catálogo, ajustes y avatar con
animaciones. El reconocimiento de señas y el dictado se conectan a los modelos
de Meta mediante `backend-meta/`.

## Arranque

Entorno recomendado: **Node.js 24** y **npm 11**. Primero inicia `backend-meta/`
según [su README](../backend-meta/README.md). En este
equipo las dependencias ya están preparadas. Desde `web-meta/`, en otra terminal:

```powershell
npm start
```

Abre [Daló](http://127.0.0.1:4201). El proxy envía `/api` al
backend local, por lo que la clave nunca se incorpora al frontend.

El proxy lee el host y puerto de `.env` y `.env.development` del backend.
En producción, `npm run build` genera el frontend optimizado y el backend lo sirve
junto con `/api`, usando automáticamente el dominio de la página.
Consulta la sección de producción del [README principal](../README.md#producción) para los comandos y variables.

En este equipo las dependencias se reutilizan mediante un enlace a un directorio
compartido. **No ejecutes `npm install` ni `npm ci` sobre ese enlace**:
podrían modificar las dependencias compartidas. En una copia nueva sin
ese enlace, instala primero las dependencias con `npm ci` y después `npm start`.

## Uso y comprobación manual

1. Completa `META_API_KEY` en `backend-meta/.env` y reinicia el backend.
2. En **Señas → Español**, abre **Detalles técnicos** y pulsa **Comprobar conexión**.
   Esto comprueba configuración, no validez de la
   clave: la autenticación se comprueba en la primera inferencia.
3. Para evaluar, abre **Evaluación de reconocimiento** dentro de esos detalles
   y elige la etiqueta esperada si la conoces. Este paso es opcional para el uso
   normal. La etiqueta no se envía al backend ni al modelo.
4. Activa la cámara. Encuadra rostro, torso y ambas manos. Pulsa **Capturar seña**
   y espera la cuenta **3, 2, 1**, durante la cual todavía no se graba. Realiza
   una única seña al aparecer el punto rojo y **Grabando**, durante tres segundos.
   Al terminar desaparece el punto y comienza la interpretación automáticamente.
5. Revisa y confirma la propuesta únicamente si coincide. Motivo, latencia,
   confianza y actividad del modelo están en **Detalles técnicos**. También se
   admite `otra`; incluye señas ajenas al catálogo y ejemplos sin seña para
   comprobar falsas detecciones como condiciones distintas.
6. Descarga el JSON antes de cerrar la página. Contiene todas las inferencias
   completadas, incluso propuestas descartadas. No contiene imágenes. Los errores
   de transporte se muestran y no se cuentan como aciertos ni rechazos del modelo.

Durante la captura y el análisis se muestran el tiempo transcurrido, las etapas
reales de la aplicación y los resúmenes públicos que Meta envía por streaming.
No son el pensamiento interno completo. Si Meta no emite un resumen, se indica
expresamente; los latidos del backend mantienen visible el estado de la conexión.
El panel **Revisar video de esta captura** permite comprobar el clip grabado.
El panel **Contexto que recibe Meta** muestra las instrucciones exactas enviadas,
el modelo y la versión del contexto. La etiqueta esperada permanece fuera del prompt.

Catálogo de cámara: **11 señas** — chao, perfecto, hola, gracias, esperar,
losiento, bienvenido, perdon, bien, mal y muybien. `otra` indica rechazo.
Repite con distintas personas, iluminación y fondo. Reserva grabaciones/personas
que no uses al ajustar prompts para comprobar generalización. La confianza es
subjetiva y no se usa como umbral automático de aceptación en la interfaz.
El criterio >85 % para habilitar candidatas pertenece al proceso de evaluación;
no sustituye la confirmación del usuario.

## Catálogo y detalles técnicos

**Español → Señas** busca entre 33 expresiones animadas: escribe o dicta una
expresión y reproduce su animación. La coincidencia exacta se resuelve en
local; si el mensaje está en lenguaje libre («todo salió muy bien», «perdona,
¿me esperas un momento?»), Muse Spark interpreta su intención desde el
backend (`POST /api/intent`, contexto `lsc-intent-v1`) y elige una expresión
del catálogo cerrado o ninguna. Si Meta no responde se conserva la búsqueda
local. No traduce oraciones a LSC ni genera una seña por palabra. Solo en
Señas → Español, encima de los paneles, **Así trabaja Meta en Daló**
muestra la tira de etapas del reconocimiento con su estado en vivo y la
ficha de la última respuesta (modelo, latencia y confianza sin calibrar).
Las fuentes, los recursos del avatar y el diagnóstico de dictado se
despliegan en **Detalles técnicos**.

La página **Validación** (navegación superior) es pública: cualquier persona
escribe su nombre, mira la animación de cada seña y guarda un veredicto
(se entiende, hay que corregir o no es válida) con notas opcionales. Cada
guardado crea un registro nuevo en SQLite —varias personas pueden validar
la misma seña sin sobrescribirse— y todos los registros se consultan y
filtran en la pestaña **Registros**, además del historial por seña.
También concentra un banco de pruebas de intención que compara búsqueda
local y Meta frase a frase o por lote, y el análisis de los JSON de
ensayos descargados (aciertos, confusiones, rechazo y latencia).

En **Expresiones**, los filtros iniciales son **Cámara: Sí** y **Avatar: Sí**.
Selecciona Todas/Todos para explorar también las entradas sin reconocimiento.
La vista previa aparece al pasar el cursor o enfocar la miniatura; al pulsarla,
se abre la animación ampliada.

**En preparación** indica que faltan revisión lingüística y revisión del material
y sus permisos, incluso cuando la cámara o el avatar están disponibles. El
tooltip de ese estado explica la diferencia. `reconocible` y la disponibilidad
de recursos visuales se mantienen por separado en `src/app/catalog.ts`.

## Alcance y modelos en ejecución

- **Modelo Meta:** `muse-spark-1.3-contributor`, alojado en Meta Model API. La cámara
  graba tres segundos y envía únicamente el video. El backend lo normaliza a MP4
  silencioso y pide muestreo de 12 fps. Contributor permite a Meta usar el contenido
  para entrenamiento. El contexto `lsc-motion-v4-11` incluye descripciones
  visuales provisionales para las once señas activas.
- **Dictado:** `muse-voice-transcribe-1.0`. En Español → Señas, pulsa **Dictar con
  Meta** y después **Terminar dictado**. AudioWorklet captura como máximo 15 segundos;
  se codifica WAV mono PCM16/24 kHz y se envía al backend al finalizar. El micrófono
  se cierra antes de la transcripción. Cancelar descarta la grabación o petición.
- **Navegador:** cámara con `getUserMedia`, grabación con MediaRecorder, reproducción de
  animaciones VRM con Three.js, preferencias locales y voz con `speechSynthesis`.
- **Sin llamadas ML locales:** no se incluyen MediaPipe, GRU, ONNX ni sus pesos.
  Las animaciones del catálogo son datos ya generados, no inferencia en runtime.
- El avatar refleja animaciones del catálogo; no hay seguimiento corporal en vivo.
- SAM y ejecución open-weight quedan para fases posteriores. Daló requiere Internet
  para reconocer señas. Las animaciones siguen pendientes de validación lingüística.

El catálogo de cámara contiene once señas, incluida Muy bien; las otras 22
definiciones siguen deshabilitadas. Consulta las [limitaciones del prototipo](../README.md#problemas-limitaciones-y-posibles-soluciones):
el prototipo no garantiza precisión con personas nuevas ni en webcam. Los datos
y resultados privados de evaluación no se distribuyen con la aplicación.

## Verificación

```powershell
npm test -- --watch=false
npm run build
```

Sin clave solo se verifica interfaz, contrato y manejo de errores. La precisión,
latencia real y compatibilidad efectiva de la cuenta Meta requieren la clave.
