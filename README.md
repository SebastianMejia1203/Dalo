# Daló · LSC ↔ Español

**Una herramienta de apoyo para la comunicación cotidiana entre personas sordas usuarias de Lengua de Señas Colombiana y personas oyentes que se comunican en español.**

Proyecto para el **Meta Global AI Developer Hackathon 2026**, con **Muse Spark 1.3 Contributor** y **Muse Wonder** como parte del proceso de desarrollo asistido por IA.

**Estado del prototipo:** 33 expresiones animadas · 8 señas reconocibles por cámara · aplicación web.

> Daló trabaja con un vocabulario acotado. Las animaciones y el reconocimiento son experimentales y requieren validación con personas competentes en LSC.

## Contenido

- [1. El problema y la propuesta](#1-el-problema-y-la-propuesta)
- [2. Qué puedes hacer con Daló](#2-qué-puedes-hacer-con-daló)
- [3. Uso de los modelos de Meta](#3-uso-de-los-modelos-de-meta)
- [4. Recorrido de demostración](#4-recorrido-de-demostración)
- [5. Cómo funciona](#5-cómo-funciona)
- [6. Ejecutar el proyecto](#6-ejecutar-el-proyecto)
- [7. Resultados, problemas y limitaciones](#7-resultados-problemas-y-limitaciones)
- [8. Guía técnica](#8-guía-técnica)
- [9. Pendientes de validación](#9-pendientes-de-validación)
- [10. Fuentes y atribuciones](#10-fuentes-y-atribuciones)

## 1. El problema y la propuesta

Un saludo, un agradecimiento o una petición de ayuda pueden convertirse en una barrera cuando dos personas no comparten la misma lengua. Daló explora cómo apoyar esos intercambios mediante texto, voz, cámara y un avatar que representa expresiones de LSC.

El prototipo permite consultar expresiones en español y observar su animación. También intenta reconocer un conjunto de señas frente a una cámara, muestra una propuesta en español y permite confirmarla antes de comunicarla.

## 2. Qué puedes hacer con Daló

| Función | Experiencia |
|---|---|
| **Español → Señas** | Escribir o dictar un mensaje, consultar coincidencias del catálogo y reproducir una expresión con el avatar. |
| **Señas → Español** | Activar la cámara, realizar una seña compatible y confirmar el texto propuesto. |
| **Explorar expresiones** | Buscar entre 33 expresiones de cordialidad y recorrer páginas de ocho resultados. |
| **Ver una animación en detalle** | Pasar el puntero sobre una miniatura o abrir el avatar en un modal grande. |
| **Controlar la reproducción** | Pausar, repetir, cambiar la velocidad y revisar fotogramas. |
| **Ajustar la vista y la salida** | Girar el avatar, acercar, desplazar la cámara y elegir voz o tamaño del texto. |

Las ocho señas reconocibles son **Hola, Gracias, Chao, Perfecto, Esperar, Lo siento, Bienvenido y Perdón**. La disponibilidad de animación y de reconocimiento se muestra por separado en cada expresión.

## 3. Uso de los modelos de Meta

### Cómo se construyó Daló con Muse

**Muse Spark 1.3 Contributor y Muse Wonder participaron directamente en la construcción del prototipo**, desde la generación inicial de código hasta la resolución de problemas del avatar, las animaciones y el seguimiento visual. Su uso se realizó durante el desarrollo con Muse; el resultado queda en el código, las herramientas y los archivos de animación del proyecto.

| Modelo | Uso real en Daló |
|---|---|
| **Muse Spark 1.3 Contributor** | Generación inicial de código e implementación iterativa de la aplicación. Una vez comprobada la calidad del proceso de animación, se utilizó para generar el resto siguiendo ese procedimiento. |
| **Muse Wonder** | Definición del enfoque técnico, adaptación del avatar 3D y primera animación de calidad en Blender. Se utilizó ampliamente para crear y corregir el modelo de reconocimiento, sus pesos y sus clases, y para resolver problemas complejos. |

### Por qué se eligió Contributor

**Daló es y seguirá siendo un proyecto open source.** La elección de Muse Spark 1.3 Contributor permitió reducir el costo de desarrollo y se ajustó al carácter abierto previsto para la entrega de la hackatón.

Contributor ofrece el mismo modelo y capacidades que la modalidad Standard, con una condición distinta de uso de datos: las entradas y salidas pueden utilizarse para entrenar y mejorar los modelos de Meta. En Standard, el contenido no se utiliza para ese entrenamiento. Para este proyecto de código abierto, la decisión priorizó el ahorro frente a esa diferencia entre modalidades. [Fuente: modalidades de Meta](https://dev.meta.ai/docs/pricing-rate-limits).

**Tarifas de referencia en USD por un millón de tokens, consultadas el 28 de octubre de 2026:**

| Modelo / modalidad | Entrada | Entrada en caché | Salida |
|---|---:|---:|---:|
| Muse Spark 1.3 Standard | 1,25 | 0,15 | 4,25 |
| **Muse Spark 1.3 Contributor — utilizado en Daló** | **0,10** | **0,002** | **0,20** |
| Muse Wonder | 4,00 | 0,20 | 20,00 |

[Fuente: precios oficiales de Meta](https://dev.meta.ai/docs/pricing-rate-limits). Son precios por tokens, no por tarea.

En mi experiencia al desarrollar durante el proyecto, una tarea de alrededor de **USD 0,30 con Spark Contributor** podía ascender a **USD 3–5 o más con Wonder**, dependiendo de la complejidad, el contexto, las iteraciones y la calidad del resultado. (Es una referencia de uso del proyecto).

Por eso se utilizó Wonder para resolver los problemas difíciles y establecer el procedimiento inicial; después, Spark Contributor permitió aplicar el proceso ya probado al resto del trabajo con un costo menor.

### Del primer resultado a un proceso repetible

1. **Construir e iterar con Spark 1.3 Contributor.** Generar código y concretar progresivamente cómo debía funcionar Daló.
2. **Resolver las tareas complejas con Wonder.** Trabajar en la definición técnica, el modelado y la animación del avatar, realizando una primera ejecución del proceso.
3. **Revisar la calidad.** Comprobar el resultado y ajustar el procedimiento hasta disponer de una forma de trabajo repetible.
4. **Ampliar con Spark 1.3 Contributor.** Aplicar ese procedimiento a las demás animaciones, conservando las fuentes editables y sus exportaciones para la web.

La primera expresión trabajada fue **Hola**. Con ayuda de Wonder se normalizaron los puntos y se corrigieron problemas de profundidad estimada, asignación de manos y deformación; después se trabajó manualmente en Blender y se ajustó la animación hasta obtener una mejora apreciable. Esa primera experiencia permitió establecer el procedimiento para producir en serie las demás animaciones de cordialidad con Spark Contributor.

Wonder también tuvo una participación importante en la creación del modelo de identificación: ajustes de pesos y clases, corrección del esqueleto de MediaPipe y resolución de errores complejos. La selección del modelo dependió de la dificultad de la tarea y de si ya existía un procedimiento probado.

El repositorio conserva un [flujo reutilizable de autoría con Muse y Blender](skills/muse-dalo-animaciones/SKILL.md), además de las recetas de `tools/`, los editables `.blend` y las animaciones `.vrma`. Estos archivos permiten continuar y revisar el trabajo realizado durante la hackatón.

### Cómo se ejecuta el prototipo

La aplicación web relaciona el texto con el catálogo, reconoce las señas mediante **MediaPipe Holistic y un clasificador temporal propio ejecutado con ONNX**, y reproduce las animaciones con Three.js y VRM. El aporte de Muse Spark 1.3 Contributor y Muse Wonder se encuentra en el proceso de desarrollo que permitió construir e iterar sobre esos componentes.

Las ideas de integración y los escenarios aún no comprobados se documentan en [Pendientes de validación](PENDIENTES.md).

## 4. Recorrido de demostración

1. **Comunicar en español.** Escribe «Hola» o «Gracias», elige una coincidencia y observa la animación.
2. **Explorar el catálogo.** Abre Expresiones, usa la búsqueda y cambia de página. Abre una animación en grande para revisar el gesto.
3. **Probar la cámara.** Cambia a Señas → Español, concede permiso y realiza una de las ocho señas disponibles. Mantén las manos visibles y bájalas entre expresiones para separar los turnos.
4. **Confirmar el resultado.** Revisa la propuesta y confirma antes de reproducirla por voz o copiarla.
5. **Mostrar los límites.** Prueba una frase fuera del catálogo y explica qué vocabulario admite el prototipo.

Para presentar el trabajo en la hackatón, acompaña este recorrido con el proceso de autoría en Muse y Blender y los archivos resultantes: una fuente `.blend` y una animación `.vrma` por expresión.

## 5. Cómo funciona

### De español a una animación

```text
Texto o dictado → búsqueda en el catálogo → expresión disponible
                                              ↓
                                  animación VRMA → avatar 3D
```

### De una seña a español

```text
Cámara → MediaPipe Holistic → puntos de cuerpo y manos
                                      ↓
                         segmento de movimiento → modelo ONNX
                                                        ↓
                                      propuesta → confirmación → texto / voz
```

### Tecnologías principales

| Capa | Tecnologías |
|---|---|
| Aplicación web | Angular 21, TypeScript, signals y componentes standalone. |
| Avatar y reproducción | Three.js, `@pixiv/three-vrm` y VRM Animation. |
| Seguimiento visual | MediaPipe Holistic. |
| Reconocimiento | GRU entrenada con Python/PyTorch y ejecutada con ONNX Runtime Web. |
| Autoría de movimientos | Blender, complemento VRM y herramientas Python del proyecto. |
| Desarrollo asistido | Muse Spark 1.3 Contributor y Muse Wonder. |
| Comprobaciones | Vitest, unittest y Playwright. |

La galería utiliza miniaturas WebP y activa el 3D al interactuar. El modelo y las animaciones se reutilizan mediante caché para reducir trabajo y tiempos de carga.

## 6. Ejecutar el proyecto

### Requisitos

- **Node.js 24** y **npm 11** para la aplicación web.
- **Python** para las herramientas y pruebas del proyecto.
- **Cámara y micrófono**, opcionales según la función que se quiera probar.
- **Blender 5.2 con el complemento VRM**, únicamente para editar o regenerar animaciones.

### Iniciar la web

Desde la raíz del repositorio:

```powershell
Set-Location web
npm install
npm start
```

Abre **http://localhost:4200**. Concede permisos de cámara o micrófono cuando uses esas funciones. El reconocimiento de voz y las voces de salida dependen de las capacidades del navegador.

Las animaciones y los modelos publicados en `web/public` permiten ejecutar la aplicación. El dataset local se necesita para extracción, entrenamiento o reconstrucción de referencias, y se mantiene fuera del repositorio.

### Comprobar y compilar

Desde `web`:

```powershell
npm test -- --watch=false
npm run build
```

Desde la raíz:

```powershell
python -m unittest discover -s tests -v
```

La compilación queda en `web/dist/web/browser`. Para publicarla, utiliza HTTPS y configura el alojamiento para servir `.mjs` como JavaScript y `.wasm` como `application/wasm`.

Las herramientas de reconocimiento requieren sus dependencias de Python; en el entorno local de desarrollo están instaladas en `.venv`. Su ejecución se describe en la guía técnica.

## 7. Resultados, problemas y limitaciones

### Lo que está disponible

| Elemento | Estado |
|---|---|
| Expresiones con avatar | 33 animaciones y sus fuentes editables. |
| Señas reconocibles | 8 clases de señas y una clase adicional `otra`. |
| Pruebas web | 132 pruebas superadas en la última comprobación. |
| Compilación web | Comprobada. |
| Galería y controles | Miniaturas, vista previa, modal y cámara comprobados en navegador. |
| Validación lingüística | Pendiente con personas competentes en LSC. |

### Reconocimiento implementado

El modelo temporal recibe puntos de cuerpo y manos extraídos con MediaPipe. La aplicación delimita los movimientos por segmentos, filtra propuestas por confianza y permite confirmar el resultado. El código de entrenamiento y las pruebas de paridad entre Python y TypeScript permanecen en el repositorio.

Las cifras históricas de evaluación se trasladaron a [Pendientes de validación](PENDIENTES.md#resultados-históricos-del-reconocedor), donde se indica la evidencia necesaria para volver a presentarlas como resultados reproducibles.

### Problemas de captura y seguimiento encontrados

Las siguientes observaciones corresponden al trabajo con los datos y a las pruebas de webcam del proyecto. Delimitan el vocabulario que se pudo utilizar y explican por qué algunas señas pueden animarse, pero no reconocerse de forma fiable.

| Problema observado | Consecuencia en Daló | Ajuste aplicado o límite que permanece |
|---|---|---|
| **Profundidad insuficientemente fiable** | Movimientos hacia la cámara o hacia el pecho no quedaban bien diferenciados. Varias señas no resultaron utilizables con esta captura. | Se normalizaron los puntos y se corrigió su adaptación al avatar. La profundidad estimada sigue siendo una limitación para el reconocimiento. |
| **Manos juntas u ocultas entre sí** | MediaPipe perdía puntos, confundía las manos o producía una representación deformada. Apoyar no pudo reconocerse de forma fiable en las condiciones probadas. | Apoyar no se ofrece como clase reconocible. Tener una animación disponible no implica que la cámara pueda identificar la seña. |
| **Ruido con la persona quieta** | El avatar realizaba movimientos erráticos aunque no hubiera un movimiento intencional frente a la cámara. | Se aplicó estabilización y se fijaron torso y piernas en reposo en el avatar en vivo para evitar propagar el ruido a todo el cuerpo. |
| **Rotación rápida de articulaciones** | Al girar rápidamente la muñeca, la orientación de la mano podía perderse y la mano del avatar se deformaba. | Se revisaron orientaciones y continuidad en las animaciones; el seguimiento en vivo conserva dificultades con movimientos rápidos. |
| **Diferencias entre captura de estudio y webcam** | Cambios de ángulo, distancia, encuadre e iluminación producían confusiones entre acciones. | Se ajustó cómo se delimitan e identifican las señas. El reconocimiento necesita evaluación con condiciones y personas nuevas. |

MediaPipe entrega coordenadas de profundidad estimadas y landmarks mundiales; en estas pruebas esa información no bastó para reconstruir o distinguir con fiabilidad todos los movimientos. La limitación observada no equivale a que su API carezca de coordenada de profundidad. [Referencia de los resultados de Holistic](https://ai.google.dev/edge/api/mediapipe/python/mp/tasks/vision/HolisticLandmarkerResult).

**El caso de Perdón.** En la referencia utilizada, las manos se colocan juntas, una sobre la otra. Durante las pruebas fue necesario separarlas ligeramente para que el seguimiento conservara ambas y el reconocedor pudiera identificarlas. Es una adaptación para sortear una limitación técnica; su equivalencia lingüística necesita revisión con personas competentes en LSC.

**Restricción del cuerpo y la cabeza.** El torso y las piernas permanecen fijos en el avatar en vivo. Se buscó limitar la cabeza a girar a izquierda y derecha sobre su eje vertical. El código actual todavía permite inclinaciones limitadas además de ese giro; restringirla exclusivamente al eje vertical queda registrado en [Pendientes](PENDIENTES.md#estabilidad-y-restricción-de-la-cabeza).

### Problemas encontrados en los datos

Durante la revisión del material de referencia se observaron videos de baja resolución, incluidos clips de 480p, movimientos rápidos que aparecían borrosos y variaciones en la ejecución de una misma expresión entre participantes. Esto dificultó distinguir orientaciones de palma, dedos y transiciones.

La captura del dataset se realizó en condiciones controladas. Los resultados obtenidos con esas secuencias no se trasladaron directamente a una webcam con otro ángulo, distancia y condiciones de iluminación.

En el JSON de landmarks del dataset —referido durante el trabajo como `datos.json` o `data.json`— también se encontraron puntos ausentes o nulos, discontinuidades entre fotogramas e intercambios en la identificación de las manos. La aplicación directa de esos puntos al rig produjo, en la versión inicial, deformaciones de todo el cuerpo del avatar.

Para trabajar sobre estos problemas fue necesario:

1. **Normalizar los puntos y su correspondencia con el rig**, revisando qué mano representaba realmente cada grupo de landmarks.
2. **Tratar los datos faltantes y las discontinuidades**, evitando interpretar un punto ausente como una posición válida.
3. **Revisar la profundidad estimada y las referencias 2D**, que no permitían por sí solas un ajuste fiable al personaje 3D.
4. **Reconstruir y ajustar Hola en Blender con Wonder**, comprobando poses, palmas, muñecas y continuidad antes de extender el proceso a las otras expresiones.

Estos ajustes mejoraron la representación obtenida; no eliminan las limitaciones de la captura original ni garantizan el reconocimiento de todas las variantes de una seña.

### Limitaciones que permanecen

- El vocabulario es acotado y las animaciones todavía requieren revisión lingüística.
- Las señas que dependen de profundidad, contacto entre manos u oclusiones no se reconocen de forma fiable en todos los casos probados.
- La representación no incluye todos los componentes faciales y no manuales de LSC. Fijar partes del cuerpo reduce ruido, pero también limita los movimientos que se pueden representar.
- El acceso a la cámara depende de los permisos del navegador y de la disponibilidad del dispositivo.
- La suite Python conserva cinco fallos previos en comprobaciones estáticas de interfaz que esperan textos o estructuras anteriores.

Como alternativas de captura se propusieron cámaras de profundidad con LIPSense y sistemas de captura óptica con marcadores. **No se probaron en Daló**; sus posibilidades y la evaluación necesaria están en [Pendientes de captura 3D](PENDIENTES.md#alternativas-de-captura-3d-no-probadas).

Daló es un prototipo de apoyo y no sustituye a intérpretes profesionales.

## 8. Guía técnica

Esta parte reúne las instrucciones para mantener el proyecto, editar animaciones y trabajar con los datos. Abre únicamente el apartado que necesites.

<details>
<summary>Estructura del proyecto y archivos principales</summary>

| Ruta | Uso |
|---|---|
| `web/src/app/catalog.ts` | Catálogo inicial, URLs y disponibilidad de cada expresión. |
| `web/src/app/cordialidad.json` | Manifest de las otras 23 expresiones de cordialidad. |
| `web/src/app/servicios/` | Estado, seguimiento, carga de modelos y caché de animaciones. |
| `web/public/Animaciones/<id>.blend` | Una fuente editable final por expresión: 33 archivos. |
| `web/public/avatar/<id>.vrma` | Una animación final por expresión: 33 archivos. |
| `web/public/avatar/<id>.json` | Landmarks de referencia y reproducción alternativa: 33 archivos. |
| `web/public/avatar/miniaturas/<id>.webp` | Miniaturas usadas por la galería; no son capturas de inspección. |
| `web/public/avatar/avatar-sample-1.vrm` | Personaje original, entrada para corregir sus pesos. |
| `web/public/avatar/avatar-sample-1-codos.vrm` | Modelo con pesos corregidos, entrada para ajustar su superficie. |
| `web/public/avatar/avatar-sample-1-superficie-codos.vrm` | Modelo utilizado por la aplicación. |
| `tools/assets/avatar-pesos.blend` | Escena fuente con pesos corregidos, necesaria para ajustar la malla. |
| `tools/assets/avatar-superficie.blend` | Escena fuente de la malla final; `relax_hola_elbows.py` carga su objeto Body. |
| `tools/` | Recetas de autoría, conversión, exportación y comprobaciones. |
| `tools/reconocimiento/` | Inventario, extracción, características, evaluación y exportación del reconocedor. |
| `tests/` y `web/src/**/*.spec.ts` | Pruebas; `tests/fixtures/hola-volume.json` conserva la referencia geométrica de los codos. |
| `data/LSC-54/` | Dataset original local; las herramientas no deben modificarlo. |
| `data/reconocimiento/secuencias/` | Secuencias procesadas necesarias para entrenar sin repetir la extracción. |
| `data/reconocimiento/modelos/` | Holistic Landmarker utilizado por el extractor y sus pruebas. |
| `web/public/modelo-reconocimiento/` y `web/public/ort/` | Clasificador y runtime que carga la web. |

Los tres VRM cumplen funciones distintas en la creación del avatar. Los dos Blender de `tools/assets` son fuentes de la malla, mientras que los 33 Blender de `Animaciones` contienen las señas.

`PROPUESTA.md` conserva la propuesta del proyecto. Este README reúne la guía técnica del prototipo.

</details>

<details>
<summary>Autoría, exportación y comprobación de animaciones</summary>

El `.blend` es la fuente editable, el `.vrma` contiene la animación y el `.vrm` es el personaje. La web reproduce VRMA con prioridad sobre los landmarks JSON.

1. Identifica la expresión y observa su video original en `data/LSC-54/RawVideos/Videos Courtesy/<participante>/Cordialidad/<expresión>/<repetición>.avi`. No inventes una seña a partir de su nombre.
2. Abre el Blender final correspondiente. Conserva el rig humanoide, acción, rango, dedos y contactos; verifica izquierda y derecha anatómicas y el posible espejo del video.
3. Modifica las poses y distribuye la orientación de la palma entre brazo y antebrazo. Usa cuaterniones normalizados con signos continuos; evita saltos de IK y torsión excesiva de muñeca. Hornea constraints antes de exportar.
4. Guarda el editable final como `web/public/Animaciones/<id>.blend` y exporta VRM Animation a `web/public/avatar/<id>.vrma`. Las recetas desactivan las copias automáticas `.blend1`.
5. Integra `animacionUrl: 'avatar/<id>.vrma'` en el catálogo, sin `public/`. Recarga la página para descartar la caché de la versión anterior. Revisa reproducción, pausa, repetición, velocidad y fotogramas tanto en Comunicar como en Expresiones.
6. Comprueba palmas, dedos, contactos, codos y reposo desde frente y perfil sobre el modelo real. Registra cambios generales necesarios en esta guía; elimina las capturas al terminar.

Los VRMA deben contener `VRMC_vrm_animation` 1.0, canales válidos, tiempos crecientes y la cadena completa `hips → spine → chest` hasta brazos y dedos. Omitir antecesores estáticos produce acciones vacías en Blender. La conversión de pulgares VRM0 a VRM1 distingue Metacarpal, Proximal y Distal. El cargador web rota los modelos VRM0 según su orientación.

El personaje AvatarSample_1 es Sendagaya Shibu de VRoid; su metadata local indica CC0. La autorización de los datos derivados de LSC-54 y la validación lingüística deben revisarse antes de publicar las señas como material validado.

### Recetas y comprobaciones

Las recetas `author_<expresión>_blender.py` reconstruyen movimientos desde poses guiadas por referencia. No deben ejecutarse automáticamente sobre todos los editables: pueden sustituir retoques manuales. Para Gracias, la receta es `author_gracias_blender.py`.

Hola utiliza 79 fotogramas a 30 fps y toma el reposo de `ayuda.blend`, acción `Ayudar`, fotograma 1. Apoyar utiliza 65 fotogramas y Ayuda 75. Sus herramientas específicas de comprobación revisan continuidad, dedos y muñecas; cada uno tiene criterios propios. Esperar y Lo siento usan la receta compartida:

```powershell
$blender = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
& $blender --background web/public/Animaciones/perfecto.blend --python tools/author_esperar_losiento_blender.py -- --sign esperar
& $blender --background web/public/Animaciones/perfecto.blend --python tools/author_esperar_losiento_blender.py -- --sign losiento
```

Estas dos señas usan 91 fotogramas a 30 fps e importan los ayudantes de `author_perdon_blender.py`; ese archivo debe conservarse.

Para las otras 23 expresiones, `build_cordialidad.py` lee el manifest y omite los resultados completos existentes salvo `--overwrite`. `--only <id>` limita la generación. Utiliza `losiento.blend`, `prepare_cordialidad_blender.py`, `poses_cordialidad.py` y los ayudantes compartidos. La preparación adapta muñecas a IK y define palmas y dedos; sincroniza huesos con paso angular máximo de 14°, limita muñecas a 40° y conserva reposo inicial y final a 30 fps. No y Muchas gracias usan los primeros 60 fotogramas de referencia; sus JSON conservan la secuencia completa. Son candidatos técnicos que todavía requieren revisión de contactos y validación lingüística.

Bienvenido se genera en tres etapas. Los intermedios quedan en `build/animaciones`; solo la última etapa publica el resultado final:

```powershell
& $blender --background web/public/Animaciones/bienvenido.blend --python tools/author_bienvenido_blender.py
& $blender --background build/animaciones/bienvenido-base.blend --python tools/smooth_bienvenido_blender.py
& $blender --background build/animaciones/bienvenido-fluido.blend --python tools/fix_bienvenido_elbows.py -- --shoulder-safe
```

La corrección distribuye el giro axial y limita el desplazamiento del codo manteniendo muñecas y orientación de manos. Los controles `check_bienvenido_flow.py`, `check_bienvenido_elbows.py` y `check_bienvenido_shoulders.py` verifican aspectos distintos. La corrección de pesos y superficie del personaje se realiza aparte:

```powershell
& $blender --background web/public/Animaciones/bienvenido.blend --python tools/fix_avatar_elbow_weights.py
& $blender --background tools/assets/avatar-pesos.blend --python tools/fit_elbow_surface.py
```

La segunda etapa necesita la escena anterior al ajuste de superficie: no debe repetirse sobre `avatar-superficie.blend`. `relax_hola_elbows.py` utiliza la malla final para comprobar Hola. `export_hola_volume_fixture.py` exporta su referencia geométrica a `tests/fixtures/hola-volume.json`; `web/tools/verify-elbow-volume.ts` la compara con la deformación del renderer.

`verificar_vrma.py`, `suavizar_vrma.py`, los controles `check_*` y renderizadores permiten inspeccionar resultados. Los renderizadores son herramientas útiles aunque sus imágenes de salida sean desechables. `lsc54_to_vrma.py` es un conversor base desde landmarks: no reemplaza las correcciones de las animaciones finales. `extract_lsc54_avatar.py` conserva pose y manos en JSON, interpola datos faltantes y permite seleccionar expresiones con `--target id=Categoría/Expresión`; verifica los FPS contra el video original antes de usar `--fps-verificado`.

### Editar una seña con Muse o Blender

La skill reutilizable está en `skills/muse-dalo-animaciones/SKILL.md`. Puede darse al asistente esta instrucción, completando los campos:

```text
Edita [SEÑA] para Daló siguiendo skills/muse-dalo-animaciones/SKILL.md.
Identificador: [ID]. Archivo editable: [RUTA AL BLEND].
Referencia visual: [RUTA AL VIDEO]. Cambio solicitado: [DESCRIPCIÓN].
Conserva el rig y el contenido lingüístico salvo el ajuste indicado.
Guarda web/public/Animaciones/[ID].blend y exporta web/public/avatar/[ID].vrma.
Revisa anatomía y continuidad, e integra la URL del catálogo si tienes acceso.
Comprueba la reproducción en Daló e indica qué verificaciones quedan pendientes.
No declares validación lingüística sin revisión competente en LSC.
```

</details>

<details>
<summary>Miniaturas y comprobaciones de la galería</summary>

Las miniaturas se generan con el mismo modelo, luces y encuadre de la aplicación. Se aplica únicamente el primer instante de reposo de cada seña, se reinician los huesos secundarios y se estabilizan durante 240 pasos de física antes de capturar. La animación no avanza durante ese proceso: capturar la primera actualización provoca ropa y cabello deformados.

```powershell
# Desde la raíz, con Playwright instalado y accesible para Node:
node tools/generate_avatar_thumbnails.cjs
# Después de compilar la web:
node tools/check_expression_previews.cjs
```

Las herramientas usan rutas de archivos locales mediante Playwright, sin servidor externo. `CHROMIUM_PATH` permite indicar el ejecutable de Chromium; `NODE_PATH` puede apuntar a una instalación de Playwright. La comprobación revisa miniaturas, hover, caché, modal y controles de cámara. Sus capturas e informes son temporales.

</details>

<details>
<summary>Preparación de datos y entrenamiento del reconocedor</summary>

Las herramientas de `tools/reconocimiento` cubren estas etapas:

- `inventario.py`: localiza videos, participantes y repeticiones.
- `extraer.py`: reprocesa cada video con Holistic, usando sesión independiente por video para admitir distintas resoluciones; guarda `.npz`.
- `caracteristicas.py`: define normalización y características compartidas con la web.
- `entrenar.py`: evaluación LOSO con espejo, variación de velocidad y oclusión.
- `exportar_modelo.py`: entrena con todos los clips y exporta ONNX más metadatos para la web; no sustituye la evaluación independiente.
- `generar_fixture_paridad.py`: referencia para comprobar Python frente a TypeScript.
- `evaluar_dtw.py`: comparación de referencia del reconocedor, cubierta por pruebas.
- `muestra_visual.py`: inspección opcional del seguimiento; sus imágenes se eliminan tras revisarlas.

Se conserva un único inventario amplio como `data/reconocimiento/inventario.json` y el índice de secuencias procesadas. Los informes y logs de ejecución son regenerables.

```powershell
.venv/Scripts/python.exe tools/reconocimiento/inventario.py `
  --raiz 'data/LSC-54/RawVideos/Videos Courtesy' `
  --salida data/reconocimiento/inventario.json `
  --senas chao,perfecto,hola,gracias,esperar,losiento,bienvenido,perdon,ayudar,apoyar
.venv/Scripts/python.exe tools/reconocimiento/extraer.py `
  --raiz 'data/LSC-54/RawVideos/Videos Courtesy' `
  --inventario data/reconocimiento/inventario.json `
  --modelo data/reconocimiento/modelos/holistic_landmarker.task `
  --salida-dir data/reconocimiento/secuencias `
  --senas chao,perfecto,hola,gracias,esperar,losiento,bienvenido,perdon,ayudar,apoyar
.venv/Scripts/python.exe tools/reconocimiento/entrenar.py `
  --secuencias-dir data/reconocimiento/secuencias `
  --salida data/inspection/evaluacion-reconocimiento.json
.venv/Scripts/python.exe tools/reconocimiento/exportar_modelo.py `
  --secuencias-dir data/reconocimiento/secuencias `
  --salida-dir web/public/modelo-reconocimiento
```

`inspect_lsc54.py` y `landmark_viewer.html` permiten explorar el dataset sin cargar todo el JSON: el límite inicial es 32 MiB y puede ampliarse con `--max-mib`. Los datos faltantes se conservan. No modifica el dataset ni valida las señas.

</details>

<details>
<summary>Archivos temporales y mantenimiento</summary>

`data/inspection`, `web/tmp`, `web/.angular/cache`, `web/dist`, `build`, `__pycache__` y las capturas de reconocimiento son salidas regenerables. Las herramientas recrean sus carpetas cuando las necesitan. No conservar capturas, logs, `.blend1`, experimentos debug ni copias por cada corrección. Public contiene únicamente los archivos finales que necesita la aplicación y sus editables; las fuentes de la malla se guardan en `tools/assets`.

Conservar código, pruebas, fixtures, fuentes de animación y modelo, datos de entrenamiento y dependencias necesarias. No publicar credenciales, grabaciones privadas o datasets. El vocabulario necesita revisión con personas competentes en LSC, preferentemente personas sordas usuarias; Daló no sustituye a intérpretes ni ofrece traducción universal.

</details>

## 9. Pendientes de validación

Los escenarios de uso propuestos, las posibles integraciones futuras y las cifras históricas que necesitan evidencia reproducible están en [PENDIENTES.md](PENDIENTES.md). Se mantienen separadas de las funciones implementadas del prototipo.

## 10. Fuentes y atribuciones

### LSC-54: autores y datos de referencia

Reconocemos el trabajo de **Juan E. Mora-Zarate, Claudia L. Garzón-Castro y Jorge A. Castellanos-Rivillas**, de la **Universidad de La Sabana**, autores de *LSC-54: A landmark-based dataset for colombian sign language*. Sus videos y datos de movimiento sirven de referencia para preparar las animaciones y entrenar el reconocedor de Daló.

- [Artículo original y autoría](https://pmc.ncbi.nlm.nih.gov/articles/PMC12557509/).
- [Dataset original en Science Data Bank — DOI 10.57760/sciencedb.25639](https://doi.org/10.57760/sciencedb.25639).
- [SignCapture: repositorio de la herramienta de captura citada por los autores](https://github.com/juanesmz/SignCapture).

El dataset y sus grabaciones son recursos de sus autores; la preparación y adaptación realizadas para Daló no transfieren su autoría al proyecto. Los permisos de redistribución de datos derivados deben revisarse por separado.

### Avatar: VRoid Project / pixiv

El personaje base es **Sendagaya Shibu / β Ver AvatarSample_1**, publicado por **VRoid Project (pixiv)**. Daló adapta su malla y sus pesos para la reproducción de señas y crea las animaciones sobre ese personaje.

- [Personaje original en VRoid Hub](https://hub.vroid.com/en/characters/675572020956181239).
- [Perfil del creador: VRoid Project](https://hub.vroid.com/en/users/36144806).
- [Copia del archivo base utilizada: Sendagaya_Shibu.vrm en madjin/vrm-samples](https://github.com/madjin/vrm-samples/blob/master/vroid/beta/Sendagaya_Shibu.vrm).

La metadata del archivo original utilizado declara **CC0**. `madjin/vrm-samples` distribuye una copia; el crédito de creación corresponde a VRoid Project / pixiv.

### Modelos y herramientas

| Recurso | Aporte a Daló |
|---|---|
| [Muse Spark 1.3 Contributor, Meta](https://dev.meta.ai/docs/models) | Generación de código, implementación iterativa y generación de las demás animaciones a partir del proceso probado. |
| [Muse Wonder, Meta](https://dev.meta.ai/models/muse-wonder) | Adaptación del avatar y primera animación, establecimiento del proceso repetible y creación y ajuste del reconocedor, sus pesos y clases. |
| [MediaPipe](https://github.com/google-ai-edge/mediapipe) | Detección de puntos del cuerpo y las manos. |
| [ONNX Runtime](https://github.com/microsoft/onnxruntime) | Ejecución del clasificador en el navegador. |
| [Three.js](https://github.com/mrdoob/three.js) y [three-vrm](https://github.com/pixiv/three-vrm) | Visualización del avatar y reproducción de animaciones VRM. |
| [Blender](https://www.blender.org/) y [VRM Add-on for Blender](https://github.com/saturday06/VRM-Addon-for-Blender) | Edición y exportación del personaje y sus animaciones. |

El trabajo de Daló incluye la interfaz, integración del catálogo, herramientas de autoría y comprobación, adaptación de las animaciones, preparación del reconocedor y optimización de las vistas 3D.

La [propuesta inicial](PROPUESTA.md) conserva el planteamiento histórico del proyecto; no es un registro de funciones terminadas. El estado implementado se describe en este README, y las ideas pendientes se reúnen en [PENDIENTES.md](PENDIENTES.md).
