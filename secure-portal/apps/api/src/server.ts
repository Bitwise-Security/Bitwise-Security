import { buildApp } from "./app.js";
import { getConfig } from "./config.js";
import { closePool } from "./db.js";
import { closeRedis } from "./redis.js";

const config = getConfig();
const app = await buildApp();

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "Shutting down");
  await app.close();
  await closePool();
  await closeRedis();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ port: config.PORT, host: "0.0.0.0" });

