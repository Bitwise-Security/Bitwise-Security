import path from "node:path";
import { fileURLToPath } from "node:url";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { LogController } from "fastify";
import { ZodError } from "zod";
import { getConfig } from "./config.js";
import { AppError } from "./errors.js";
import { getRedis } from "./redis.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerFileRoutes } from "./routes/files.js";
import { isOriginAllowed } from "./security/origin.js";
import { authenticateRequest } from "./security/sessions.js";

export async function buildApp() {
  const config = getConfig();
  const app = Fastify({
    trustProxy: 1,
    bodyLimit: 1_048_576,
    // URLs may contain one-time download tickets. Never emit request URLs through
    // Fastify's automatic request-completion logs.
    logController: new LogController({ disableRequestLogging: true }),
    logger: {
      level: config.NODE_ENV === "test" ? "silent" : "info",
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.headers['x-csrf-token']",
          "res.headers['set-cookie']",
          "body.password",
          "body.code",
          "body.token",
          "body.challengeToken",
          "body.enrollmentToken",
        ],
        censor: "[REDACTED]",
      },
    },
  });

  await app.register(cookie);
  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        mediaSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: config.NODE_ENV === "production" ? [] : null,
      },
    },
    hsts:
      config.NODE_ENV === "production"
        ? { maxAge: 63_072_000, includeSubDomains: true, preload: true }
        : false,
    referrerPolicy: { policy: "no-referrer" },
    frameguard: { action: "deny" },
  });
  await app.register(rateLimit, {
    global: false,
    max: 100,
    timeWindow: "1 minute",
    ...(config.NODE_ENV === "test" || config.RATE_LIMIT_BACKEND === "memory"
      ? {}
      : { redis: getRedis() }),
  });
  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer", bodyLimit: config.UPLOAD_CHUNK_SIZE_BYTES + 16 },
    (_request, body, done) => done(null, body),
  );

  app.decorateRequest("auth", null);
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (
      !isOriginAllowed(
        request.method,
        origin,
        config.PUBLIC_ORIGIN,
        config.NODE_ENV === "production",
      )
    ) {
      await reply.code(403).send({ error: "Untrusted request origin" });
      return;
    }
    if (request.url.startsWith("/api/")) {
      reply.header("Cache-Control", "no-store");
      reply.header("Pragma", "no-cache");
    }
    await authenticateRequest(request);
  });

  app.get("/api/v1/health", () => ({ status: "ok" }));
  registerAuthRoutes(app);
  registerAdminRoutes(app);
  registerFileRoutes(app);

  app.setErrorHandler(async (error, request, reply) => {
    if (error instanceof AppError) {
      await reply.code(error.statusCode).send({ error: error.message, code: error.code });
      return;
    }
    if (error instanceof ZodError) {
      await reply.code(400).send({ error: "Invalid request", code: "INVALID_REQUEST" });
      return;
    }
    if ((error as { statusCode?: number }).statusCode === 429) {
      await reply.code(429).send({ error: "Too many requests", code: "RATE_LIMITED" });
      return;
    }
    request.log.error({ err: error }, "Unhandled request error");
    await reply.code(500).send({ error: "Internal server error", code: "INTERNAL_ERROR" });
  });

  if (config.NODE_ENV === "production") {
    const apiDirectory = path.dirname(fileURLToPath(import.meta.url));
    const webRoot = path.resolve(apiDirectory, "../../web/dist");
    await app.register(fastifyStatic, { root: webRoot, wildcard: false });
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith("/api/")) {
        await reply.code(404).send({ error: "Not found" });
        return;
      }
      await reply.sendFile("index.html", { maxAge: 0, immutable: false });
    });
  }

  return app;
}
