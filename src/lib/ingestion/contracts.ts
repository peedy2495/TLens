import type { CsvOptions } from "../csv";
import type { Filter, Row, Table } from "../data";

export const limits = {
  chunkBytes: 64 * 1024,
  valueChars: 1024 * 1024,
  depth: 128,
  fieldNameChars: 1024,
  rowBytes: 2 * 1024 * 1024,
  pageRows: 100,
  pageBytes: 8 * 1024 * 1024,
  yamlBytes: 5_000_000,
  metadataValues: 1000,
};
export type Format = "json" | "yaml" | "csv" | "xml";
export interface Capabilities {
  streaming: boolean;
  cancellable: boolean;
  knownTotalSize: boolean;
  preview: boolean;
  schemaDiscovery: boolean;
  resumable: boolean;
}
export interface Connector {
  readonly capabilities: Capabilities;
  open(signal: AbortSignal): Promise<void>;
  read(): AsyncIterable<Uint8Array>;
  close(): Promise<void>;
}
export interface Entity {
  id: number;
  parent: number | null;
  position: number;
  name: string;
  kind: "object" | "array" | "value" | "xml";
  value: string;
  path: string[];
  tablePath?: string[];
  replaceExisting?: boolean;
}
export interface EntitySink {
  add(entity: Entity): void;
  update(id: number, value: string): void;
}
export interface Parser {
  write(chunk: Uint8Array): void;
  end(): void;
}
export interface Progress {
  phase: "reading" | "indexing" | "completed";
  bytes: number;
  total: number;
  records: number;
}
export interface Dataset {
  id: string;
  name: string;
  format: string;
  generation: string;
  columns: string[];
  scalarColumns: string[];
  filterColumns: string[];
  count: number;
  paths: number;
  mapping: { start: string; end: string };
  timeline: boolean;
}
export interface Query {
  dataset: string;
  query: string;
  filters: Filter[];
  language: string;
  filterColumn: string;
  filterValue?: string;
  day: string;
  today: string;
  mapping: { start: string; end: string };
  colorColumn: string;
  sorts: Record<string, { column: string; direction: 1 | -1 } | null>;
  pages: Record<string, number>;
  timelinePage?: number;
  pathPage?: number;
  valuePage?: number;
}
export interface PageTable extends Table {
  total: number;
  columns: string[];
  offset: number;
  ids: number[];
}
export interface QueryResult {
  tables: PageTable[];
  total: number;
  tableCount: number;
  values: string[];
  moreValues: boolean;
  dates: string[];
  day: string;
  dayRows: Row[];
  dayCount: number;
  start: number;
  end: number;
  legend: string[];
  timeline: boolean;
}
export interface ChildPage {
  kind: "object" | "array" | "value";
  value?: import("../data").JsonValue;
  total: number;
  entries: {
    key: string;
    kind: "object" | "array" | "value";
    value?: import("../data").JsonValue;
    count: number;
  }[];
}
export type Request =
  | { type: "list" }
  | { type: "import"; file: File; csv: CsvOptions; replace?: string }
  | { type: "remote"; url: string; token: string; name: string }
  | { type: "jazz"; data: string; account: string; name: string }
  | {
      type: "children";
      dataset: string;
      record: number;
      path: string[];
      offset: number;
    }
  | { type: "query"; query: Query }
  | {
      type: "export";
      query: Query;
      format: "csv" | "json";
      path?: string[];
      columns?: string[];
      csv: CsvOptions;
    }
  | { type: "delete"; dataset: string }
  | { type: "delete-record"; dataset: string; generation: string; record: number }
  | { type: "delete-all" }
  | { type: "storage" };
export class SourceError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "SourceError";
  }
}
export function formatFor(file: { name: string; type?: string }): Format {
  const declared: Record<string, Format> = {
    "application/json": "json",
    "text/json": "json",
    "application/xml": "xml",
    "text/xml": "xml",
    "text/csv": "csv",
    "application/yaml": "yaml",
    "text/yaml": "yaml",
  };
  const extension = /\.([^.]+)$/.exec(file.name)?.[1].toLowerCase();
  const declaredFormat = declared[file.type?.split(";")[0].toLowerCase() ?? ""];
  if (
    declaredFormat &&
    declaredFormat !== (extension === "yml" ? "yaml" : extension)
  )
    throw new SourceError(
      "FORMAT",
      "Dateiendung und Medientyp widersprechen sich / File extension and MIME type disagree.",
    );
  if (extension === "yml" || extension === "yaml") return "yaml";
  if (extension === "json" || extension === "csv" || extension === "xml")
    return extension;
  throw new SourceError(
    "FORMAT",
    "Nicht unterstütztes Dateiformat / Unsupported format: JSON, YAML, YML, CSV, XML.",
  );
}
