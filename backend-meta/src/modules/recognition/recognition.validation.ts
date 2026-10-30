import type { RequestHandler } from "express";
import { HttpError } from "../../shared/http/errors.ts";
export function validateFrames(frames: unknown): asserts frames is string[] {
  if (
    !Array.isArray(frames) ||
    frames.length < 8 ||
    frames.length > 12 ||
    frames.some(
      (f) =>
        typeof f !== "string" ||
        f.length > 600000 ||
        !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(f),
    )
  )
    throw new HttpError(
      400,
      "INVALID_FRAMES",
      "Envía entre 8 y 12 fotogramas JPEG (máximo 450 KB por imagen).",
    );
}

export const requireJson: RequestHandler = (req, _res, next) => {
  if (!req.is("application/json"))
    throw new HttpError(415, "CONTENT_TYPE", "Se requiere JSON.");
  next();
};
