import { createHash, randomBytes } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";
import { names, AppError, type Role } from "./dealdesk";

export type DemoSession = { authenticated: boolean; role: Role; name: string };
declare global {
  namespace Express {
    interface Request { demoSession?: DemoSession }
  }
}
const cookieName = "dealdesk_demo";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
export const signedOut: DemoSession = { authenticated: false, role: "Rep", name: "" };
export async function sessionMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[cookieName];
    if (typeof token === "string") {
      const r = await pool.query("SELECT role FROM dealdesk_sessions WHERE token_hash=$1 AND expires_at>now()", [hash(token)]);
      if (r.rows[0]) {
        const role = r.rows[0].role as Role;
        req.demoSession = { authenticated: true, role, name: names[role] };
      }
    }
    next();
  } catch (e) { next(e); }
}
export function requireLogin(req: Request, _res: Response, next: NextFunction) {
  if (!req.demoSession?.authenticated) { next(new AppError(401, "Sign in to the demo to continue.")); return; }
  next();
}
export function sameOrigin(req: Request, _res: Response, next: NextFunction) {
  const origin = req.get("origin");
  if (origin && new URL(origin).host !== req.get("host") && new URL(origin).host !== req.get("x-forwarded-host")) { next(new AppError(403, "Cross-origin browser requests are not permitted.")); return; }
  next();
}
export async function loginSession(req: Request, res: Response) {
  const token = randomBytes(32).toString("hex");
  await pool.query("DELETE FROM dealdesk_sessions WHERE expires_at < now()");
  if (req.cookies?.[cookieName]) await pool.query("DELETE FROM dealdesk_sessions WHERE token_hash=$1", [hash(req.cookies[cookieName])]);
  await pool.query("INSERT INTO dealdesk_sessions(token_hash,role,expires_at) VALUES ($1,'Rep',now()+interval '7 days')", [hash(token)]);
  res.cookie(cookieName, token, { httpOnly: true, sameSite: "lax", secure: req.secure || req.get("x-forwarded-proto") === "https", maxAge: 7 * 86400000, path: "/" });
  return { authenticated: true, role: "Rep", name: names.Rep };
}
export async function changeRole(req: Request, role: Role) {
  await pool.query("UPDATE dealdesk_sessions SET role=$1 WHERE token_hash=$2 AND expires_at>now()", [role, hash(req.cookies[cookieName])]);
  return { authenticated: true, role, name: names[role] };
}
export async function endSession(req: Request, res: Response) {
  if (req.cookies?.[cookieName]) await pool.query("DELETE FROM dealdesk_sessions WHERE token_hash=$1", [hash(req.cookies[cookieName])]);
  res.clearCookie(cookieName, { path: "/" });
  return signedOut;
}
