/// <reference lib="webworker" />
import sqlite3InitModule, {
  type Database,
  type Sqlite3Static,
} from "@sqlite.org/sqlite-wasm";
import wasmUrl from "@sqlite.org/sqlite-wasm/sqlite3.wasm?url";
import { Repository } from "./repository";
import { ingest, ingestConnector, ingestFromUrl, ingestYamlDocuments, projectionWithWarnings } from "../ingestion/service";
import { ndjsonParser } from "../ingestion/http";
import { sources } from "../ingestion/connectors";
import { exportData } from "./export";
import { newId } from "../ids";
import { formatFor, type ConfirmImport, type Dataset, type ImportDecision, type Request } from "../ingestion/contracts";

declare const self: DedicatedWorkerGlobalScope;
let repository: Promise<Repository> | undefined;
let resetDatabase: (() => Promise<Repository>) | undefined;
function open() {
  if (!repository)
    repository = new Promise<Repository>((resolve, reject) => {
      if (!navigator.storage?.getDirectory || !navigator.locks) {
        reject(
          new Error(
            "OPFS/Web Locks nicht verfügbar / unavailable. Use a supported browser with local storage enabled.",
          ),
        );
        return;
      }
      navigator.locks
        .request(
          "dlens-sqlite-writer-v1",
          { ifAvailable: true },
          async (lock) => {
            if (!lock) {
              reject(
                new Error(
                  "DLens-Datenbank in anderem Tab geöffnet / Database open in another tab. Close it and reload.",
                ),
              );
              return;
            }
            try {
              // The upstream declaration omits the supported Emscripten module options.
              const initialize = sqlite3InitModule as (options: {
                locateFile: (path: string) => string;
              }) => Promise<Sqlite3Static>;
              const sqlite = await initialize({
                locateFile: (path) => (path.endsWith(".wasm") ? wasmUrl : path),
              });
              const pool = await sqlite.installOpfsSAHPoolVfs({
                directory: "/dlens-sqlite-v1",
                initialCapacity: 8,
              });
              const PoolDatabase = pool.OpfsSAHPoolDb as unknown as new (
                filename: string,
              ) => Database;
              let current: Repository | undefined;
              const create = () => {
                const db = new PoolDatabase("/dlens.sqlite3");
                try { return new Repository(db, sqlite); }
                catch (error) { db.close(); throw error; }
              };
              resetDatabase = async () => {
                current?.close();
                current = undefined;
                await pool.wipeFiles();
                current = create();
                repository = Promise.resolve(current);
                return current;
              };
              try {
                current = create();
                current.recover();
                resolve(current);
              } catch (error) { reject(error); }
              // Retain exclusive ownership even when opening failed, allowing an explicit reset.
              await new Promise(() => {});
            } catch (error) {
              reject(error);
            }
          },
        )
        .catch(reject);
    });
  return repository;
}
let active: { id: string; controller: AbortController } | undefined;
let ack: (() => void) | undefined;
let pendingWarning: { token: string; resolve: (decision: ImportDecision) => void } | undefined;
self.onmessage = async ({
  data,
}: MessageEvent<{
  id: string;
  request?: Request;
  control?: "cancel" | "ack" | "limit";
  token?: string;
  decision?: ImportDecision;
}>) => {
  if (data.control) {
    if (active?.id === data.id) {
      if (data.control === "limit") {
        if (pendingWarning && pendingWarning.token === data.token && ["continue", "cancel", "ignore"].includes(data.decision ?? "")) {
          pendingWarning.resolve(data.decision!); pendingWarning = undefined;
        }
        return;
      }
      if (data.control === "cancel") {
        active.controller.abort(); pendingWarning?.resolve("cancel"); pendingWarning = undefined;
      }
      ack?.();
      ack = undefined;
    }
    return;
  }
  if (active) {
    self.postMessage({ id: data.id, error: "BUSY" });
    return;
  }
  const controller = new AbortController();
  active = { id: data.id, controller };
  const confirm: ConfirmImport = (warning) => new Promise((resolve) => {
    const token = newId("warn"); pendingWarning = { token, resolve };
    self.postMessage({ id: data.id, warning, token });
  });
  try {
    const request = data.request!;
    const opened = await open().catch((error) => {
      if (request.type === "delete-all" && resetDatabase) return undefined;
      throw error;
    });
    controller.signal.throwIfAborted();
    const repo = request.type === "delete-all" ? await resetDatabase!() : opened!;
    let result: unknown;
    switch (request.type) {
      case "list":
        result = repo.list();
        break;
      case "delete":
        repo.delete(request.dataset);
        result = repo.list();
        break;
      case "delete-record":
        repo.deleteRecord(request.dataset, request.generation, request.record);
        result = repo.list();
        break;
      case "delete-all":
        result = repo.list();
        break;
      case "storage":
        result = {
          ...(await navigator.storage.estimate()),
          databaseBytes:
            Number(repo.db.selectValue("PRAGMA page_count")) *
            Number(repo.db.selectValue("PRAGMA page_size")),
          persisted: await navigator.storage.persisted(),
        };
        break;
      case "children":
        result = repo.children(
          request.dataset,
          request.record,
          request.path,
          request.offset,
        );
        break;
      case "query":
        result = repo.query(request.query);
        break;
      case "import": {
        const estimate = await navigator.storage.estimate();
        if (
          estimate.quota &&
          estimate.quota - (estimate.usage ?? 0) < request.file.size * 4
        )
          throw new Error(
            "Zu wenig Browserspeicher / Insufficient browser storage (estimated 4× source size).",
          );
        if (formatFor(request.file) === "yaml") {
          result = await ingestYamlDocuments(repo, request.file, request.csv, controller.signal,
            (progress) => self.postMessage({ id: data.id, progress }), request.language, confirm,
            request.source, request.displayName);
          break;
        }
        result = await ingest(
          repo,
          request.file,
          request.csv,
          controller.signal,
          (progress) => self.postMessage({ id: data.id, progress }),
          request.replace,
          confirm,
          request.source,
          request.displayName,
        );
        break;
      }
      case "url-import": {
        result = await ingestFromUrl(repo, request.url, request.csv, controller.signal,
          (progress) => self.postMessage({ id: data.id, progress }), request.language, confirm,
          request.source, request.displayName);
        break;
      }
      case "remote": {
        const dataset = await ingestConnector(
          repo,
          sources.open("http", { url: request.url, token: request.token }),
          request.name || new URL(request.url).hostname,
          "api",
          0,
          controller.signal,
          (progress) => self.postMessage({ id: data.id, progress }),
          ndjsonParser,
          request.replace,
          confirm,
        );
        if (request.source) {
          const updated: Dataset = { ...dataset, source: request.source };
          repo.db.exec({ sql: "UPDATE datasets SET metadata=? WHERE id=?", bind: [JSON.stringify(updated), dataset.id] });
          result = updated;
        } else result = dataset;
        break;
      }
      case "connector-pull": {
        const endpoint = request.kind === "ndjson"
          ? request.endpoint
          : `${request.endpoint.replace(/\/+$/, "")}/records?table=${encodeURIComponent(request.sourceName)}`;
        const name = `${request.profileName} · ${request.sourceName}`;
        const dataset = await ingestConnector(
          repo,
          sources.open("http", { url: endpoint, token: request.token }),
          name,
          "api",
          0,
          controller.signal,
          (progress) => self.postMessage({ id: data.id, progress }),
          ndjsonParser,
          undefined,
          confirm,
        );
        const updated: Dataset = {
          ...dataset,
          source: {
            kind: "connector",
            connectorId: request.profileId,
            connectorName: request.profileName,
            sourceName: request.sourceName,
          },
        };
        repo.db.exec({ sql: "UPDATE datasets SET metadata=? WHERE id=?", bind: [JSON.stringify(updated), dataset.id] });
        result = updated;
        break;
      }
      case "jazz": {
        const fingerprint =
          request.account +
          ":" +
          Array.from(
            new Uint8Array(
              await crypto.subtle.digest(
                "SHA-256",
                new TextEncoder().encode(request.data),
              ),
            ),
          )
            .map((n) => n.toString(16).padStart(2, "0"))
            .join("") +
          ":1";
        const migrated = repo.db.selectValue(
          "SELECT dataset FROM migrations WHERE fingerprint=?",
          [fingerprint],
        );
        if (migrated) {
          result = repo.dataset(String(migrated));
          break;
        }
        const tables = JSON.parse(request.data);
        if (
          !Array.isArray(tables) ||
          !tables.every(
            (t) =>
              t &&
              Array.isArray(t.path) &&
              t.path.every((p: unknown) => typeof p === "string") &&
              Array.isArray(t.rows) &&
              t.rows.every(
                (r: unknown) => r && typeof r === "object" && !Array.isArray(r),
              ),
          )
        )
          throw new Error("Ungültige Jazz-Daten / Invalid Jazz data.");
        // Keep the existing logical paths, including tables sharing a prefix.
        const input = repo.begin(request.name, "jazz");
        try {
          let id = 0;
          for (const table of tables)
            for (const row of table.rows) {
              controller.signal.throwIfAborted();
              repo.add(input.generation, {
                id: ++id,
                parent: null,
                position: id - 1,
                name: String(id),
                kind: "value",
                value: JSON.stringify(row),
                path: table.path,
                tablePath: table.path,
              });
              if (id % 100 === 0)
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
          const project = projectionWithWarnings(repo, controller.signal, confirm);
          let after = 0;
          for (;;) {
            controller.signal.throwIfAborted();
            const batch = await project(input.generation, after);
            if (!batch.count) break;
            after = batch.after;
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
          const dataset = repo.complete(
            input,
            request.data.length,
            fingerprint,
          );
          result = dataset;
        } catch (error) {
          repo.fail(input.generation, "error", String(error));
          throw error;
        }
        break;
      }
      case "export":
        await exportData(
          repo,
          request.query,
          request.format,
          request.csv,
          async (chunk) => {
            controller.signal.throwIfAborted();
            await new Promise<void>((resolve) => {
              ack = resolve;
              self.postMessage({ id: data.id, chunk });
            });
            controller.signal.throwIfAborted();
          },
          controller.signal,
          request.path,
          request.columns,
        );
        result = true;
        break;
    }
    self.postMessage({ id: data.id, result });
  } catch (error) {
    self.postMessage({
      id: data.id,
      error: controller.signal.aborted
        ? "Abgebrochen / Cancelled"
        : error instanceof Error
          ? error.message
          : String(error),
    });
  } finally {
    active = undefined;
    ack = undefined;
    pendingWarning = undefined;
  }
};
