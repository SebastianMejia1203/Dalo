# Backend de la prueba Meta

Requiere Node.js 22.19 o superior y Express 5. El arranque utiliza
también los certificados de confianza del sistema, manteniendo la verificación TLS.

Configura la clave solamente en el archivo local `.env`; `.env.example` la deja vacía:

```dotenv
META_API_KEY=
META_MODEL=muse-spark-1.3-contributor
PORT=3001
```

Desde `backend-meta/`:

```powershell
npm ci
npm run dev
```

Consulta [la guía de desarrollo y producción](../docs/ENTORNOS.md). `npm run dev` carga
`.env` y `.env.development`; `npm start` carga `.env` y `.env.production` e inicia
producción por defecto. Las variables del proceso tienen prioridad. Producción requiere
`APP_ORIGIN` y sirve también el frontend compilado, salvo `SERVE_FRONTEND=false`.

Reinicia el proceso después de cambiar `.env`. En una copia nueva del repositorio,
crea primero `.env` a partir de `.env.example`. `.env` está excluido de Git.

## Desarrollo y verificación

Todo el código fuente y las pruebas del backend están escritos en TypeScript.
`strict`, `noUnusedLocals`, `noUnusedParameters` y `noEmitOnError` están activos.
No se usan `any`, `@ts-ignore`, `@ts-nocheck` ni `allowJs` para silenciar errores.

```powershell
npm run dev         # Ejecuta src/server.ts con recarga al editar
npm run typecheck   # Comprueba tipos de fuentes y pruebas
npm test            # Pruebas HTTP, streaming, medios y catálogo en TypeScript
npm run build       # Compila src/ en dist/; falla si hay errores de tipos
npm run check       # Tipos + pruebas + compilación
npm start           # Compila y ejecuta producción (requiere APP_ORIGIN)
```

