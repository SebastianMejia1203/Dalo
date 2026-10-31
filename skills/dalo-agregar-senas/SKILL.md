---
name: dalo-agregar-senas
description: Incorporar o precisar señas en Daló usando múltiples videos etiquetados de una fuente como LSC-54, integrar su definición por categoría y evaluar reconocimiento, confusiones y rechazo antes de habilitarlas.
---

# Agregar señas a Daló

Trabaja desde la raíz del proyecto Daló. Localízala comprobando `backend-meta/package.json`, `backend-meta/senas/` y `web-meta/src/app/catalog.ts`; no dependas del directorio donde esté instalada esta skill.

El resultado es una definición respaldada por videos, integrada en el catálogo y acompañada por resultados reproducibles. Esta skill cubre reconocimiento y disponibilidad en la interfaz; no produce una animación 3D ni certifica corrección lingüística.

## Fuente y evidencia

- Debe existir una fuente identificable con videos etiquetados de la seña. Daló usa **LSC-54** como referencia, pero el dataset no se distribuye con el proyecto. Utiliza la ruta externa proporcionada por el usuario y revisa su estructura antes de asumir nombres.
- Confirma palabra, ID y categoría objetivo: `cordialidad`, `numeros` o `colores`. Distingue el nombre de la carpeta del dataset del identificador del producto. No uses una palabra en español para inventar la forma de una seña.
- Inventaría todos los clips de la palabra, participantes, hashes, fuente y permisos conocidos. Usa [el inventario](scripts/inventory.py) según [el flujo de datos y evaluación](references/evaluacion.md). Para otras estructuras o datasets adapta el inventario de forma explícita; no adivines etiquetas desde nombres ambiguos.
- Inspecciona videos completos de varias personas y repeticiones, con el movimiento activo y sus variantes. Selecciona una muestra diversa para redactar la descripción; después evalúa el conjunto disponible. Una imagen, una ejecución o un acierto aislado no bastan para habilitar reconocimiento. No hay un número de clips que garantice calidad: informa cuántos clips **únicos** y participantes existen y si la cobertura es insuficiente.
- Reserva participantes completos antes de ajustar descripciones. Los clips reservados no se usan para escoger ejemplos, corregir el prompt ni seleccionar la palabra. Si ya los examinaste para esos fines, reclasifícalos como desarrollo y consigue nuevos datos; no llames independiente a esa evaluación.

Si falta la fuente, no hay ejemplos suficientes o las etiquetas/variantes son contradictorias, continúa el inventario y la preparación posible, pero deja la seña deshabilitada y explica qué evidencia falta. No descargues ni publiques automáticamente un dataset ni supongas derechos de redistribución.

## Descripción y definición

Lee [la integración del proyecto](references/integracion.md) y los archivos reales que señala antes de editar.

1. Describe manos, configuración de dedos, orientación, ubicación, contacto y trayectoria durante el núcleo activo. Distingue reposo de gesto. Indica variantes observadas, lateralidad y límites de visibilidad; separa hechos de hipótesis visuales provisionales.
2. Compara con las clases más parecidas. Evita restricciones no respaldadas por todos los ejemplos: amplitud grande, giro de torso o un lado obligatorio pueden excluir ejecuciones válidas, como ocurrió con Bienvenido.
3. Crea `backend-meta/senas/<categoria>/<id>.json` inicialmente con `activa: false`, sin modificar el dataset. Guarda pruebas y procedencia en un directorio privado fuera del repositorio y de los recursos públicos; nunca en los videos originales ni en el prompt.
4. Construye un contexto **experimental explícito** que añada la candidata al catálogo activo. Una seña deshabilitada no entra en `motionSpec` automáticamente. No actives producción solo para poder probarla.

## Evaluación y decisión

- Sigue [evaluacion.md](references/evaluacion.md): piloto diverso, regresión sobre clases existentes y evaluación reservada cuando sea posible. Envía video completo normalizado, a 12 fps como el runtime; usa fotogramas para inspección o comparaciones documentadas.
- Evalúa confusiones en ambos sentidos con las clases existentes. Incluye videos de palabras ajenas al catálogo: prueba cerrada esperando `otra` y prueba abierta sin catálogo, como condiciones separadas. No uses una sola palabra externa para estimar una tasa general de rechazo.
- Las peticiones son independientes. No envíes etiqueta esperada, rutas, participante, nombre del archivo ni hojas de contacto anotadas. La evaluación no es entrenamiento y no crea memoria entre peticiones.
- Conserva contexto/modelo exactos, selección de muestras, solicitudes sanitizadas, logs públicos y resultados separados. Cuenta fallos técnicos y reporta todos los denominadores. No descartes errores ni sustituyas selectivamente respuestas para mejorar cifras.
- Antes de llamadas reales confirma el alcance autorizado, el modelo y el volumen estimado de peticiones. Utiliza la autorización existente si cubre esos videos y destino. Esta skill por sí sola no autoriza transferir datos ni gastar en la API. No muestres claves; Contributor tiene condiciones de uso de contenido para entrenamiento.
- Justifica la decisión con cobertura por participante, precisión por clase, confusiones, regresiones y rechazo. Usa los criterios acordados con el usuario; si no existen, propone una decisión razonada sin inventar un umbral universal. Si la evidencia es insuficiente, conserva `activa: false` y entrega el informe; no declares terminada la validación.

## Integración final

Si procede habilitar la seña, actualiza la definición y su disponibilidad real en `web-meta/`. No marques avatar disponible sin recurso existente, ni validación lingüística por tener buena exactitud. Mantén `En preparación` y el estado de revisión que corresponda.

Ejecuta los checks pertinentes, reinicia si corresponde y verifica `/api/catalog`, `/api/context` y filtros de Expresiones. Cambiar descripciones requiere identificar una nueva versión de contexto para que los experimentos sean distinguibles. No sobrescribas artefactos anteriores.

Entrega: seña/categoría, fuente y cobertura, archivos cambiados, modelo/contexto, resultados por condición, fallos/regresiones, estado activo o pendiente y rutas a logs e informe. Distingue incorporación técnica, evaluación de desarrollo, evaluación reservada y validación lingüística.
