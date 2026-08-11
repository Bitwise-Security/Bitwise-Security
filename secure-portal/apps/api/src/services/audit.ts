import type { FastifyRequest } from "fastify";
import { getPool } from "../db.js";
import type { DatabaseQuery } from "../db.js";
import type { AuditInput, Queryable } from "../types.js";
import { requestContext } from "../types.js";

export async function writeAuditEvent(
  request: FastifyRequest,
  event: AuditInput,
  queryable: Queryable = getPool(),
): Promise<void> {
  const query = auditEventQuery(request, event);
  await queryable.query(query.sql, query.params);
}

export function auditEventQuery(request: FastifyRequest, event: AuditInput): DatabaseQuery {
  const context = requestContext(request);
  return {
    sql:
    `INSERT INTO audit_events
      (organization_id, actor_user_id, action, target_type, target_id, outcome,
       ip_address, user_agent, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    params: [
      event.organizationId ?? null,
      event.actorUserId ?? null,
      event.action,
      event.targetType ?? null,
      event.targetId ?? null,
      event.outcome,
      context.ipAddress,
      context.userAgent,
      JSON.stringify(event.metadata ?? {}),
    ],
  };
}
