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

El navegador muestra **3, 2, 1 antes de grabar**. El punto rojo aparece únicamente
durante los tres segundos de captura; después se interpreta el video automáticamente.
FFmpeg normaliza a MP4 sin audio, ancho máximo de 640 px, duración máxima de cinco
segundos y 12 fps. El dictado usa WAV mono PCM16 a 24 kHz. El backend elimina los
archivos temporales de conversión y no conserva las capturas como historial.
Los evaluadores por lotes y sus artefactos privados no se distribuyen.

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
```

Todo el código fuente y las pruebas del backend están en **TypeScript estricto**. `dist/` contiene únicamente la salida compilada para Node y no se edita. Rutas y controladores HTTP están separados de los clientes de Meta y del procesamiento de medios.

Las explicaciones visuales se editan en **`backend-meta/senas/cordialidad/<id>.json`**, campo `descripcion`. Cada archivo incluye nombre, intención, `activa` y los órdenes del catálogo/contexto. Once señas están activas, incluida Muy bien; las otras 22 definiciones se conservan como candidatas deshabilitadas. El repositorio valida las definiciones al iniciar y el constructor de contexto genera las instrucciones desde ellas.

El contexto de uso normal es **`lsc-motion-v4-11`**. Incluye chao, perfecto, hola,
gracias, esperar, losiento, bienvenido, perdon, bien, mal y muybien, además de la
salida de rechazo `otra`. La etiqueta esperada permanece fuera de la petición.

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

## Estado y limitaciones

El contexto de uso normal es `lsc-motion-v4-11`, con once señas activas, incluida
Muy bien. Las otras 22 definiciones permanecen deshabilitadas. El catálogo visual
incluye 33 expresiones animadas; disponer de avatar no habilita reconocimiento
por cámara ni acredita corrección lingüística.

Las descripciones son hipótesis visuales provisionales. El prototipo no tiene
validación independiente que garantice precisión con personas nuevas o en webcam.
La confianza del proveedor es subjetiva, no está calibrada y puede ser alta en
una respuesta equivocada. La aplicación requiere confirmación del usuario.

El criterio acordado para incorporar candidatas exige muestras correctamente
identificadas con confianza estrictamente mayor que 0,85, además de revisar
confusiones, regresiones y rechazo. No es un filtro automático de cada respuesta
ni una garantía de precisión poblacional.

Limitaciones pendientes:

- Se confunden señas con configuraciones o contactos similares; hay que revisar
  variantes con personas competentes en LSC y usar ejemplos de contraste.
- La lectura del movimiento puede ser inconsistente. Comparar video y fotogramas
  de forma controlada es una posible investigación, no una solución demostrada.
- Las palabras externas pueden clasificarse como señas del catálogo. Su rechazo
  debe medirse por separado de la identificación abierta, con varios términos.
- Las animaciones no representan todos los componentes faciales y no manuales
  de LSC y requieren revisión lingüística y de permisos.
- Cámara, iluminación, nitidez, red y disponibilidad de la API condicionan el uso.
- No hay seguimiento corporal en vivo, uso de SAM ni reconocimiento sin conexión.

Los evaluadores por lotes, los datasets, las grabaciones y los resultados privados
no forman parte de la distribución. Para ejecutar Daló bastan el código, sus
recursos de avatar, las dependencias y la configuración descrita en los README.

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

Mantén la candidata en `activa: false` durante el experimento. Usa un contexto
explícito con versión nueva y un control sin candidata. Solo después de evaluar
y justificar la activación actualiza backend, disponibilidad de cámara del
frontend y expectativas de catálogo en las pruebas. Una animación existente no
justifica por sí sola habilitar reconocimiento.

### Recursos, evaluación y mantenimiento

Las animaciones usan VRM Animation y secuencias JSON preparadas. La galería utiliza miniaturas WebP y carga el avatar al interactuar. Las fuentes y permisos de cada expresión se consultan en sus metadatos; una animación disponible no equivale a una seña validada.

El backend elimina sus archivos temporales de conversión. `backend-meta/dist/`, `web-meta/dist/` y las cachés de compilación son salidas regenerables y están excluidas de Git. La carpeta pública contiene los recursos necesarios para reproducir el avatar, no archivos de autoría, grabaciones ni informes privados.

No publiques `.env`, claves, grabaciones privadas ni datasets. Revisa permisos y validación con personas competentes en LSC antes de distribuir materiales como contenido validado.

## Pendientes de validación

- Revisión lingüística de las señas, sus variantes y las animaciones con personas competentes en LSC.
- Confirmación de permisos de publicación de los recursos derivados.
- Evaluación con personas y condiciones de captura nuevas.
- Mejora del rechazo de señas fuera del catálogo y calibración de confianza.
- Refinamiento de las veinte candidatas pendientes sin reutilizar resultados de
  evaluación para presentar después la misma partición como independiente.
- Comparación controlada de video y fotogramas para investigar los fallos de
  lectura del movimiento; todavía no hay una corrección demostrada.
- Incorporación de contenido en números y colores.
- Evaluación del modo open-weight y del funcionamiento sin conexión.
