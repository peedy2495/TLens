import { beforeAll, afterAll, describe, expect, it } from "vitest";
import sqlite3InitModule, { type Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import { Repository } from "../storage/repository";
import { ingest, ingestYamlDocuments } from "./service";
import { defaultCsvOptions } from "../csv";
import { findIdentityMatches, findLocalReloadTargets, localIdentityFor, urlIdentityFor } from "../source-identity";
import type { Dataset } from "./contracts";

let sqlite: Sqlite3Static;
beforeAll(async () => { sqlite = await sqlite3InitModule(); });
const repos: Repository[] = [];
afterAll(() => repos.forEach((repo) => repo.close()));
function repository() {
  const repo = new Repository(new sqlite.oo1.DB(":memory:"), sqlite);
  repos.push(repo);
  return repo;
}

describe("durable source replacement", () => {
  it("replaces local sources by full path while preserving unrelated datasets", async () => {
    const repo = repository();
    const signal = new AbortController().signal;
    const first = await ingest(repo, new File(['[{"ID":"old"}]'], "data.json"), defaultCsvOptions, signal, () => {},
      undefined, undefined, { kind: "local", path: "/a/data.json", filename: "data.json" }, "data.json");
    const unrelated = await ingest(repo, new File(['[{"ID":"keep"}]'], "other.json"), defaultCsvOptions, signal, () => {},
      undefined, undefined, { kind: "local", path: "/b/other.json", filename: "other.json" }, "other.json");
    const identity = localIdentityFor({ name: "data.json" }, "/a/data.json");
    const matches = findIdentityMatches(repo.list(), identity);
    expect(matches.map((entry) => entry.id)).toEqual([first.id]);
    for (const match of matches) repo.delete(match.id);
    const next = await ingest(repo, new File(['[{"ID":"new"}]'], "data.json"), defaultCsvOptions, signal, () => {},
      undefined, undefined, { kind: "local", path: "/a/data.json", filename: "data.json" }, "data.json");
    const rows = (repo.query({
      dataset: next.id, query: "", filters: [], language: "de", filterColumn: "ID",
      day: "", today: "2026-09-08", mapping: { start: "", end: "" }, colorColumn: "ID", sorts: {}, pages: {},
    }).tables[0]?.rows ?? []).map((row) => row.ID);
    expect(rows).toEqual(["new"]);
    expect(repo.list().map((entry) => entry.id).sort()).toEqual([unrelated.id, next.id].sort());
  });

  it("replaces all YAML parts for one URL identity and cleans up after failures", async () => {
    const repo = repository();
    const signal = new AbortController().signal;
    const identity = urlIdentityFor("https://example.org/bundle.yaml");
    const source: Dataset["source"] = { kind: "url", url: identity.kind === "url" ? identity.url : "", filename: "bundle.yaml" };
    const parts = await ingestYamlDocuments(repo, new File(["---\n{rows: [{ID: \"001\"}]}\n---\n{rows: [{ID: \"002\"}]}"], "bundle.yaml"),
      defaultCsvOptions, signal, () => {}, "de", undefined, source, "bundle.yaml");
    expect(parts).toHaveLength(2);
    expect(findIdentityMatches(repo.list(), identity)).toHaveLength(2);
    // Failed replacement refreshes to a clean state without stale rows.
    for (const match of findIdentityMatches(repo.list(), identity)) repo.delete(match.id);
    await expect(ingestYamlDocuments(repo, new File(["---\n{rows: [{ID: \"changed\"}]}\n---\n{broken: [}"], "bundle.yaml"),
      defaultCsvOptions, signal, () => {}, "de", undefined, source, "bundle.yaml")).rejects.toThrow();
    expect(findIdentityMatches(repo.list(), identity)).toHaveLength(0);
    const single = await ingestYamlDocuments(repo, new File(["rows: [{ID: \"003\"}]"], "bundle.yaml"),
      defaultCsvOptions, signal, () => {}, "de", undefined, source, "bundle.yaml");
    expect(single).toHaveLength(1);
    expect(repo.list()).toHaveLength(1);
  });

  it("replaces pathless local YAML groups without touching equal basenames", async () => {
    const repo = repository();
    const signal = new AbortController().signal;
    const group = (id: string): Dataset["source"] => ({ kind: "local", path: "", filename: "bundle.yaml", groupId: id });
    const first = await ingestYamlDocuments(repo, new File(["---\n{rows: [{ID: \"a1\"}]}\n---\n{rows: [{ID: \"a2\"}]}"], "bundle.yaml"),
      defaultCsvOptions, signal, () => {}, "de", undefined, group("g1"), "bundle.yaml");
    expect(first).toHaveLength(2);
    await ingestYamlDocuments(repo, new File(["---\n{rows: [{ID: \"b1\"}]}\n---\n{rows: [{ID: \"b2\"}]}"], "bundle.yaml"),
      defaultCsvOptions, signal, () => {}, "de", undefined, group("g2"), "bundle.yaml");
    expect(repo.list()).toHaveLength(4);
    // Explicit reload selection covers the whole group, not the same-basename import.
    const targets = findLocalReloadTargets(repo.list(), first[0].id);
    expect(targets.map((entry) => entry.id).sort()).toEqual(first.map((entry) => entry.id).sort());
    for (const match of targets) repo.delete(match.id);
    const next = await ingestYamlDocuments(repo, new File(["rows: [{ID: \"a3\"}]"], "bundle.yaml"),
      defaultCsvOptions, signal, () => {}, "de", undefined, group("g1"), "bundle.yaml");
    expect(next).toHaveLength(1);
    expect(repo.list()).toHaveLength(3);
    const rows = (repo.query({
      dataset: next[0].id, query: "", filters: [], language: "de", filterColumn: "ID",
      day: "", today: "2026-09-08", mapping: { start: "", end: "" }, colorColumn: "ID", sorts: {}, pages: {},
    }).tables[0]?.rows ?? []).map((row) => row.ID);
    expect(rows).toEqual(["a3"]);
  });

  it("matches connector identities by stable id plus selected source", async () => {
    const repo = repository();
    const signal = new AbortController().signal;
    const first = await ingest(repo, new File(['[{"ID":"old"}]'], "events.json"), defaultCsvOptions, signal, () => {},
      undefined, undefined, { kind: "connector", connectorId: "p1", connectorName: "Warehouse", sourceName: "events" }, "Warehouse · events");
    const stored = findIdentityMatches(repo.list(), { kind: "connector", connectorId: "p1", connectorName: "Warehouse", sourceName: "events" });
    expect(stored.map((entry) => entry.id)).toEqual([first.id]);
    for (const match of stored) repo.delete(match.id);
    expect(repo.list()).toHaveLength(0);
  });
});
