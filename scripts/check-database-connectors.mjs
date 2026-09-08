import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import pg from "pg";
import mysql from "mysql2/promise";
import { createConnectorServer, databaseRows } from "../server/connector.mjs";
const exec = promisify(execFile),
  containers = [];
const password = randomBytes(18).toString("hex");
const results = [];
async function run(image, env, port) {
  const { stdout } = await exec("docker", [
    "run",
    "--rm",
    "--label",
    "com.dlens.test=connector",
    "-d",
    "-p",
    `127.0.0.1::${port}`,
    ...Object.entries(env).flatMap(([key, value]) => ["-e", `${key}=${value}`]),
    image,
  ]);
  const id = stdout.trim();
  containers.push(id);
  const mapping = await exec("docker", ["port", id, `${port}/tcp`]);
  return mapping.stdout.trim().split(":").at(-1);
}
async function ready(open) {
  for (let i = 0; i < 90; i++) {
    try {
      return await open();
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("Test database did not become ready");
}
async function check(connection, driver) {
  const rows = [];
  for await (const row of databaseRows(
    connection,
    "events",
    new AbortController().signal,
  ))
    rows.push(row);
  assert.deepEqual(rows.map((r) => r.ID).sort(), ["001", "002"]);
  assert.equal(rows.find((r) => r.ID === "001").Date, "2026-09-08");
  const server = createConnectorServer({
    token: password,
    origin: "https://dlens.test",
    tables: ["events"],
    readRows: (table, signal) => databaseRows(connection, table, signal),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/records?table=events`,
      { headers: { Authorization: `Bearer ${password}` } },
    );
    assert.equal(response.status, 200);
    const output = (await response.text()).trim().split("\n").map(JSON.parse);
    assert.equal(output.length, 2);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(async () => {
      for await (const row of databaseRows(
        connection,
        "events",
        controller.signal,
      ))
        void row;
    });
    const connectingAbort = new AbortController();
    const iterator = databaseRows(connection, "events", connectingAbort.signal);
    const pending = iterator.next();
    connectingAbort.abort();
    await assert.rejects(pending);
    await new Promise((resolve) => setTimeout(resolve, 100));
    results.push({
      driver,
      rows: rows.length,
      datePreserved: true,
      authenticatedStream: true,
      cancellation: true,
    });
    console.log(
      `PASS: ${driver} read-only table stream, date/text preservation, backend and cancellation`,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
try {
  const pgPort = await run(
    "postgres:16-alpine",
    { POSTGRES_PASSWORD: password, POSTGRES_DB: "dlens_test" },
    5432,
  );
  const pgUrl = `postgres://postgres:${password}@127.0.0.1:${pgPort}/dlens_test`;
  const admin = await ready(async () => {
    const client = new pg.Client({ connectionString: pgUrl });
    await client.connect();
    return client;
  });
  try {
    await admin.query(
      "CREATE TABLE events(\"ID\" text, \"Date\" date); INSERT INTO events VALUES('001','2026-09-08'),('002','2026-09-09');",
    );
    await admin.query(
      `CREATE USER dlens_read PASSWORD '${password}'; GRANT SELECT ON events TO dlens_read;`,
    );
  } finally {
    await admin.end();
  }
  await check(
    pgUrl
      .replace("postgres:", "postgres:")
      .replace("://postgres:", "://dlens_read:"),
    "PostgreSQL 16",
  );
  const myPort = await run(
    "mariadb:11",
    {
      MARIADB_ROOT_PASSWORD: password,
      MARIADB_ROOT_HOST: "%",
      MARIADB_DATABASE: "dlens_test",
    },
    3306,
  );
  const myAdmin = await ready(() =>
    mysql.createConnection({
      host: "127.0.0.1",
      port: Number(myPort),
      user: "root",
      password,
      database: "dlens_test",
    }),
  );
  try {
    await myAdmin.query("CREATE TABLE events(ID varchar(10), Date date)");
    await myAdmin.query("INSERT INTO events VALUES (?,?),(?,?)", [
      "001",
      "2026-09-08",
      "002",
      "2026-09-09",
    ]);
    await myAdmin.query(
      `CREATE USER 'dlens_read'@'%' IDENTIFIED BY '${password}'`,
    );
    await myAdmin.query(
      "GRANT SELECT ON dlens_test.events TO 'dlens_read'@'%'",
    );
  } finally {
    await myAdmin.end();
  }
  await check(
    `mysql://dlens_read:${password}@127.0.0.1:${myPort}/dlens_test`,
    "MariaDB 11",
  );
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/database-connectors.json",
    JSON.stringify(results, null, 2),
  );
} finally {
  for (const id of containers)
    await exec("docker", ["stop", id]).catch(() => {});
}
