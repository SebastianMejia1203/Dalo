# Integración en Daló

Comprueba estos archivos en el proyecto; si cambiaron, adapta las instrucciones a su contrato vigente.

| Archivo                                                    | Uso                                                                           |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `backend-meta/src/modules/signs/sign.types.ts`             | Contratos TypeScript del catálogo, definición y contexto.                     |
| `backend-meta/src/modules/signs/sign.repository.ts`        | Carga de JSON por categoría y validación al iniciar.                          |
| `backend-meta/src/modules/signs/sign.context.ts`           | `createMotionSpec` y `motionSpec`; constructor de instrucciones y esquema.    |
| `backend-meta/senas/cordialidad/*.json`                    | Definiciones existentes, incluidas candidatas deshabilitadas.                 |
| `backend-meta/src/infrastructure/media/video.converter.ts` | Normalización de video que usa el runtime.                                    |
| `web-meta/src/app/catalog.ts` y `cordialidad.json`         | Metadatos, formulaciones, fuentes, disponibilidad y animaciones del frontend. |
| `web-meta/public/avatar/`                                  | Recursos reales para representación visual.                                   |

## JSON por seña

Usa el ID sin acentos, en minúsculas y sin separadores; la regla actual es `^[a-z][a-z0-9]*$`. El nombre del archivo debe coincidir con el ID, que debe ser único en todas las categorías. `otra` está reservado para rechazo.

Ejemplo de forma, **no definición lingüística para copiar**:

```json
{
  "id": "candidata",
  "nombre": "Nombre de la expresión",
  "significado": "Significado en español",
  "intencion": "Intención comunicativa",
  "descripcion": "Descripción sustentada en los videos inspeccionados, con sus límites y variantes.",
  "activa": false,
  "orden": 10,
  "ordenDescripcion": 12
}
```

Elige órdenes disponibles tras revisar todos los JSON; los números del ejemplo no son valores obligatorios. No renumeres las señas existentes porque alteraría el contexto de control. Para números/colores utiliza su categoría; no insertes contenido ficticio para llenar carpetas.

`activa: false` excluye la seña de catálogo y esquema cerrados. Su descripción queda disponible en `movementDescriptions` para construir un contexto de prueba. Para incluirla experimentalmente, llama `createMotionSpec` con entradas activas **más** la candidata y las descripciones correspondientes; asigna un `promptVersion` nuevo. Conserva un contexto de control sin candidata ni cambios de redacción. Cambiar solo la descripción con el mismo número de clases no cambia automáticamente la versión: pásala explícitamente en experimentos y actualiza la versión del runtime si se publica el ajuste.

## Frontend

- Si la entrada ya existe, actualiza su disponibilidad en su ubicación real. Algunas entradas de cordialidad se generan mediante `cordialidad.json` y un mapeo: añadir un ID al backend no modifica por sí solo ese mapeo.
- `reconocible` describe disponibilidad de cámara; `avatarUrl`/`animacionUrl` describen recursos visuales. No son equivalentes.
- Para una entrada sin avatar utiliza URLs nulas y estado honesto. No apuntes a archivos inexistentes ni actives una clase fuera del catálogo del backend.
- Conserva nombre legible, formulaciones, fuente, variante y estado de validación. Las fuentes y los videos de evaluación no van en el prompt como respuesta esperada.
- No cambies contratos TypeScript para omitir validaciones ni añadas JS al backend.

## Checks y cierre

Desde `backend-meta/`: `npm run check`. Desde `web-meta/`, si se modificó: `npm test -- --watch=false` y `npm run build`.

Revisa fixtures y pruebas que contienen recuentos explícitos de clases; ajusta expectativas justificadas por la incorporación, sin debilitar las comprobaciones. La lista de clases de la interfaz se obtiene de `/api/context`.

Después de editar JSON, reinicia el backend: el repositorio los carga al iniciar. Comprueba `/api/catalog` y `/api/context` usando localhost:3001 o el proxy localhost:4201, sin activar la cámara personal para una simple verificación de catálogo.

Si `web-meta/node_modules` es un enlace compartido, no ejecutes instalaciones que puedan modificar otras dependencias. Usa las ya preparadas o una instalación independiente. La clave solo vive en `backend-meta/.env` y nunca se copia a los artefactos.
