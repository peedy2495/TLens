import type { Dataset } from "./ingestion/contracts";
import { newId } from "./ids";

export type ConnectorKind = "postgres" | "mariadb" | "ndjson";

export interface ConnectorProfile {
  id: string;
  name: string;
  kind: ConnectorKind;
  /** Base URL for postgres/mariadb backends, full NDJSON URL for ndjson. */
  endpoint: string;
}

export type SourceIdentity =
  | { kind: "local"; path: string; filename: string; groupId?: string }
  | { kind: "url"; url: string; filename: string }
  | { kind: "connector"; connectorId: string; connectorName: string; sourceName: string };

export function newLocalGroupId(): string {
  return newId("local");
}

export function newProfileId(): string {
  return newId("connector");
}

export function readConnectorProfiles(): ConnectorProfile[] {
  try {
    const raw = localStorage.getItem("dlens-connectors");
    if (raw === null) return [];
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (entry): entry is ConnectorProfile =>
          !!entry &&
          typeof entry.id === "string" &&
          typeof entry.name === "string" &&
          (entry.kind === "postgres" || entry.kind === "mariadb" || entry.kind === "ndjson") &&
          typeof entry.endpoint === "string",
      )
      .map((entry) => ({ id: entry.id, name: entry.name, kind: entry.kind, endpoint: entry.endpoint }));
  } catch {
    return [];
  }
}

export function saveConnectorProfiles(profiles: ConnectorProfile[]): void {
  try {
    localStorage.setItem("dlens-connectors", JSON.stringify(profiles));
  } catch {
    /* Ignore unavailable storage. */
  }
}

export function canonicalUrl(raw: string): string {
  const trimmed = raw.trim();
  const parsed = new URL(trimmed);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("URL must use http(s).");
  return parsed.toString();
}

export function filenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const base = pathname.split("/").filter(Boolean).pop() ?? "";
    return decodeURIComponent(base) || url;
  } catch {
    return url;
  }
}

export function filenameFromEndpoint(endpoint: string): string {
  return filenameFromUrl(endpoint);
}

function filePathOf(file: { name: string; path?: string; webkitRelativePath?: string }): string {
  const candidate = typeof file.path === "string" && file.path ? file.path : "";
  if (candidate && !candidate.includes("fakepath")) return candidate;
  const relative = typeof file.webkitRelativePath === "string" ? file.webkitRelativePath : "";
  if (relative) return relative;
  return "";
}

/** Genuine filesystem path of a File object when the platform exposes one (never fakepath). */
export function genuineFilePath(file: { name: string; path?: string; webkitRelativePath?: string }): string {
  return filePathOf(file);
}

/** Explicit user-supplied path wins; otherwise use a genuine File path when available. */
export function localIdentityFor(file: { name: string; path?: string; webkitRelativePath?: string }, explicitPath = ""): Extract<SourceIdentity, { kind: "local" }> {
  const explicit = explicitPath.trim();
  if (explicit) {
    if (explicit.replaceAll("\\", "/").split("/").pop() !== file.name || explicit.includes("fakepath")) {
      throw new Error("Quellpfad muss zur ausgewählten Datei passen / Source path must match the selected file.");
    }
    return { kind: "local", path: explicit, filename: file.name };
  }
  const genuine = filePathOf(file);
  if (genuine) return { kind: "local", path: genuine, filename: file.name };
  // Browser File objects expose no absolute path: keep the import distinct so
  // equal basenames from different folders are never silently conflated.
  return { kind: "local", path: "", filename: file.name };
}

export function urlIdentityFor(rawUrl: string): Extract<SourceIdentity, { kind: "url" }> {
  const url = canonicalUrl(rawUrl);
  return { kind: "url", url, filename: filenameFromUrl(url) };
}

export function connectorIdentityFor(profile: ConnectorProfile, sourceName: string): Extract<SourceIdentity, { kind: "connector" }> {
  return { kind: "connector", connectorId: profile.id, connectorName: profile.name, sourceName };
}

export function identityKey(identity: SourceIdentity): string | null {
  if (identity.kind === "local") return identity.path ? `local:${identity.path}` : null;
  if (identity.kind === "url") return `url:${identity.url}`;
  return `connector:${identity.connectorId}:${identity.sourceName}`;
}

export function datasetIdentity(dataset: Dataset): SourceIdentity | null {
  const source = (dataset as { source?: SourceIdentity }).source;
  if (source && typeof source === "object") {
    if (source.kind === "local" && typeof source.path === "string") return source;
    if (source.kind === "url" && typeof source.url === "string") return source;
    if (source.kind === "connector" && typeof source.connectorId === "string") return source;
  }
  return null;
}

