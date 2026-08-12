import { getConfig } from "./config.js";

interface EncodedBinary {
  __portalBinary: string;
}

interface D1WireResult {
  rows: Array<Record<string, unknown>>;
  changes: number;
}

interface D1WireResponse {
  results: D1WireResult[];
}

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

export interface DatabaseQuery {
  sql: string;
  params?: readonly unknown[];
}

export interface Queryable {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>>;
}

function normalizeSql(sql: string): string {
  return sql
    .replace(/\$(\d+)/gu, "?$1")
    .replace(/::(?:text|inet|jsonb|file_status|integer|boolean|timestamptz)\b/giu, "")
    .replace(/\bnow\(\)/giu, "(unixepoch() * 1000)")
    .replace(/\bLEAST\s*\(/giu, "min(");
}

function encodeParameter(value: unknown): unknown {
  if (Buffer.isBuffer(value)) return { __portalBinary: value.toString("base64") } satisfies EncodedBinary;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "bigint") {
    const numberValue = Number(value);
    if (!Number.isSafeInteger(numberValue)) throw new Error("Database integer exceeds the safe range");
    return numberValue;
  }
  if (value === undefined) return null;
  return value;
}

function isEncodedBinary(value: unknown): value is EncodedBinary {
  return typeof value === "object" && value !== null &&
    "__portalBinary" in value && typeof value.__portalBinary === "string";
}

function decodeRow<T>(row: Record<string, unknown>): T {
  const decoded = Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (isEncodedBinary(value)) return [key, Buffer.from(value.__portalBinary, "base64")];
    if ((key === "locked" || key === "uploaded_by_me") && typeof value === "number") {
      return [key, value === 1];
    }
    if ((key.endsWith("_at") || key === "locked_until") && typeof value === "number") {
      return [key, new Date(value)];
    }
    if (key === "metadata" && typeof value === "string") {
      try {
        return [key, JSON.parse(value) as unknown];
      } catch {
        return [key, {}];
      }
    }
    return [key, value];
  }));
  return decoded as T;
}

class D1BindingClient implements Queryable {
  async query<T = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<T>> {
    const [result] = await this.batch<T>([{ sql, params }]);
    if (!result) throw new Error("D1 returned no query result");
    return result;
  }

  async batch<T = Record<string, unknown>>(
    queries: readonly DatabaseQuery[],
  ): Promise<Array<QueryResult<T>>> {
    if (queries.length < 1 || queries.length > 100) throw new Error("Invalid D1 batch size");
    const response = await fetch(`${getConfig().D1_BINDING_ORIGIN}/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(queries.map((query) => ({
        sql: normalizeSql(query.sql),
        params: (query.params ?? []).map(encodeParameter),
      }))),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`D1 binding query failed with HTTP ${response.status}`);
    const payload = await response.json() as D1WireResponse;
    if (!Array.isArray(payload.results) || payload.results.length !== queries.length) {
      throw new Error("D1 binding returned an invalid result set");
    }
    return payload.results.map((result) => ({
      rows: result.rows.map((row) => decodeRow<T>(row)),
      rowCount: result.rows.length > 0 ? result.rows.length : result.changes,
    }));
  }
}

let database: D1BindingClient | undefined;

export function getPool(): D1BindingClient {
  database ??= new D1BindingClient();
  return database;
}

export function closePool(): Promise<void> {
  database = undefined;
  return Promise.resolve();
}
