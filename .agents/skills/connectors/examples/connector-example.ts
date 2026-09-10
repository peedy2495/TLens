export interface DataBatch<T = unknown> {
  records: T[];
  processedBytes?: number;
  totalBytes?: number;
  processedRecords?: number;
  done: boolean;
}

export interface ConnectorCapabilities {
  streaming: boolean;
  cancellable: boolean;
  knownTotalSize: boolean;
  schemaDiscovery: boolean;
  preview: boolean;
  resumable: boolean;
}

export interface Connector<T = unknown> {
  readonly capabilities: ConnectorCapabilities;

  open(signal?: AbortSignal): Promise<void>;

  read(options?: unknown): AsyncIterable<DataBatch<T>>;

  close(): Promise<void>;
}
