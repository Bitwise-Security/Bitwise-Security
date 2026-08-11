import type { FastifyReply, FastifyRequest } from "fastify";
import type pg from "pg";
import { getConfig } from "../config.js";
import { getPool } from "../db.js";
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
  client: pg.PoolClient,
  request: FastifyRequest,
  userId: string,
): Promise<{ sessionToken: string; csrfToken: string }> {
  const config = getConfig();
  const sessionToken = randomToken();
  const csrfToken = randomToken();
  const userAgent = request.headers["user-agent"];
  await client.query(
    `INSERT INTO sessions
       (user_id, token_digest, csrf_digest, ip_address, user_agent,
        idle_expires_at, absolute_expires_at)
     VALUES ($1, $2, $3, $4::inet, $5,
       now() + ($6 * interval '1 minute'),
       now() + ($7 * interval '1 hour'))`,
    [
      userId,
      tokenDigest(sessionToken),
      tokenDigest(csrfToken),
      request.ip,
      typeof userAgent === "string" ? userAgent.slice(0, 500) : null,
      config.SESSION_IDLE_MINUTES,
      config.SESSION_ABSOLUTE_HOURS,
    ],
  );
  return { sessionToken, csrfToken };
}

export async function authenticateRequest(request: FastifyRequest): Promise<void> {
  request.auth = null;
  const token = request.cookies[sessionCookieName()];
  if (!token) return;

  const config = getConfig();
  const result = await getPool().query<{
    session_id: string;
    user_id: string;
    email: string;
    display_name: string;
    organization_id: string;
    role: "ADMIN" | "CLIENT";
  }>(
    `UPDATE sessions s
     SET last_seen_at = now(),
         idle_expires_at = LEAST(
           absolute_expires_at,
           now() + ($2 * interval '1 minute')
         )
     FROM users u, organization_memberships om
     WHERE s.token_digest = $1
       AND s.user_id = u.id
       AND om.user_id = u.id
       AND s.revoked_at IS NULL
       AND s.idle_expires_at > now()
       AND s.absolute_expires_at > now()
       AND u.status = 'ACTIVE'
     RETURNING s.id AS session_id, u.id AS user_id, u.email::text,
       u.display_name, om.organization_id, om.role`,
    [tokenDigest(token), config.SESSION_IDLE_MINUTES],
  );
  const row = result.rows[0];
  if (!row) return;
  request.auth = {
    sessionId: row.session_id,
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
       AND idle_expires_at > now() AND absolute_expires_at > now()`,
    [request.auth.sessionId, tokenDigest(csrfToken)],
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