`dist/` es salida generada para Node, excluida de Git. No se edita. Las fuentes
importan `.ts`; el compilador reescribe las extensiones al generar la salida.
Node no comprueba tipos al ejecutar: `typecheck` y `build` hacen esa comprobación.
[Configuración de TypeScript](https://www.typescriptlang.org/tsconfig/).

## Arquitectura modular

```text
src/
  server.ts                       # Arranque HTTP y cierre del proceso
  app.ts                          # Composición de Express y dependencias
  config/environment.ts           # Lectura y validación del entorno
  modules/
    signs/                        # Definiciones, catálogo, esquema, contexto y consultas
    recognition/                  # Rutas, controlador, validación, resultados y salida NDJSON
    transcription/                # Rutas, controlador, tipos y servicio de dictado
  infrastructure/
    meta/                         # Clientes Chat, Responses/SSE y Voice Transcribe
    media/video.converter.ts      # FFmpeg y limpieza de archivos privados
  shared/
    validation.ts                 # Lectura segura de valores desconocidos
    http/                         # Errores, política de origen y cancelación por desconexión
senas/                            # Un JSON por seña, agrupado por categoría
tests/                           # Contratos HTTP, datos, medios y fixtures controladas
```

- **Rutas:** registran endpoints y parsers; no contienen llamadas a proveedores.
- **Controladores:** administran petición/respuesta, concurrencia y cancelación.
- **Módulos:** contienen los contratos, validaciones y reglas de cada función.
- **Infraestructura:** traduce esos contratos a Meta o FFmpeg. Los clientes de
  Meta no reciben objetos Express; los datos externos se validan antes de devolverlos.
- **Composición:** `createApp` recibe dependencias sustituibles en las pruebas;
  no se necesitan un contenedor de inyección ni clases base para cada archivo.

El adaptador `modules/recognition/recognition.stream.ts` transforma los eventos del
cliente Responses en NDJSON, añade latidos y solo publica resúmenes públicos.
`modules/transcription/transcription.service.ts` valida el WAV y el vocabulario;
el controlador lee el stream y el cliente de infraestructura envía el audio a Meta.

Los límites JSON de 6 MB se aplican únicamente al reconocimiento. El dictado
mantiene su stream WAV, limitado a 1 MB. Cada proceso admite un reconocimiento y
un dictado simultáneos; conversiones y proveedor comparten plazo/cancelación.
La política de origen se aplica antes de leer cuerpos. Los errores no exponen
claves ni detalles privados del proveedor. El host y el origen permitido dependen del entorno.

Se eliminaron los archivos puente `.mjs` y las carpetas anteriores `routes/`,
`services/` y `signs/` sueltas. Las herramientas externas de evaluación importan
los módulos compilados de `dist/`; ejecuta `npm run build` antes de usarlas.

## Definiciones de señas

La fuente del catálogo del backend es `senas/`, con un JSON por seña:

```text
senas/
  cordialidad/
    hola.json
    bienvenido.json
    ...
  numeros/             # vacía por ahora
  colores/             # vacía por ahora
```

Cada archivo contiene `id`, `nombre`, `significado`, `intencion`, `descripcion`,
`activa`, `orden` y `ordenDescripcion`. La explicación visual se edita en
`descripcion`. `activa` controla su inclusión en las clases, el esquema y el prompt;
`orden` y `ordenDescripcion` conservan el orden del contexto evaluado.
Sí y No se conservan como candidatas con `activa: false`; las diez clases actuales
siguen activas. No hay señas ficticias en números o colores.

`src/modules/signs/sign.repository.ts` carga y valida los archivos al iniciar. Un archivo
incompleto, con ID duplicado o cuyo nombre no coincida con su ID detiene el arranque.
`src/modules/signs/sign.context.ts` construye el prompt desde estas definiciones.
Reinicia el backend después de editar un JSON. No se mantiene otro `catalog.json`.
Los avatares y metadatos visuales del frontend siguen en su catálogo propio;
añadir una clase aquí no genera una animación en el frontend.

En desarrollo escucha en `127.0.0.1:3001`; en producción el host predeterminado es
`0.0.0.0` y exige `APP_ORIGIN`. La política de origen no sustituye autenticación
ni límites por usuario en un despliegue público.

- `GET /api/health`: estado de configuración y modelo, nunca la clave.
- `GET /api/catalog`: diez clases experimentales.
- `GET /api/context`: modelo, versión e instrucciones exactas del clasificador,
  incluido el catálogo. No incluye claves ni la etiqueta esperada.
- `POST /api/recognize/stream`: `{ "videoDataUrl": "data:video/webm;base64,..." }`
  o MP4. Requiere FFmpeg en PATH (o `FFMPEG_PATH` en `.env`): normaliza el video a
  MP4 silencioso, ancho máximo 640 px, máximo 5 segundos y 12 fps. Usa un archivo
  de entrada temporal privado que se elimina después de cerrar FFmpeg. Mantiene
  compatibilidad con `frames` para las pruebas anteriores. Entrega NDJSON incremental
  con etapas, latidos cada segundo, resúmenes públicos de Meta y resultado final.
  Usa Responses API, `stream: true`, `store: false` y `reasoning.summary: auto`.
  No transmite razonamiento privado ni estado cifrado. La API puede no emitir
  resúmenes; la aplicación no inventa actividad del modelo para rellenar esa espera.
- `POST /api/recognize`: `{ "frames": ["data:image/jpeg;base64,..."] }`.
  Acepta 8–12 JPEG ordenados, máximo 6 MB por petición.
- Respuesta: `{clase, confianza, motivo, model, latencyMs, promptVersion}`.
  `otra` indica rechazo. El backend valida clases y rango de confianza.
- Clave ausente: HTTP 503; petición inválida: 400; proveedor inválido: 502;
  otro análisis en curso: 429. Timeout del proveedor: 60 s.
- `POST /api/transcribe`: WAV canónico mono PCM16 a 16 o 24 kHz; el backend lo
  envía como multipart a `muse-voice-transcribe-1.0`, modo `PUSH_TO_TALK`, con
  preferencia de idioma español y vocabulario del catálogo. Devuelve la transcripción.
- No conserva videos, imágenes, audio, respuestas ni credenciales en disco. El frontend guarda
  sus resultados en memoria y permite descargarlos sin imágenes.

El contexto actual `lsc-motion-v4-10` añade descripciones visuales provisionales a
las diez clases. Fue desarrollado sobre muestras del dataset, por lo que los
resultados sobre esos mismos clips son métricas de desarrollo, no de generalización.
No hay validación lingüística ni ejemplos visuales etiquetados en cada petición.
Contributor permite a Meta usar contenido para entrenamiento; `store: false`
no elimina esa condición del modo Contributor.

```powershell
npm test
```

Las pruebas usan un proveedor controlado: verifican el contrato HTTP, no la
precisión del modelo real.

Referencias de la integración:
[imágenes](https://dev.meta.ai/docs/image-understanding),
[salida estructurada](https://dev.meta.ai/docs/structured-output).

[Responses y resúmenes por streaming](https://dev.meta.ai/docs/protocols/responses).
