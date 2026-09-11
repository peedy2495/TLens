import { describe, expect, it } from "vitest";
import { buildFieldTree, entriesForTables } from "./field-tree";

describe("field tree grouping", () => {
  it("nests branches by record path and sorts fields", () => {
    const tree = buildFieldTree([
      { path: ["Events", "Event"], fields: ["End", "Area"] },
      { path: ["Events", "People"], fields: ["Name"] },
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].segment).toBe("Events");
    expect(tree[0].children.map((child) => child.segment)).toEqual(["Event", "People"]);
    expect(tree[0].children[0].fields).toEqual(["Area", "End"]);
  });

  it("keeps same-named fields at different depths as separate leaves", () => {
    const tree = buildFieldTree([
      { path: ["A"], fields: ["ID"] },
      { path: ["A", "B"], fields: ["ID", "Other"] },
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].fields).toEqual(["ID"]);
    expect(tree[0].children[0].fields).toEqual(["ID", "Other"]);
  });

  it("covers structure beyond filtered/paginated windows", () => {
    const entries = Array.from({ length: 25 }, (_, index) => ({
      path: [`Path${String(index + 1).padStart(2, "0")}`],
      fields: index === 24 ? ["Area", "FarField"] : ["Area"],
    }));
    const tree = buildFieldTree(entries);
    expect(tree).toHaveLength(25);
    expect(tree[24].fields).toContain("FarField");
  });

  it("supports flat sources without branches", () => {
    expect(buildFieldTree([])).toEqual([]);
    const flat = buildFieldTree([{ path: [], fields: ["B", "A"] }]);
    expect(flat).toHaveLength(1);
    expect(flat[0].fields).toEqual(["A", "B"]);
  });

  it("derives legacy table entries per path", () => {
    const entries = entriesForTables([
      { path: ["Events"], rows: [{ ID: 1 }, { Area: "x" }] },
      { path: ["Events", "People"], rows: [{ ID: 2 }] },
    ]);
    expect(entries).toHaveLength(2);
    expect(entries[0].fields).toEqual(["Area", "ID"]);
  });
});
