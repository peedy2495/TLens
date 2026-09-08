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
