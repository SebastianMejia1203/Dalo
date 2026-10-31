# Fuentes y atribuciones

### LSC-54: autores y datos de referencia

Reconocemos el trabajo de **Juan E. Mora-Zarate, Claudia L. Garzón-Castro y Jorge A. Castellanos-Rivillas**, de la **Universidad de La Sabana**, autores de _LSC-54: A landmark-based dataset for colombian sign language_. Sus videos y datos de movimiento sirven de referencia para preparar las animaciones y evaluar el reconocimiento de Daló.

- [Artículo original y autoría](https://pmc.ncbi.nlm.nih.gov/articles/PMC12557509/).
- [Dataset original en Science Data Bank — DOI 10.57760/sciencedb.25639](https://doi.org/10.57760/sciencedb.25639).
- [SignCapture: repositorio de la herramienta de captura citada por los autores](https://github.com/juanesmz/SignCapture).

El dataset y sus grabaciones son recursos de sus autores; la preparación y adaptación realizadas para Daló no transfieren su autoría al proyecto. Los permisos de redistribución de datos derivados deben revisarse por separado.

En el estado actual, LSC-54 se usa como referencia para descripciones visuales,
animaciones y evaluaciones de cordialidad. El catálogo contiene **33 expresiones
animadas** y **11 señas habilitadas para cámara**, incluida Muy bien. Las otras
22 definiciones del backend están deshabilitadas; números y colores todavía no
tienen contenido. Disponibilidad técnica no equivale a validación lingüística
ni a autorización de publicación.

Los datasets, las grabaciones y los resultados privados de evaluación no se
distribuyen con el código. Daló no está certificado por los autores de LSC-54;
consulta el [estado y las limitaciones](GUIA-TECNICA.md#estado-y-limitaciones).

### Avatar: VRoid Project / pixiv

El personaje base es **Sendagaya Shibu / β Ver AvatarSample_1**, publicado por **VRoid Project (pixiv)**. Daló adapta su malla y sus pesos para la reproducción de señas y crea las animaciones sobre ese personaje.

- [Personaje original en VRoid Hub](https://hub.vroid.com/en/characters/675572020956181239).
- [Perfil del creador: VRoid Project](https://hub.vroid.com/en/users/36144806).
- [Copia del archivo base utilizada: Sendagaya_Shibu.vrm en madjin/vrm-samples](https://github.com/madjin/vrm-samples/blob/master/vroid/beta/Sendagaya_Shibu.vrm).

La metadata del archivo original utilizado declara **CC0**. `madjin/vrm-samples` distribuye una copia; el crédito de creación corresponde a VRoid Project / pixiv.

### Modelos y herramientas

| Recurso                                                                                                             | Aporte a Daló                                                                        |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [Muse Spark 1.3 Contributor, Meta](https://dev.meta.ai/docs/models)                                                 | Reconocimiento remoto de señas en `web-meta/`, además del uso durante el desarrollo. |
| [Muse Voice Transcribe, Meta](https://dev.meta.ai/docs/models)                                                      | Dictado en español en `web-meta/`.                                                   |
| [Muse Wonder, Meta](https://dev.meta.ai/models/muse-wonder)                                                         | Apoyo durante el desarrollo y la autoría de las animaciones del avatar.              |
| [Three.js](https://github.com/mrdoob/three.js) y [three-vrm](https://github.com/pixiv/three-vrm)                    | Visualización del avatar y reproducción de animaciones VRM.                          |
| [Blender](https://www.blender.org/) y [VRM Add-on for Blender](https://github.com/saturday06/VRM-Addon-for-Blender) | Edición y exportación del personaje y sus animaciones.                               |

El trabajo de Daló incluye la interfaz, integración del catálogo, herramientas de autoría y comprobación, adaptación de las animaciones, integración del reconocimiento remoto y optimización de las vistas 3D.

Las descripciones del catálogo son hipótesis visuales provisionales. Los aciertos
o la confianza de un modelo no sustituyen la revisión con personas competentes
en LSC. Las animaciones y los permisos de publicación siguen pendientes de revisión.

El uso de APIs tampoco concede derechos sobre las grabaciones. Los avisos de
envío a Meta se mantienen en la interfaz: el video utiliza Muse Spark 1.3
Contributor y el dictado Muse Voice Transcribe. Contributor permite a Meta usar
el contenido enviado para entrenamiento; `store: false` no elimina esa condición.
