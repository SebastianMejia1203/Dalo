# Daló: ideas pendientes

Este documento reúne escenarios propuestos y cifras históricas que no deben presentarse como capacidades verificadas del prototipo. La descripción de las funciones implementadas está en el [README](README.md).

## Uso junto a videollamadas

Daló puede utilizarse junto a una videollamada compartiendo su ventana o copiando resultados al chat, y de que su cámara y su salida de voz son compatibles con ese escenario.

Para evaluar esta idea hace falta:

- Elegir una plataforma de videollamada, navegador y sistema operativo concretos.
- Comprobar si ambas aplicaciones pueden acceder a la cámara al mismo tiempo.
- Comprobar qué recibe la otra persona al compartir la ventana: avatar, texto y, si corresponde, audio.
- Determinar cómo se transmite la voz de Daló; la reproducción local no demuestra que llegue a la llamada.
- Probar el flujo completo con dos participantes y registrar condiciones y limitaciones.

Hasta completar esas pruebas, el uso con videollamadas no se ofrece como una función verificada ni como una integración disponible.

## Integraciones posibles

La interpretación de intenciones en español mediante Meta Model API y un backend se planteó en la propuesta inicial. Es una idea pendiente de implementación y evaluación, no un compromiso de la versión actual. El uso ya realizado de Muse Spark 1.3 Contributor y Muse Wonder corresponde al desarrollo del proyecto.

## Resultados históricos del reconocedor

Se conservaron las siguientes cifras de la documentación anterior como referencia histórica. Los informes detallados de esas ejecuciones se retiraron durante la limpieza del proyecto. Antes de usarlas como evidencia en la presentación, hay que repetir la evaluación con el código actual y generar un informe reproducible que identifique datos, clases, separación por participante y versión del modelo.

La última evaluación documentada utilizó **377 clips** y separó participantes entre entrenamiento y evaluación mediante **LOSO**: en cada turno, una persona completa queda fuera del entrenamiento. El resultado global fue **95,8 %**.

<details>
<summary>Ver resultados por clase y condiciones de evaluación</summary>

| Clase | Recuperación |
|---|---|
| Chao | 92,7 % |
| Perfecto | 100 % |
| Hola | 92,5 % |
| Gracias | 96,2 % |
| Esperar | 96,3 % |
| Lo siento | 92,9 % |
| Bienvenido | 92,9 % |
| Perdón | 98,1 % |
| Otra | 98,8 % |

La GRU tiene 64 unidades y recibe secuencias de 48 fotogramas con 151 características v2. La separación por participante se realiza antes de aumentar los datos. Las características Python y TypeScript se comprueban con una tolerancia de paridad de 2e-4.

La web delimita segmentos por actividad y reposo de manos, exige una probabilidad mínima de 0,55 y estabilidad de dos análisis, y caduca las propuestas. `Otra` incluye Ayudar y Apoyar. Ayuda presenta dificultades por la oclusión al juntar las manos y todavía no se ofrece como reconocible.

Estos resultados corresponden a clips de estudio. La precisión con cámaras, iluminación y personas nuevas requiere evaluación independiente.

</details>

## Estabilidad y restricción de la cabeza

Se fijaron torso y piernas del avatar en vivo para evitar movimientos erráticos procedentes del seguimiento. La restricción buscada para la cabeza es permitir únicamente el giro a izquierda y derecha sobre su eje vertical.

En `web/src/app/avatar-vivo/avatar-vivo.ts`, `actualizarCabeza` todavía limita los tres ejes de rotación en lugar de conservar solo el giro vertical. Queda pendiente aplicar esa restricción y comprobar su estabilidad con la persona quieta, en movimiento y con pérdida temporal de landmarks. Este documento registra el pendiente; no se ha cambiado ese comportamiento al actualizar la documentación.

## Alternativas de captura 3D no probadas

### Cámaras de profundidad y LIPSense

Se propuso evaluar una cámara que mida profundidad junto con el software comercial **LIPSense** de LIPS Corporation, mencionado inicialmente como «LipSense». El fabricante presenta captura de pose 3D y seguimiento corporal mediante imágenes RGB y de profundidad. [Fuente oficial y demostraciones de LIPSense](https://www.lips-hci.com/lipsense-intelligent-sensing-solution).

Las demostraciones motivaron esta propuesta, pero no se probó el equipo ni el software en Daló. No se puede afirmar que produzca una grabación exacta de las señas o que resuelva las manos juntas y las rotaciones rápidas.

Una prueba tendría que comprobar precisión de dedos y muñecas, contactos entre manos, movimientos hacia la cámara, oclusiones, estabilidad en reposo y transferencia de los movimientos al rig. También habría que verificar la cámara compatible, el alcance de la licencia, los costos y la posibilidad de exportar los datos.

### Captura óptica con marcadores

Otra propuesta consiste en utilizar sistemas de captura de movimiento con cámaras y marcadores —los trajes con puntos empleados en cine— para producir referencias de animación más controladas.

Tampoco se probaron en el proyecto. Antes de adoptarlos habría que comprobar si la configuración registra dedos y contactos con suficiente detalle, además de brazos y cuerpo, y qué correcciones requiere al trasladar el movimiento al avatar.

Estas alternativas se plantean para mejorar la captura de referencias. Su posible uso no demuestra por sí mismo una mejora del reconocedor de webcam: esa mejora requeriría entrenamiento y evaluación independientes.

## Otros trabajos pendientes

- Revisar las expresiones y sus componentes no manuales con personas competentes en LSC y participación de personas sordas usuarias.
- Evaluar el reconocimiento con personas y cámaras externas a los datos de entrenamiento.
- Revisar permisos y atribuciones para redistribuir datos derivados y preparar una demo pública.

Estos puntos describen trabajo pendiente; no representan validaciones ya realizadas.
