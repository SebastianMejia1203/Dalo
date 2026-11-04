import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const VEREDICTOS = [
  "sin-revisar",
  "se-entiende",
  "corregir",
  "no-valida",
] as const;
export type VeredictoAdmin = (typeof VEREDICTOS)[number];

export interface RevisionAdmin {
  id: number;
  signId: string;
  veredicto: VeredictoAdmin;
  notas: string;
  validador: string;
  fecha: string;
  updatedAt: string;
}

export interface EnsayoAdmin {
  esperada: string;
  clase: string;
  confianza: number;
  motivo: string;
  model: string;
  promptVersion: string;
  latencyMs: number;
  fecha: string;
}

export interface EvalSessionAdmin {
  id: number;
  codigo: string;
  notas: string;
  createdAt: string;
  total: number;
  correctos: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sign_id TEXT NOT NULL,
  veredicto TEXT NOT NULL,
  notas TEXT NOT NULL DEFAULT '',
  validador TEXT NOT NULL DEFAULT '',
  fecha TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_revisions_sign ON revisions(sign_id);
CREATE INDEX IF NOT EXISTS idx_revisions_updated ON revisions(updated_at DESC);
CREATE TABLE IF NOT EXISTS eval_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL,
  notas TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS eval_trials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES eval_sessions(id) ON DELETE CASCADE,
  esperada TEXT NOT NULL,
  clase TEXT NOT NULL,
  confianza REAL NOT NULL,
  motivo TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  prompt_version TEXT NOT NULL DEFAULT '',
  latency_ms INTEGER NOT NULL DEFAULT 0,
  fecha TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_trials_session ON eval_trials(session_id);
`;

/** Abre (y crea si falta) la base de administración. El llamador la conserva. */
export function openAdminDb(dbPath: string): DatabaseSync {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA journal_mode = WAL;");
  // Migración: la tabla anterior permitía una sola revisión por seña
  // (sign_id como clave primaria). Se conserva cada fila como un registro.
  const previa = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='revisions'",
    )
    .get() as Record<string, unknown> | undefined;
  if (previa && String(previa.sql ?? "").includes("sign_id TEXT PRIMARY KEY")) {
    db.exec(`
      ALTER TABLE revisions RENAME TO revisions_legacy;
      CREATE TABLE revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sign_id TEXT NOT NULL,
        veredicto TEXT NOT NULL,
        notas TEXT NOT NULL DEFAULT '',
        validador TEXT NOT NULL DEFAULT '',
        fecha TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO revisions (sign_id, veredicto, notas, validador, fecha, updated_at)
        SELECT sign_id, veredicto, notas, validador, fecha, updated_at FROM revisions_legacy;
      DROP TABLE revisions_legacy;
    `);
  }
  db.exec(SCHEMA);
  return db;
}

function filaRevision(fila: Record<string, unknown>): RevisionAdmin {
  return {
    id: Number(fila.id ?? 0),
    signId: String(fila.sign_id),
    veredicto: fila.veredicto as VeredictoAdmin,
    notas: String(fila.notas ?? ""),
    validador: String(fila.validador ?? ""),
    fecha: String(fila.fecha ?? ""),
    updatedAt: String(fila.updated_at ?? ""),
  };
}

export function listRevisions(db: DatabaseSync): RevisionAdmin[] {
  return (
    db
      .prepare("SELECT * FROM revisions ORDER BY updated_at DESC, id DESC")
      .all() as Record<string, unknown>[]
  ).map(filaRevision);
}

/** Cada validación es un registro nuevo: varias personas pueden validar la misma seña. */
export function createRevision(
  db: DatabaseSync,
  signId: string,
  revision: Omit<RevisionAdmin, "id" | "signId" | "updatedAt">,
): RevisionAdmin {
  const updatedAt = new Date().toISOString();
  const resultado = db
    .prepare(
      `INSERT INTO revisions (sign_id, veredicto, notas, validador, fecha, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      signId,
      revision.veredicto,
      revision.notas,
      revision.validador,
      revision.fecha,
      updatedAt,
    );
  return { ...revision, id: Number(resultado.lastInsertRowid), signId, updatedAt };
}

