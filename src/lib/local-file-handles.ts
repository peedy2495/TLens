import type { Dataset } from "./ingestion/contracts";

/** Narrow type for a File System Access API file handle. */
export interface LocalFileHandle {
  readonly name?: string;
  getFile(): Promise<File>;
}

/** Narrow type for a picked file plus its native handle (when provided). */
export interface PickedLocalFile {
  file: File;
  handle: LocalFileHandle | null;
}

interface PickerWindow extends Window {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<LocalFileHandle[]>;
}

/** Feature detection: true only when the File System Access picker exists. */
export function supportsFilePicker(scope: Window | undefined = typeof window !== "undefined" ? window : undefined): boolean {
  return typeof (scope as PickerWindow | undefined)?.showOpenFilePicker === "function";
}

/** Stable session key for a dataset: group id wins so YAML parts share one handle. */
export function handleKeyForDataset(dataset: Dataset): string {
  const source = dataset.source;
  if (source?.kind === "local" && source.groupId) return `group:${source.groupId}`;
  if (source?.kind === "local" && source.path) return `path:${source.path}`;
  return `id:${dataset.id}`;
}

/** All lookup keys for a dataset, most stable first. */
export function lookupKeysForDataset(dataset: Dataset): string[] {
  const keys = [handleKeyForDataset(dataset)];
  const source = dataset.source;
  if (source?.kind === "local" && source.groupId && source.path) keys.push(`path:${source.path}`);
  if (!keys.includes(`id:${dataset.id}`)) keys.push(`id:${dataset.id}`);
  return keys;
}

/** Find a retained handle for a dataset, trying group, path, then id keys. */
export function findStoredHandle(
  store: ReadonlyMap<string, LocalFileHandle>,
  dataset: Dataset,
): LocalFileHandle | undefined {
  for (const key of lookupKeysForDataset(dataset)) {
    const handle = store.get(key);
    if (handle) return handle;
  }
  return undefined;
}

/**
 * Retain a handle under every stable key of the freshly imported datasets so
 * a reload keeps working even though dataset ids change on replacement.
 */
export function storeHandleForDatasets(
  store: Map<string, LocalFileHandle>,
  datasets: Dataset[],
  handle: LocalFileHandle,
): void {
  for (const dataset of datasets) {
    for (const key of lookupKeysForDataset(dataset)) store.set(key, handle);
  }
}

/** A picker dismissal (AbortError) is not a failure: existing data stays. */
export function isPickerCancel(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

const PICKER_ACCEPT: Record<string, string[]> = {
  "application/json": [".json"],
  "application/yaml": [".yaml", ".yml", ".kyaml"],
  "text/csv": [".csv"],
  "application/xml": [".xml"],
};

/** Open the native picker once; returns null when dismissed. Rethrows real errors. */
export async function pickLocalFile(scope: Window = window): Promise<PickedLocalFile | null> {
  const picker = (scope as PickerWindow).showOpenFilePicker;
  if (!picker) return null;
  let handles: LocalFileHandle[];
  try {
    handles = await picker.call(scope, {
      multiple: false,
      types: [{ description: "Data files", accept: PICKER_ACCEPT }],
    });
  } catch (error) {
    if (isPickerCancel(error)) return null;
    throw error;
  }
  const handle = handles[0];
  if (!handle) return null;
  return { file: await handle.getFile(), handle };
}
