# Evaluación ciega de Cordialidad

La ejecución del 29 de octubre de 2026 está en
`data/meta-evaluation/2026-10-29-cordialidad/` (datos locales, excluidos de Git).

1. `prepare.py` inventaría todos los AVI de las ocho clases, selecciona 12
   fotogramas cronológicos por clip mediante movimiento clásico y genera
   JPEG, hojas de contacto, tiempos, hashes y un manifiesto.
2. `run.mjs` envía peticiones independientes a Meta con cuatro trabajadores.
   Usa el contexto exacto del frontend para catálogo cerrado. En abierto retira
   el catálogo y permite una etiqueta libre o `desconocida`.
3. `report.py` consolida resultados y genera un informe con matriz de confusión,
   rechazos, comparación de formatos e índice de cada prueba.

Requiere Python y FFmpeg. Desde la raíz, prepara las dependencias opcionales
y compila el backend antes de ejecutar el runner:

```powershell
py -m venv .venv
.venv/Scripts/python.exe -m pip install -r tools/meta-evaluation/requirements.txt
npm --prefix backend-meta run build
```

Desde la raíz del repositorio:

```powershell
.venv/Scripts/python.exe tools/meta-evaluation/prepare.py --output data/meta-evaluation/NUEVA-EJECUCION
node --use-system-ca --env-file=backend-meta/.env tools/meta-evaluation/run.mjs data/meta-evaluation/NUEVA-EJECUCION 4
.venv/Scripts/python.exe tools/meta-evaluation/report.py data/meta-evaluation/NUEVA-EJECUCION
```

Usa un directorio nuevo para otro modelo, contexto o selección de entradas.
El runner rechaza cambios de contexto sobre una ejecución existente y, al
reanudar, conserva todos los resultados existentes, incluidos errores. No
reintenta un resultado guardado; para repetirlo crea una ejecución independiente.
Los 429 y ciertos errores transitorios pueden reintentarse hasta tres veces,
registrando cada intento; 401/403 detienen la cola pendiente.

El prompt no contiene la etiqueta esperada, ruta, nombre de archivo ni
participante. Los JPEG enviados son imágenes individuales sin las anotaciones
de las hojas de contacto. Las etiquetas esperadas se usan únicamente al evaluar
las respuestas. No hay entrenamiento ni ejemplos etiquetados entre peticiones.

- `manifest.json`: fuentes locales, selección, etiquetas reales, hashes y tareas.
- `contexts.json`: modelo, prompts y esquemas sin credenciales.
- `requests/`: contexto y referencias a imágenes, sin duplicar los data URLs.
- `logs/`: eventos y resúmenes públicos por prueba; no razonamiento privado.
- `results/`: respuesta final, confianza, motivo, latencia, uso de tokens y comparación.
- `results.jsonl`: resultados anexados conforme terminan las peticiones.
- `results.json`, `summary.json`, `REPORT.md`: consolidados regenerables.

La comparación inicial con MP4 usa el muestreo elegido por el proveedor. Para
videos tan cortos puede reducirse a un solo fotograma. Las tareas adicionales
con `videoFps: 12` solicitan muestreo explícito, se conservan como pruebas
independientes y no reemplazan los resultados anteriores.

La coincidencia exacta en abierto no detecta sinónimos automáticamente: hay que
revisar la respuesta semánticamente. Una única palabra externa no basta para
medir una tasa general de falsos positivos. El dataset tiene rostros pixelados;
no se dispone de toda la expresión facial.
