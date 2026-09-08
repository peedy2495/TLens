import { it, expect } from "vitest";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { Repository } from "../storage/repository";
it("projects a broad XML hierarchy without quadratic work", async () => {
  const sqlite = await sqlite3InitModule(),
    repo = new Repository(new sqlite.oo1.DB(":memory:"), sqlite);
  try {
    const generation = repo.begin("large.xml", "xml").generation;
    repo.db.transaction(() => {
      repo.add(generation, {
        id: 1,
        parent: null,
        name: "Records",
        position: 0,
        path: ["Records"],
        kind: "xml",
        value: '{"attributes":{},"text":""}',
      });
      for (let i = 0; i < 10000; i++) {
        repo.add(generation, {
          id: i * 2 + 2,
          parent: 1,
          name: "Record",
          position: i,
          path: ["Records", "Record"],
          kind: "xml",
          value: '{"attributes":{},"text":""}',
        });
        repo.add(generation, {
          id: i * 2 + 3,
          parent: i * 2 + 2,
          name: "Name",
          position: 0,
          path: ["Records", "Record", "Name"],
          kind: "xml",
          value: '{"attributes":{},"text":"A"}',
        });
      }
    });
    const start = performance.now();
    repo.prepareProjection(generation, true);
    expect(performance.now() - start).toBeLessThan(5000);
    expect(
      repo.db.selectValue(
        "SELECT count(*) FROM entities WHERE table_path IS NOT NULL",
      ),
    ).toBe(10000);
  } finally {
    repo.close();
  }
}, 120000);
