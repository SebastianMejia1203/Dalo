# Datos y evaluación reproducible

## Inventario de LSC-54

Ejecuta el ayudante de esta skill desde la raíz del proyecto. Si está instalada globalmente, utiliza su ruta real para localizar `scripts/inventory.py`.

```powershell
python skills/dalo-agregar-senas/scripts/inventory.py `
  --root "data/LSC-54/RawVideos/Videos Courtesy" `
  --word "apoyar=Cordialidad/Apoyar" `
  --word "hola=Cordialidad/Hola" `
  --output "data/meta-evaluation/apoyar-inventario-01"
```

La palabra objetivo y los contrastes se eligen según la solicitud, no por este ejemplo. El script acepta más `--word ID=Categoría/Carpeta` y admite acentos normalizados para localizar carpetas. No cambia etiquetas silenciosamente si hay ambigüedad. No descarga, altera ni transmite videos. Guarda hash, participante, ruta relativa y una partición determinista por participante; los duplicados exactos quedan excluidos. Su división es una **propuesta**, no demuestra que esos participantes sean nuevos para el equipo: revisa los experimentos existentes antes de llamarlos reservados.

Para otra fuente registra nombre, versión/URL o DOI si se conoce, ruta, lengua/variante, sistema de etiquetas, participantes y permisos. Si su estructura difiere, utiliza un adaptador explícito y conserva el mismo contrato de procedencia y particiones. No inventes participantes ausentes; sin identificarlos no se puede garantizar una separación por persona.

## Inspección y particiones

Examina solo desarrollo al ajustar. Revisa distintas personas, repeticiones, lateralidad, contacto, inicio y final. Inspecciona también clips borrosos o atípicos; no selecciones únicamente los que confirman tu descripción. Documenta ilegibles, etiquetas dudosas y exclusiones justificadas antes de consultar respuestas del modelo.

No copies videos a `public/` por evaluar reconocimiento. Los derechos de evaluación, transmisión a un proveedor y redistribución son asuntos distintos. La existencia local del dataset no los resuelve.

Los fotogramas/hojas de contacto permiten revisar el gesto, pero no reemplazan automáticamente el video. Puedes reutilizar `extract` en `tools/meta-evaluation/prepare.py`; **su CLI tiene clases antiguas fijas y no incorpora cualquier candidata**. No la ejecutes esperando que descubra la nueva palabra. Tampoco confundas `report.py` o `report-expansion.py`, ligados a experimentos concretos, con un evaluador genérico.

## Preparar un experimento para el runner

1. Compila `backend-meta/` con `npm run build`; el runner importa `dist/`.
2. Crea un directorio nuevo, un manifiesto con la selección explícita y `closedSpec` exportado mediante `createMotionSpec`. Para una candidata inactiva debes añadirla explícitamente a las entradas del contexto. No uses el fallback de `run.mjs`: es un contexto base y no necesariamente el contexto de movimientos elegido.
3. Prepara cada video con la normalización del runtime (`normalizeVideo` en `dist/infrastructure/media/video.converter.js`), guardando el MP4 silencioso en `samples/<sampleId>/full.mp4`. Usa IDs neutros; valida que no se pierda el núcleo activo por el límite de duración. Registra fuentes, hashes y cambios de formato. La reproducción lenta de inspección no cambia la velocidad que envías.
4. Incluye tanto muestras objetivo como contrastes de clases existentes. No uses un manifiesto que solo tenga la candidata para afirmar ausencia de regresiones.

Contrato mínimo del runner actual:

```text
manifest.json
  closedSpec: contexto completo, instrucciones, clases, esquema y promptVersion
  samples: [{ id, source: rutaRelativaLocal }]
  tasks: [{ id, sampleId, expected, kind: "video", scope: "closed", videoFps: 12 }]
samples/<sampleId>/full.mp4
```

`expected` y `source` son metadatos **locales**. En cerrado, para una palabra fuera del catálogo, `expected` debe ser `otra`. Para su condición abierta usa `scope: "open"` y la etiqueta real como `expected`. La identificación abierta no contiene candidatos y no debe recibir la descripción particular de la respuesta correcta.

El runner incluye el caso especial `outside-0001` en su ordenamiento: si tienes varios negativos, usa IDs únicos, tareas de tipo video y revisa las tareas explícitamente; no reutilices el mismo ID. Para fotogramas lee su contrato real, que necesita metadatos adicionales de cada imagen.

Desde la raíz, **solo con llamadas autorizadas**:

```powershell
node --use-system-ca --env-file=backend-meta/.env tools/meta-evaluation/run.mjs data/meta-evaluation/EXPERIMENTO-NUEVO 4
```

Calcula antes el número de tareas, incluidos controles, negativos abiertos/cerrados y posibles reintentos. El runner hace hasta tres intentos en ciertos errores transitorios; registra cada uno y se detiene con 401/403. Si cambia contexto, modelo o selección usa otro directorio; no borres resultados para volver a intentar solo los fallos.

## Condiciones y reporte

- **Control:** catálogo y contexto activos sin modificar, para medir variación/regresión.
- **Desarrollo con candidata:** modelo, videos y muestreo constantes, catálogo ampliado y contexto versionado.
- **Reservada:** participantes no usados para ajustar, después de fijar el contexto. Si el resultado motiva otro ajuste, deja de ser una prueba final independiente.
- **Fuera del catálogo:** varios términos no candidatos; condición cerrada esperando rechazo y condición abierta separada.

Guarda `manifest.json`, `contexts.json`, `requests/`, `logs/`, `results/` y los consolidados. No contienen credenciales. Los logs son etapas y resúmenes públicos, no razonamiento privado. Las referencias locales a medios permiten reconstrucción sin duplicar los data URLs.

El informe debe separar condiciones y particiones, contar todos los errores técnicos, mostrar matriz de confusión y métricas por clase/participante, comparar el conjunto de clases existente antes/después y registrar exclusiones y reintentos. No mezcles el piloto con la evaluación final en un único porcentaje. No interpretes confianza subjetiva como exactitud calibrada.

Guarda resultados del rechazo aunque contradigan el objetivo. Un acierto alto en desarrollo no garantiza generalización, reconocimiento en vivo ni validación lingüística. No se fija un umbral universal de habilitación en esta skill: documenta el criterio y la decisión con el usuario y la evidencia disponible.
