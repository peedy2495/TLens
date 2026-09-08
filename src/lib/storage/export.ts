import { exportCsv, type CsvOptions } from "../csv";
import { limits, type Query } from "../ingestion/contracts";
import type { Repository } from "./repository";

// The consumer acknowledges every chunk before the next SQLite row is read.
export async function exportData(
  repo: Repository,
  query: Query,
  format: "json" | "csv",
  csv: CsvOptions,
  write: (chunk: string) => Promise<void>,
  signal: AbortSignal,
  path?: string[],
  columns?: string[],
) {
  const where = repo.where(query);
  const paths = repo.db.prepare(
    `SELECT path FROM records WHERE ${where.sql} ${path ? "AND path=?" : ""} GROUP BY path ORDER BY min(id)`,
  );
  paths.bind([...where.bind, ...(path ? [JSON.stringify(path)] : [])]);
  let firstTable = true;
  try {
    if (format === "json") await write("[");
    while (paths.step()) {
      const pathText = String(paths.get(0)),
        order =
          format === "csv"
            ? repo.order(query, pathText)
            : { sql: "id", bind: [] };
      if (format === "json")
        await write(`${firstTable ? "" : ","}{"path":${pathText},"rows":[`);
      if (format === "csv") {
        if (!columns?.length)
          throw new Error("No visible columns / Keine sichtbaren Spalten.");
        await write(exportCsv([], columns, csv));
      }
      const statement = repo.db.prepare(
        `SELECT payload FROM records WHERE ${where.sql} AND path=? ORDER BY ${order.sql}`,
      );
      let firstRow = true,
        buffer = "";
      try {
        statement.bind([...where.bind, pathText, ...order.bind]);
        while (statement.step()) {
          signal.throwIfAborted();
          const payload = String(statement.get(0));
          buffer +=
            format === "json"
              ? (firstRow ? "" : ",") + payload
              : exportCsv([JSON.parse(payload)], columns!, {
                  ...csv,
                  header: false,
                }).slice(1);
          firstRow = false;
          if (buffer.length >= limits.chunkBytes) {
            await write(buffer);
            buffer = "";
          }
        }
        if (buffer) await write(buffer);
      } finally {
        statement.finalize();
      }
      if (format === "json") await write("]}");
      firstTable = false;
    }
    if (format === "json") await write("]");
  } finally {
    paths.finalize();
  }
}
