# Dalo: comunicación básica entre LSC y español

**Propuesta para el Meta Global AI Developer Hackathon**  
**Fecha:** 26 de octubre de 2026  
**Modalidad:** desarrollo individual  
**Estado:** propuesta inicial; decisiones técnicas sujetas a pruebas y disponibilidad de datos.

## 1. Resumen

Dalo será una aplicación de escritorio para facilitar intercambios básicos entre personas sordas usuarias de Lengua de Señas Colombiana (LSC) y personas oyentes que se comunican en español.

El prototipo permitirá escribir o dictar una expresión en español y reproducir su representación mediante un video validado en LSC. En la dirección contraria, permitirá grabar una expresión breve frente a una cámara e intentará reconocerla dentro de un vocabulario limitado, mostrando su significado en español y ofreciendo reproducción por voz.

La aplicación solicitará confirmación o permitirá repetir cuando el resultado sea ambiguo. Su propósito será demostrar la viabilidad de una interacción bidireccional en un dominio acotado y evaluar sus limitaciones con usuarios.

## 2. Problema y contexto de uso

Los intercambios cotidianos entre personas que utilizan LSC y personas que no conocen esta lengua pueden presentar barreras de comunicación.

La primera versión se enfocará en un punto de atención al cliente: saludar, agradecer, solicitar ayuda, pedir que se repita una expresión y despedirse. Este contexto permitirá construir una demostración concreta y evaluar si ambas personas consiguen comunicar una intención básica.

La definición del vocabulario y la evaluación deberán contar con una persona competente en LSC y, preferentemente, con participación de personas sordas usuarias de la lengua.

## 3. Objetivos

### Objetivo general

Desarrollar y evaluar un prototipo de escritorio que facilite la comunicación básica entre LSC y español mediante un catálogo de expresiones verificadas y reconocimiento visual de vocabulario limitado.

### Objetivos específicos

- Relacionar distintas formulaciones en español con expresiones disponibles en el catálogo.
- Reproducir videos completos y validados en LSC para las expresiones compatibles.
- Reconocer un conjunto inicial de expresiones grabadas con una cámara convencional.
- Incorporar entrada de voz y reproducción de resultados en español.
- Manejar expresiones desconocidas y resultados ambiguos mediante rechazo, repetición o confirmación.
- Evaluar precisión, falsas aceptaciones, latencia y utilidad del prototipo.

## 4. Alcance del hackatón

| Componente | Alcance propuesto |
| --- | --- |
| Español a LSC | Entre 15 y 20 expresiones mediante videos completos, si se consiguen los permisos y la validación necesarios. |
| LSC a español | Comenzar con 5 expresiones y ampliar a 8 únicamente si las pruebas lo permiten. |
| Captura de señas | Grabaciones breves iniciadas y terminadas por el usuario. |
| Entrada en español | Texto y voz. |
| Salida en español | Texto y voz opcional, después de confirmar el resultado. |
| Plataforma | Aplicación de escritorio; Windows como primer entorno de validación. |
| Contexto | Intercambios básicos en un punto de atención. |

Las cantidades son metas condicionadas a los datos disponibles. La aplicación mostrará por separado qué expresiones puede reproducir y cuáles puede reconocer.

### Fuera del alcance inicial

- Traducción universal de LSC.
- Reconocimiento de conversaciones continuas sin pausas.
- Traducción libre de cualquier oración en español.
- Generación automática de señas mediante avatares o videos sintéticos.
- Construcción de frases concatenando videos de palabras españolas.
- Sustitución de intérpretes profesionales.

La ampliación a entre 20 y 30 expresiones en ambas direcciones se considerará una fase posterior.

## 5. Experiencia de uso

### Español a LSC

1. La persona escribe o dicta una expresión.
2. El sistema identifica si corresponde a una intención del catálogo.
3. La interfaz muestra la intención interpretada y permite confirmarla.
4. La aplicación reproduce el video completo de la expresión validada en LSC.
5. Si no existe una correspondencia adecuada, informa la limitación y muestra las opciones disponibles.

Ejemplo: distintas maneras de pedir que alguien repita pueden asociarse a una misma expresión validada del catálogo. Esta asociación no implica traducir libremente la gramática del español a LSC.

### LSC a español

1. La persona activa la cámara y consulta las indicaciones visuales de encuadre.
2. Pulsa «Grabar seña», realiza una expresión y termina la captura.
3. El sistema analiza la secuencia y propone un resultado o solicita repetir.
4. La persona confirma o descarta la propuesta.
5. El resultado confirmado se muestra en español y puede reproducirse mediante voz.

Los estados de grabación, análisis y error deberán ser visibles sin depender de señales sonoras. La interfaz priorizará controles grandes, contraste suficiente, navegación por teclado y mensajes breves.

