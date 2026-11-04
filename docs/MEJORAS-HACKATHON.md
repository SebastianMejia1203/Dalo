# Mejoras para darle más peso a Daló en el hackathon

Seguimiento de las ideas para destacar en el Meta Global AI Developer Hackathon 2026.
Estado: `[ ]` pendiente · `[~]` en curso · `[x]` hecho · `[-]` descartado/aplazado con motivo.

## Resumen

| # | Mejora | Estado | Impacto | Esfuerzo |
|---|--------|--------|---------|----------|
| 1 | Validación con personas competentes en LSC | [ ] Pendiente: no se consiguió quién la haga | Alto | Medio (gestión) |
| 2 | Evaluación independiente pequeña (amigos) | [~] Entorno listo, sin ejecutar | Alto | Bajo |
| 3 | Hacer visible el uso de Meta (pipeline y open-weight) | [x] Pipeline visual hecho; open-weight aplazado | Alto (25 % rúbrica) | Medio |
| 4 | Español libre → intención del catálogo con Spark | [x] Hecho y probado con la API real | Medio-alto | Bajo-medio |
| 5 | Completar un escenario/diálogo, no señas sueltas | [-] Vitrina de diálogo eliminada a petición; candidatas sin activar | Medio-alto | Medio |
| 6 | Video de demostración de 3 minutos | [ ] | Alto | Bajo |

Además: vista **Validación** (validación de señas, pruebas de intención por lote y sesiones de evaluación en SQLite) — hecha el 2 de noviembre, con base de datos el 3.

---

## 1. Validación con personas competentes en LSC

**Plan del autor:** publicar mañana en internet y pagar a dos personas para una sesión de 1 hora o menos.

**Opinión sobre los COP 20 000:** como pago único por persona para una sesión corta de un proyecto estudiantil/de hackathon es aceptable y está por encima del salario mínimo por hora en Colombia, pero la competencia en LSC es una habilidad especializada: un intérprete profesional cobra bastante más por hora. Recomendación:

- Ofrece COP 20 000 como "apoyo por tu tiempo" dejando claro que es un proyecto de hackathon sin financiación, o sube a COP 30 000–50 000 por persona si el presupuesto lo permite. Paga igual aunque sus observaciones sean críticas: pagas por su criterio, no por aprobación.
- No pidas validar las 33 animaciones en una hora; no cabe con calidad. Prioriza: las 11 señas reconocibles por cámara + Sí, No, Por favor y Ayuda (candidatas del punto 5).
- Estructura sugerida de la sesión (45–60 min, por videollamada con cámara):
  1. Contexto y consentimiento (5 min): qué es Daló, qué se graba y qué no, permiso para tomar notas; permiso aparte si quieres grabar.
  2. Revisión de animaciones (20 min): ¿la seña se entiende?, ¿qué está mal en manos, ubicación, trayectoria o expresión facial?, ¿variante regional?
  3. La persona hace las señas a cámara (20 min): ¿el reconocedor las entiende cuando las hace alguien competente, no imitando el avatar?
  4. Cierre (10 min): las 3 correcciones más importantes y si el concepto le parece útil.
- En la publicación pide: persona sorda usuaria de LSC o intérprete/persona competente, cámara y conexión, 1 hora. Deja claro el pago, la duración y que no es una oferta laboral.
- Anota nombre/rol solo con permiso ("validado con…"). Si nadie responde, documenta los intentos: también suma credibilidad.

**Estado (2 de noviembre): no se consiguió quién lo pruebe; queda pendiente.**
La vista Validación ya permite registrar el veredicto y las notas por seña en
cuanto haya validador/a, con exportación del registro en JSON.

Tareas:

- [ ] Publicar la convocatoria (internet/redes/comunidades).
- [ ] Acordar fecha, pago y consentimiento con dos personas.
- [x] Preparar la lista corta de señas a revisar (11 + 4 candidatas, en Validación).
- [ ] Realizar las sesiones y anotar hallazgos por seña.
- [ ] Corregir lo crítico y registrar qué quedó pendiente en el catálogo.

## 2. Evaluación independiente pequeña (amigos)

**Plan del autor:** pedir el favor a unos amigos. **Entorno: listo** (clave en `backend-meta/.env`, FFmpeg, Node 24 y dependencias verificados).

