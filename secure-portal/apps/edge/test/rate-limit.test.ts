import { describe, expect, it } from "vitest";
import { nextRateState, ratePolicyFor } from "../src/rate-limit.js";

describe("Cloudflare edge authentication limiter", () => {
  it("limits only the explicit sensitive endpoints", () => {
    expect(ratePolicyFor("post", "/api/v1/auth/login")).toEqual({ limit: 10, windowSeconds: 60 });
    expect(ratePolicyFor("post", "/api/v1/public/secure-transfers/unlock")).toEqual({ limit: 10, windowSeconds: 300 });
    expect(ratePolicyFor("GET", "/api/v1/auth/login")).toBeUndefined();
    expect(ratePolicyFor("POST", "/api/v1/files/example/download-ticket")).toBeUndefined();
  });

  it("denies the request after the fixed-window limit and resets after expiry", () => {
    const policy = { limit: 2, windowSeconds: 60 };
    const first = nextRateState(undefined, policy, 1_000);
    const second = nextRateState(first.state, policy, 2_000);
    const third = nextRateState(second.state, policy, 3_000);
    const reset = nextRateState(third.state, policy, 61_001);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(reset).toEqual({ state: { count: 1, windowEndsAt: 121_001 }, allowed: true });
  });
});
