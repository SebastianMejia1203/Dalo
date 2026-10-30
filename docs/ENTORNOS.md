# Desarrollo y producción

La aplicación activa usa `backend-meta/` y `web-meta/`. `web/` conserva la versión anterior.

## Desarrollo

Instala dependencias con `npm ci` dentro de cada aplicación en una copia independiente.
Si `web-meta/node_modules` es un enlace a `web/node_modules`, conserva ese enlace y no ejecutes `npm ci` sobre él.

Copia `backend-meta/.env.example` a `backend-meta/.env` y completa `META_API_KEY`.
Opcionalmente copia `.env.development.example` a `.env.development` para personalizar host y puerto.

Desde la raíz, en dos terminales:

```powershell
npm run dev:backend
npm run dev:frontend
```

Abre http://localhost:4201. Angular usa `/api` y su proxy lee automáticamente `HOST` y `PORT` de la configuración de desarrollo del backend. Reinicia ambos procesos al modificar los archivos de entorno. Para un backend de desarrollo remoto, define `API_PROXY_TARGET` en el proceso que ejecuta Angular.

## Producción

1. Copia `backend-meta/.env.production.example` a `backend-meta/.env.production`.
2. Completa `APP_ORIGIN` con el origen público exacto, por ejemplo `https://dalo.midominio.com`, y `META_API_KEY` con la clave de producción. No incluyas rutas en el origen.
3. Compila y arranca desde la raíz:

```powershell
npm run build
npm start
```

El backend sirve `web-meta/dist/web-meta/browser` y la API `/api` desde el mismo servidor. El navegador toma automáticamente el protocolo, dominio y puerto de la página; no hay direcciones localhost compiladas para producción. El proxy de Angular solo interviene en desarrollo.

En un servidor público, termina HTTPS en el proxy inverso y reenvía las peticiones a `127.0.0.1:3001`. Establece `HOST=127.0.0.1` si el proxy corre en la misma máquina; `0.0.0.0` sirve para contenedores o interfaces externas. Conserva el streaming sin buffering y un timeout superior a 75 segundos en el proxy. Cámara y micrófono requieren HTTPS fuera de localhost.

También puedes servir Angular con Nginx u otro servidor: configura `SERVE_FRONTEND=false` y reenvía `/api` al backend bajo el mismo dominio público. El resto de las rutas debe servir Angular con fallback a `index.html`; los recursos inexistentes y las rutas API desconocidas deben conservar su 404.

## Variables del backend

| Variable | Desarrollo | Producción |
| --- | --- | --- |
| `NODE_ENV` | `development` con `npm run dev` | `production` con `npm start` |
| `HOST` | `127.0.0.1` | `0.0.0.0` |
| `PORT` | `3001` | `3001` |
| `APP_ORIGIN` | Opcional; permite localhost y 127.0.0.1 en puerto 4201 | Obligatorio; origen público exacto |
| `SERVE_FRONTEND` | `false` | `true` |
| `FRONTEND_DIST` | No se usa por defecto | `../web-meta/dist/web-meta/browser`, relativa a `backend-meta/` |
| `META_API_KEY` | Clave privada del backend | Clave privada del backend |
| `META_MODEL` | `muse-spark-1.3-contributor` | Igual |
| `FFMPEG_PATH` | Opcional si FFmpeg está en PATH | Igual |

Precedencia: **variables del proceso > `.env.development` o `.env.production` > `.env` > valores predeterminados**. El comando selecciona el archivo específico; si defines `NODE_ENV` externamente debe coincidir con el comando. Los archivos locales de entorno se excluyen de Git y los ejemplos se versionan. Nunca copies claves al frontend.

`APP_ORIGIN` restringe el origen de las peticiones del navegador; no es autenticación. El servicio conserva los límites de entrada y concurrencia existentes. Un despliegue que necesite control de acceso debe añadir autenticación y límites por usuario en su infraestructura.

## Frontend y comprobaciones

La URL está centralizada en `web-meta/src/environments/environment.ts`; Angular la sustituye por `environment.development.ts` al compilar desarrollo. Ambos usan `/api` para resolver automáticamente el dominio. La arquitectura publicada usa el mismo origen y no necesita CORS entre dominios.

```powershell
npm run check
npm run build
# Opcional, comprobar la compilación de desarrollo:
npm --prefix web-meta run build:development
```

`GET /api/health` indica si hay una clave configurada, sin publicarla; la autenticación con Meta se comprueba al usar el proveedor. Las pruebas usan respuestas controladas y no consumen la API real.