Protocolo completo y herramientas en [EVALUACION-AMIGOS.md](EVALUACION-AMIGOS.md):

- La app ya trae el modo de evaluación: en **Señas → Español → Detalles técnicos → Evaluación de reconocimiento** se elige la etiqueta esperada (no se envía a Meta), se captura y al final se descargan los ensayos en JSON.
- `tools/evaluacion-webcam/evaluar.py orden --participante P1` genera el orden aleatorio reproducible de señas por participante.
- `tools/evaluacion-webcam/evaluar.py reporte <ensayos.json>` genera el informe: aciertos por seña, matriz de confusión, rechazo de `otra`, errores con confianza alta y latencia.
- Importante: los amigos no saben LSC; imitarán el avatar. Esto mide robustez con personas y cámaras nuevas, **no** corrección lingüística. Eso es el punto 1.

Tareas:

- [ ] Reclutar 3–5 amigos con cámaras distintas (ideal: al menos un celular o portátil distinto al del desarrollo).
- [ ] Cada uno: 11 señas × 2 repeticiones + 3 acciones fuera de catálogo = 25 capturas (~15–20 min).
- [ ] Descargar el JSON de cada sesión sin cerrar la página.
- [ ] Generar el informe y guardarlo en `data/evaluacion-amigos/` (carpeta local, no se publica).
- [ ] Anotar aquí la cifra final con su contexto (n personas, n intentos) para usarla en la demo.

## 3. Uso visible de Meta, open-weight y SAM 3.1

**Situación del autor:** sin máquina para cargar un modelo open-weight grande; créditos de Modal solicitados y no aceptados. Dudas razonables: que Muse Spark Open iguale la minucia de Muse Spark 1.3 alojado leyendo video, y que SAM 3.1 ayude cuando el cuello de botella es que Spark ya confunde señas parecidas entre las 11 actuales.

Decisiones registradas:

- [-] **Open-weight auto-hospedado: aplazado.** Sin hardware ni créditos, y con riesgo real de bajar la calidad del reconocimiento, que es el núcleo de la demo. No bloquear el proyecto por el premio de open weights. Si aparece hardware (GPU prestada, créditos), se reevalúa con una prueba A/B pequeña sobre los mismos clips antes de adoptarlo.
- [-] **SAM 3.1 como paso previo: aplazado.** SAM segmenta personas/manos, pero no entrega esqueleto ni clasifica; el problema actual es discriminación semántica entre señas parecidas, no localización. Añadiría costo y latencia por captura sin atacar la causa de los errores. Solo tendría sentido como experimento medido (¿recortar a la persona reduce confusiones?), no como mejora asumida.
- [x] **Mejorar la visualización del pipeline (hecho, 2 de noviembre; ajustado el 3):** el componente `web-meta/src/app/pipeline/` muestra encima de los paneles, solo en Señas → Español, la tira de etapas con estado en vivo (pendiente/activa/hecha/error):
  `Cámara → Grabación 3 s → FFmpeg (MP4, 640 px, 12 fps) → Muse Spark 1.3 (contexto lsc-motion-v4-11) → Propuesta → Confirmación humana`.
  Tarjeta con el mismo estilo que los paneles (borde, radio 16, título «Cómo trabaja el reconocimiento»); en móvil la tira pasa a línea de tiempo vertical con conectores. Sin columna de estado a la derecha: solo una ficha debajo cuando hay algo que decir (en curso, error o última respuesta con Modelo/Latencia/Confianza), y nada en reposo. En Español → Señas no se muestra: sin llamada a modelo no aporta nada. El detalle (`motivo`, evidencia visual) sigue en Detalles técnicos.
- [x] Sección breve en la demo/README: qué es llamada a modelo Meta, qué es función del navegador y qué es procesamiento clásico (README principal y el propio pipeline).

## 4. Español libre → intención del catálogo (explicación)

Hoy, Español → Señas busca coincidencias de texto en el catálogo local (`web-meta/src/app/comunicador/comunicador.ts`): funciona si escribes "gracias" o una formulación registrada, pero falla o duda con frases naturales como "¿me podrías repetir, por favor?", "todo salió muy bien" o "perdona, ¿me esperas un momento?".

