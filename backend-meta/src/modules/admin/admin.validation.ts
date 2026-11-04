import { HttpError } from "../../shared/http/errors.ts";
import { object } from "../../shared/validation.ts";
import { VEREDICTOS } from "../../infrastructure/db/admin.store.ts";
import type {
  EnsayoAdmin,
  RevisionAdmin,
} from "../../infrastructure/db/admin.store.ts";

const HOY = () => new Date().toISOString().slice(0, 10);

function texto(
  valor: unknown,
  campo: string,
  maximo: number,
  obligatorio = false,
): string {
  if (valor === undefined && !obligatorio) return "";
  if (typeof valor !== "string" || (obligatorio && !valor.trim()))
    throw new HttpError(400, "INVALID_REVISION", `Revisa el campo ${campo}.`);
  if (valor.length > maximo)
    throw new HttpError(400, "INVALID_REVISION", `El campo ${campo} es demasiado largo.`);
  return valor;
}

/** Parche de una revisión: veredicto obligatorio, notas y validador opcionales. */
export function revisionValida(
  body: unknown,
): Pick<RevisionAdmin, "veredicto" | "notas" | "validador"> {
  const datos = object(body ?? {});
  const veredicto = datos.veredicto;
  if (
    typeof veredicto !== "string" ||
    !(VEREDICTOS as readonly string[]).includes(veredicto)
  )
    throw new HttpError(
      400,
      "INVALID_REVISION",
      "El veredicto debe ser sin-revisar, se-entiende, corregir o no-valida.",
    );
  return {
    veredicto: veredicto as RevisionAdmin["veredicto"],
    notas: texto(datos.notas, "notas", 2000),
    validador: texto(datos.validador, "validador", 120),
  };
}

/** Importación completa: todo o nada; cada entrada necesita veredicto válido. */
export function importacionValida(
  body: unknown,
  conocidas: Set<string>,
): Omit<RevisionAdmin, "id" | "updatedAt">[] {
  const datos = object(body ?? {});
  const revisiones = datos.revisiones;
  // Acepta el formato histórico (mapa por seña) y el actual (lista de registros).
  if (Array.isArray(revisiones)) {
    const filas: Omit<RevisionAdmin, "id" | "updatedAt">[] = [];
    for (const valor of revisiones) {
      const entrada = object(valor ?? {});
      const id = String(entrada.signId ?? entrada.sign_id ?? "");
      if (!conocidas.has(id))
        throw new HttpError(404, "SIGN_NOT_FOUND", `Seña desconocida: ${id}.`);
      const parcial = revisionValida(valor);
      const fechaBruta = entrada.fecha;
      const fecha =
        typeof fechaBruta === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fechaBruta)
          ? fechaBruta
          : HOY();
      filas.push({ signId: id, fecha, ...parcial });
    }
    if (filas.length > 500)
      throw new HttpError(400, "INVALID_REVISION", "Demasiadas revisiones.");
    return filas;
  }
  if (!revisiones || typeof revisiones !== "object")
    throw new HttpError(
      400,
      "INVALID_REVISION",
      "Envía `revisiones` con los registros a importar.",
    );
  const filas: Omit<RevisionAdmin, "id" | "updatedAt">[] = [];
  for (const [id, valor] of Object.entries(
    revisiones as Record<string, unknown>,
  )) {
    if (!conocidas.has(id))
      throw new HttpError(404, "SIGN_NOT_FOUND", `Seña desconocida: ${id}.`);
    const parcial = revisionValida(valor);
    const fechaBruta = object(valor ?? {}).fecha;
    const fecha =
      typeof fechaBruta === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fechaBruta)
        ? fechaBruta
        : HOY();
    filas.push({ signId: id, fecha, ...parcial });
  }
  if (filas.length > 200)
    throw new HttpError(400, "INVALID_REVISION", "Demasiadas revisiones.");
  return filas.sort((a, b) => a.signId.localeCompare(b.signId));
}

export function fechaHoy(): string {
  return HOY();
}

function ensayoValido(valor: unknown, indice: number): EnsayoAdmin {
  const datos = object(valor);
  const campo = (nombre: string) => `ensayo ${indice + 1}, campo ${nombre}`;
  const cadena = (nombre: string, maximo: number, obligatoria: boolean) => {
    const textoValor = datos[nombre];
    if (textoValor === undefined && !obligatoria) return "";
    if (
      typeof textoValor !== "string" ||
      (obligatoria && !textoValor) ||
      textoValor.length > maximo
    )
      throw new HttpError(400, "INVALID_SESSION", `Revisa ${campo(nombre)}.`);
    return textoValor;
  };
  const confianza = datos.confianza;
  const latencyMs = datos.latencyMs;
  if (
    typeof confianza !== "number" ||
    !Number.isFinite(confianza) ||
    confianza < 0 ||
    confianza > 1
  )
    throw new HttpError(400, "INVALID_SESSION", `Revisa ${campo("confianza")}.`);
  if (
    typeof latencyMs !== "number" ||
    !Number.isFinite(latencyMs) ||
    latencyMs < 0 ||
    latencyMs > 3600000
  )
    throw new HttpError(400, "INVALID_SESSION", `Revisa ${campo("latencyMs")}.`);
  return {
    esperada: cadena("esperada", 120, true),
    clase: cadena("clase", 120, true),
    confianza,
    motivo: cadena("motivo", 2000, false),
    model: cadena("model", 160, false),
    promptVersion: cadena("promptVersion", 120, false),
    latencyMs,
    fecha: cadena("fecha", 40, false),
  };
}

/** Sesión de evaluación con sus ensayos ya validados para guardar. */
export function sesionValida(body: unknown): {
  codigo: string;
  notas: string;
  ensayos: EnsayoAdmin[];
} {
  const datos = object(body ?? {});
  const codigo = datos.codigo;
  const notas = datos.notas;
  const ensayos = datos.ensayos;
  if (typeof codigo !== "string" || !codigo.trim() || codigo.length > 24)
    throw new HttpError(
      400,
      "INVALID_SESSION",
      "La sesión necesita un código de 1 a 24 caracteres (p. ej. P1).",
    );
  if (notas !== undefined && (typeof notas !== "string" || notas.length > 500))
    throw new HttpError(400, "INVALID_SESSION", "Revisa el campo notas.");
  if (!Array.isArray(ensayos) || ensayos.length < 1 || ensayos.length > 500)
    throw new HttpError(
      400,
      "INVALID_SESSION",
      "La sesión necesita entre 1 y 500 ensayos.",
    );
  return {
    codigo: codigo.trim(),
    notas: typeof notas === "string" ? notas : "",
    ensayos: ensayos.map((ensayo, indice) => ensayoValido(ensayo, indice)),
  };
}
