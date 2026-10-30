import type { ErrorRequestHandler } from "express";
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const errorHandler: ErrorRequestHandler = (
  caught: unknown,
  _req,
  res,
  next,
) => {
  let error = caught;
  const type =
    error && typeof error === "object" && "type" in error
      ? error.type
      : undefined;
  if (res.destroyed) return;
  if (res.headersSent) return next(error);
  if (type === "entity.too.large")
    error = new HttpError(413, "TOO_LARGE", "La captura excede 6 MB.");
  else if (type === "entity.parse.failed")
    error = new HttpError(400, "INVALID_JSON", "JSON inválido.");
  else if (type === "encoding.unsupported" || type === "charset.unsupported")
    error = new HttpError(
      415,
      "CONTENT_TYPE",
      "Formato de contenido no admitido.",
    );
  res.status(error instanceof HttpError ? error.status : 502).json({
    code: error instanceof HttpError ? error.code : "INVALID_META_RESPONSE",
    error:
      error instanceof HttpError
        ? error.message
        : "No se obtuvo una respuesta válida de Meta. Reintenta la captura.",
  });
};
