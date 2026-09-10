import { describe, expect, it, vi } from "vitest";
import {
  canonicalUrl,
  connectorIdentityFor,
  discoverConnectorSources,
  displayNameFor,
  filenameFromUrl,
  findIdentityMatches,
  findLocalReloadTargets,
  identityKey,
  isLocalFileDataset,
  localIdentityFor,
  localReloadExpectedFilename,
  newLocalGroupId,
  urlIdentityFor,
  validateLocalReloadSelection,
  type ConnectorProfile,
} from "./source-identity";
import type { Dataset } from "./ingestion/contracts";
import { formatFor } from "./ingestion/contracts";

function dataset(id: string, source: Dataset["source"], name = id): Dataset {
  return {
    id, name, format: "json", generation: `gen-${id}`, columns: [], scalarColumns: [],
    filterColumns: [], count: 1, paths: 1, mapping: { start: "", end: "" }, timeline: false, source,
  };
}

describe("source identity", () => {
  it("keeps equal basenames from different local paths distinct", () => {
    const first = localIdentityFor({ name: "data.json" }, "/a/data.json");
    const second = localIdentityFor({ name: "data.json" }, "/b/data.json");
    expect(identityKey(first)).not.toBe(identityKey(second));
    const stored = [dataset("1", { kind: "local", path: "/a/data.json", filename: "data.json" })];
    expect(findIdentityMatches(stored, first)).toHaveLength(1);
    expect(findIdentityMatches(stored, second)).toHaveLength(0);
  });

  it("never matches an unknown browser-local path destructively", () => {
    const identity = localIdentityFor({ name: "data.json" });
    expect(identityKey(identity)).toBe(null);
    const stored = [dataset("1", { kind: "local", path: "", filename: "data.json" })];
    expect(findIdentityMatches(stored, identity)).toHaveLength(0);
  });

  it("uses genuine File paths and ignores fakepath", () => {
    expect(localIdentityFor({ name: "a.json", path: "C:\\fakepath\\a.json" as string }))
      .toMatchObject({ kind: "local", path: "" });
    expect(localIdentityFor({ name: "a.json", path: "/real/a.json" as string }).path).toBe("/real/a.json");
    expect(localIdentityFor({ name: "a.json", webkitRelativePath: "dir/a.json" }).path).toBe("dir/a.json");
  });

  it("identifies URL sources canonically and displays only the filename", () => {
    const identity = urlIdentityFor("https://example.org/files/data.csv?x=1");
    expect(identity.filename).toBe("data.csv");
    expect(displayNameFor(identity)).toBe("data.csv");
    expect(canonicalUrl("https://example.org/files/data.csv?x=1")).toBe(identity.kind === "url" ? identity.url : "");
    const stored = [dataset("u1", { kind: "url", url: identity.kind === "url" ? identity.url : "", filename: "data.csv" })];
    expect(findIdentityMatches(stored, identity)).toHaveLength(1);
  });

  it("identifies connector sources by stable id plus selected source", () => {
    const profile: ConnectorProfile = { id: "p1", name: "Warehouse", kind: "postgres", endpoint: "http://127.0.0.1:8787" };
    const identity = connectorIdentityFor(profile, "events");
    expect(displayNameFor(identity)).toBe("Warehouse · events");
    const stored = [
      dataset("c1", { kind: "connector", connectorId: "p1", connectorName: "Warehouse", sourceName: "events" }),
      dataset("c2", { kind: "connector", connectorId: "p1", connectorName: "Warehouse", sourceName: "other" }),
    ];
    expect(findIdentityMatches(stored, identity).map((entry) => entry.id)).toEqual(["c1"]);
  });

  it("leaves ambiguous legacy datasets without identity untouched", () => {
    const stored = [dataset("legacy", undefined, "data.json")];
    const identity = localIdentityFor({ name: "data.json" }, "/x/data.json");
    expect(findIdentityMatches(stored, identity)).toHaveLength(0);
  });
});

