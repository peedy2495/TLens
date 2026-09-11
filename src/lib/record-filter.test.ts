import { describe, expect, it } from "vitest";
import {
  filterTables,
  recordExistsFilter,
  recordScalarFilter,
  sameFilter,
  toTables,
  type Row,
  type Table,
} from "./data";

describe("record path filters", () => {
  it("matches nested scalars by exact path and type", () => {
    const tables = toTables({
      Events: [
        { EventID: "EV-1", count: 0, active: false, note: "", missing: null },
        { EventID: "EV-2", count: 1, active: true, note: "x" },
      ],
    });
    for (const [path, value, id] of [
      [["count"], 0, "EV-1"],
      [["active"], false, "EV-1"],
      [["note"], "", "EV-1"],
      [["missing"], null, "EV-1"],
      [["count"], 1, "EV-2"],
    ] as const) {
      const result = filterTables(tables, "", [recordScalarFilter([...path], value)]);
      expect(result[0].rows.map((row) => row.EventID)).toEqual([id]);
    }
    // String "0" must not match number 0; null must not match empty string.
    expect(
      filterTables(tables, "", [recordScalarFilter(["count"], "0")])[0]?.rows ?? [],
    ).toEqual([]);
    expect(
      filterTables(tables, "", [recordScalarFilter(["missing"], "")])[0]?.rows ?? [],
    ).toEqual([]);
  });
  it("distinguishes duplicate keys in different branches and array indices", () => {
    const tables = toTables({
      Events: [
        { EventID: "A", outer: { Tag: "x" }, inner: { Tag: "y" } },
        { EventID: "B", outer: { Tag: "y" }, inner: { Tag: "x" } },
        {
          EventID: "C",
          Crew: [{ PersonID: "P-1" }, { PersonID: "P-2" }],
        },
        {
          EventID: "D",
          Crew: [{ PersonID: "P-2" }, { PersonID: "P-1" }],
        },
      ],
    });
    expect(
      filterTables(tables, "", [recordScalarFilter(["outer", "Tag"], "x")])[0].rows.map((r) => r.EventID),
    ).toEqual(["A"]);
    expect(
      filterTables(tables, "", [recordScalarFilter(["Crew", 1, "PersonID"], "P-2")])[0].rows.map((r) => r.EventID),
    ).toEqual(["C"]);
    expect(
      filterTables(tables, "", [recordExistsFilter(["inner", "Tag"])])[0].rows.map((r) => r.EventID),
    ).toEqual(["A", "B"]);
  });
  it("handles dotted, slashed and spaced keys without path confusion", () => {
    const rows: Row[] = [
      { EventID: "A", "a.b": { "c/d": 1 }, plain: 0 },
      { EventID: "B", a: { b: { c: 1 } } },
    ];
    const tables: Table[] = [{ path: ["Root"], rows }];
    expect(
      filterTables(tables, "", [recordScalarFilter(["a.b", "c/d"], 1)])[0].rows.map((r) => r.EventID),
    ).toEqual(["A"]);
    expect(
      filterTables(tables, "", [recordExistsFilter(["a", "b"])])[0].rows.map((r) => r.EventID),
    ).toEqual(["B"]);
  });
  it("keeps legacy contains/equals semantics and dedplicates identical filters", () => {
    const tables = toTables({
      Events: [
        { EventID: "EV-1", Area: "Stage 1" },
        { EventID: "EV-2", Area: "stage 10" },
      ],
    });
    expect(
      filterTables(tables, "", [{ column: "Area", value: "stage 1" }])[0].rows.map((r) => r.EventID),
    ).toEqual(["EV-1", "EV-2"]);
    expect(
      filterTables(tables, "", [{ column: "Area", value: "Stage 1", operator: "equals" }])[0].rows.map((r) => r.EventID),
    ).toEqual(["EV-1"]);
    const a = recordScalarFilter(["Area"], "Stage 1");
    const b = recordScalarFilter(["Area"], "Stage 1");
    const c = recordScalarFilter(["Other", "Area"], "Stage 1");
    expect(sameFilter(a, b)).toBe(true);
    expect(sameFilter(a, c)).toBe(false);
    expect(
      sameFilter({ column: "Area", value: "x" }, { column: "Area", value: "x", operator: "equals" }),
    ).toBe(false);
  });
});
