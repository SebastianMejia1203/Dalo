# Guía técnica de Daló

Las rutas de código de esta guía se expresan desde la raíz del repositorio. Para arrancar la aplicación, consulta el [README principal](../README.md). Para variables y publicación, consulta [Entornos](ENTORNOS.md).

## Modelos Meta y tratamiento de medios

| Componente                   | Función durante el uso                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `muse-spark-1.3-contributor` | Recibe un video silencioso y el contexto de las señas; devuelve clase, confianza subjetiva y motivo.                |
| `muse-voice-transcribe-1.0`  | Transcribe dictado en español por turnos de hasta 15 segundos. El audio se envía al finalizar.                      |
| Navegador                    | Captura cámara y micrófono, reproduce el avatar con Three.js/VRM y lee texto confirmado mediante `speechSynthesis`. |
| Backend TypeScript           | Custodia la clave, valida entradas/salidas, normaliza video con FFmpeg y conecta con Meta.                          |

Daló necesita conexión a Internet y acceso a los modelos. **Contributor permite que Meta use el contenido enviado para entrenamiento**; `store: false` no elimina esa condición. Los avisos de envío de video/audio permanecen visibles en la interfaz.

El navegador graba tres segundos; FFmpeg normaliza a MP4 sin audio, ancho máximo de 640 px y 12 fps. El dictado usa WAV mono PCM16 a 24 kHz. El backend elimina los archivos temporales de conversión y no conserva las capturas como historial. La evaluación por lotes sí guarda sus artefactos locales expresamente.

El streaming muestra etapas reales de la aplicación y resúmenes públicos que la API envíe. **No expone el pensamiento interno completo**. El modelo recibe el contexto y la captura de cada petición; no tiene acceso al repositorio, los avatares ni la etiqueta esperada de evaluación.

## Arquitectura y organización de señas

```text
web-meta/                     Angular: interfaz web, puerto 4201
backend-meta/
  src/
    app.ts                    Composición de Express y dependencias
    server.ts                 Arranque del servidor local
    config/                   Configuración del entorno
    modules/
      signs/                  Catálogo, contexto, esquema y consultas
      recognition/            Controlador, validación y salida NDJSON
      transcription/          Controlador y servicio de dictado
    infrastructure/
      meta/                   Clientes Chat, Responses y Voice Transcribe
      media/                  Conversión con FFmpeg
    shared/                   Validación, errores y cancelación HTTP
  senas/
    cordialidad/              Un JSON por seña
    numeros/                  Sin señas por ahora
    colores/                  Sin señas por ahora
  tests/                      Contratos y fixtures en TypeScript
tools/meta-evaluation/        Preparación, ejecución e informes de evaluación
```

Todo el código fuente y las pruebas del backend están en **TypeScript estricto**. `dist/` contiene únicamente la salida compilada para Node y no se edita. Rutas y controladores HTTP están separados de los clientes de Meta y del procesamiento de medios.

Las explicaciones visuales se editan en **`backend-meta/senas/cordialidad/<id>.json`**, campo `descripcion`. Cada archivo incluye nombre, intención, `activa` y los órdenes del catálogo/contexto. Diez señas están activas; Sí y No se conservan como candidatas deshabilitadas. El repositorio valida las definiciones al iniciar y el constructor de contexto genera las instrucciones desde ellas.

`numeros/` y `colores/` están preparadas pero vacías. Añadir una definición al backend no crea su animación: los recursos y metadatos visuales siguen en `web-meta/src/app/catalog.ts` y `web-meta/public/`.

Flujos:

```text
Texto → catálogo local → animación VRMA/JSON → avatar
Audio → backend → Voice Transcribe → texto → catálogo local → avatar
Cámara → cuenta previa → video → backend/FFmpeg → Spark Contributor
                                                ↓
                           propuesta → confirmación → texto / voz
```

La conversión Español → Señas busca expresiones del catálogo; no traduce libremente frases ni concatena una seña por cada palabra. Python y Blender se utilizan para autoría, datos y evaluación, no para arrancar Daló.

## Resultados y limitaciones

La evaluación de desarrollo con **Spark Contributor**, videos completos a **12 fps** y contexto **`lsc-motion-v4-10`** obtuvo **359/402 aciertos (89,3 %)**, contando un fallo técnico como error. Bienvenido obtuvo 27/28, Bien 51/54 y Mal 42/51.

**No es validación independiente:** las mismas muestras ayudaron a ajustar descripciones y seleccionar palabras. No permite afirmar esa precisión con personas nuevas ni en webcam.

Los artefactos locales están en `data/meta-evaluation/2026-10-29-welcome-plus-two/`: `REPORT.md`, `summary.json`, `results.json` y `events.jsonl`, con un índice por prueba. Se conservaron 499 tareas entre selección, controles, pruebas dirigidas y lote final. Estos archivos locales están excluidos de Git.

