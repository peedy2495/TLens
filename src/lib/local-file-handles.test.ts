import { describe, expect, it, vi } from "vitest";
import {
  findStoredHandle,
  handleKeyForDataset,
  isPickerCancel,
  pickLocalFile,
  storeHandleForDatasets,
  supportsFilePicker,
  type LocalFileHandle,
} from "./local-file-handles";
import type { Dataset } from "./ingestion/contracts";

function dataset(id: string, source: Dataset["source"], name = id): Dataset {
  return {
    id, name, format: "json", generation: `gen-${id}`, columns: [], scalarColumns: [],
    filterColumns: [], count: 1, paths: 1, mapping: { start: "", end: "" }, timeline: false, source,
  };
}

function handle(file: File, name = file.name): LocalFileHandle {
  return { name, getFile: async () => file };
}

describe("local file handles", () => {
  it("keys datasets by group id so YAML parts share one handle", () => {
    const first = dataset("g1", { kind: "local", path: "", filename: "b.yaml", groupId: "g" });
    const second = dataset("g2", { kind: "local", path: "", filename: "b.yaml", groupId: "g" });
    expect(handleKeyForDataset(first)).toBe("group:g");
    expect(handleKeyForDataset(second)).toBe("group:g");
    expect(handleKeyForDataset(dataset("x", { kind: "local", path: "/a/d.json", filename: "d.json" }))).toBe("path:/a/d.json");
    expect(handleKeyForDataset(dataset("y", undefined))).toBe("id:y");
  });

  it("remaps a retained handle across changed dataset ids after replacement", () => {
    const store = new Map<string, LocalFileHandle>();
    const fresh = new File(["1"], "b.yaml");
    const retained = handle(fresh);
    const before = [
      dataset("old-1", { kind: "local", path: "", filename: "b.yaml", groupId: "g" }),
      dataset("old-2", { kind: "local", path: "", filename: "b.yaml", groupId: "g" }),
    ];
    storeHandleForDatasets(store, before, retained);
    // Replacement assigns new ids but reuses the group id.
    const after = [
      dataset("new-1", { kind: "local", path: "", filename: "b.yaml", groupId: "g" }),
      dataset("new-2", { kind: "local", path: "", filename: "b.yaml", groupId: "g" }),
    ];
    for (const entry of after) {
      expect(findStoredHandle(store, entry)).toBe(retained);
    }
    // A fresh read always goes through getFile() anew, never a stale snapshot.
    const other = new File(["2"], "b.yaml");
    const next = handle(other);
    storeHandleForDatasets(store, after, next);
    expect(findStoredHandle(store, after[0])).toBe(next);
  });

  it("keeps pathless same-basename sources apart", () => {
    const store = new Map<string, LocalFileHandle>();
    storeHandleForDatasets(store, [dataset("a", { kind: "local", path: "", filename: "d.json", groupId: "ga" })], handle(new File(["a"], "d.json")));
    expect(findStoredHandle(store, dataset("b", { kind: "local", path: "", filename: "d.json", groupId: "gb" }))).toBeUndefined();
  });

  it("detects picker support and treats dismissal as cancellation", () => {
    expect(supportsFilePicker(undefined)).toBe(false);
    expect(supportsFilePicker({} as Window)).toBe(false);
    expect(supportsFilePicker({ showOpenFilePicker: async () => [] } as unknown as Window)).toBe(true);
    expect(isPickerCancel(new DOMException("dismissed", "AbortError"))).toBe(true);
    expect(isPickerCancel(new DOMException("denied", "NotAllowedError"))).toBe(false);
    expect(isPickerCancel(new Error("boom"))).toBe(false);
  });

  it("returns null on picker dismissal and rethrows permission errors", async () => {
    const scope = {
      showOpenFilePicker: vi.fn().mockRejectedValueOnce(new DOMException("dismissed", "AbortError")),
    } as unknown as Window;
    await expect(pickLocalFile(scope)).resolves.toBeNull();

    const denied = {
      showOpenFilePicker: vi.fn().mockRejectedValueOnce(new DOMException("denied", "NotAllowedError")),
    } as unknown as Window;
    await expect(pickLocalFile(denied)).rejects.toBeInstanceOf(DOMException);

    const fresh = new File(["x"], "d.json");
    const picked = { name: "d.json", getFile: async () => fresh };
    const ok = {
      showOpenFilePicker: vi.fn().mockResolvedValueOnce([picked]),
    } as unknown as Window;
    const result = await pickLocalFile(ok);
    expect(result?.file).toBe(fresh);
    expect(result?.handle).toBe(picked);

    const empty = {
      showOpenFilePicker: vi.fn().mockResolvedValueOnce([]),
    } as unknown as Window;
    await expect(pickLocalFile(empty)).resolves.toBeNull();
  });
});
