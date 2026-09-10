import { sources } from "./connectors";
import { parseAllDocuments } from "yaml";
import { createParser } from "./parsers";
import {
  formatFor,
  RecordLimit,
  type ConfirmImport,
  limits,
  type Dataset,
  type Progress,
  type Connector,
  type EntitySink,
  type Parser,
} from "./contracts";
import { resolveDownloadFilename } from "./download-filename";
import type { CsvOptions } from "../csv";
import type { Repository } from "../storage/repository";

export async function ingest(
  repository: Repository,
  file: File,
  csv: CsvOptions,
  signal: AbortSignal,
  progress: (p: Progress) => void,
  replace?: string,
  confirm?: ConfirmImport,
  source?: Dataset["source"],
  displayName?: string,
) {
  const format = formatFor(file);
  if (format === "yaml" && file.size > limits.yamlBytes)
    throw new Error("YAML: Maximal 5 MB / Maximum 5 MB.");
  const dataset = await ingestConnector(
    repository,
    sources.open(format, file),
    displayName ?? file.name,
    format,
    file.size,
    signal,
    progress,
    (sink) => createParser(format, sink, csv),
    replace,
    confirm,
  );
  if (source) return attachSource(repository, dataset, source);
  return dataset;
}

function attachSource(repository: Repository, dataset: Dataset, source: Dataset["source"]): Dataset {
  const updated = { ...dataset, source };
  repository.db.exec({ sql: "UPDATE datasets SET metadata=? WHERE id=?", bind: [JSON.stringify(updated), dataset.id] });
  return updated;
}

class StreamConnector {
  readonly capabilities = { streaming: true, cancellable: true, knownTotalSize: false, preview: false, schemaDiscovery: false, resumable: false };
  private reader?: ReadableStreamDefaultReader<Uint8Array>;
  constructor(private body: ReadableStream<Uint8Array>, private signal: AbortSignal) {}
  async open(signal: AbortSignal) {
    signal.throwIfAborted();
    this.reader = this.body.getReader();
  }
  async *read() {
    if (!this.reader) throw new Error("Connector is not open");
    for (;;) {
      this.signal.throwIfAborted();
      const { value, done } = await this.reader.read();
      if (done) break;
      for (let offset = 0; offset < value.length; offset += limits.chunkBytes) {
        this.signal.throwIfAborted();
        yield value.subarray(offset, offset + limits.chunkBytes);
      }
    }
  }
  async close() {
    try { await this.reader?.cancel(); } catch { /* Already closed. */ }
    this.reader?.releaseLock();
    this.reader = undefined;
  }
}

function relayEndpointFor(rawUrl: string): string {
  const query = `?url=${encodeURIComponent(rawUrl)}`;
  try {
    // Same-origin relay: works in the page, the storage worker and tests.
    if (typeof location !== "undefined" && location.href) {
      return new URL(`/api/import-url${query}`, location.href).toString();
    }
  } catch { /* Fall through to the relative path. */ }
  return `/api/import-url${query}`;
}

function cancelledError(): Error {
  return new Error("Abgebrochen / Cancelled");
}

function isAbort(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof DOMException && error.name === "AbortError");
}

function unsupportedDownloadError(filename: string | null): Error {
  const shown = filename ? ` „${filename}“` : "";
  return new Error(
    `URL-Import: Die heruntergeladene Datei${shown} hat kein unterstütztes Format (JSON, YAML, YML, KYAML, CSV, XML). / URL import: downloaded file${filename ? ` “${filename}”` : ""} has no supported format (JSON, YAML, YML, KYAML, CSV, XML).`,
  );
}

async function cancelBody(response: Response | undefined): Promise<void> {
  try {
    await response?.body?.cancel();
  } catch { /* Already consumed or closed. */ }
}