- El rechazo de señas externas **sigue fallando**: el video de Necesitar produjo Perfecto en catálogo cerrado y no se identificó en vocabulario abierto. Un solo clip no estima una tasa general de falsos positivos.
- La confianza es subjetiva, no está calibrada y no sustituye la confirmación del usuario.
- El vocabulario es acotado; Perdón y Mal siguen teniendo errores apreciables.
- Las animaciones no representan todos los componentes faciales y no manuales de LSC y siguen pendientes de validación lingüística y revisión de permisos.
- La cámara, el micrófono, la iluminación, la nitidez y la disponibilidad del servicio condicionan el uso.
- Daló no hace seguimiento corporal en vivo ni usa SAM; el modo open-weight sin conexión sigue pendiente.

## Guía técnica

Consulta [backend-meta/README.md](../backend-meta/README.md) para la arquitectura y los endpoints, y [web-meta/README.md](../web-meta/README.md) para la interfaz y las herramientas de evaluación manual.

### Archivos principales

| Ruta                                      | Responsabilidad                                                  |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `backend-meta/src/app.ts`                 | Composición de Express y dependencias.                           |
| `backend-meta/src/modules/signs/`         | Catálogo, esquema de respuesta y contexto del modelo.            |
| `backend-meta/senas/cordialidad/`         | Definiciones individuales y explicaciones visuales de las señas. |
| `backend-meta/src/modules/recognition/`   | Capturas, validación, controlador y streaming NDJSON.            |
| `backend-meta/src/modules/transcription/` | Dictado y validación de audio.                                   |
| `backend-meta/src/infrastructure/`        | Clientes Meta y conversión de video.                             |
| `backend-meta/tests/`                     | Contratos HTTP, casos del proveedor y medios.                    |
| `web-meta/src/app/catalog.ts`             | Nombres, formulaciones, disponibilidad y URLs del avatar.        |
| `web-meta/src/app/comunicador/`           | Interfaz Español → Señas y Señas → Español.                      |
| `web-meta/src/app/expresiones/`           | Galería, búsqueda, filtros y vista previa.                       |
| `web-meta/src/app/avatar-lsc/`            | Renderizado y controles del avatar.                              |
| `web-meta/public/avatar/`                 | Recursos de animación y miniaturas.                              |
| `tools/meta-evaluation/`                  | Preparación de medios, ejecución e informes de pruebas.          |

### Editar o incorporar una seña

La skill [dalo-agregar-senas](../skills/dalo-agregar-senas/SKILL.md) guía el proceso desde una fuente de videos etiquetados como LSC-54: inventario, revisión de variantes, descripción visual, integración y evaluación antes de habilitar reconocimiento. Incluye un ayudante local para detectar duplicados y proponer particiones por participante.

Ejemplo de solicitud a un agente:

```text
Usa $dalo-agregar-senas para incorporar [palabra] en [categoría],
usando los videos de LSC-54 en [ruta]. Revisa varias personas y
repeticiones, reserva participantes para evaluación y conserva
por separado contexto, logs y resultados.
```

1. Edita o crea `backend-meta/senas/<categoria>/<id>.json`. Incluye nombre, significado, intención, descripción visual, estado activo y orden.
2. Describe lo observable: forma y orientación de las manos, ubicación, contacto y trayectoria. Las descripciones son provisionales hasta su validación lingüística.
3. Si necesita representación visual, prepara la animación y registra sus URLs y metadatos en `web-meta/src/app/catalog.ts`. Activar una clase en el backend no genera el avatar.
4. Ejecuta las comprobaciones del backend y frontend, reinicia el backend y revisa el contexto expuesto en Detalles técnicos.
5. Evalúa con capturas nuevas y conserva por separado contexto, logs y resultados. No presentes como validación independiente las muestras usadas para ajustar la descripción.

### Recursos, evaluación y mantenimiento

Las animaciones usan VRM Animation y secuencias JSON preparadas. La galería utiliza miniaturas WebP y carga el avatar al interactuar. Las fuentes y permisos de cada expresión se consultan en sus metadatos; una animación disponible no equivale a una seña validada.

El backend elimina sus archivos temporales de conversión. `backend-meta/dist/`, `web-meta/dist/` y las cachés de compilación son salidas regenerables. Los artefactos de evaluación que justifican resultados —manifiestos, contexto, logs y respuestas— se conservan en `data/meta-evaluation/`, excluidos de Git.

No publiques `.env`, claves, grabaciones privadas ni datasets. Revisa permisos y validación con personas competentes en LSC antes de distribuir materiales como contenido validado.

## Pendientes de validación

- Revisión lingüística de las señas, sus variantes y las animaciones con personas competentes en LSC.
- Confirmación de permisos de publicación de los recursos derivados.
- Evaluación con personas y condiciones de captura nuevas.
- Mejora del rechazo de señas fuera del catálogo y calibración de confianza.
- Incorporación de contenido en números y colores.
- Evaluación del modo open-weight y del funcionamiento sin conexión.
