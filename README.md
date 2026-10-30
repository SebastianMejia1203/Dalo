# Daló · LSC ↔ Español

Daló ayuda a comunicar expresiones cotidianas entre personas usuarias de **Lengua de Señas Colombiana (LSC)** y personas que hablan español.

Puedes escribir o dictar una expresión para ver su seña, o usar la cámara para obtener una propuesta en español.

> **Prototipo experimental:** incluye 33 expresiones animadas y reconoce 10 señas por cámara. Su vocabulario es limitado y necesita validación con personas competentes en LSC. No sustituye a intérpretes profesionales.

## Qué puedes hacer

- **Español → Señas:** escribe o dicta una expresión del catálogo y reproduce su animación.
- **Señas → Español:** pulsa Capturar, espera el **3, 2, 1** y realiza tu seña cuando aparezca el punto rojo. La grabación dura tres segundos; después revisas y confirmas la propuesta.
- **Explorar expresiones:** busca, filtra por cámara o avatar y amplía las animaciones.

Las señas reconocibles son: **Hola, Gracias, Chao, Perfecto, Esperar, Lo siento, Bienvenido, Perdón, Bien y Mal**.

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

Para configurar variables o publicar la aplicación, consulta [Desarrollo y producción](docs/ENTORNOS.md).

## Cómo está organizado

| Carpeta                  | Contenido                                              |
| ------------------------ | ------------------------------------------------------ |
| `web-meta/`              | Interfaz Angular y avatar 3D.                          |
| `backend-meta/`          | API en TypeScript estricto y Express 5.                |
| `backend-meta/senas/`    | Un archivo JSON por seña, con su descripción visual.   |
| `tools/meta-evaluation/` | Preparación de videos y evaluación del reconocimiento. |

Las señas se agrupan en **cordialidad**, **números** y **colores**. Por ahora, solo cordialidad tiene contenido.

Para agregar una seña a partir de varios videos de LSC-54, usa la skill [dalo-agregar-senas](skills/dalo-agregar-senas/SKILL.md).

## Qué debes tener en cuenta

- Español → Señas busca expresiones del catálogo; no traduce frases libres.
- El reconocimiento puede equivocarse, especialmente con palabras fuera del catálogo. Confirma siempre la propuesta.
- Las animaciones siguen pendientes de revisión lingüística y de permisos de publicación.
- El video se envía a **Muse Spark 1.3 Contributor** y el dictado a **Muse Voice Transcribe**. Contributor permite a Meta usar el contenido enviado para entrenamiento.

La evaluación de desarrollo obtuvo **359/402 aciertos (89,3 %)**. Se usaron muestras que también ayudaron a ajustar el contexto: **no es una validación independiente ni garantiza esa precisión con personas nuevas**. Consulta los [resultados y límites de la evaluación](docs/GUIA-TECNICA.md#resultados-y-limitaciones).

## Para desarrollar

Desde la raíz:

```powershell
npm run check
npm run build
```

- [Backend: arquitectura, endpoints y pruebas](backend-meta/README.md)
- [Frontend: funcionamiento y comprobaciones](web-meta/README.md)
- [Guía técnica: modelos, señas y evaluación](docs/GUIA-TECNICA.md)
- [Entornos y publicación](docs/ENTORNOS.md)

## Créditos

Proyecto para el **Meta Global AI Developer Hackathon 2026**. Utiliza datos de referencia **LSC-54** y el avatar **Sendagaya Shibu / AvatarSample_1**, de VRoid Project / pixiv.

Consulta la [autoría, fuentes y atribuciones completas](docs/ATRIBUCIONES.md).
