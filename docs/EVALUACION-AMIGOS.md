# Evaluación con amigos (personas y cámaras nuevas)

Evaluación pequeña e independiente del reconocimiento Señas → Español.
Mide robustez con personas que no participaron en el desarrollo y cámaras
distintas. **No** mide corrección lingüística: los participantes imitan el
avatar sin saber LSC. La validación lingüística es el punto 1 de
[MEJORAS-HACKATHON.md](MEJORAS-HACKATHON.md).

## Antes de empezar

Requisitos verificados en este equipo: clave en `backend-meta/.env`, FFmpeg en
PATH, Node.js 24 y dependencias instaladas.

1. Terminal 1: `npm run dev:backend`
2. Terminal 2: `npm run dev:frontend`
3. Abre http://localhost:4201 y entra a **Señas → Español**.
4. En **Detalles técnicos**, pulsa **Comprobar conexión** y confirma que el
   servicio responde antes de invitar a nadie.

Acuerdo con cada participante (decirlo en voz alta y anotar sí/no):

- Su video de 3 segundos se envía a Meta (modo Contributor: Meta puede usarlo
  para entrenar modelos). La app no guarda el video; solo se descarga un JSON
  con la respuesta del modelo, sin imágenes.
- Puede detenerse cuando quiera. Sus datos se identifican como P1, P2… sin
  nombre en los archivos de resultados.

## Sesión por participante (15–20 min, 25 capturas)

1. Genera su orden (aleatorio y reproducible, distinto por persona):

   ```powershell
   py tools/evaluacion-webcam/evaluar.py orden --participante P1
   ```

2. En **Evaluación de reconocimiento** elige la etiqueta esperada que indique
   el orden. La etiqueta **no** se envía a Meta; solo se usa al calificar.
3. Para cada seña del catálogo: el participante mira la animación en
   **Expresiones** las veces que necesite, vuelve, pulsa **Capturar seña**,
   espera el 3, 2, 1 y hace la seña al ver el punto rojo. Sin corregirle a
   mitad de la captura; si la hace "mal", también es un dato.
4. Para `otra`, el orden indica la acción: quedarse quieto, un movimiento
   libre o una seña fuera del catálogo (p. ej., inventada). No debe imitar
   ninguna de las 11.
5. Al terminar, pulsa **Descargar resultados JSON** antes de cerrar la
   página y renombra el archivo: `ensayos-P1.json`, `ensayos-P2.json`, …
   (o guárdalo directamente como sesión en **Validación → Ensayos** con el
   código del participante: queda en la base SQLite del backend y se puede
   analizar junto con otras sesiones).
6. Anota en una línea: equipo/cámara usados, iluminación (buena/regular/mala)
   y cualquier incidencia. Sin nombres.

## Informe

Con todos los JSON en una carpeta local (p. ej. `data/evaluacion-amigos/`):

```powershell
py tools/evaluacion-webcam/evaluar.py reporte data/evaluacion-amigos/ensayos-P1.json data/evaluacion-amigos/ensayos-P2.json
```

Genera `REPORTE-EVALUACION.md` junto a los JSON: aciertos totales y por seña,
matriz de confusión, rechazo correcto de `otra`, errores con confianza ≥ 0,8 y
latencia mediana/media/máxima. Los errores de transporte no llegan al JSON de
ensayos, así que no contaminan las cifras.

## Cómo citar el resultado

Siempre con contexto, por ejemplo: "11 señas × 2 repeticiones + 3 fuera de
catálogo por persona; n = 4 participantes, 100 capturas; personas y cámaras
nuevas imitando el avatar, sin conocimiento de LSC; confianza del modelo sin
calibrar". Nunca como "precisión de Daló" a secas, y nunca mezclado con las
cifras de desarrollo sobre clips ya usados para ajustar el prompt.
