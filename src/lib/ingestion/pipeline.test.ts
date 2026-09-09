import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import sqlite3InitModule, { type Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import { Repository } from "../storage/repository";
import { ingest, ingestYamlDocuments } from "./service";
import { defaultCsvOptions, parseCsv } from "../csv";
import { toTables, type Table } from "../data";
import type { Query } from "./contracts";
import { exportData } from "../storage/export";
let sqlite: Sqlite3Static;
beforeAll(async () => {
  sqlite = await sqlite3InitModule();
});
const repos: Repository[] = [];
afterAll(() => repos.forEach((repo) => repo.close()));
function repository() {
  const repo = new Repository(new sqlite.oo1.DB(":memory:"), sqlite);
  repos.push(repo);
  return repo;
}
function query(dataset: string, changes: Partial<Query> = {}): Query {
  return {
    dataset,
    query: "",
    filters: [],
    language: "de",
    filterColumn: "Name",
    day: "",
    today: "2026-09-08",
    mapping: { start: "Start", end: "End" },
    colorColumn: "Area",
    sorts: {},
    pages: {},
    ...changes,
  };
}
async function load(
  repo: Repository,
  text: string,
  name = "test.json",
  replace?: string,
) {
  return ingest(
    repo,
    new File([text], name),
    defaultCsvOptions,
    new AbortController().signal,
    () => {},
    replace,
  );
}
const plain = (tables: Table[]) =>
  tables.map(({ path, rows }) => ({ path, rows }));
describe("persistent ingestion and queries", () => {
  it("preserves JSON table paths, scalar types, empty containers, hierarchy and source order", async () => {
    const repo = repository();
    const input = {
      Events: [
        {
          EventID: "001",
          Name: "Änne 10",
          Personal: [{ PersonID: "p1" }],
          Empty: [],
          Obj: {},
          Null: null,
        },
        { EventID: "002", Name: "Anne 2" },
      ],
      Crew: [{ Name: "Bea" }],
    };
    const data = await load(repo, JSON.stringify(input));
    expect(plain(repo.query(query(data.id)).tables)).toEqual(toTables(input));
    const filtered = repo.query(
      query(data.id, { filters: [{ column: "PersonID", value: "p1" }] }),
    );
    expect(filtered.total).toBe(1);
    expect(filtered.tables[0].rows[0].EventID).toBe("001");
    const sorted = repo.query(
      query(data.id, {
        sorts: {
          [JSON.stringify([data.id, ["Root", "Events"]])]: {
            column: "Name",
            direction: 1,
          },
        },
      }),
    );
    expect(sorted.tables[0].rows.map((r) => r.EventID)).toEqual(["002", "001"]);
  });
  it("uses the final value of duplicate JSON object keys", async () => {
    const repo = repository();
    const data = await load(
      repo,
      '{"Rows":[{"Old":true}],"Rows":[{"Name":"old","Name":"new"}]}',
    );
    expect(repo.query(query(data.id)).tables[0].rows).toEqual([
      { Name: "new" },
    ]);
  });
  it("preserves XML wrapper/repeated/single record conversion and rejects DTDs", async () => {
    const repo = repository();
    const data = await load(
      repo,
      '<Root>\n  <Events>\n<Event id="01"><Name>A &amp; B</Name><Personal><Person><ID>001</ID></Person><Person><ID>002</ID></Person></Personal></Event><Event id="02"><Name>C</Name></Event></Events></Root>',
      "test.xml",
    );
    expect(plain(repo.query(query(data.id)).tables)).toEqual([
      {
        path: ["Root", "Events", "Event"],
        rows: [
          {
            "@id": "01",
            Name: "A & B",
            Personal: { Person: [{ ID: "001" }, { ID: "002" }] },
          },
          { "@id": "02", Name: "C" },
        ],
      },
    ]);
    await expect(load(repo, "<!DOCTYPE R><R/>", "bad.xml")).rejects.toThrow(
      "DTD",
    );
    expect(repo.list()).toHaveLength(1);
  });
  it("keeps active generation on errors and cancellation and replaces atomically on success", async () => {
    const repo = repository(),
      first = await load(repo, '[{"Name":"old"}]');
    await expect(
      load(repo, '[{"Name":"new"},', "test.json", first.id),
    ).rejects.toThrow();
    expect(repo.dataset(first.id).generation).toBe(first.generation);
    const abort = new AbortController();
    abort.abort();
    await expect(
      ingest(
        repo,
        new File(['[{"Name":"bad"}]'], "a.json"),
        defaultCsvOptions,
        abort.signal,
        () => {},
      ),
    ).rejects.toThrow();
    const next = await load(repo, '[{"Name":"new"}]', "test.json", first.id);
    expect(next.id).toBe(first.id);
    expect(repo.query(query(next.id)).tables[0].rows[0].Name).toBe("new");
  });
  it("preserves CSV options, leading zeros, multiline fields and exports the complete filtered/sorted table", async () => {
    const repo = repository(),
      text = 'ID;Name\r\n002;"two\nlines"\r\n001;"A; B"\r\n';
    const data = await load(repo, text, "test.csv");
    expect(repo.query(query(data.id)).tables[0].rows).toEqual(parseCsv(text));
    let output = "";
    await exportData(
      repo,
      query(data.id, {
        sorts: {
          [JSON.stringify([data.id, ["Root"]])]: { column: "ID", direction: 1 },
        },
      }),
      "csv",
      defaultCsvOptions,
      async (chunk) => {
        output += chunk;
      },
      new AbortController().signal,
      ["Root"],
      ["ID"],
    );
    expect(output).toBe('\uFEFF"ID"\r\n"001"\r\n"002"\r\n');
  });
  it("paginates without losing full-result counts, columns or timeline range", async () => {
    const repo = repository();
    const input = Array.from({ length: 205 }, (_, index) => ({
      ID: index,
      Date: "2026-09-08",
      Start: index === 204 ? "08:00" : "10:00",
      End: "11:00",
      ...(index === 204 ? { LateColumn: "yes" } : {}),
    }));
    const data = await load(repo, JSON.stringify(input));
    const result = repo.query(query(data.id));
    expect(result.tables[0].rows).toHaveLength(100);
    expect(result.total).toBe(205);
    expect(result.tables[0].columns).toContain("LateColumn");
    expect(result.start).toBe(480);
    expect(result.dayCount).toBe(205);
    expect(
      repo.query(query(data.id, { pages: { '["Root"]': 200 } })).tables[0].rows,
    ).toHaveLength(5);
  });
});

it("imports YAML documents atomically with stable numbered sources and language-aware names", async () => {
  const repo = repository();
  const loadParts = (text: string, language: "de" | "en" = "de", signal = new AbortController().signal) =>
    ingestYamlDocuments(repo, new File([text], "bundle.kyaml"), defaultCsvOptions, signal, () => {}, language);
  const parts = await loadParts('---\n{rows: [{ID: "001", note: "---"}]}\n---\n{rows: [{ID: "002"}]}');
  expect(parts.map((part) => part.name)).toEqual(["bundle.kyaml · Teil 1", "bundle.kyaml · Teil 2"]);
  expect(repo.query(query(parts[1].id)).tables[0].rows[0].ID).toBe("002");
  await expect(loadParts('---\n{rows: [{ID: "changed"}]}\n---\n{broken: [}')).rejects.toThrow();
  expect(repo.query(query(parts[0].id)).tables[0].rows[0].ID).toBe("001");
  await expect(loadParts('---\n{rows: [{ID: "changed"}]}\n---\nnull')).rejects.toThrow();
  expect(repo.list().map((part) => part.generation)).toEqual(parts.map((part) => part.generation));
  const controller = new AbortController(); controller.abort();
  await expect(loadParts('rows: [{ID: "cancelled"}]', "de", controller.signal)).rejects.toThrow();
  const updated = await loadParts('rows: [{ID: "003"}]', "en");
  expect(updated[0]).toMatchObject({ id: parts[0].id, name: "bundle.kyaml", sourceFile: "bundle.kyaml", part: 1 });
  expect(repo.list()).toHaveLength(1);
});

it("imports the supplied KubeVirt YAML example", async () => {
  const repo = repository();
  const text = readFileSync(new URL("./fixtures/win10vm.yaml", import.meta.url), "utf8");
  const datasets = await ingestYamlDocuments(repo, new File([text], "win10vm.yaml"), defaultCsvOptions,
    new AbortController().signal, () => {});
  expect(datasets).toHaveLength(1);
  expect(repo.query(query(datasets[0].id)).total).toBeGreaterThan(0);
});

it("shows object-only KYAML as one complete record", async () => {
  const repo = repository();
  const text = readFileSync(new URL("./fixtures/win10vm.kyaml", import.meta.url), "utf8");
  const [data] = await ingestYamlDocuments(repo, new File([text], "win10vm.kyaml"), defaultCsvOptions,
    new AbortController().signal, () => {});
  expect(data).toMatchObject({ name: "win10vm.kyaml", count: 1, paths: 1 });
  const result = repo.query(query(data.id));
  expect(result.tables[0].rows).toEqual([JSON.parse(text)]);
  expect(repo.query(query(data.id, { query: "iso-win10" })).total).toBe(1);
});
it("asks at successive node intervals and preserves the prior import on cancellation", async () => {
  const repo = repository();
  const old = await load(repo, '[{"ID":"original"}]', "large.json");
  const input = new File([JSON.stringify([{ Items: Array(21000).fill(0) }])], "large.json");
  const warnings: number[] = [];
  await expect(ingest(repo, input, defaultCsvOptions, new AbortController().signal, () => {}, old.id,
    async (warning) => { warnings.push(warning.interval); return warning.interval === 1 ? "continue" : "cancel"; })).rejects.toThrow("Cancelled");
  expect(warnings).toEqual([1, 2]);
  expect(repo.query(query(old.id)).tables[0].rows).toEqual([{ ID: "original" }]);
  expect(repo.db.selectValue("SELECT count(*) FROM entities WHERE generation<>?", [old.generation])).toBe(0);
  const accepted: number[] = [];
  const result = await ingest(repo, input, defaultCsvOptions, new AbortController().signal, () => {}, old.id,
    async (warning) => { accepted.push(warning.interval); return "continue"; });
  expect(accepted).toEqual([1, 2]);
  expect(result.count).toBe(1);
});
it("suppresses later warnings only for the current import after interval two", async () => {
  const repo = repository();
  const file = new File([JSON.stringify([{ Items: Array(31000).fill(0) }])], "nodes.json");
  const warnings: number[] = [];
  await ingest(repo, file, defaultCsvOptions, new AbortController().signal, () => {}, undefined,
    async (warning) => { warnings.push(warning.interval); return warning.interval === 1 ? "continue" : "ignore"; });
  expect(warnings).toEqual([1, 2]);
  await expect(ingest(repo, file, defaultCsvOptions, new AbortController().signal, () => {}, undefined,
    async (warning) => { expect(warning.interval).toBe(1); return "cancel"; })).rejects.toThrow("Cancelled");
  expect(repo.list()).toHaveLength(1);
});
it("asks at byte intervals even when the node count is small", async () => {
  const repo = repository();
  const file = new File([JSON.stringify([{ Items: Array(5).fill("x".repeat(900000)) }])], "bytes.json");
  const warnings: number[] = [];
  const data = await ingest(repo, file, defaultCsvOptions, new AbortController().signal, () => {}, undefined,
    async (warning) => { warnings.push(warning.interval); return "continue"; });
  expect(warnings).toEqual([1, 2]);
  expect(data.count).toBe(1);
});
