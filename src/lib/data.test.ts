import { describe, expect, it } from "vitest";
import { eventRange, filterTables, isDate, nextDate, toTables } from "./data";
describe("data pipeline", () => {
  it("accepts only real ISO calendar days", () => {
    expect(isDate("2026-99-99")).toBe(false);
    expect(isDate("2026-02-30")).toBe(false);
    expect(isDate("2028-02-29")).toBe(true);
    expect(isDate("not a date")).toBe(false);
  });
  it("keeps nested arrays in separate tables and preserves scalar types", () => {
    expect(
      toTables({
        Events: { Main: [{ EventID: "Foo", count: 2 }] },
        Crew: [{ Name: "Ada" }],
      }),
    ).toEqual([
      {
        path: ["Root", "Events", "Main"],
        rows: [{ EventID: "Foo", count: 2 }],
      },
      { path: ["Root", "Crew"], rows: [{ Name: "Ada" }] },
    ]);
  });
  it("combines case-insensitive search and filters, excluding missing columns", () => {
    const tables = toTables({
      Events: [
        { EventID: "Foo", Area: "Stage 1" },
        { EventID: "Foo", Area: "Stage 2" },
      ],
      Crew: [{ EventID: "Foo" }],
    });
    expect(
      filterTables(tables, "FOO", [{ column: "Area", value: "stage 1" }]),
    ).toEqual([
      { path: ["Root", "Events"], rows: [{ EventID: "Foo", Area: "Stage 1" }] },
    ]);
  });
  it("chooses today or the next match, falling back to the latest past day", () => {
    expect(nextDate(["2026-01-01", "2026-09-08"], "2026-09-07")).toBe(
      "2026-09-08",
    );
    expect(nextDate(["2026-01-01"], "2026-09-07")).toBe("2026-01-01");
    expect(nextDate([], "2026-09-07")).toBe("");
  });
  it("handles midnight and rejects invalid clock values", () => {
    expect(eventRange({ Start: "23:00", End: "01:00" })).toEqual({
      start: 1380,
      end: 1500,
    });
    expect(eventRange({ Start: "28:00", End: "oops" }).start).toBeNaN();
  });
});
