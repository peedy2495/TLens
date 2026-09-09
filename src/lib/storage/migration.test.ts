import { it, expect } from "vitest";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { Repository } from "./repository";
it("commits migration identity with data and protects active generations during cleanup", async () => {
  const sqlite = await sqlite3InitModule(),
    repo = new Repository(new sqlite.oo1.DB(":memory:"), sqlite);
  try {
    const input = repo.begin("Jazz", "jazz");
    repo.add(input.generation, {
      id: 1,
      parent: null,
      position: 0,
      name: "1",
      kind: "value",
      value: '{"ID":"001"}',
      path: ["Legacy"],
      tablePath: ["Legacy"],
    });
    repo.projectBatch(input.generation, 0);
    const data = repo.complete(input, 12, "account:hash:1");
    expect(
      repo.db.selectValue(
        "SELECT dataset FROM migrations WHERE fingerprint=?",
        ["account:hash:1"],
      ),
    ).toBe(data.id);
    repo.fail(data.generation, "error", "late error");
    expect(repo.dataset(data.id).count).toBe(1);
    const abandoned = repo.begin("Incomplete", "json");
    repo.add(abandoned.generation, {
      id: 1,
      parent: null,
      position: 0,
      name: "1",
      kind: "value",
      value: "{}",
      path: [],
      tablePath: [],
    });
    repo.recover();
    expect(repo.list()).toHaveLength(1);
    expect(
      repo.db.selectValue("SELECT status FROM imports WHERE id=?", [
        abandoned.generation,
      ]),
    ).toBe("interrupted");
  } finally {
    repo.close();
  }
});
it("rolls back schema changes on failure and refuses future schemas", async () => {
  const sqlite = await sqlite3InitModule(),
    db = new sqlite.oo1.DB(":memory:");
  db.exec("PRAGMA user_version=999;");
  expect(() => new Repository(db, sqlite)).toThrow("newer");
  db.close();
});
it("loads only one level of normalized record children at a time", async () => {
  const sqlite = await sqlite3InitModule(),
    repo = new Repository(new sqlite.oo1.DB(":memory:"), sqlite);
  try {
    const input = repo.begin("Tree", "json");
    repo.add(input.generation, {
      id: 1,
      parent: null,
      position: 0,
      name: "1",
      kind: "value",
      value: JSON.stringify({
        Items: Array.from({ length: 205 }, (_, i) => ({ ID: i })),
      }),
      path: ["Root"],
      tablePath: ["Root"],
    });
    repo.projectBatch(input.generation, 0);
    const data = repo.complete(input, 100);
    expect(repo.children(data.id, 1, [], 0).entries).toEqual([
      { key: "Items", kind: "array", value: undefined, count: 205 },
    ]);
    expect(repo.children(data.id, 1, ["Items"], 100).entries).toHaveLength(100);
    expect(
      repo.children(data.id, 1, ["Items", "204"], 0).entries[0].value,
    ).toBe(204);
    expect(() => repo.children(data.id, 1, ["__proto__"], 0)).toThrow();
  } finally {
    repo.close();
  }
});
it("deletes individual records atomically, refreshes metadata and resets all imported data", async () => {
  const sqlite = await sqlite3InitModule();
  const repo = new Repository(new sqlite.oo1.DB(":memory:"), sqlite);
  try {
    const input = repo.begin("Records", "json");
    for (const id of [1, 2]) repo.add(input.generation, {
      id, parent: null, position: id, name: String(id), kind: "value",
      value: JSON.stringify(id === 1 ? { Unique: "remove", Nested: { ID: 1 } } : { Keep: "002" }),
      path: ["Rows"], tablePath: ["Rows"],
    });
    repo.projectBatch(input.generation, 0);
    const data = repo.complete(input, 100, "legacy-fingerprint");
    expect(() => repo.deleteRecord(data.id, "stale-generation", 1)).toThrow("changed");
    expect(repo.dataset(data.id).count).toBe(2);
    // Metadata failure must roll back the record and hierarchy deletion too.
    repo.db.exec("CREATE TRIGGER fail_delete_metadata BEFORE UPDATE ON datasets BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
    expect(() => repo.deleteRecord(data.id, data.generation, 1)).toThrow();
    expect(repo.children(data.id, 1, [], 0).entries).toHaveLength(2);
    repo.db.exec("DROP TRIGGER fail_delete_metadata;");
    repo.deleteRecord(data.id, data.generation, 1);
    expect(repo.dataset(data.id)).toMatchObject({ count: 1, columns: ["Keep"], paths: 1 });
    expect(repo.db.selectValue("SELECT count(*) FROM entities WHERE id=1")).toBe(0);
    expect(repo.db.selectValue("SELECT count(*) FROM fields WHERE record=1")).toBe(0);
    expect(repo.children(data.id, 2, [], 0).entries[0].value).toBe("002");
    repo.deleteRecord(data.id, data.generation, 2);
    expect(repo.dataset(data.id)).toMatchObject({ count: 0, columns: [], paths: 0, timeline: false });
    repo.deleteAll();
    for (const table of ["datasets", "imports", "entities", "records", "fields", "migrations"])
      expect(repo.db.selectValue(`SELECT count(*) FROM ${table}`)).toBe(0);
    repo.recover();
    expect(repo.list()).toEqual([]);
    expect(repo.begin("New import", "csv").id).toBeTruthy();
  } finally { repo.close(); }
});
