# Daló · interfaz web

Interfaz de Daló: cabecera, comunicador, catálogo, ajustes y avatar con
animaciones. El reconocimiento de señas y el dictado se conectan a los modelos
de Meta mediante `backend-meta/`.

## Arranque

Node.js 22 o superior. Primero inicia `backend-meta/` según su README. En este
equipo las dependencias ya están preparadas. Desde `web-meta/`, en otra terminal:

```powershell
npm start
```

Abre [Daló](http://127.0.0.1:4201). El proxy envía `/api` al
backend local, por lo que la clave nunca se incorpora al frontend.

El proxy lee el host y puerto de `.env` y `.env.development` del backend.
En producción, `npm run build` genera el frontend optimizado y el backend lo sirve
junto con `/api`, usando automáticamente el dominio de la página.
Consulta [la guía de entornos](../docs/ENTORNOS.md) para los comandos y variables.

En este equipo se reutilizan las dependencias ya instaladas de `web/node_modules`
mediante un enlace local. **No ejecutes `npm install` ni `npm ci` sobre ese enlace**:
podrían modificar las dependencias del frontend original. En una copia nueva sin
ese enlace, instala primero las dependencias con `npm ci` y después `npm start`.

## Prueba con la clave

1. Completa `META_API_KEY` en `backend-meta/.env` y reinicia el backend.
2. Pulsa **Comprobar conexión**. Esto comprueba configuración, no validez de la
   clave: la autenticación se comprueba en la primera inferencia.
3. Abre **Evaluación de reconocimiento** y elige la etiqueta esperada si la
   conoces. No se envía al backend ni al modelo.
4. Activa la cámara. Encuadra rostro, torso y ambas manos. Pulsa **Capturar seña**
   y realiza una única seña durante los siguientes tres segundos.
5. Revisa propuesta, motivo, latencia y confianza declarada. Confirma únicamente
   si coincide. También se admite `otra`; incluye ejemplos sin seña para medir
   falsas detecciones.
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

Clases: chao, perfecto, hola, gracias, esperar, losiento, bienvenido, perdon, bien, mal y otra.
Repite con distintas personas, iluminación y fondo. Reserva grabaciones/personas
que no uses al ajustar prompts para comprobar generalización. La confianza es
subjetiva y todavía no se usa como umbral de aceptación.

## Alcance y modelos en ejecución

- **Modelo Meta:** `muse-spark-1.3-contributor`, alojado en Meta Model API. La cámara
  graba tres segundos y envía únicamente el video. El backend lo normaliza a MP4
  silencioso y pide muestreo de 12 fps. Contributor permite a Meta usar el contenido
  para entrenamiento. El contexto `lsc-motion-v4-10` incluye descripciones visuales provisionales para las diez clases.
- **Dictado:** `muse-voice-transcribe-1.0`. En Español → Señas, pulsa **Dictar con
  Meta** y después **Terminar dictado**. AudioWorklet captura como máximo 15 segundos;
  se codifica WAV mono PCM16/24 kHz y se envía al backend al finalizar. El micrófono
  se cierra antes de la transcripción. Cancelar descarta la grabación o petición.
- **Navegador:** cámara con `getUserMedia`, grabación con MediaRecorder, reproducción de
  animaciones VRM con Three.js, preferencias locales y voz con `speechSynthesis`.
- **Sin llamadas ML locales:** no se incluyen MediaPipe, GRU, ONNX ni sus pesos.
  Las animaciones del catálogo son datos ya generados, no inferencia en runtime.
- El avatar refleja animaciones del catálogo; no hay seguimiento corporal en vivo.
- SAM y ejecución open-weight quedan para fases posteriores. Esta variante requiere Internet
  para reconocer señas. Las animaciones conservan su estado de validación previo.

## Verificación

```powershell
npm test -- --watch=false
npm run build
```

Sin clave solo se verifica interfaz, contrato y manejo de errores. La precisión,
latencia real y compatibilidad efectiva de la cuenta Meta requieren la clave.