La mejora: enviar ese texto a Muse Spark (llamada barata, solo texto) con salida estructurada `{id, confianza}` validada contra los ids del catálogo, para que interprete la *intención* y la relacione con una expresión existente; si ninguna corresponde, responde "fuera de catálogo" en vez de forzar una. **No** es traducir español a gramática LSC ni generar señas nuevas: es un enrutador inteligente hacia el mismo catálogo cerrado, con la búsqueda local actual como respaldo si la API falla.

Por qué suma: iguala la inteligencia de ambas direcciones, es otro uso real y demostrable de Meta ("escribe cualquier frase natural y encuentra la expresión"), y se nota en segundos en la demo.

- [x] Endpoint de intención en el backend con Spark y esquema cerrado de ids.
  `POST /api/intent` (contexto `lsc-intent-v1`) en `backend-meta/src/modules/intent/`; valida el id contra las 33 definiciones y devuelve `id: null` fuera del catálogo. Detalle técnico: `max_tokens` debe ser 2000, porque el modelo gasta ~450 tokens en razonamiento y con 500 la respuesta llega vacía.
- [x] Respaldo a la búsqueda local ante error/timeout.
  La coincidencia exacta se resuelve en local sin llamar a Meta; el resto se interpreta tras una pausa de 700 ms al escribir (o al dictar), y si Meta falla se conserva el resultado local. Latencia real medida: 3–10 s por llamada.
- [x] Probar con 15–20 frases naturales, incluidas 4–5 fuera de catálogo.
  Banco de 16 frases precargado en Validación → Pruebas de intención (local vs Meta por frase). Verificación real del 2 de noviembre: «todo salió muy bien» → Muy bien; «quiero una pizza» → fuera; «perdona, ¿me esperas un momento?» → Esperar (descarta Perdón); «¿dónde queda el baño?» → Baño; «estoy muy mal» → Muy mal.

## 5. Frases y escenario completo (aclaración)

Hay dos ideas distintas y conviene no mezclarlas:

- **Reconocer una frase señada en un solo video** (varias señas seguidas → una frase en español): **no recomendado ahora.** La captura es de 3 s para una seña aislada; segmentar y ordenar varias señas exige otro diseño y Spark ya va justo con 11 clases aisladas.
- **Reproducir una frase como secuencia de animaciones** (el usuario escribe o elige "Hola" + "Gracias" y el avatar las encadena): viable con lo que ya existe, porque son animaciones ya creadas. Debe presentarse como *secuencia de expresiones aprendidas*, no como traducción de oraciones a LSC (la LSC no es español palabra por palabra).
- **Lo que proponía el punto 5 original:** activar señas que *completen un diálogo útil* en vez de ampliar al azar. Las candidatas Sí, No, Por favor y Ayuda ya tienen animación y definición creada (desactivadas). Con Hola + Sí/No + Por favor + Ayuda + Gracias + Chao se puede demostrar una conversación corta completa (p. ej., en una recepción). Cada candidata se activa solo si pasa la evaluación existente (>0,85 y revisión de confusiones), aprovechando el punto 2.

Tareas:

- [ ] Evaluar Sí, No, Por favor y Ayuda como candidatas (protocolo del punto 2).
- [ ] Activar solo las que pasen; registrar las que no y por qué.
- [ ] Guion de diálogo corto con las señas disponibles para la demo (punto 6).

## 6. Video de demostración (sí: es la recomendación para el video)

Esto era la recomendación para el **video de presentación de 3 minutos** y para la demo en vivo:

- [ ] Abrir con el problema y dos personas que no comparten lengua resolviendo algo concreto (30 s), no con la lista de funciones.
- [ ] Mostrar el diálogo completo en ambas direcciones (Español → avatar y Señas → español con confirmación).
- [ ] Mostrar un rechazo: una seña fuera de catálogo que responde `otra` y pide repetir. La incertidumbre bien manejada diferencia el proyecto.
- [ ] Mostrar el pipeline de Meta trabajando (punto 3) y una cifra de la evaluación independiente con su contexto (punto 2).
- [ ] Cerrar con limitaciones honestas y siguiente paso (validación LSC, punto 1).
- [ ] Plan B: video pregrabado del flujo completo por si fallan red/API, y demo probada desde otro equipo/red antes de entregar.

Guion base en la propuesta original integrada al README: problema → español a LSC → LSC a español → caso desconocido → arquitectura/resultados → limitaciones.
