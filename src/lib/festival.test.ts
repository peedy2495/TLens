import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  defaultColumns,
  eventFilter,
  filterTables,
  toTables,
  type Row,
} from "./data";

const data = JSON.parse(
  readFileSync(
    new URL("../../demo/weitklang-festival-2027.json", import.meta.url),
    "utf8",
  ),
);
const tables = toTables(data);
const events = tables
  .flatMap((table) => table.rows)
  .filter((row) => row.EventID) as Row[];

describe("festival dataset", () => {
  it("contains four festival days plus setup and teardown with unique event IDs", () => {
    expect(Object.keys(data.Festival.Events.Festivaltage)).toHaveLength(4);
    expect(events).toHaveLength(67);
    expect(new Set(events.map((row) => row.EventID)).size).toBe(events.length);
    expect([...new Set(events.map((row) => row.Date))].sort()).toEqual([
      "2027-06-16",
      "2027-06-17",
      "2027-06-18",
      "2027-06-19",
      "2027-06-20",
      "2027-06-21",
    ]);
    expect(events.filter((row) => row.Typ === "Auftritt")).toHaveLength(8);
    for (const event of events) {
      expect(event.Personal).not.toHaveLength(0);
      expect(Array.isArray(event.Equipment)).toBe(true);
      expect(event.Arbeiten).not.toHaveLength(0);
      for (const id of event.Abhängigkeiten as string[]) {
        const dependency = events.find((row) => row.EventID === id);
        expect(dependency, `${event.EventID} dependency ${id}`).toBeDefined();
        expect(
          `${dependency!.Date}T${dependency!.End}` <=
            `${event.Date}T${event.Start}`,
        ).toBe(true);
      }
    }
  });
  it("keeps full nested event records, including musicians and equipment, searchable", () => {
    const result = filterTables(tables, "Sustain-Pedal", [
      { column: "EventID", value: "D1-S1-LIVE", operator: "equals" },
    ]);
    expect(result).toHaveLength(1);
    const row = result[0].rows[0];
    expect(typeof row.Künstler).toBe("object");
    expect(Array.isArray(row.Equipment)).toBe(true);
    expect(row).toEqual(
      data.Festival.Events.Festivaltage["Tag 1 · 2027-06-17"].find(
        (event: Row) => event.EventID === "D1-S1-LIVE",
      ),
    );
    expect(defaultColumns(result)).not.toContain("Equipment");
  });
  it("finds events through a nested person ID", () => {
    const result = filterTables(tables, "", [
      { column: "PersonID", value: "LOG-01", operator: "equals" },
    ]);
    const matchingEventIds = result
      .flatMap((table) => table.rows)
      .map((row) => row.EventID)
      .filter(Boolean);
    expect(matchingEventIds).toContain("SET-001");
  });
  it("replaces an event filter and matches IDs exactly without changing other filters", () => {
    const filters = eventFilter(
      [
        { column: "Area", value: "Stage 1" },
        { column: "EventID", value: "OLD" },
      ],
      "EV-1",
    );
    const rows = [
      { EventID: "EV-1", Area: "Stage 1" },
      { EventID: "EV-10", Area: "Stage 1" },
    ];
    expect(
      filterTables([{ path: ["Root"], rows }], "", filters)[0].rows,
    ).toEqual([rows[0]]);
    expect(
      filters.filter((filter) => filter.column === "EventID"),
    ).toHaveLength(1);
    expect(filters[0]).toEqual({ column: "Area", value: "Stage 1" });
  });
});
