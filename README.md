# Dalo

Prototipo web de comunicación básica entre Lengua de Señas Colombiana (LSC) y español para el **Meta Global AI Developer Hackathon 2026**.

## Estado

Proyecto en planificación. Todavía no hay una aplicación ejecutable ni un modelo de reconocimiento validado.

## Funcionalidades previstas

- **Español a LSC:** entrada por texto o voz, identificación de una intención del catálogo y reproducción de un video autorizado y validado en LSC.
- **LSC a español:** captura de una expresión breve, reconocimiento dentro de un vocabulario limitado y confirmación del resultado antes de reproducirlo por voz.
- Manejo explícito de expresiones desconocidas y resultados ambiguos.

El objetivo inicial es reconocer cinco expresiones por cámara y ampliar únicamente si la evaluación con personas nuevas lo permite.

## Documentación

- [Propuesta del proyecto](PROPUESTA.md): alcance, arquitectura inicial, recursos candidatos, cronograma y evaluación.

La primera versión será web para distribuir la demo mediante un enlace HTTPS. Dalo funcionará junto a aplicaciones de videollamada existentes. No incorporará su propio servicio de videoconferencia.

## Uso junto a una videollamada

La demo permitirá capturar expresiones desde la cámara local, confirmar resultados y copiar el texto al chat de la reunión o compartir la ventana de Dalo. La voz generada se reproducirá en el equipo local; no se enviará automáticamente como micrófono de la llamada.

La integración directa con audio, video o subtítulos de plataformas externas se evaluará después. La entrada por micrófono no implica capturar el audio del participante remoto. El uso simultáneo de cámara con otra aplicación se comprobará en el entorno de demo.

## Arquitectura prevista

- Interfaz web y captura de cámara y micrófono con permisos del navegador.
- Extracción de puntos con MediaPipe y evaluación del clasificador temporal en el navegador.
- Python para preparación de datos y entrenamiento cuando sea necesario.
- Backend para acceder a Meta y aplicar límites de consumo, con credenciales exclusivamente en el servidor.
- Catálogo de videos autorizados y resultados fuera de vocabulario explícitos.

El framework y el alojamiento están pendientes de selección. Todavía no hay un enlace de demo publicado.

## Datos y credenciales

Los datos, videos y modelos externos se incorporarán únicamente después de revisar sus permisos y atribuciones. No se deben subir credenciales, grabaciones privadas ni conjuntos de datos al repositorio.

## Alcance y validación

Dalo no pretende ofrecer traducción universal de LSC ni sustituir a intérpretes profesionales. El vocabulario y los videos requieren validación con personas competentes en LSC, preferentemente con participación de personas sordas usuarias de la lengua.

Las contribuciones desarrolladas durante el hackatón se distinguirán de las herramientas y recursos externos utilizados.