describe("URL format and connector discovery", () => {
  it("derives the existing supported formats from URL filenames", () => {
    expect(formatFor({ name: filenameFromUrl("https://example.org/a/data.JSON") })).toBe("json");
    expect(formatFor({ name: filenameFromUrl("https://example.org/a/report.csv") })).toBe("csv");
    expect(formatFor({ name: filenameFromUrl("https://example.org/a/bundle.kyaml") })).toBe("yaml");
    expect(() => formatFor({ name: filenameFromUrl("https://example.org/a/file.txt") })).toThrow();
  });

  it("returns the configured NDJSON source name without network access", async () => {
    const profile: ConnectorProfile = { id: "n1", name: "Events API", kind: "ndjson", endpoint: "https://example.org/records" };
    await expect(discoverConnectorSources(profile, "token")).resolves.toEqual(["records"]);
  });

  it("discovers backend tables through /schema", async () => {
    const profile: ConnectorProfile = { id: "p1", name: "Warehouse", kind: "postgres", endpoint: "http://127.0.0.1:8787/" };
    const fetchMock = vi.fn(async (input: string) => {
      expect(input).toBe("http://127.0.0.1:8787/schema");
      return new Response(JSON.stringify({ tables: ["events", "tickets"] }), { headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(discoverConnectorSources(profile, "secret")).resolves.toEqual(["events", "tickets"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

it("rejects a stale explicit path belonging to a different file", () => {
  expect(() => localIdentityFor({ name: "other.json" }, "/data/old.json")).toThrow(/Source path/);
});

describe("local reload selection", () => {
  it("replaces the whole group even without a known path", () => {
    const group = newLocalGroupId();
    const stored = [
      dataset("g1", { kind: "local", path: "", filename: "bundle.yaml", groupId: group }, "bundle.yaml · Teil 1"),
      dataset("g2", { kind: "local", path: "", filename: "bundle.yaml", groupId: group }, "bundle.yaml · Teil 2"),
      dataset("other", { kind: "local", path: "", filename: "bundle.yaml", groupId: newLocalGroupId() }, "bundle.yaml"),
    ];
    expect(findLocalReloadTargets(stored, "g1").map((entry) => entry.id).sort()).toEqual(["g1", "g2"]);
    expect(findLocalReloadTargets(stored, "other").map((entry) => entry.id)).toEqual(["other"]);
  });

  it("keeps equal basenames from distinct pathless sources apart", () => {
    const stored = [
      dataset("a", { kind: "local", path: "", filename: "data.json", groupId: newLocalGroupId() }, "data.json"),
      dataset("b", { kind: "local", path: "", filename: "data.json", groupId: newLocalGroupId() }, "data.json"),
    ];
    expect(findLocalReloadTargets(stored, "a").map((entry) => entry.id)).toEqual(["a"]);
    expect(findIdentityMatches(stored, { kind: "local", path: "", filename: "data.json", groupId: "fresh" })).toHaveLength(0);
  });

  it("replaces all rows of a known path and only the selected legacy row otherwise", () => {
    const stored = [
      dataset("p1", { kind: "local", path: "/a/data.json", filename: "data.json" }),
      dataset("p2", { kind: "local", path: "/a/data.json", filename: "data.json" }),
      dataset("legacy", undefined, "data.json"),
      dataset("legacy2", undefined, "data.json"),
    ];
    expect(findLocalReloadTargets(stored, "p1").map((entry) => entry.id).sort()).toEqual(["p1", "p2"]);
    expect(findLocalReloadTargets(stored, "legacy").map((entry) => entry.id)).toEqual(["legacy"]);
  });

  it("never targets URL, connector or database sources for local reload", () => {
    const stored = [
      dataset("u", { kind: "url", url: "https://example.org/a.csv", filename: "a.csv" }),
      dataset("c", { kind: "connector", connectorId: "p1", connectorName: "W", sourceName: "events" }),
      { ...dataset("j", undefined, "db"), format: "jazz" },
    ];
    for (const entry of stored) {
      expect(isLocalFileDataset(entry)).toBe(false);
      expect(findLocalReloadTargets(stored, entry.id)).toEqual([]);
    }
    expect(isLocalFileDataset(dataset("l", { kind: "local", path: "", filename: "l.json" }))).toBe(true);
    expect(isLocalFileDataset(dataset("legacy", undefined, "l.json"))).toBe(true);
  });

  it("derives the expected filename without YAML part suffixes", () => {
    expect(localReloadExpectedFilename(dataset("a", { kind: "local", path: "", filename: "b.yaml" }, "b.yaml · Teil 2"))).toBe("b.yaml");
    expect(localReloadExpectedFilename(dataset("b", undefined, "c.yaml · Part 1"))).toBe("c.yaml");
    expect(localReloadExpectedFilename({ ...dataset("c", undefined, "plain.json"), sourceFile: "plain.json" })).toBe("plain.json");
  });

  it("accepts the same filename and rejects mismatches before any deletion", () => {
    const target = dataset("g1", { kind: "local", path: "", filename: "data.json", groupId: "g" }, "data.json");
    expect(() => validateLocalReloadSelection(target, { name: "data.json" })).not.toThrow();
    expect(() => validateLocalReloadSelection(target, { name: "other.json" })).toThrow(/passt nicht|does not match/);
    const pathed = dataset("p", { kind: "local", path: "/a/data.json", filename: "data.json" });
    expect(() => validateLocalReloadSelection(pathed, { name: "data.json", path: "/a/data.json" })).not.toThrow();
    expect(() => validateLocalReloadSelection(pathed, { name: "data.json", path: "/b/data.json" })).toThrow(/passt nicht|does not match/);
    const part = dataset("y", { kind: "local", path: "", filename: "bundle.yaml", groupId: "g" }, "bundle.yaml · Teil 2");
    expect(() => validateLocalReloadSelection(part, { name: "bundle.yaml" })).not.toThrow();
  });

  it("still matches ordinary reimports by known full path regardless of group", () => {
    const stored = [dataset("1", { kind: "local", path: "/a/data.json", filename: "data.json", groupId: "old" })];
    expect(findIdentityMatches(stored, { kind: "local", path: "/a/data.json", filename: "data.json", groupId: "fresh" }).map((entry) => entry.id)).toEqual(["1"]);
    expect(findIdentityMatches(stored, { kind: "local", path: "/a/data.json", filename: "data.json", groupId: "old" }).map((entry) => entry.id)).toEqual(["1"]);
  });
});
