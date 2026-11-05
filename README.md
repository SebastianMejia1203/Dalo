# Daló · LSC ↔ Español

[Español](README.md) · [English](README.en.md)

Daló ayuda a comunicar expresiones cotidianas entre personas usuarias de **Lengua de Señas Colombiana (LSC)** y personas que hablan español.

Puedes escribir o dictar una expresión para ver su seña, o usar la cámara para obtener una propuesta en español.

**Demo en vivo:** [dalo.sebastianmejia.dev](https://dalo.sebastianmejia.dev)

> **Prototipo experimental:** incluye 33 expresiones animadas y reconoce 11 señas por cámara, incluida Muy bien. Su vocabulario es limitado y necesita validación con personas competentes en LSC. No sustituye a intérpretes profesionales.

## Qué puedes hacer

- **Español → Señas:** escribe o dicta una expresión del catálogo y reproduce su animación. También acepta frases naturales: Muse Spark interpreta la intención y elige la expresión equivalente del catálogo, o indica que no hay ninguna.
- **Señas → Español:** pulsa Capturar, espera el **3, 2, 1** y realiza tu seña cuando aparezca el punto rojo. La grabación dura tres segundos; después revisas y confirmas la propuesta.
- **Explorar expresiones:** busca, filtra por cámara o avatar y amplía las animaciones.

Las señas reconocibles son: **Hola, Gracias, Chao, Perfecto, Esperar, Lo siento, Bienvenido, Perdón, Bien, Mal y Muy bien**.

Los detalles del modelo, las fuentes y las herramientas de evaluación están disponibles en los paneles **Detalles técnicos** de la aplicación.

## Ejecutar en tu equipo

Necesitas **Node.js 24**, **npm 11**, **FFmpeg** y una **clave Meta** con acceso a Muse Spark Contributor y Muse Voice Transcribe. El reconocimiento y el dictado requieren Internet.

### 1. Preparar el proyecto

En una copia nueva, instala las dependencias desde la raíz:

> Si `web-meta/node_modules` es un enlace a un directorio compartido, conserva las dependencias preparadas y omite su instalación. No ejecutes `npm ci` sobre ese enlace.

```powershell
npm --prefix backend-meta ci
npm --prefix web-meta ci
```

Crea el archivo de configuración si todavía no existe:

```powershell
if (!(Test-Path backend-meta/.env)) {
  Copy-Item backend-meta/.env.example backend-meta/.env
}
```

Completa `META_API_KEY` en `backend-meta/.env`. La clave se guarda únicamente en el backend; no la publiques ni la copies al frontend.

### 2. Iniciar la aplicación

Abre dos terminales en la raíz del proyecto.

**Terminal 1 — backend:**

```powershell
npm run dev:backend
```

**Terminal 2 — frontend:**

```powershell
npm run dev:frontend
```

Abre [Daló en el navegador](http://localhost:4201). La interfaz se conecta al backend local por `/api`.

### Producción

1. Copia `backend-meta/.env.production.example` a `backend-meta/.env.production` y completa `APP_ORIGIN` (el origen público exacto, sin ruta), `META_API_KEY` y un `ADMIN_TOKEN` aleatorio (`openssl rand -hex 32`). Ese token solo protege por API las definiciones, importaciones y borrados; la validación de señas es pública.
2. Desde la raíz: `npm run build` y `npm start`. El backend sirve la API `/api` y el frontend compilado desde el mismo servidor; `GET /api/health` confirma si hay clave configurada, sin publicarla.
3. Termina HTTPS en un proxy inverso hacia `127.0.0.1:3001`, con streaming sin buffering y timeout superior a 75 segundos. Cámara y micrófono requieren HTTPS fuera de localhost.
4. Apunta `ADMIN_DB_PATH` a una ruta persistente fuera del directorio de despliegue para no perder las validaciones al actualizar. Nunca publiques `.env`, claves, grabaciones ni datasets.

## Cómo está organizado

| Carpeta                  | Contenido                                              |
| ------------------------ | ------------------------------------------------------ |
| `web-meta/`              | Interfaz Angular y avatar 3D.                          |
| `backend-meta/`          | API en TypeScript estricto y Express 5.                |
| `backend-meta/senas/`    | Un archivo JSON por seña, con su descripción visual.   |

Las señas se agrupan en **cordialidad**, **números** y **colores**. Por ahora, solo cordialidad tiene contenido.

Para agregar una seña a partir de varios videos de LSC-54, usa la skill [dalo-agregar-senas](skills/dalo-agregar-senas/SKILL.md).

## Cómo funciona por dentro

- **Texto:** la coincidencia exacta con el catálogo se resuelve en el navegador, sin esperar a Meta. Si es lenguaje libre, `POST /api/intent` (contexto `lsc-intent-v1`) elige una expresión existente o ninguna. No se traduce palabra por palabra.
- **Cámara:** tras el 3, 2, 1 se graban 3 segundos; FFmpeg normaliza a MP4 sin audio (máx. 640 px, 5 s, 12 fps) y Muse Spark responde con clase, confianza subjetiva y motivo. El backend elimina los temporales y no guarda las capturas. La persona siempre confirma o descarta la propuesta.
- **Dictado:** WAV mono a 24 kHz hacia Muse Voice Transcribe; el texto resultante sigue la misma ruta que el texto escrito.
- **Señas:** cada definición vive en `backend-meta/senas/<categoría>/<id>.json` (campo `descripcion`: forma y orientación de las manos, ubicación, contacto y trayectoria). Hay 11 activas en el contexto `lsc-motion-v4-11`, con salida de rechazo `otra`, y 22 candidatas desactivadas. Añadir la definición no crea la animación: los recursos visuales van en `web-meta/src/app/catalog.ts` y `web-meta/public/`. Mantén la candidata en `activa: false` hasta evaluarla con capturas nuevas.
- **Validación:** la página Validación es pública; cada persona guarda su veredicto en SQLite y puede haber varios registros por seña, visibles en Registros. Las descripciones son hipótesis provisionales hasta su revisión con personas competentes en LSC.

## Problemas, limitaciones y posibles soluciones

Las siguientes soluciones son líneas de trabajo pendientes; su eficacia debe comprobarse antes de ampliar el reconocimiento.

| Problema o limitación | Qué ocurre | Posible solución |
| --- | --- | --- |
| Confusión entre señas parecidas | Tranquilo se confunde con Perdón; otras señas comparten formas o contactos similares. | Revisar las variantes con personas competentes en LSC y precisar orientación, contacto y trayectoria con videos de contraste. |
| Lectura inconsistente del movimiento | Algunas respuestas describen solo reposo aunque el video contiene una seña. | Comparar video y fotogramas cronológicos sobre los mismos ejemplos, revisar encuadre y calidad, y medir si el cambio reduce errores. |
| Palabras fuera del catálogo | Una seña desconocida puede confundirse con una del catálogo. | Ampliar las palabras negativas y evaluar falsos positivos antes de habilitar cada candidata. Mantener la confirmación del usuario. |
| Confianza sin calibrar | Un 90 % declarado por el modelo puede acompañar una respuesta equivocada. Las muestras son pocas y tienen historial previo de uso. | Evaluar con más personas y grabaciones nuevas, separar desarrollo de evaluación y comprobar la relación entre confianza y aciertos. |
| Vocabulario y animaciones limitados | Hay **11 señas reconocibles** y **33 expresiones animadas**. Español → Señas relaciona la intención con el catálogo cerrado; no traduce libremente frases. Las animaciones requieren revisión lingüística y de permisos. | Incorporar señas gradualmente, comprobar regresiones y revisar animaciones y derechos antes de publicarlas. |
| Dependencia de la API | El reconocimiento y el dictado necesitan Internet. Las respuestas pueden tardar o fallar. | Medir latencia y disponibilidad, comunicar los fallos y evaluar reintentos acotados para errores transitorios. |

El prototipo **no dispone de validación independiente que garantice precisión con personas nuevas**. El repositorio contiene el código y los recursos de ejecución; no distribuye datasets, grabaciones ni resultados privados de evaluación.

**Uso de datos:** el video se envía a **Muse Spark 1.3 Contributor** y el dictado a **Muse Voice Transcribe**. Contributor permite a Meta usar el contenido enviado para entrenamiento. Tenlo en cuenta antes de enviar grabaciones personales.

## Para desarrollar

Desde la raíz:

```powershell
npm run check
npm run build
```

- [Backend: arquitectura, endpoints y pruebas](backend-meta/README.md)
- [Frontend: funcionamiento y comprobaciones](web-meta/README.md)

## Modelos en tiempo de ejecución

Por las reglas del evento, ningún modelo ajeno a Meta corre en tiempo de ejecución. El reconocimiento usa `muse-spark-1.3-contributor` y el dictado `muse-voice-transcribe-1.0`, ambos desde el backend. La versión anterior con MediaPipe y una GRU local (ONNX) se retiró por esa regla y no forma parte de esta variante. `speechSynthesis` es una función del navegador, no un modelo; Three.js y FFmpeg procesan gráficos y medios sin inferencia. No hay modelo open-weight de Meta en ejecución: evaluarlo queda pendiente (ver abajo).

## Plan original y lo que falta

La idea original era la que hoy hace el prototipo: intercambios básicos y bidireccionales entre LSC y español mediante un catálogo acotado, con confirmación del usuario ante resultados ambiguos y apoyo junto a videollamadas compartiendo la ventana de Daló o copiando el texto confirmado al chat. Siguen fuera de alcance la traducción universal o continua de LSC, traducir frases libres del español y sustituir intérpretes profesionales.

Para llegar a esa idea completa falta, en este orden:

- Validación de señas y animaciones con personas competentes en LSC y participación de personas sordas.
- Evaluación independiente con personas, cámaras y grabaciones nuevas, separada de los datos de desarrollo.
- Ampliar el vocabulario de forma gradual (hoy solo hay cordialidad; números y colores están vacíos y 22 definiciones siguen desactivadas), midiendo confusiones y rechazo de señas ajenas antes de activar cada candidata.
- Comprobar el uso junto a una videollamada concreta (cámara compartida, qué ve y oye la otra persona) antes de ofrecerlo como función verificada.
- Evaluar un modelo open-weight de Meta y el funcionamiento sin conexión, y medir costo y latencia por interacción en la demo pública.

## Créditos

Proyecto para el **Meta Global AI Developer Hackathon 2026**. Utiliza datos de referencia **LSC-54** y el avatar **Sendagaya Shibu / AvatarSample_1**, de VRoid Project / pixiv.

Consulta la [autoría, fuentes y atribuciones completas](docs/ATRIBUCIONES.md).
