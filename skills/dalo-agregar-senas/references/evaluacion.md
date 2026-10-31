# Fuente externa y evaluación privada

El repositorio no incluye datasets, evaluadores por lotes ni resultados privados.
No presupongas que existen herramientas de experimentos anteriores. Antes de
evaluar, identifica la fuente externa, sus permisos y un destino privado fuera
del repositorio y de cualquier carpeta pública.

## Inventario

El ayudante de esta skill inventaría videos sin transmitirlos ni alterarlos:

```powershell
python skills/dalo-agregar-senas/scripts/inventory.py `
  --root "RUTA-EXTERNA/RawVideos/Videos Courtesy" `
  --word "apoyar=Cordialidad/Apoyar" `
  --word "hola=Cordialidad/Hola" `
  --output "DIRECTORIO-PRIVADO/inventario"
```

Sustituye las rutas y palabras por las autorizadas. Si la skill está instalada
globalmente, localiza el script en su directorio real. El inventario guarda
hashes, participantes y rutas; su partición es una propuesta, no demuestra que
esas personas sean nuevas para el proyecto. Si faltan registros históricos,
declara que no puedes acreditar independencia.

## Inspección y separación

Revisa varias personas y repeticiones completas, incluido reposo y núcleo activo.
Reserva participantes antes de redactar. No uses los positivos reservados para
escoger ejemplos, corregir descripciones ni seleccionar palabras. Documenta por
separado cualquier control o negativo compartido entre etapas. Si un resultado
motiva un ajuste, esa muestra pasa a desarrollo.

No copies videos ni hojas de contacto a `public/`. Los fotogramas ayudan a
inspeccionar el movimiento, pero no sustituyen automáticamente al video. Verifica
que la normalización a un máximo de cinco segundos y 12 fps conserve el núcleo.

## Ejecución autorizada

Si se necesitan llamadas reales, prepara un evaluador privado solo dentro del
alcance autorizado. Compila el backend para reutilizar `createMotionSpec` y el
normalizador de medios; revisa sus contratos actuales. Añade explícitamente la
candidata inactiva al contexto experimental y asigna una versión nueva, sin
cambiar el catálogo del servicio para probarla.

Incluye un control con el catálogo activo, desarrollo, evaluación separada,
contrastes de señas existentes y varias palabras externas. En cerrado se espera
`otra` para las externas; en abierto se retiran catálogo y descripciones de la
respuesta correcta. No envíes etiquetas esperadas, rutas, participantes ni nombres
de archivo al proveedor.

Fija modelo, contexto, selección, volumen y política acotada de reintentos antes
de ejecutar. Las peticiones son independientes, no entrenamiento. Conserva todos
los resultados, incluidos errores; no repitas selectivamente fallos hasta lograr
una cifra favorable. Un cambio de protocolo exige un experimento separado.

## Decisión y privacidad

El informe privado debe separar condiciones, participantes y fuentes únicas de
número de llamadas. Cuenta errores técnicos, confusiones, falsos positivos y
regresiones; distingue confianza subjetiva de exactitud. No combines desarrollo
y evaluación en un único porcentaje ni declares validación lingüística por un
buen resultado del modelo.

No guardes claves en peticiones o logs ni publiques medios, hashes, rutas de
participantes o resultados privados. Los logs recogen etapas y resúmenes públicos,
no razonamiento interno. Al entregar cambios al proyecto, incluye únicamente la
definición, los recursos autorizados, su disponibilidad real y los ajustes de
código o pruebas necesarios. Aplica el criterio acordado con el usuario; esta
skill no establece un umbral universal ni autoriza gasto o transmisión de datos.
