import { describe, expect, it } from "vitest";
import {
  eventRange,
  detectTimeColumns,
  hasTimelineData,
  filterColumns,
  filterOptions,
  filterTables,
  isDate,
  nextDate,
  toTables,
} from "./data";
describe("data pipeline", () => {
  it("requires a valid date and both mapped times in the same record for the timeline", () => {
    const mapping = { start: "Beginn", end: "Ende" };
    expect(hasTimelineData(toTables([{ Date: "2027-06-17", Beginn: "09:00", Ende: "10:00" }]), mapping)).toBe(true);
    for (const rows of [[], [{ Name: "Ada" }], [{ Date: "2027-06-17", Beginn: "09:00" }], [{ Date: "invalid", Beginn: "09:00", Ende: "10:00" }], [{ Date: "2027-06-17", Beginn: "25:00", Ende: "10:00" }]]) {
      expect(hasTimelineData(toTables(rows), mapping)).toBe(false);
    }
  });
  it("detects common time field names without guessing unrelated fields", () => {
    for (const end of ["END", "sToP", "Finish"]) {
      expect(detectTimeColumns(["BeGiNnInG", end])).toEqual({ start: "BeGiNnInG", end });
    }
    expect(detectTimeColumns(["EventID", "START_TIME", "Endzeit"])).toEqual({ start: "START_TIME", end: "Endzeit" });
    expect(detectTimeColumns(["Date", "Startnummer", "Weekend"])).toEqual({ start: "", end: "" });
    expect(detectTimeColumns(["Beginn", "Other"])).toEqual({ start: "Beginn", end: "" });
  });
  it("uses selected time columns and leaves unmapped times invalid", () => {
    const row = { Beginn: "23:00", Ende: "01:00", Start: "12:00", End: "13:00" };
    expect(eventRange(row, "Beginn", "Ende")).toEqual({ start: 1380, end: 1500 });
    expect(eventRange(row, "", "").start).toBeNaN();
    expect(eventRange(row, "", "").end).toBeNaN();
  });
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
  it("offers unique existing filter values in descending order", () => {
    const tables = toTables({
      Events: [
        { Area: "Stage 2" },
        { Area: "Stage 10" },
        { Area: "Stage 2" },
        { Area: "Stage 1" },
        { Other: "Not an area" },
      ],
    });
    expect(filterOptions(tables, "Area")).toEqual([
      "Stage 10",
      "Stage 2",
      "Stage 1",
    ]);
  });
  it("filters rows by columns nested in objects and arrays", () => {
    const tables = toTables({
      Events: [
        {
          EventID: "EV-1",
          Personal: [{ PersonID: "P-2", Name: "Ada" }],
        },
        {
          EventID: "EV-2",
          Personal: [{ PersonID: "P-1", Name: "Grace" }],
        },
      ],
    });
    expect(filterColumns(tables)).toContain("PersonID");
    expect(filterOptions(tables, "PersonID")).toEqual(["P-2", "P-1"]);
    expect(
      filterTables(tables, "", [{ column: "PersonID", value: "P-2" }]),
    ).toEqual([
      {
        path: ["Root", "Events"],
        rows: [
          {
            EventID: "EV-1",
            Personal: [{ PersonID: "P-2", Name: "Ada" }],
          },
        ],
      },
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