## 6. Vocabulario inicial

Se propone explorar estas intenciones:

- Saludar.
- Agradecer.
- Pedir ayuda.
- Pedir que se repita.
- Despedirse.

La selección definitiva dependerá de la disponibilidad de ejemplos utilizables, las diferencias visuales entre categorías y la validación lingüística. Cada intención deberá vincularse a una expresión concreta en LSC; no se asumirá una equivalencia palabra por palabra.

Cada entrada del catálogo deberá registrar:

- Identificador estable.
- Significado o intención en español.
- Formulaciones compatibles en español.
- Video de referencia y video autorizado para reproducción, cuando corresponda.
- Fuente, licencia y atribución requerida.
- Persona o procedimiento de validación.
- Variantes y limitaciones conocidas.
- Disponibilidad para reproducción y para reconocimiento.

## 7. Arquitectura propuesta

### Flujo español a LSC

```text
Texto o micrófono
    → transcripción, cuando corresponda
    → identificación de intención con Meta
    → validación del identificador contra el catálogo
    → confirmación del usuario
    → reproducción de video validado
```

### Flujo LSC a español

```text
Cámara
    → captura de una expresión breve
    → extracción de puntos con MediaPipe
    → análisis temporal y clasificación
    → aceptación, confirmación o solicitud de repetición
    → texto y voz opcional
```

La detección de puntos y el clasificador visual se ejecutarán localmente en la arquitectura inicial. Los servicios de Meta se utilizarán para las tareas de lenguaje y voz previstas. La interfaz deberá explicar cuándo se envía contenido a un servicio externo.

## 8. Uso de modelos de Meta

### Muse Voice Transcribe

Se propone utilizarlo para convertir la voz de entrada en texto. La calidad para español y las condiciones reales de uso se comprobarán durante la integración.

### Muse Spark

Se utilizará para relacionar formulaciones cotidianas en español con las intenciones permitidas. Su respuesta deberá limitarse a un identificador del catálogo, una solicitud de aclaración o un resultado de «fuera de vocabulario».

La aplicación validará la respuesta antes de reproducir contenido. El modelo no generará instrucciones de LSC ni inventará videos o expresiones.

### Experimento opcional con video

Se podrá comparar el reconocimiento directo de clips mediante Muse Spark con el clasificador local. La capacidad de recibir video no demuestra por sí misma competencia en LSC. Este experimento tendrá un presupuesto limitado y no sustituirá la evaluación con ejemplos independientes.

No se incorporarán modelos adicionales de Meta únicamente para aumentar su cantidad: cada integración deberá resolver una necesidad del producto.

## 9. Herramientas y recursos existentes

| Recurso | Uso potencial | Verificación pendiente |
| --- | --- | --- |
| MediaPipe | Extraer puntos de manos, postura y rostro. | Compatibilidad de versiones, estabilidad y rendimiento en el equipo. |
| LSC-54 | Explorar un conjunto de 54 categorías con secuencias de puntos y 22 participantes. | Acceso, licencia de los datos, vocabulario útil y correspondencia con la captura propia. |
| LSC50 | Explorar 50 señas con videos y puntos corporales de cinco participantes. | Licencias de cada recurso y generalización desde sus condiciones de captura. |
| SignCapture | Referencia para captura y procesamiento de ejemplos. | Licencia antes de reutilizar código o recursos. |
| INSOR Educativo | Consultar vocabulario y variaciones de LSC. | Permisos para incorporar o redistribuir videos concretos. |

MediaPipe detecta posiciones corporales; no proporciona por sí solo un traductor de LSC. Tampoco se asumirá que modelos entrenados para otras lenguas de señas reconocen LSC.

La licencia de un artículo no necesariamente es la misma que la de sus datos, código o videos. Cada recurso se revisará por separado antes de incorporarlo al proyecto público.

## 10. Estrategia de reconocimiento

1. Seleccionar cinco categorías con ejemplos utilizables.
2. Separar participantes entre entrenamiento, validación y prueba antes de realizar aumentos de datos.
3. Extraer secuencias de puntos con una configuración reproducible.
4. Normalizar posición y escala conservando las relaciones espaciales relevantes entre manos, cuerpo y rostro.
5. Construir una primera referencia con comparación temporal de secuencias, como Dynamic Time Warping (DTW).
6. Evaluar una red temporal pequeña, como una GRU, únicamente si los datos y resultados justifican la complejidad adicional.
7. Ajustar criterios de aceptación y rechazo con el conjunto de validación.
8. Probar con personas y grabaciones nuevas antes de ampliar el vocabulario.

Se incluirán ejemplos de reposo, movimientos ajenos al vocabulario y expresiones desconocidas. Un clasificador limitado a categorías conocidas puede asignarles incorrectamente cualquier movimiento.

