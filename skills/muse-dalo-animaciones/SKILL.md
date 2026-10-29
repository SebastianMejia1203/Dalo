---
name: muse-dalo-animaciones
description: Crear o corregir animaciones de señas para Daló en Blender a partir de un archivo blend y una referencia visual, exportar VRMA e integrarlo en el catálogo local. Usar como instrucciones para Muse o un asistente con acceso a Blender y al proyecto.
---

# Animaciones de Blender para Daló

Trabaja sobre el proyecto `F:\Proyectos\Dalo`. El resultado es un `.blend`
editable y una animación `.vrma` reproducible sobre el avatar de Daló.
La referencia del proceso terminado es Hola. El archivo de Blender por sí solo
no se reproduce en la web: hace falta exportar VRM Animation e integrar su URL.

## Entradas y alcance

Identifica la seña, el identificador del catálogo, el `.blend` de partida y el
video de referencia. Lee las instrucciones locales aplicables. Si falta la
referencia visual, solicita su ubicación: no inventes la seña por su nombre.
Si la tarea consiste solo en retocar una animación existente, conserva su
contenido lingüístico y modifica lo solicitado.

Abre `web/public/Animaciones/hola.blend` como ejemplo editable del rig y del
resultado. Para reconstruir Hola desde cero, utiliza una copia de
`web/public/Animaciones/hola.blend` con la receta
`tools/author_hola_blender.py`; ejecutarla reemplaza los resultados actuales
de Hola, no es un generador genérico para otras señas.

Para otras señas guarda una copia como `web/public/Animaciones/<id>.blend`.
Conserva el avatar original `web/public/avatar/avatar-sample-1.vrm`, el dataset
y los archivos de partida. Usa el control de versiones para conservar cambios; no acumules copias históricas en public.
El alcance normal termina en el proyecto local; publicar o desplegar requiere
una petición del usuario.

## Inspección y autoría en Blender

- Comprueba la escena real, el armature activo, su acción, rango de fotogramas
  y correspondencia humanoide VRM. En Hola el objeto es `Armature`, con huesos
  `J_Bip_R_*` y `J_Bip_L_*`. No supongas estos nombres para otro rig.
- Comprueba que el complemento VRM está disponible y soporta la exportación
  de VRM Animation. En esta instalación la receta utiliza
  `bl_ext.blender_org.vrm` y `bpy.ops.export_scene.vrma`. Si falta, informa del
  requisito; cambiar la extensión de un archivo no crea un VRMA.
- Observa el video por fases: reposo, preparación, articulación principal y
  regreso. Identifica mano dominante, lugar, trayectoria, orientación de palma,
  configuración de dedos y contactos. Usa izquierda/derecha anatómicas del
  personaje; confirma el posible espejo del video.
- Mantén las proporciones del rig. Los landmarks 2D o su profundidad estimada
  no son coordenadas 3D globales fiables. En `hola.json` el grupo llamado
  `manoIzquierda` coincide con la muñeca derecha pose[16]: verifica la anatomía,
  no copies esa etiqueta como verdad.
- Crea poses clave estables de hombro, brazo, antebrazo, muñeca y dedos.
  Puedes usar IK para colocar las poses. Evita resolver IK ambiguo por fotograma
  cerca del hombro, donde puede saltar el plano del codo. Interpola rotaciones
  locales con cuaterniones normalizados y signos continuos, y hornea el resultado.
- Distribuye la orientación de la palma entre brazo y antebrazo; no fuerces
  todo el giro en la muñeca. Calibra la normal por lado con la anatomía del rig.
  No copies el signo de una mano a la otra. Revisa pulgar, dedos y palma desde
  delante y de perfil para detectar inversiones y penetraciones.
- Respeta el ritmo de la referencia y los ajustes pedidos. No añadas ondas,
  expresiones faciales o movimientos de la mano no dominante sin evidencia.
  No generalices la mano izquierda inmóvil de Hola a señas de dos manos.

La receta de Hola usa 79 fotogramas a 30 fps: 2,6 segundos entre primera y última
clave. Sus poses principales están en 1, 7, 30, 34, 40, 45, 73 y 79. Son datos
del ejemplo, no una duración ni unas poses obligatorias para todas las señas.

## Exportación y entrega

1. Guarda la copia editable con acción activa, claves visibles, rango correcto
   y el rig seleccionado. No renombres huesos ni rompas el mapeo VRM humanoide.
2. Exporta **VRM Animation** a `web/public/avatar/<id>.vrma`, con el armature
   correcto y el rango animado completo. Si hay constraints o controladores,
   asegúrate de que la exportación contiene el movimiento evaluado.
3. Comprueba que el VRMA tiene la extensión `VRMC_vrm_animation` versión 1.0,
   canales no vacíos y tiempos crecientes. Los nodos de brazos y dedos deben
   ser alcanzables desde las caderas a través de sus antecesores estáticos:
   omitir `hips → spine → chest` produjo acciones vacías al importar.
4. En `web/src/app/catalog.ts`, actualiza la entrada correspondiente con
   `animacionUrl: 'avatar/<id>.vrma'`. Las URLs son relativas a `web/public`,
   sin el prefijo `public/`. Conserva los demás metadatos y su estado de
   validación; `animacionUrl` tiene prioridad sobre `avatarUrl`.
5. Abre Daló localmente y prueba Español → Señas, la expresión, reproducción,
   pausa, repetición, velocidad y desplazamiento por fotogramas. Recarga la
   página tras reemplazar un VRMA: el servicio conserva animaciones por URL.
   Comprueba que se carga el VRMA y no solo el JSON de landmarks.
6. Revisa preparación, palma, dedos, codo y regreso sobre el avatar real.
   Registra origen y verificaciones relevantes en el README general. Las capturas
   e informes de `data/inspection` son temporales y se eliminan al terminar.

Para Hola ejecuta dentro de Blender `tools/check_hola_anatomy.py`: revisa la
palma al frente, flexión de muñeca <32°, cambio mundial por fotograma <20° y
giro axial relativo <45°. Estos umbrales y el fotograma central corresponden
a Hola; adapta el control para otra seña. No garantizan naturalidad ni validez
lingüística. Si se cambia el avatar, revisa de nuevo proporciones y contactos.

Con acceso a terminal, ejecuta `python -m unittest discover -s tests -v` desde
la raíz y `npm run build` desde `web`. Un build o una prueba geométrica no
sustituye la revisión visual. No declares validación lingüística sin revisión
por una persona competente en LSC.

Si Muse solo tiene acceso a Blender, termina el `.blend` y el `.vrma` y entrega
la ruta y el cambio exacto pendiente del catálogo para que el asistente del
repositorio complete la integración. No afirmes que está listo en Daló hasta
comprobar su reproducción allí. Informa con precisión de lo verificado y de
lo pendiente.

Para invocar este flujo en Muse, usa el texto de
[la guía general](../../README.md#editar-una-seña-con-muse-o-blender).
