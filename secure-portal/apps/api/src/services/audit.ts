import type { FastifyRequest } from "fastify";
import { getPool } from "../db.js";
import type { AuditInput, Queryable } from "../types.js";
import { requestContext } from "../types.js";

export async function writeAuditEvent(
  request: FastifyRequest,
  event: AuditInput,
  queryable: Queryable = getPool(),
): Promise<void> {
  const context = requestContext(request);
  await queryable.query(
    `INSERT INTO audit_events
      (organization_id, actor_user_id, action, target_type, target_id, outcome,
       ip_address, user_agent, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::inet, $8, $9::jsonb)`,
    [
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
  );
}

