import type { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { getConfig } from "../config.js";
import { getPool } from "../db.js";
import type { Queryable } from "../db.js";
import type { DatabaseQuery } from "../db.js";
import { randomToken, tokenDigest } from "./crypto.js";

const PRODUCTION_COOKIE = "__Host-portal_session";
const DEVELOPMENT_COOKIE = "portal_session";

export function sessionCookieName(): string {
  return getConfig().NODE_ENV === "production"
    ? PRODUCTION_COOKIE
    : DEVELOPMENT_COOKIE;
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  const config = getConfig();
  reply.setCookie(sessionCookieName(), token, {
    path: "/",
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: config.SESSION_ABSOLUTE_HOURS * 60 * 60,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(sessionCookieName(), {
    path: "/",
    httpOnly: true,
    secure: getConfig().NODE_ENV === "production",
    sameSite: "strict",
  });
}

export async function createSession(
  client: Queryable,
  request: FastifyRequest,
  userId: string,
): Promise<{ sessionToken: string; csrfToken: string }> {
  const material = sessionInsertQuery(request, userId);
  await client.query(material.query.sql, material.query.params);
  return { sessionToken: material.sessionToken, csrfToken: material.csrfToken };
}

export function sessionInsertQuery(
  request: FastifyRequest,
  userId: string,
): { sessionToken: string; csrfToken: string; query: DatabaseQuery } {
  const config = getConfig();
  const sessionToken = randomToken();
  const csrfToken = randomToken();
  const userAgent = request.headers["user-agent"];
  const query: DatabaseQuery = {
    sql:
    `INSERT INTO sessions
       (id, user_id, token_digest, csrf_digest, ip_address, user_agent,
        idle_expires_at, absolute_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    params: [
      randomUUID(),
      userId,
      tokenDigest(sessionToken),
      tokenDigest(csrfToken),
      request.ip,
      typeof userAgent === "string" ? userAgent.slice(0, 500) : null,
      Date.now() + config.SESSION_IDLE_MINUTES * 60_000,
      Date.now() + config.SESSION_ABSOLUTE_HOURS * 3_600_000,
    ],
  };
  return { sessionToken, csrfToken, query };
}

export async function authenticateRequest(request: FastifyRequest): Promise<void> {
  request.auth = null;
  const token = request.cookies[sessionCookieName()];
  if (!token) return;

  const config = getConfig();
  const session = await getPool().query<{
    session_id: string;
    user_id: string;
  }>(
    `UPDATE sessions
     SET last_seen_at = $2,
         idle_expires_at = min(absolute_expires_at, $3)
     WHERE token_digest = $1
       AND revoked_at IS NULL
       AND idle_expires_at > $2
       AND absolute_expires_at > $2
     RETURNING id AS session_id, user_id`,
    [tokenDigest(token), Date.now(), Date.now() + config.SESSION_IDLE_MINUTES * 60_000],
  );
  const activeSession = session.rows[0];
  if (!activeSession) return;
  const result = await getPool().query<{
    user_id: string;
    email: string;
    display_name: string;
    organization_id: string;
    role: "ADMIN" | "CLIENT";
  }>(
    `SELECT u.id AS user_id, u.email, u.display_name, om.organization_id, om.role
     FROM users u JOIN organization_memberships om ON om.user_id = u.id
     WHERE u.id = $1 AND u.status = 'ACTIVE'
     LIMIT 1`,
    [activeSession.user_id],
  );
  const row = result.rows[0];
  if (!row) return;
  request.auth = {
    sessionId: activeSession.session_id,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    organizationId: row.organization_id,
    role: row.role,
  };
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!request.auth) {
    await reply.code(401).send({ error: "Authentication required" });
  }
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!request.auth) {
    await reply.code(401).send({ error: "Authentication required" });
    return;
  }
  if (request.auth.role !== "ADMIN") {
    await reply.code(403).send({ error: "Permission denied" });
  }
}

export async function requireCsrf(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!request.auth) {
    await reply.code(401).send({ error: "Authentication required" });
    return;
  }
  const csrfToken = request.headers["x-csrf-token"];
  if (typeof csrfToken !== "string") {
    await reply.code(403).send({ error: "Invalid CSRF token" });
    return;
  }
  const result = await getPool().query(
    `SELECT 1 FROM sessions
     WHERE id = $1 AND csrf_digest = $2 AND revoked_at IS NULL
       AND idle_expires_at > $3 AND absolute_expires_at > $3`,
    [request.auth.sessionId, tokenDigest(csrfToken), Date.now()],
  );
  if (result.rowCount !== 1) {
    await reply.code(403).send({ error: "Invalid CSRF token" });
  }
}

export async function rotateCsrfToken(sessionId: string): Promise<string> {
  const csrfToken = randomToken();
  await getPool().query(
    "UPDATE sessions SET csrf_digest = $2 WHERE id = $1 AND revoked_at IS NULL",
    [sessionId, tokenDigest(csrfToken)],
  );
  return csrfToken;
}
