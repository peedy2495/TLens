import { describe, expect, it } from "vitest";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { Repository } from "./repository";

async function openRepo() {
  const sqlite = await sqlite3InitModule();
  return new Repository(new sqlite.oo1.DB(":memory:"), sqlite);
}

function seedRow(repo: Repository, generation: string, id: number, row: Record<string, unknown>, path: string[]) {
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

describe("source-wide field structure", () => {
  it("groups top-level fields per path across depths", async () => {
    const repo = await openRepo();
    try {
      const input = repo.begin("Structured", "json");
      seedRow(repo, input.generation, 1, { ID: "a", Area: "Stage" }, ["Events", "Event"]);
      seedRow(repo, input.generation, 2, { ID: "b" }, ["Events", "Event", "People"]);
      repo.projectBatch(input.generation, 0);
      const data = repo.complete(input, 100);
      const structure = repo.structure(data.id);
      expect(structure).toHaveLength(2);
      const event = structure.find((entry) => entry.path.join("/") === "Events/Event")!;
      const people = structure.find((entry) => entry.path.join("/") === "Events/Event/People")!;
      expect(event.fields).toContain("ID");
      expect(event.fields).toContain("Area");
      expect(people.fields).toEqual(["ID"]);
    } finally {
      repo.close();
    }
  });

  it("covers paths beyond the paginated record window", async () => {
    const repo = await openRepo();
    try {
      const input = repo.begin("ManyPaths", "json");
      for (let id = 1; id <= 25; id++)
        seedRow(
          repo,
          input.generation,
          id,
          id === 25 ? { Area: "Stage", FarField: "beyond-first-page" } : { Area: "Stage" },
          [`Path${String(id).padStart(2, "0")}`],
        );
      let after = 0;
      for (;;) {
        const batch = repo.projectBatch(input.generation, after);
        if (!batch.count) break;
        after = batch.after;
      }
      const data = repo.complete(input, 10000);
      const structure = repo.structure(data.id);
      expect(structure).toHaveLength(25);
      expect(structure[24].fields).toContain("FarField");
    } finally {
      repo.close();
    }
  });

  it("handles flat single-path sources", async () => {
    const repo = await openRepo();
    try {
      const input = repo.begin("Flat", "json");
      seedRow(repo, input.generation, 1, { B: "2", A: "1" }, ["Rows"]);
      repo.projectBatch(input.generation, 0);
      const data = repo.complete(input, 10);
      expect(repo.structure(data.id)).toEqual([{ path: ["Rows"], fields: ["A", "B"] }]);
    } finally {
      repo.close();
    }
  });
});
