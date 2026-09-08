import {
  limits,
  type Connector,
  type Capabilities,
  type EntitySink,
  type Parser,
} from "./contracts";

export class HttpConnector implements Connector {
  readonly capabilities: Capabilities = {
    streaming: true,
    cancellable: true,
    knownTotalSize: false,
    preview: false,
    schemaDiscovery: false,
    resumable: false,
  };
  private reader?: ReadableStreamDefaultReader<Uint8Array>;
  private signal?: AbortSignal;
  constructor(
    private endpoint: string,
    private token = "",
  ) {
    const url = new URL(endpoint);
    if (
      url.username ||
      url.password ||
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
        ))
    )
      throw new Error(
        "HTTPS endpoint required (HTTP is allowed only on localhost).",
      );
  }
  async open(signal: AbortSignal) {
    this.signal = signal;
    const response = await fetch(this.endpoint, {
      signal,
      headers: {
        Accept: "application/x-ndjson",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      credentials: "omit",
      redirect: "error",
    });
    if (!response.ok || !response.body)
      throw new Error(`Remote source: HTTP ${response.status}`);
    if (!response.headers.get("content-type")?.includes("ndjson")) {
      await response.body.cancel();
      throw new Error("Remote source must return application/x-ndjson.");
    }
    this.reader = response.body.getReader();
  }
  async *read() {
    if (!this.reader || !this.signal) throw new Error("Connector not open");
    for (;;) {
      this.signal.throwIfAborted();
      const { value, done } = await this.reader.read();
      if (done) break;
      for (let offset = 0; offset < value.length; offset += limits.chunkBytes)
        yield value.subarray(offset, offset + limits.chunkBytes);
    }
  }
  async close() {
    await this.reader?.cancel();
    this.reader?.releaseLock();
    this.reader = undefined;
    this.token = "";
  }
}
export function ndjsonParser(sink: EntitySink): Parser {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let pending = "",
    id = 0;
  function line(text: string) {
    if (!text.trim()) return;
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("NDJSON requires object records.");
    const check = (value: unknown, depth: number) => {
      if (depth > limits.depth) throw new Error("NDJSON nesting exceeds 128.");
      if (typeof value === "string" && value.length > limits.valueChars)
        throw new Error("NDJSON value exceeds 1 Mi characters.");
      if (value && typeof value === "object")
        for (const [key, nested] of Object.entries(value)) {
          if (key.length > limits.fieldNameChars)
            throw new Error("NDJSON field name exceeds 1,024 characters.");
          check(nested, depth + 1);
        }
    };
    check(value, 0);
    sink.add({
      id: ++id,
      parent: null,
      position: id - 1,
      name: String(id),
      kind: "value",
      value: JSON.stringify(value),
      path: ["Remote", String(id)],
      tablePath: ["Remote"],
    });
  }
  function feed(text: string) {
    pending += text;
    let newline: number;
    while ((newline = pending.indexOf("\n")) >= 0) {
      if (newline > limits.rowBytes)
        throw new Error("NDJSON record exceeds 2 Mi characters.");
      line(pending.slice(0, newline));
      pending = pending.slice(newline + 1);
    }
    if (pending.length > limits.rowBytes)
      throw new Error("NDJSON record exceeds 2 Mi characters.");
  }
  return {
    write(chunk) {
      feed(decoder.decode(chunk, { stream: true }));
    },
    end() {
      feed(decoder.decode());
      line(pending);
    },
  };
}
