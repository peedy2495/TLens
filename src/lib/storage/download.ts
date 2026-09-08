import type { StorageClient } from "./client";
import type { Request } from "../ingestion/contracts";

type Writable = {
  write(chunk: string): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
};
type SavePicker = (options: {
  suggestedName: string;
}) => Promise<{ createWritable(): Promise<Writable> }>;
export async function downloadStorage(
  client: StorageClient,
  request: Extract<Request, { type: "export" }>,
  name: string,
) {
  const picker = (window as unknown as { showSaveFilePicker?: SavePicker })
    .showSaveFilePicker;
  const handle = picker ? await picker({ suggestedName: name }) : undefined;
  const writable = await handle?.createWritable();
  const chunks: string[] = [];
  let bytes = 0;
  try {
    await client.request(request, {
      chunk: async (chunk) => {
        if (writable) await writable.write(chunk);
        else {
          bytes += new TextEncoder().encode(chunk).byteLength;
          if (bytes > 20 * 1024 * 1024)
            throw new Error(
              "Export über 20 MiB benötigt einen Browser mit Datei-Speicherdialog / Exports above 20 MiB require a browser with a file save dialog.",
            );
          chunks.push(chunk);
        }
      },
    });
    if (writable) await writable.close();
    else {
      const url = URL.createObjectURL(
        new Blob(chunks, {
          type:
            request.format === "csv"
              ? "text/csv;charset=utf-8"
              : "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch (error) {
    await writable?.abort();
    throw error;
  }
}
