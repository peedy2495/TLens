import { HttpConnector } from "./http";
import { limits, type Connector, type Capabilities } from "./contracts";
export class FileConnector implements Connector {
  readonly capabilities: Capabilities = {
    streaming: true,
    cancellable: true,
    knownTotalSize: true,
    preview: false,
    schemaDiscovery: false,
    resumable: false,
  };
  private reader?: ReadableStreamDefaultReader<Uint8Array>;
  private signal?: AbortSignal;
  constructor(private file: Blob) {}
  async open(signal: AbortSignal) {
    signal.throwIfAborted();
    this.signal = signal;
    this.reader = this.file.stream().getReader();
  }
  async *read() {
    if (!this.reader || !this.signal) throw new Error("Connector is not open");
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
    await this.reader?.cancel();
    this.reader?.releaseLock();
    this.reader = undefined;
  }
}
export class SourceRegistry {
  private factories = new Map<string, (source: unknown) => Connector>();
  register<T>(type: string, factory: (source: T) => Connector) {
    this.factories.set(type, (source) => factory(source as T));
  }
  open(type: string, source: unknown) {
    const factory = this.factories.get(type);
    if (!factory) throw new Error(`Unknown source: ${type}`);
    return factory(source);
  }
}
export const sources = new SourceRegistry();
for (const type of ["json", "yaml", "csv", "xml"])
  sources.register(type, (file: Blob) => new FileConnector(file));

sources.register(
  "http",
  (source: { url: string; token: string }) =>
    new HttpConnector(source.url, source.token),
);