export function findIdentityMatches(datasets: Dataset[], identity: SourceIdentity): Dataset[] {
  if (identity.kind === "local") {
    // Local sources match by shared group or by known full path; the general
    // path-based reimport policy is unchanged. Unknown browser-local paths
    // and ambiguous legacy data never match destructively.
    return datasets.filter((dataset) => {
      const current = datasetIdentity(dataset);
      if (!current || current.kind !== "local") return false;
      if (identity.groupId && current.groupId && identity.groupId === current.groupId) return true;
      return !!identity.path && !!current.path && identity.path === current.path;
    });
  }
  const key = identityKey(identity);
  if (key === null) return [];
  return datasets.filter((dataset) => {
    const current = datasetIdentity(dataset);
    if (!current) return false;
    return identityKey(current) === key;
  });
}

/** A dataset is a genuine local file when it is not URL-, connector- or database-backed. */
export function isLocalFileDataset(dataset: Dataset): boolean {
  if (dataset.source?.kind === "url" || dataset.source?.kind === "connector") return false;
  return !["jazz", "api"].includes(dataset.format);
}

/** Base filename a local reload selection must carry (YAML part suffixes excluded). */
export function localReloadExpectedFilename(dataset: Dataset): string {
  const source = dataset.source;
  if (source?.kind === "local" && source.filename) return source.filename;
  if (typeof dataset.sourceFile === "string" && dataset.sourceFile) return dataset.sourceFile;
  return dataset.name.replace(/ · (Teil|Part) \d+$/, "");
}

/**
 * Datasets replaced by reloading one explicitly selected local source: the
 * whole group when a durable group id exists, all rows of a known full path,
 * otherwise only the selected row so unrelated same-basename sources survive.
 */
export function findLocalReloadTargets(datasets: Dataset[], targetId: string): Dataset[] {
  const target = datasets.find((entry) => entry.id === targetId);
  if (!target || !isLocalFileDataset(target)) return [];
  const source = target.source?.kind === "local" ? target.source : undefined;
  if (source?.groupId) {
    return datasets.filter(
      (entry) => entry.source?.kind === "local" && entry.source.groupId === source.groupId,
    );
  }
  if (source?.path) {
    return datasets.filter(
      (entry) => entry.source?.kind === "local" && entry.source.path === source.path,
    );
  }
  return [target];
}

/** Rejects a reload selection whose filename (or genuine path) misses the target; call before deleting. */
export function validateLocalReloadSelection(
  target: Dataset,
  file: { name: string; path?: string; webkitRelativePath?: string },
): void {
  const expected = localReloadExpectedFilename(target);
  const genuine = genuineFilePath(file);
  const targetPath = target.source?.kind === "local" ? target.source.path ?? "" : "";
  if (file.name !== expected || (genuine && targetPath && genuine !== targetPath)) {
    throw new Error(
      `Ausgewählte Datei „${file.name}“ passt nicht zur Quelle „${expected}“ / Selected file “${file.name}” does not match source “${expected}”.`,
    );
  }
}

export function displayNameFor(identity: SourceIdentity): string {
  if (identity.kind === "local") return identity.filename;
  if (identity.kind === "url") return identity.filename;
  return `${identity.connectorName} · ${identity.sourceName}`;
}

export function connectorRecordsUrl(profile: ConnectorProfile, sourceName: string, tokenQuery = ""): string {
  const base = profile.endpoint.replace(/\/+$/, "");
  if (profile.kind === "ndjson") return profile.endpoint;
  const separator = base.includes("?") ? "&" : "?";
  void tokenQuery;
  return `${base}/records${separator}table=${encodeURIComponent(sourceName)}`;
}

export async function discoverConnectorSources(profile: ConnectorProfile, token: string, signal?: AbortSignal): Promise<string[]> {
  if (profile.kind === "ndjson") return [filenameFromEndpoint(profile.endpoint)];
  const base = profile.endpoint.replace(/\/+$/, "");
  const response = await fetch(`${base}/schema`, {
    signal,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!response.ok) throw new Error(`Connector schema: HTTP ${response.status}`);
  const payload = (await response.json()) as { tables?: unknown };
  if (!Array.isArray(payload.tables) || !payload.tables.every((entry) => typeof entry === "string")) {
    throw new Error("Connector schema response is invalid.");
  }
  return payload.tables as string[];
}
