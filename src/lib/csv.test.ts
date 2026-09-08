import { expect, it } from "vitest";
import { parseCsv, exportCsv, defaultCsvOptions } from "./csv";

it("exports selected columns in order with quoted multiline values", () => {
  const rows = [{ ID: "001", Text: 'A,"B"\nC', Hidden: "omit" }];
  expect(parseCsv(exportCsv(rows, ["Text", "ID"]))).toEqual([{ Text: 'A,"B"\nC', ID: "001" }]);
  expect(exportCsv(rows, ["ID"], { delimiter: ";", quote: "", header: false })).toBe("\uFEFF001\r\n");
  expect(() => exportCsv(rows, ["Text"], { ...defaultCsvOptions, quote: "" })).toThrow(/CSV:/);
});

it("applies custom separators, quotes and headerless imports", () => {
  expect(parseCsv("'Ada|A'|001\nGrace|002", { delimiter: "|", quote: "'", header: false })).toEqual([
    { Column1: "Ada|A", Column2: "001" },
    { Column1: "Grace", Column2: "002" },
  ]);
  expect(parseCsv('Name;Note\nAda;"literal"', { ...defaultCsvOptions, delimiter: ";", quote: "" })).toEqual([
    { Name: "Ada", Note: '"literal"' },
  ]);
});

it("imports semicolon CSV with BOM, quotes, multiline text and unchanged IDs", () => {
  expect(parseCsv('\uFEFFEventID;Date;Start;Description\r\n001;2027-06-17;09:00;"Hello; ""world""\nAgain"\r\n')).toEqual([
    { EventID: "001", Date: "2027-06-17", Start: "09:00", Description: 'Hello; "world"\nAgain' },
  ]);
});

it("supports commas, tabs, empty cells and blank lines", () => {
  expect(parseCsv('Name,Area\nAda,\n\n')).toEqual([{ Name: "Ada", Area: "" }]);
  expect(parseCsv('Name\tArea\nAda\tStage 1')).toEqual([{ Name: "Ada", Area: "Stage 1" }]);
});

it("rejects malformed records and ambiguous headers", () => {
  for (const text of ['Name,Name\na,b', 'Name,\na,b', 'Name,Area\na', 'Name\n"unclosed', 'Name\n"closed"extra']) {
    expect(() => parseCsv(text)).toThrow(/CSV:/);
  }
});
