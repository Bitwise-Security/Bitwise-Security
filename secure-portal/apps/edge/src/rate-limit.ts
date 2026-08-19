export interface RateState {
  count: number;
  windowEndsAt: number;
}

export interface RatePolicy {
  limit: number;
  windowSeconds: number;
}

const AUTH_POLICIES = new Map<string, RatePolicy>([
  ["POST /api/v1/auth/login", { limit: 10, windowSeconds: 60 }],
  ["POST /api/v1/auth/mfa/verify", { limit: 10, windowSeconds: 300 }],
  ["POST /api/v1/auth/password-reset/request", { limit: 5, windowSeconds: 900 }],
  ["POST /api/v1/auth/password-reset/confirm", { limit: 5, windowSeconds: 900 }],
  ["POST /api/v1/auth/mfa/enrol", { limit: 10, windowSeconds: 600 }],
  ["POST /api/v1/auth/mfa/confirm", { limit: 10, windowSeconds: 600 }],
  ["POST /api/v1/invitations/accept", { limit: 10, windowSeconds: 600 }],
  ["POST /api/v1/admin/clients/invitations", { limit: 20, windowSeconds: 3600 }],
  ["POST /api/v1/admin/spaces", { limit: 20, windowSeconds: 3600 }],
  ["POST /api/v1/public/secure-transfers/unlock", { limit: 10, windowSeconds: 300 }],
  // Operator container controls: throttled so the bearer token cannot be
  // brute-forced against an endpoint that answers 404 either way.
  ["POST /control/container/start", { limit: 10, windowSeconds: 600 }],
  ["POST /control/container/stop", { limit: 10, windowSeconds: 600 }],
  ["GET /control/container/status", { limit: 30, windowSeconds: 600 }],
]);

export function ratePolicyFor(method: string, pathname: string): RatePolicy | undefined {
  return AUTH_POLICIES.get(`${method.toUpperCase()} ${pathname}`);
}

export function nextRateState(
  current: RateState | undefined,
  policy: RatePolicy,
  now: number,
): { state: RateState; allowed: boolean } {
  const state = !current || current.windowEndsAt <= now
    ? { count: 1, windowEndsAt: now + policy.windowSeconds * 1000 }
    : { count: current.count + 1, windowEndsAt: current.windowEndsAt };
  return { state, allowed: state.count <= policy.limit };
}