Los puntajes del modelo no se presentarán como probabilidades de acierto sin una calibración que lo justifique. La aplicación priorizará solicitar repetición frente a emitir resultados dudosos.

## 11. Tecnologías propuestas

| Componente | Opción inicial |
| --- | --- |
| Lenguaje principal | Python. |
| Interfaz de escritorio | PySide6. |
| Captura y manejo de video | OpenCV. |
| Puntos de manos, postura y rostro | MediaPipe. |
| Clasificación inicial | Comparación temporal de secuencias. |
| Entrenamiento, si es necesario | PyTorch y una red temporal pequeña. |
| Lenguaje y voz de entrada | Meta Model API. |
| Voz de salida | Motor del sistema operativo, sujeto a comprobar disponibilidad de español. |
| Catálogo | Archivos JSON y videos locales autorizados. |

Esta selección busca reducir la cantidad de tecnologías que debe mantener una sola persona. Las versiones se fijarán después de verificar su compatibilidad. No se requiere una base de datos ni infraestructura de GPU para comenzar la primera prueba.

Las credenciales de Meta se cargarán desde configuración local excluida del repositorio. La distribución pública no incluirá claves del desarrollador.

## 12. Cronograma

El cronograma distingue la planificación del 26 de octubre del periodo de construcción indicado en la guía: del 27 de octubre al 4 de noviembre de 2026.

| Fecha | Actividades | Resultado verificable |
| --- | --- | --- |
| 26 oct. | Revisar reglas, recursos, licencias y opciones de validación. | Propuesta y lista de decisiones pendientes. |
| 27 oct. | Elegir cinco expresiones, comprobar datos, configurar cámara y acceso a Meta. | Captura funcional, muestra de datos y primera llamada a la API. |
| 28 oct. | Implementar extracción de puntos y primer clasificador. | Reconocimiento experimental de clips. |
| 29 oct. | Evaluar con participantes separados y revisar falsas aceptaciones. | Informe inicial y decisión de mantener o reducir el vocabulario. |
| 30 oct. | Implementar español a intención y reproducción de videos. | Primer flujo completo de español a LSC. |
| 31 oct. | Integrar cámara, clasificación y confirmación. | Primer flujo completo de LSC a español. |
| 1 nov. | Integrar voz y manejo de errores. | Interacción bidireccional con entrada y salida por voz. |
| 2 nov. | Validar con personas competentes en LSC y probar conversaciones. | Hallazgos lingüísticos, de usabilidad y de precisión. |
| 3 nov. | Corregir, documentar, empaquetar y grabar la demo. | Versión candidata y video de tres minutos. |
| 4 nov. | Verificar acceso público, instalación y entrega. | Proyecto presentado antes de las 9:00 p. m., hora de Colombia. |

Se buscará apoyo de validación desde el inicio. La ampliación de vocabulario tendrá menor prioridad que corregir expresiones, errores y problemas de uso.

## 13. Evaluación y criterios de avance

### Métricas

- Aciertos y errores por expresión.
- Matriz de confusión entre categorías.
- Tasa de aceptación incorrecta de movimientos o expresiones desconocidas.
- Proporción de intentos que el sistema rechaza o solicita repetir.
- Latencia desde el final de la grabación hasta el resultado.
- Resultados con personas que no aparecen en entrenamiento.
- Comprensión de los videos y utilidad percibida por usuarios de LSC.
- Identificación correcta de intenciones en español y rechazo de solicitudes fuera del catálogo.

Se reportarán el número de participantes, intentos y condiciones de prueba. No se presentará una cifra global de precisión sin explicar cómo se obtuvo.

### Decisiones de avance

- Ampliar de cinco a ocho expresiones solamente si las primeras funcionan con ejemplos independientes y un nivel de falsas aceptaciones adecuado para la demostración.
- Reducir o retirar categorías que presenten confusiones persistentes.
- Mantener visibles las limitaciones si la validación con nuevos usuarios es insuficiente.
- Definir los umbrales cuantitativos después de la primera evaluación, sin presentarlos como resultados alcanzados.

## 14. Presupuesto

Se dispone de **USD 150 en créditos de Meta Model API**, según lo indicado por el participante.

- Limitar la primera ronda de experimentos a USD 15–20.
- Medir consumo y costo real por interacción antes de ampliar las pruebas.
- Conservar el saldo para integración, evaluación y demostración.
- Implementar límites de solicitudes y revisar los avisos de facturación; una notificación de gasto no debe asumirse como un corte automático.

Los créditos no se asumirán como presupuesto disponible para intérpretes, grabaciones, equipos o entrenamiento externo.

