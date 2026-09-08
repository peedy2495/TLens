import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { once } from "node:events";
import { pathToFileURL } from "node:url";

export function createConnectorServer({ token, origin, tables, readRows }) {
  if (!token || token.length < 24)
    throw new Error(
      "DLENS_CONNECTOR_TOKEN must contain at least 24 characters.",
    );
  if (!origin || !tables.length)
    throw new Error(
      "Configure DLENS_CONNECTOR_ORIGIN and DLENS_CONNECTOR_TABLES.",
    );
  const allowed = new Set(tables);
  let active = 0;
  return createServer(async (req, res) => {
    if (req.headers.origin && req.headers.origin !== origin) {
      res.writeHead(403).end();
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "GET");
      res.setHeader("Access-Control-Allow-Headers", "Authorization");
      res.writeHead(204).end();
      return;
    }
    const expected = Buffer.from(`Bearer ${token}`),
      received = Buffer.from(req.headers.authorization ?? "");
    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      res.writeHead(401).end();
      return;
    }
    if (req.method !== "GET") {
      res.writeHead(405).end();
      return;
    }
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/schema") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ tables: [...allowed] }));
      return;
    }
    const table = url.searchParams.get("table");
    if (url.pathname !== "/records" || !allowed.has(table)) {
      res.writeHead(404).end();
      return;
    }
    if (active >= 2) {
      res.writeHead(429).end();
      return;
    }
    active++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30 * 60 * 1000);
    res.on("close", () => controller.abort());
    try {
      res.setHeader("Content-Type", "application/x-ndjson");
      for await (const row of readRows(table, controller.signal)) {
        controller.signal.throwIfAborted();
        const line = JSON.stringify(row) + "\n";
        if (Buffer.byteLength(line) > 2 * 1024 * 1024)
          throw new Error("Record too large");
        if (!res.write(line))
          await once(res, "drain", { signal: controller.signal });
      }
      res.end();
    } catch {
      // Never expose driver errors, SQL or connection strings to clients/logs.
      if (!res.headersSent) res.writeHead(502).end("Source unavailable");
      else res.destroy();
    } finally {
      clearTimeout(timeout);
      active--;
    }
  });
}

export async function* databaseRows(connectionString, table, signal) {
  signal.throwIfAborted();
  const parts = table.split(".");
  if (!parts.every((part) => /^[a-zA-Z_][a-zA-Z0-9_$]*$/.test(part)))
    throw new Error("Invalid configured table identifier");
  if (/^postgres(?:ql)?:/.test(connectionString)) {
    const { default: pg } = await import("pg");
    const { default: QueryStream } = await import("pg-query-stream");
    signal.throwIfAborted();
    const client = new pg.Client({
      connectionString,
      connectionTimeoutMillis: 10000,
      types: {
        getTypeParser: (oid, format) =>
          [1082, 1114, 1184].includes(oid)
            ? (value) => value
            : pg.types.getTypeParser(oid, format),
      },
    });
    client.on("error", () => {}); // Query/stream consumers receive errors; late teardown errors must not crash the server.
    const stop = () => {
      void client.end().catch(() => {});
    };
    signal.addEventListener("abort", stop, { once: true });
    try {
      signal.throwIfAborted();
      await client.connect();
      await client.query("SET default_transaction_read_only = on");
      await client.query("SET statement_timeout = '30min'");
      const stream = client.query(
        new QueryStream(
          `SELECT * FROM ${parts.map((p) => '"' + p + '"').join(".")}`,
          [],
          { batchSize: 128 },
        ),
      );
      for await (const row of stream) {
        signal.throwIfAborted();
        yield row;
      }
    } finally {
      signal.removeEventListener("abort", stop);
      await client.end().catch(() => {});
    }
  } else if (/^mysql:/.test(connectionString)) {
    const { default: mysql } = await import("mysql2");
    signal.throwIfAborted();
    const client = mysql.createConnection({
      uri: connectionString,
      dateStrings: true,
      supportBigNumbers: true,
      bigNumberStrings: true,
      multipleStatements: false,
      connectTimeout: 10000,
    });
    client.on("error", () => {}); // Teardown can race the handshake after cancellation.
    const stop = () => client.destroy();
    signal.addEventListener("abort", stop, { once: true });
    try {
      signal.throwIfAborted();
      await client.promise().query("SET SESSION TRANSACTION READ ONLY");
      const stream = client
        .query(`SELECT * FROM ${parts.map((p) => "`" + p + "`").join(".")}`)
        .stream({ highWaterMark: 128 });
      for await (const row of stream) {
        signal.throwIfAborted();
        yield row;
      }
    } finally {
      signal.removeEventListener("abort", stop);
      client.destroy();
    }
  } else throw new Error("Use a PostgreSQL or MySQL/MariaDB connection URL.");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const connection = process.env.DLENS_CONNECTOR_DATABASE_URL;
  if (!connection)
    throw new Error("Set DLENS_CONNECTOR_DATABASE_URL on the server.");
  const server = createConnectorServer({
    token: process.env.DLENS_CONNECTOR_TOKEN,
    origin: process.env.DLENS_CONNECTOR_ORIGIN,
    tables: (process.env.DLENS_CONNECTOR_TABLES ?? "")
      .split(",")
      .filter(Boolean),
    readRows: (table, signal) => databaseRows(connection, table, signal),
  });
  server.listen(
    Number(process.env.DLENS_CONNECTOR_PORT ?? 8787),
    process.env.DLENS_CONNECTOR_HOST ?? "127.0.0.1",
    () => console.log("DLens connector listening"),
  );
}
