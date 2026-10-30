import type { RequestHandler } from "express";
import { HttpError } from "./errors.ts";
export const originPolicy = (allowedOrigins: string[]): RequestHandler => (req, res, next) => {
  res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.includes(origin))
    throw new HttpError(403, "ORIGIN", "Origen no permitido.");
  next();
};
