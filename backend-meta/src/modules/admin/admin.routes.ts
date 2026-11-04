import { Router, json, type RequestHandler } from "express";
import { HttpError } from "../../shared/http/errors.ts";
import { requireJson } from "../recognition/recognition.validation.ts";
import {
  loadSigns,
  updateSignDefinition,
} from "../signs/sign.repository.ts";
import { categories } from "../signs/sign.repository.ts";
import {
  createEvalSession,
  createRevision,
  deleteEvalSession,
  deleteRevision,
  getEvalTrials,
  listEvalSessions,
  listRevisions,
  openAdminDb,
  replaceRevisions,
} from "../../infrastructure/db/admin.store.ts";
import {
  fechaHoy,
  importacionValida,
  revisionValida,
  sesionValida,
} from "./admin.validation.ts";

export interface AdminDependencies {
  adminToken: string;
  adminDbPath: string;
}

/**
 * Validación pública de señas y administración protegida.
 * Cualquier persona puede ver señas/registros y guardar una validación
 * (POST/PUT /admin/revisions/:id) o una sesión de evaluación, sin token.
 * Las operaciones destructivas o que cambian el reconocimiento
 * (PATCH de definiciones, importación que reemplaza, borrados) exigen
 * `x-admin-token` cuando `ADMIN_TOKEN` está configurado.
 * Las definiciones se persisten en los JSON de `senas/` y aplican al
 * reiniciar; las revisiones y sesiones viven en SQLite (`ADMIN_DB_PATH`).
 */
export function adminRoutes({ adminToken, adminDbPath }: AdminDependencies) {
  const router = Router({ caseSensitive: true, strict: true });
  const db = openAdminDb(adminDbPath);
  const conocidas = new Set(loadSigns().map((sign) => sign.id));

  const guard: RequestHandler = (req, _res, next) => {
    if (adminToken && req.header("x-admin-token") !== adminToken)
      throw new HttpError(
        401,
        "ADMIN_TOKEN",
        "Token de administración ausente o incorrecto.",
      );
    next();
  };

  router.get("/admin/signs", (_req, res) => {
    const signs = loadSigns().map((sign) => ({
      ...sign,
      categoria: sign.categoria ?? categories[0],
    }));
    res.json({
      tokenRequired: !!adminToken,
      restartRequired: false,
      signs,
    });
  });

  router.patch(
    "/admin/signs/:id",
    guard,
    requireJson,
    json({ limit: "32kb", strict: false, inflate: false }),
    (req, res) => {
      const body = req.body as {
        descripcion?: unknown;
        activa?: unknown;
      } | null;
      const descripcion = body?.descripcion;
      const activa = body?.activa;
      if (
        (descripcion !== undefined &&
          (typeof descripcion !== "string" ||
            !descripcion.trim() ||
            descripcion.length > 4000)) ||
        (activa !== undefined && typeof activa !== "boolean") ||
        (descripcion === undefined && activa === undefined)
      )
        throw new HttpError(
          400,
          "INVALID_SIGN_PATCH",
          "Envía `descripcion` (texto no vacío) y/o `activa` (booleano).",
        );
      try {
        const { sign, changed } = updateSignDefinition(String(req.params.id), {
          descripcion:
            typeof descripcion === "string" ? descripcion : undefined,
          activa: typeof activa === "boolean" ? activa : undefined,
        });
        res.json({ sign, changed, restartRequired: changed });
      } catch {
        throw new HttpError(404, "SIGN_NOT_FOUND", "Seña desconocida.");
      }
    },
  );

  router.get("/admin/revisions", (_req, res) => {
    res.json({ revisions: listRevisions(db) });
  });

  // Debe ir antes de POST /admin/revisions/:id para que «import» no sea un id.
  router.post(
    "/admin/revisions/import",
    guard,
    requireJson,
    json({ limit: "256kb", strict: false, inflate: false }),
    (req, res) => {
      const count = replaceRevisions(
        db,
        importacionValida(req.body, conocidas),
      );
      res.json({ count });
    },
  );

  const guardarRevision: RequestHandler = (req, res) => {
    const id = String(req.params.id);
    if (!conocidas.has(id))
      throw new HttpError(404, "SIGN_NOT_FOUND", "Seña desconocida.");
    const datos = revisionValida(req.body);
    if (!datos.validador.trim())
      throw new HttpError(
        400,
        "INVALID_REVISION",
        "Indica tu nombre para guardar la validación.",
      );
    if (datos.veredicto === "sin-revisar")
      throw new HttpError(
        400,
        "INVALID_REVISION",
        "Elige un veredicto: se entiende, hay que corregir o no es válida.",
      );
    const revision = createRevision(db, id, {
      ...datos,
      validador: datos.validador.trim(),
      notas: datos.notas.trim(),
      fecha: fechaHoy(),
    });
    res.status(201).json({ revision });
  };

  // Público: cualquier persona puede validar. POST es la ruta actual;
  // PUT se conserva por compatibilidad y también crea un registro nuevo.
  router.post(
    "/admin/revisions/:id",
    requireJson,
    json({ limit: "16kb", strict: false, inflate: false }),
    guardarRevision,
  );
  router.put(
    "/admin/revisions/:id",
    requireJson,
    json({ limit: "16kb", strict: false, inflate: false }),
    guardarRevision,
  );

  router.delete("/admin/revisions/:revisionId", guard, (req, res) => {
    const id = Number(req.params.revisionId);
    if (!Number.isInteger(id) || id < 1)
      throw new HttpError(400, "INVALID_REVISION", "Identificador inválido.");
    if (!deleteRevision(db, id))
      throw new HttpError(404, "REVISION_NOT_FOUND", "Registro inexistente.");
    res.json({ deleted: true });
  });

  router.post(
    "/admin/eval-sessions",
    requireJson,
    json({ limit: "2mb", strict: false, inflate: false }),
    (req, res) => {
      const { codigo, notas, ensayos } = sesionValida(req.body);
      const sesion = createEvalSession(db, codigo, notas, ensayos);
      res.status(201).json({ session: { codigo, notas, ...sesion } });
    },
  );

  router.get("/admin/eval-sessions", (_req, res) => {
    res.json({ sessions: listEvalSessions(db) });
  });

  router.get("/admin/eval-sessions/:id/trials", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1)
      throw new HttpError(400, "INVALID_SESSION", "Identificador inválido.");
    const trials = getEvalTrials(db, id);
    if (!trials)
      throw new HttpError(404, "SESSION_NOT_FOUND", "Sesión inexistente.");
    res.json({ sessionId: id, trials });
  });

  router.delete("/admin/eval-sessions/:id", guard, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1)
      throw new HttpError(400, "INVALID_SESSION", "Identificador inválido.");
    if (!deleteEvalSession(db, id))
      throw new HttpError(404, "SESSION_NOT_FOUND", "Sesión inexistente.");
    res.json({ deleted: true });
  });
  return router;
}