Para contenido de participantes se propone el modo estándar. La documentación de Meta distingue este modo de Contributor, que permite utilizar contenido para entrenamiento de modelos. La configuración y las condiciones vigentes se revisarán antes de enviar grabaciones.

## 15. Riesgos y respuesta

| Riesgo | Respuesta prevista |
| --- | --- |
| Datos insuficientes o sin permisos adecuados. | Reducir vocabulario y obtener ejemplos propios autorizados. |
| Buen resultado en entrenamiento y mal desempeño con personas nuevas. | Separar participantes y probar capturas independientes desde el principio. |
| Interpretación lingüística incorrecta. | Validar catálogo y videos antes de presentarlos como correctos. |
| Confusión entre categorías o movimientos desconocidos. | Incluir negativos, ajustar rechazo y solicitar confirmación. |
| Fallos de cámara, iluminación u oclusión de manos. | Mostrar indicaciones de encuadre y permitir repetir. |
| Dependencia de conectividad para Meta. | Informar el fallo y conservar acceso al catálogo local de expresiones. |
| Alcance excesivo para un desarrollador. | Priorizar cinco expresiones y los dos flujos completos. |
| Retrasos de empaquetado o entrega. | Preparar la versión candidata y la demo el 3 de noviembre. |

La captura, el entrenamiento y la publicación de grabaciones tendrán autorizaciones diferenciadas. No se publicarán videos de participantes por el solo hecho de haber autorizado su uso en pruebas.

## 16. Entregables del hackatón

- Repositorio público con el código desarrollado durante el evento.
- README con instalación, configuración, ejecución y limitaciones.
- Registro de dependencias, fuentes, licencias y atribuciones.
- Catálogo con vocabulario disponible en cada dirección y estado de validación.
- Aplicación ejecutable o procedimiento reproducible para iniciarla.
- Informe breve de evaluación y condiciones de prueba.
- Video público de demostración de tres minutos.
- Descripción explícita del uso de Meta y de las contribuciones originales.

### Guion sugerido para la demo

| Tiempo | Contenido |
| --- | --- |
| 0:00–0:25 | Problema, usuarios y escenario. |
| 0:25–1:10 | Entrada en español por voz o texto y reproducción de LSC. |
| 1:10–1:55 | Expresión por cámara, propuesta en español y confirmación. |
| 1:55–2:20 | Manejo de una expresión desconocida o ambigua. |
| 2:20–2:45 | Arquitectura, uso de Meta y resultados de evaluación. |
| 2:45–3:00 | Limitaciones y siguiente etapa. |

La demostración distinguirá claramente las funciones nuevas de las herramientas, modelos y datos externos utilizados.

## 17. Primer hito técnico

El primer hito será una prueba de cinco expresiones por cámara, antes de invertir esfuerzo en una interfaz elaborada.

Debe permitir capturar una expresión, extraer sus puntos corporales, compararla con ejemplos conocidos y mostrar un resultado o rechazo. La evaluación con personas separadas del entrenamiento determinará si conviene ampliar el vocabulario o mejorar los datos.

## 18. Referencias

- [Evento y fechas públicas](https://cerebralvalley.ai/e/meta-ai-developer-hackathon).
- [Guía de participantes](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details?backUrl=%2Fe%2Fmeta-ai-developer-hackathon). Las condiciones específicas de esta propuesta se basan en el texto compartido por el participante el 26 de octubre de 2026.
- [Meta Model API: documentación general](https://dev.meta.ai/docs/overview).
- [Meta: comprensión de audio y video](https://dev.meta.ai/docs/video-understanding).
- [Meta: precios y modalidades de uso](https://dev.meta.ai/docs/pricing-rate-limits).
- [MediaPipe Gesture Recognizer](https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer).
- [LSC-54: artículo y referencias al conjunto de datos](https://pmc.ncbi.nlm.nih.gov/articles/PMC12557509/).
- [LSC50: artículo y referencias al conjunto de datos](https://www.nature.com/articles/s41597-024-04172-5).
- [SignCapture](https://github.com/juanesmz/SignCapture).
- [INSOR Educativo: vocabulario cotidiano](https://educativo.insor.gov.co/catdiccionario/cotidiano/).

## 19. Decisiones pendientes

- Confirmar el stack según la experiencia del desarrollador.
- Revisar licencias y acceso efectivo a los recursos candidatos.
- Seleccionar las cinco expresiones iniciales a partir de los datos utilizables.
- Conseguir validación lingüística y participación de usuarios de LSC.
- Definir condiciones de captura y protocolo de evaluación.
- Comprobar modelos disponibles en la cuenta de Meta y consumo real.
- Revisar la rúbrica completa de evaluación, cuya tabla no estaba incluida en el texto compartido.