/** Compatibilidad: antes PUT sobrescribía; ahora también crea un registro. */
export const upsertRevision = createRevision;

export function deleteRevision(db: DatabaseSync, id: number): boolean {
  const resultado = db.prepare("DELETE FROM revisions WHERE id = ?").run(id);
  return resultado.changes > 0;
}

/** Reemplaza todas las revisiones de forma atómica. Valida antes en rutas. */
export function replaceRevisions(
  db: DatabaseSync,
  revisiones: Omit<RevisionAdmin, "id" | "updatedAt">[],
): number {
  const insert = db.prepare(
    "INSERT INTO revisions (sign_id, veredicto, notas, validador, fecha, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const updatedAt = new Date().toISOString();
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM revisions").run();
    for (const fila of revisiones)
      insert.run(
        fila.signId,
        fila.veredicto,
        fila.notas,
        fila.validador,
        fila.fecha,
        updatedAt,
      );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return revisiones.length;
}

export function createEvalSession(
  db: DatabaseSync,
  codigo: string,
  notas: string,
  ensayos: EnsayoAdmin[],
): { id: number; total: number; correctos: number } {
  const insertSesion = db.prepare(
    "INSERT INTO eval_sessions (codigo, notas, created_at) VALUES (?, ?, ?)",
  );
  const insertEnsayo = db.prepare(
    `INSERT INTO eval_trials
       (session_id, esperada, clase, confianza, motivo, model, prompt_version, latency_ms, fecha)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let id = 0;
  db.exec("BEGIN");
  try {
    const resultado = insertSesion.run(
      codigo,
      notas,
      new Date().toISOString(),
    );
    id = Number(resultado.lastInsertRowid);
    for (const ensayo of ensayos)
      insertEnsayo.run(
        id,
        ensayo.esperada,
        ensayo.clase,
        ensayo.confianza,
        ensayo.motivo,
        ensayo.model,
        ensayo.promptVersion,
        Math.round(ensayo.latencyMs),
        ensayo.fecha,
      );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const correctos = ensayos.filter((e) => e.clase === e.esperada).length;
  return { id, total: ensayos.length, correctos };
}

export function listEvalSessions(db: DatabaseSync): EvalSessionAdmin[] {
  return (
    db.prepare(
      `SELECT s.id, s.codigo, s.notas, s.created_at,
              COUNT(t.id) AS total,
              SUM(CASE WHEN t.clase = t.esperada THEN 1 ELSE 0 END) AS correctos
         FROM eval_sessions s
         LEFT JOIN eval_trials t ON t.session_id = s.id
        GROUP BY s.id
        ORDER BY s.id DESC`,
    ).all() as Record<string, unknown>[]
  ).map((fila) => ({
    id: Number(fila.id),
    codigo: String(fila.codigo),
    notas: String(fila.notas ?? ""),
    createdAt: String(fila.created_at),
    total: Number(fila.total ?? 0),
    correctos: Number(fila.correctos ?? 0),
  }));
}

export function sessionExists(db: DatabaseSync, id: number): boolean {
  const fila = db
    .prepare("SELECT 1 FROM eval_sessions WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  return !!fila;
}

export function getEvalTrials(
  db: DatabaseSync,
  sessionId: number,
): EnsayoAdmin[] | null {
  if (!sessionExists(db, sessionId)) return null;
  return (
    db.prepare(
      `SELECT esperada, clase, confianza, motivo, model, prompt_version, latency_ms, fecha
         FROM eval_trials WHERE session_id = ? ORDER BY id`,
    ).all(sessionId) as Record<string, unknown>[]
  ).map((fila) => ({
    esperada: String(fila.esperada),
    clase: String(fila.clase),
    confianza: Number(fila.confianza),
    motivo: String(fila.motivo ?? ""),
    model: String(fila.model ?? ""),
    promptVersion: String(fila.prompt_version ?? ""),
    latencyMs: Number(fila.latency_ms ?? 0),
    fecha: String(fila.fecha ?? ""),
  }));
}

export function deleteEvalSession(db: DatabaseSync, id: number): boolean {
  const resultado = db.prepare("DELETE FROM eval_sessions WHERE id = ?").run(id);
  return resultado.changes > 0;
}
