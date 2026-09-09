import { sources } from "./connectors";
import { parseAllDocuments } from "yaml";
import { createParser } from "./parsers";
import {
  formatFor,
  limits,
  type Dataset,
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

export async function ingestYamlDocuments(
  repository: Repository, file: File, csv: CsvOptions, signal: AbortSignal,
  progress: (p: Progress) => void, language: "de" | "en" = "de",
) {
  if (file.size > limits.yamlBytes) throw new Error("YAML: Maximal 5 MB / Maximum 5 MB.");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
  signal.throwIfAborted();
  const documents = parseAllDocuments(text, { uniqueKeys: true });
  if (!documents.length || documents.length > 1000) throw new Error("YAML: 1–1000 Dokumente / documents required.");
  const previous = repository.list().filter((data) => data.format === "yaml" &&
    (data.sourceFile === file.name || (!data.sourceFile && data.name === file.name)));
  const staged: ReturnType<Repository["begin"]>[] = [];
  let records = 0;
  try {
    for (const [index, document] of documents.entries()) {
      signal.throwIfAborted();
      if (document.errors.length) throw document.errors[0];
      if (document.warnings.length) throw document.warnings[0];
      const value = document.toJS({ maxAliasCount: 50 });
      const part = index + 1;
      const old = previous.find((data) => (data.part ?? 1) === part);
      const input = repository.begin(`${file.name} · ${language === "de" ? "Teil" : "Part"} ${part}`, "yaml", old?.id);
      staged.push(input);
      const parser = createParser("json", {
        add: (entity) => repository.add(input.generation, entity),
        update: (id, value) => repository.updateEntity(input.generation, id, value),
      }, csv);
      repository.db.transaction(() => {
        parser.write(new TextEncoder().encode(JSON.stringify(value)));
        parser.end();
      });
      repository.prepareProjection(input.generation, false);
      let after = 0;
      for (;;) {
        signal.throwIfAborted();
        const batch = repository.projectBatch(input.generation, after);
        records += batch.count;
        after = batch.after;
        if (!batch.count) break;
        progress({ phase: "indexing", bytes: file.size, total: file.size, records });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    signal.throwIfAborted();
    const datasets: Dataset[] = [];
    // Publish all documents together so a malformed later part preserves the old file.
    repository.db.transaction(() => {
      for (const [index, input] of staged.entries()) {
        const data = { ...repository.complete(input, file.size), sourceFile: file.name, part: index + 1 };
        repository.db.exec({ sql: "UPDATE datasets SET metadata=? WHERE id=?", bind: [JSON.stringify(data), data.id] });
        datasets.push(data);
      }
      for (const old of previous) if (!datasets.some((data) => data.id === old.id)) {
        repository.db.exec({ sql: "DELETE FROM datasets WHERE id=?", bind: [old.id] });
        repository.clean(old.generation);
      }
    });
    progress({ phase: "completed", bytes: file.size, total: file.size, records });
    return datasets;
  } catch (error) {
    for (const input of staged) repository.fail(input.generation, signal.aborted ? "cancelled" : "error", String(error));
    throw error;
  }
}
