import type { FastifyRequest } from "fastify";
import type pg from "pg";

export type Role = "ADMIN" | "CLIENT";

export interface AuthContext {
  sessionId: string;
  userId: string;
  email: string;
  displayName: string;
  organizationId: string;
  role: Role;
}

export interface AuditInput {
  organizationId?: string | null;
  actorUserId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  outcome: "SUCCESS" | "FAILURE";
  metadata?: Record<string, string | number | boolean | null>;
}

export type Queryable = Pick<pg.Pool, "query"> | Pick<pg.PoolClient, "query">;

export function requestContext(request: FastifyRequest): {
  ipAddress: string;
  userAgent: string | null;
} {
  const userAgent = request.headers["user-agent"];
  return {
    ipAddress: request.ip,
    userAgent: typeof userAgent === "string" ? userAgent.slice(0, 500) : null,
  };
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

