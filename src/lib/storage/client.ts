import type { Progress, Request, ConfirmImport } from "../ingestion/contracts";
export class StorageClient {
  private worker: Worker;
  private queue: Promise<unknown> = Promise.resolve();
  private callbacks = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      failure?: Error;
      progress?: (p: Progress) => void;
      confirm?: ConfirmImport;
      chunk?: (chunk: string) => Promise<void>;
    }
  >();
  private current?: string;
  private latestQuery = 0;
  private operationVersion = 0;
  private closed = false;
  constructor() {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = async ({ data }) => {
      const call = this.callbacks.get(data.id);
      if (!call) return;
      if (data.warning) {
        let decision: "continue" | "cancel" | "ignore" = "cancel";
        try { decision = await call.confirm?.(data.warning) ?? "cancel"; } catch { /* Cancel on failed confirmation. */ }
        if (this.callbacks.has(data.id)) this.worker.postMessage({ id: data.id, control: "limit", token: data.token, decision });
        return;
      }
      if (data.progress) {
        call.progress?.(data.progress);
        return;
      }
      if (typeof data.chunk === "string") {
        try {
          await call.chunk?.(data.chunk);
          this.worker.postMessage({ id: data.id, control: "ack" });
        } catch (error) {
          this.worker.postMessage({ id: data.id, control: "cancel" });
          call.failure =
            error instanceof Error ? error : new Error(String(error));
        }
        return;
      }
      this.callbacks.delete(data.id);
      this.current = undefined;
      if (call.failure) call.reject(call.failure);
      else if (data.error) call.reject(new Error(data.error));
      else call.resolve(data.result);
    };
    this.worker.onerror = () => {
      for (const call of this.callbacks.values())
        call.reject(
          new Error(
            "Daten-Worker beendet / Data worker stopped. Reload DLens.",
          ),
        );
      this.callbacks.clear();
    };
  }
  request<T>(
    request: Request,
    options: {
      failure?: Error;
      progress?: (p: Progress) => void;
      confirm?: ConfirmImport;
      chunk?: (chunk: string) => Promise<void>;
    } = {},
  ): Promise<T> {
    const operationVersion = this.operationVersion;
    const queryVersion =
      request.type === "query" ? ++this.latestQuery : undefined;
    const job = this.queue
      .catch(() => {})
      .then(
        () =>
          new Promise<T>((resolve, reject) => {
            if (
              operationVersion !== this.operationVersion &&
              ["import", "url-import", "connector-pull", "jazz", "export", "remote"].includes(request.type)
            ) {
              reject(new Error("Abgebrochen / Cancelled"));
              return;
            }
            if (this.closed) {
              reject(new Error("Closed"));
              return;
            }
            if (
              queryVersion !== undefined &&
              queryVersion !== this.latestQuery
            ) {
              reject(new Error("Superseded query"));
              return;
            }
            const id = crypto.randomUUID();
            this.current = id;
            this.callbacks.set(id, {
              resolve: (value) => resolve(value as T),
              reject,
              ...options,
            });
            this.worker.postMessage({ id, request });
          }),
      );
    this.queue = job;
    return job;
  }
  cancel() {
    this.operationVersion++;
    if (this.current)
      this.worker.postMessage({ id: this.current, control: "cancel" });
  }
  close() {
    this.closed = true;
    this.worker.terminate();
    for (const call of this.callbacks.values())
      call.reject(new Error("Closed"));
    this.callbacks.clear();
  }
}
