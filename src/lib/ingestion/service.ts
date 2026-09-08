import { sources } from "./connectors";
import { createParser } from "./parsers";
import {
  formatFor,
  limits,
  type Progress,
  type Connector,
  type EntitySink,
  type Parser,
} from "./contracts";
import type { CsvOptions } from "../csv";
import type { Repository } from "../storage/repository";

export async function ingest(
  repository: Repository,
  file: File,
  csv: CsvOptions,
  signal: AbortSignal,
  progress: (p: Progress) => void,
  replace?: string,
) {
  const format = formatFor(file);
  if (format === "yaml" && file.size > limits.yamlBytes)
    throw new Error("YAML: Maximal 5 MB / Maximum 5 MB.");
  return ingestConnector(
    repository,
    sources.open(format, file),
    file.name,
    format,
    file.size,
    signal,
    progress,
    (sink) => createParser(format, sink, csv),
    replace,
  );
}
export async function ingestConnector(
  repository: Repository,
  source: Connector,
  name: string,
  format: string,
  total: number,
  signal: AbortSignal,
  progress: (p: Progress) => void,
  makeParser: (sink: EntitySink) => Parser,
  replace?: string,
) {
  const input = repository.begin(name, format, replace);
  let bytes = 0,
    records = 0,
    lastProgress = 0,
    batchBytes = 0,
    transactionOpen = false;
  const parser = makeParser({
    add: (entity) => repository.add(input.generation, entity),
    update: (id, value) => repository.updateEntity(input.generation, id, value),
  });
  try {
    await source.open(signal);
    for await (const chunk of source.read()) {
      signal.throwIfAborted();
      if (!transactionOpen) {
        repository.db.exec("BEGIN");
        transactionOpen = true;
      }
      parser.write(chunk);
      bytes += chunk.length;
      batchBytes += chunk.length;
      if (batchBytes >= 4 * 1024 * 1024) {
        repository.db.exec("COMMIT");
        transactionOpen = false;
        batchBytes = 0;
      }
      if (performance.now() - lastProgress > 150) {
        progress({ phase: "reading", bytes, total, records });
        lastProgress = performance.now();
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    signal.throwIfAborted();
    if (transactionOpen) {
      repository.db.exec("COMMIT");
      transactionOpen = false;
    }
    repository.db.transaction(() => parser.end());
    progress({ phase: "indexing", bytes, total, records });
    repository.prepareProjection(input.generation, format === "xml");
    let after = 0;
    for (;;) {
      signal.throwIfAborted();
      const result = repository.projectBatch(input.generation, after);
      after = result.after;
      records += result.count;
      if (performance.now() - lastProgress > 150) {
        progress({ phase: "indexing", bytes, total, records });
        lastProgress = performance.now();
      }
      if (!result.count) break;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    signal.throwIfAborted();
    const dataset = repository.complete(input, bytes);
    progress({ phase: "completed", bytes, total, records });
    return dataset;
  } catch (error) {
    if (transactionOpen) repository.db.exec("ROLLBACK");
    repository.fail(
      input.generation,
      signal.aborted ? "cancelled" : "error",
      String(error),
    );
    throw error;
  } finally {
    await source.close();
  }
}
