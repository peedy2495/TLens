import { describe, expect, it } from "vitest";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { Repository } from "./repository";
import type { Query } from "../ingestion/contracts";

function baseQuery(dataset: string, overrides: Partial<Query> = {}): Query {
  return {
    dataset,
    query: "",
    filters: [],
    language: "en",
    filterColumn: "Area",
    filterValue: "",
    day: "",
    today: "2026-09-08",
    mapping: { start: "", end: "" },
    colorColumn: "Area",
    sorts: {},
    pages: {},
    ...overrides,
  };
}

async function openRepo() {
  const sqlite = await sqlite3InitModule();
  return { sqlite, repo: new Repository(new sqlite.oo1.DB(":memory:"), sqlite) };
}

function seedRow(
  repo: Repository,
  generation: string,
  id: number,
  row: Record<string, unknown>,
  path: string[] = ["Rows"],
) {
  repo.add(generation, {
    id,
    parent: null,
    position: id,
    name: String(id),
    kind: "value",
    value: JSON.stringify(row),
    path,
    tablePath: path,
  });
}

describe("scoped filter fields and values", () => {
  it("scopes field and value choices to the current search+filter matches", async () => {
    const { repo } = await openRepo();
    try {
      const input = repo.begin("Scoped", "json");
      seedRow(repo, input.generation, 1, { Area: "Stage 1", Keep: "yes" });
      seedRow(repo, input.generation, 2, {
        Area: "Stage 2",
        Exclusive: "only-stage-2",
        Nested: { Tag: "nested-2" },
      });
      repo.projectBatch(input.generation, 0);
      const data = repo.complete(input, 100);

      const filtered = repo.query(
        baseQuery(data.id, {
          filters: [{ column: "Area", value: "Stage 1" }],
        }),
      );
      expect(filtered.filterFields).not.toContain("Exclusive");
      expect(filtered.filterFields).not.toContain("Tag");
      expect(filtered.filterFields).toContain("Area");
      expect(filtered.values).not.toContain("Stage 2");
      expect(filtered.values).toContain("Stage 1");

      const unfiltered = repo.query(baseQuery(data.id));
      expect(unfiltered.filterFields).toContain("Exclusive");
      expect(unfiltered.filterFields).toContain("Tag");
      expect(unfiltered.values).toEqual(
        expect.arrayContaining(["Stage 1", "Stage 2"]),
      );
    } finally {
      repo.close();
    }
  });

  it("combines search text with AND filters, handles nested fields and zero matches", async () => {
    const { repo } = await openRepo();
    try {
      const input = repo.begin("Search", "json");
      seedRow(repo, input.generation, 1, {
        Area: "Stage 1",
        Note: "sunset concert",
        Crew: [{ PersonID: "P-1" }],
      });
      seedRow(repo, input.generation, 2, {
        Area: "Stage 1",
        Note: "morning setup",
        Crew: [{ PersonID: "P-2" }],
      });
      seedRow(repo, input.generation, 3, {
        Area: "Stage 2",
        Note: "sunset concert",
        Crew: [{ PersonID: "P-9" }],
      });
      repo.projectBatch(input.generation, 0);
      const data = repo.complete(input, 100);

      const both = repo.query(
        baseQuery(data.id, {
          query: "sunset",
          filters: [{ column: "Area", value: "Stage 1" }],
          filterColumn: "PersonID",
        }),
      );
      expect(both.filterFields).toContain("PersonID");
      expect(both.values).toEqual(["P-1"]);

      const empty = repo.query(
        baseQuery(data.id, {
          filters: [{ column: "Area", value: "no-such-stage" }],
        }),
      );
      expect(empty.total).toBe(0);
      expect(empty.filterFields).toEqual([]);
      expect(empty.values).toEqual([]);
      expect(empty.moreValues).toBe(false);
    } finally {
      repo.close();
    }
  });

  it("includes matches outside row/page windows and across paths with bounded value paging", async () => {
    const { repo } = await openRepo();
    try {
      // Exceed the 100-row page in a single path: the marker sits on row 120.
      const input = repo.begin("Paged", "json");
      for (let id = 1; id <= 120; id++)
        seedRow(
          repo,
          input.generation,
          id,
          id === 120
            ? { Area: "Stage 1", LateField: "beyond-first-page" }
            : { Area: "Stage 1", Index: String(id) },
          ["SinglePath"],
        );
      let after = 0;
      for (;;) {
        const batch = repo.projectBatch(input.generation, after);
        if (!batch.count) break;
        after = batch.after;
      }
      const data = repo.complete(input, 10000);
      const first = repo.query(
        baseQuery(data.id, {
          filters: [{ column: "Area", value: "Stage 1" }],
        }),
      );
      expect(first.tables).toHaveLength(1);
      expect(first.tables[0].rows.length).toBeLessThanOrEqual(100);
      expect(first.tables[0].total).toBe(120);
      expect(first.filterFields).toContain("LateField");

      // Exceed the 20-path page: the marker sits on the 25th path.
      const pathsInput = repo.begin("ManyPaths", "json");
      for (let id = 1; id <= 25; id++)
        seedRow(
          repo,
          pathsInput.generation,
          id,
          id === 25
            ? { Area: "Stage 1", FarField: "beyond-first-path-page" }
            : { Area: "Stage 1", Index: String(id) },
          [`Path${String(id).padStart(2, "0")}`],
        );
      {
        let cursor = 0;
        for (;;) {
          const batch = repo.projectBatch(pathsInput.generation, cursor);
          if (!batch.count) break;
          cursor = batch.after;
        }
      }
      const pathsData = repo.complete(pathsInput, 10000);
      const pathFirst = repo.query(
        baseQuery(pathsData.id, {
          filters: [{ column: "Area", value: "Stage 1" }],
        }),
      );
      expect(pathFirst.tableCount).toBe(25);
      expect(pathFirst.tables.length).toBeLessThanOrEqual(20);
      expect(pathFirst.filterFields).toContain("FarField");
      const pathSecond = repo.query(
        baseQuery(pathsData.id, {
          filters: [{ column: "Area", value: "Stage 1" }],
          pathPage: 1,
        }),
      );
      expect(pathSecond.tables.length).toBeGreaterThan(0);
      expect(pathSecond.filterFields).toContain("FarField");

      const valuesInput = repo.begin("Values", "json");
      for (let id = 1; id <= 102; id++)
        seedRow(repo, valuesInput.generation, id, {
          Area: `Stage ${String(id).padStart(3, "0")}`,
        });
      {
        let cursor = 0;
        for (;;) {
          const batch = repo.projectBatch(valuesInput.generation, cursor);
          if (!batch.count) break;
          cursor = batch.after;
        }
      }
      const valuesData = repo.complete(valuesInput, 1000);
      const page0 = repo.query(
        baseQuery(valuesData.id, { filterColumn: "Area", valuePage: 0 }),
      );
      expect(page0.values).toHaveLength(100);
      expect(page0.moreValues).toBe(true);
      const page1 = repo.query(
        baseQuery(valuesData.id, { filterColumn: "Area", valuePage: 100 }),
      );
      expect(page1.values).toHaveLength(2);
      expect(page1.moreValues).toBe(false);
    } finally {
      repo.close();
    }
  });

  it("requires multiple simultaneous filters to all match", async () => {
    const { repo } = await openRepo();
    try {
      const input = repo.begin("Multi", "json");
      seedRow(repo, input.generation, 1, {
        Area: "Stage 1",
        Note: "sunset",
        Keep: "yes",
      });
      seedRow(repo, input.generation, 2, {
        Area: "Stage 1",
        Note: "sunset",
        Keep: "no",
      });
      seedRow(repo, input.generation, 3, {
        Area: "Stage 1",
        Note: "morning",
        Keep: "yes",
      });
      repo.projectBatch(input.generation, 0);
      const data = repo.complete(input, 100);

      const both = repo.query(
        baseQuery(data.id, {
          filters: [
            { column: "Area", value: "Stage 1" },
            { column: "Note", value: "sunset" },
            { column: "Keep", value: "yes" },
          ],
          filterColumn: "Keep",
        }),
      );
      expect(both.total).toBe(1);
      expect(both.values).toEqual(["yes"]);
      expect(both.filterFields).toContain("Keep");

      const relaxed = repo.query(
        baseQuery(data.id, {
          filters: [{ column: "Area", value: "Stage 1" }],
          filterColumn: "Keep",
        }),
      );
      expect(relaxed.total).toBe(3);
      expect(relaxed.values).toEqual(
        expect.arrayContaining(["yes", "no"]),
      );
    } finally {
      repo.close();
    }
  });

  it("keeps unrelated source generations separate", async () => {
    const { repo } = await openRepo();
    try {
      const first = repo.begin("First", "json");
      seedRow(repo, first.generation, 1, { Area: "Stage 1" });
      repo.projectBatch(first.generation, 0);
      const a = repo.complete(first, 10);
      const second = repo.begin("Second", "json");
      seedRow(repo, second.generation, 1, { Area: "Other", Foreign: "leak" });
      repo.projectBatch(second.generation, 0);
      const b = repo.complete(second, 10);

      const scoped = repo.query(baseQuery(a.id));
      expect(scoped.filterFields).not.toContain("Foreign");
      expect(scoped.values).not.toContain("Other");
      expect(repo.query(baseQuery(b.id)).filterFields).toContain("Foreign");
    } finally {
      repo.close();
    }
  });
});
