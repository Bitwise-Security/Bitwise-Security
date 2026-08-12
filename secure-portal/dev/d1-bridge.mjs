import { createServer } from "node:http";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const databasePath = resolve(process.env.D1_DB_PATH ?? "/data/portal.sqlite");
const migrationsPath = resolve(process.env.D1_MIGRATIONS_PATH ?? "/migrations");
const port = Number(process.env.PORT ?? 8788);

mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
database.exec(`CREATE TABLE IF NOT EXISTS d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const applied = database.prepare("SELECT 1 FROM d1_migrations WHERE name = ?");
const recordMigration = database.prepare("INSERT INTO d1_migrations (name) VALUES (?)");
for (const name of readdirSync(migrationsPath).filter((entry) => /^\d+.*\.sql$/u.test(entry)).sort()) {
  if (applied.get(name)) continue;
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(readFileSync(resolve(migrationsPath, name), "utf8"));
    recordMigration.run(name);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function decode(value) {
  if (value && typeof value === "object" && typeof value.__portalBinary === "string") {
    return Uint8Array.from(Buffer.from(value.__portalBinary, "base64"));
  }
  if (value === null || typeof value === "string" || typeof value === "number") return value;
  throw new Error("Invalid parameter");
}

function encode(value) {
  if (value instanceof Uint8Array) return { __portalBinary: Buffer.from(value).toString("base64") };
  if (typeof value === "bigint") {
    const converted = Number(value);
    if (!Number.isSafeInteger(converted)) throw new Error("Unsafe database integer");
    return converted;
  }
  return value;
}

function executeBatch(queries) {
  if (!Array.isArray(queries) || queries.length < 1 || queries.length > 100) {
    throw new Error("Invalid batch size");
  }
  database.exec("BEGIN IMMEDIATE");
  try {
    const results = queries.map((query) => {
      if (!query || typeof query.sql !== "string" || query.sql.length < 1 || query.sql.length > 50_000 ||
          !Array.isArray(query.params) || query.params.length > 200) {
        throw new Error("Invalid statement");
      }
      const statement = database.prepare(query.sql);
      const rows = statement.all(...query.params.map(decode));
      const isRead = /^\s*(?:SELECT|PRAGMA)\b/iu.test(query.sql);
      const changes = isRead ? 0 : Number(database.prepare("SELECT changes() AS count").get().count);
      return {
        rows: rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, encode(value)]))),
        changes,
      };
    });
    database.exec("COMMIT");
    return results;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

const server = createServer((request, response) => {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  if (request.method === "GET" && request.url === "/health") {
    response.end('{"status":"ok"}');
    return;
  }
  if (request.method !== "POST" || request.url !== "/batch") {
    response.statusCode = 404;
    response.end('{"error":"Not found"}');
    return;
  }
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    body += chunk;
    if (body.length > 2_000_000) request.destroy();
  });
  request.on("end", () => {
    try {
      response.end(JSON.stringify({ results: executeBatch(JSON.parse(body)) }));
    } catch {
      response.statusCode = 400;
      response.end('{"error":"Database operation failed"}');
    }
  });
});

server.listen(port, "0.0.0.0");

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