export async function ingestFromUrl(
  repository: Repository,
  rawUrl: string,
  csv: CsvOptions,
  signal: AbortSignal,
  progress: (p: Progress) => void,
  language: "de" | "en" = "de",
  confirm?: ConfirmImport,
  source?: Dataset["source"],
  displayName?: string,
) {
  void displayName;
  const url = rawUrl.trim();
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("URL must use http(s).");
  const identityUrl = parsed.toString();
  // Direct browser streaming first, so CORS-enabled sources (including large
  // ones) never depend on the relay. A network/CORS failure falls back to the
  // same-origin relay; HTTP answers are authoritative and never retried.
  // The supported format is resolved only after the response arrives, from
  // the downloaded filename (Content-Disposition, else final response URL).
  let response: Response | undefined;
  let relayed = false;
  try {
    response = await fetch(url, { signal, credentials: "omit", redirect: "follow" });
  } catch (error) {
    if (isAbort(error, signal)) throw cancelledError();
    try {
      response = await fetch(relayEndpointFor(url), { signal, credentials: "omit", redirect: "follow" });
    } catch (relayError) {
      if (isAbort(relayError, signal)) throw cancelledError();
      throw new Error("URL-Import blockiert (CORS oder Netzwerk) und Relay nicht erreichbar. DLens-Entwicklungs-/Vorschau-Server oder Vercel-Deployment mit /api/import-url verwenden. / URL import blocked (CORS or network) and relay unavailable. Use a DLens dev/preview server or Vercel deployment serving /api/import-url.");
    }
    relayed = true;
    if (!response.ok || !response.body) {
      if (response.status === 413) throw new Error("URL-Import überschreitet die Relay-Größenbegrenzung. / URL import exceeds the relay size limit.");
      throw new Error(`URL-Import: HTTP ${response.status} / URL import: HTTP ${response.status}.`);
    }
  }
  if (!response.ok || !response.body) throw new Error(`URL import: HTTP ${response.status}`);
  const headerFor = (current: Response): string | null => {
    try {
      return current.headers.get("content-disposition");
    } catch {
      return null;
    }
  };
  let filename = resolveDownloadFilename({ disposition: headerFor(response), responseUrl: relayed ? undefined : response.url, fallbackUrl: url });
  let format: ReturnType<typeof formatFor> | null = null;
  try {
    format = filename ? formatFor({ name: filename }) : null;
  } catch {
    format = null;
  }
  // Same-origin relay exposes Content-Disposition; a cross-origin direct
  // response may hide it. When the request URL itself carries no usable
  // filename, retry the relay once to obtain the trustworthy server name
  // instead of guessing from the URL or the content type.
  if (!format && !relayed && !signal.aborted) {
    await cancelBody(response);
    try {
      const retry = await fetch(relayEndpointFor(url), { signal, credentials: "omit", redirect: "follow" });
      if (retry.ok && retry.body) {
        const retryName = resolveDownloadFilename({ disposition: headerFor(retry), fallbackUrl: url });
        try {
          const retryFormat = retryName ? formatFor({ name: retryName }) : null;
          if (retryFormat) {
            response = retry;
            relayed = true;
            filename = retryName;
            format = retryFormat;
          } else {
            await cancelBody(retry);
          }
        } catch {
          await cancelBody(retry);
        }
      } else {
        await cancelBody(retry);
      }
    } catch (retryError) {
      if (isAbort(retryError, signal)) throw cancelledError();
      // Fall through to the bilingual unsupported-format error below.
    }
  }
  if (!format || !filename) {
    if (signal.aborted) throw cancelledError();
    await cancelBody(response);
    throw unsupportedDownloadError(filename);
  }
  const resolvedFormat = format;
  const resolvedName = filename;
  const total = Number(response.headers.get("content-length") ?? 0) || 0;
  const body = response.body;
  if (!body) throw new Error(`URL import: HTTP ${response.status}`);
  // Identity always keeps the original canonical request URL; only the
  // displayed/stored filename follows the downloaded name.
  const resolved: Dataset["source"] = { kind: "url", url: source?.url ?? identityUrl, filename: resolvedName };
  if (resolvedFormat === "yaml") {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        signal.throwIfAborted();
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > limits.yamlBytes) throw new Error("YAML: Maximal 5 MB / Maximum 5 MB.");
        chunks.push(value);
        progress({ phase: "reading", bytes, total: total || bytes, records: 0 });
      }
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw cancelledError();
      throw error;
    } finally {
      try { await reader.cancel(); } catch { /* Consumed. */ }
      reader.releaseLock();
    }
    const merged = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
    const file = new File([merged], resolvedName);
    // Pass the resolved URL source/display directly so same-basename
    // downloads from distinct URLs never collide during replacement.
    return ingestYamlDocuments(repository, file, csv, signal, progress, language, confirm, resolved, resolvedName);
  }
  const dataset = await ingestConnector(
    repository,
    new StreamConnector(body, signal) as unknown as Connector,
    resolvedName,
    resolvedFormat,
    total,
    signal,
    progress,
    (sink) => createParser(resolvedFormat, sink, csv),
    undefined,
    confirm,
  );
  return attachSource(repository, dataset, resolved);
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
  confirm?: ConfirmImport,
) {
  const project = projectionWithWarnings(repository, signal, confirm);
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
      const result = await project(input.generation, after);
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
  progress: (p: Progress) => void, language: "de" | "en" = "de", confirm?: ConfirmImport,
  source?: Dataset["source"], displayBase?: string,
) {
  if (file.size > limits.yamlBytes) throw new Error("YAML: Maximal 5 MB / Maximum 5 MB.");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
  signal.throwIfAborted();
  const documents = parseAllDocuments(text, { uniqueKeys: true });
  if (!documents.length || documents.length > 1000) throw new Error("YAML: 1–1000 Dokumente / documents required.");
  const project = projectionWithWarnings(repository, signal, confirm);
  const base = displayBase ?? file.name;
  const previous = repository.list().filter((data) => {
    if (data.format !== "yaml") return false;
    const current = (data as Dataset).source;
    if (source?.kind === "local" && source.groupId) {
      return current?.kind === "local" && current.groupId === source.groupId;
    }
    if (source?.kind === "local" && !source.path) return false;
    if (source && current && JSON.stringify(current) === JSON.stringify(source)) return true;
    if (source) return false;
    return data.sourceFile === file.name || (!data.sourceFile && !current && data.name === file.name);
  });
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
      const input = repository.begin(documents.length > 1 ? `${base} · ${language === "de" ? "Teil" : "Part"} ${part}` : base, "yaml", old?.id);
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
        const batch = await project(input.generation, after);
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
        const data = { ...repository.complete(input, file.size), sourceFile: file.name, part: index + 1, ...(source ? { source } : {}) };
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

export function projectionWithWarnings(repository: Repository, signal: AbortSignal, confirm?: ConfirmImport) {
  let interval = 1;
  return async (generation: string, after: number) => {
    for (;;) {
      signal.throwIfAborted();
      try { return repository.projectBatch(generation, after, { bytes: limits.rowBytes * interval, nodes: 10000 * interval }); }
      catch (error) {
        if (!(error instanceof RecordLimit) || !confirm) throw error;
        const decision = await confirm({ interval, bytes: limits.rowBytes * interval, nodes: 10000 * interval });
        signal.throwIfAborted();
        if (decision === "cancel") throw new Error("Abgebrochen / Cancelled");
        interval = decision === "ignore" && interval >= 2 ? Infinity : interval + 1;
      }
    }
  };
}
