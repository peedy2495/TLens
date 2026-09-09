import { describe, expect, it } from "vitest";
import { createParser, jsonParser, xmlParser } from "./parsers";
import { defaultCsvOptions } from "../csv";
import { formatFor } from "./contracts";
import type { Entity, Parser } from "./contracts";
import { FileConnector } from "./connectors";
function sink() {
  const nodes = new Map<number, Entity>();
  return {
    nodes,
    add(e: Entity) {
      nodes.set(e.id, { ...e });
    },
    update(id: number, value: string) {
      nodes.get(id)!.value = value;
    },
  };
}
function split(parser: Parser, text: string, width = 1) {
  const bytes = new TextEncoder().encode(text);
  for (let i = 0; i < bytes.length; i += width)
    parser.write(bytes.subarray(i, i + width));
  parser.end();
}
describe("incremental parser boundaries", () => {
  it("handles every UTF-8, JSON token and structural boundary", () => {
    const target = sink();
    split(
      jsonParser(target),
      '{"rows":[{"Text":"Ä😀\\n","Value":-1.25e2,"Empty":[]},{}]}',
    );
    expect([...target.nodes.values()].filter((n) => n.tablePath)).toHaveLength(
      2,
    );
    expect([...target.nodes.values()].some((n) => n.value === '"Ä😀\\n"')).toBe(
      true,
    );
  });
  it.each(["[1,]", '{"a":}', '{"a":1,}', '{"a" 1}', "[1 2]", "{}{}", "[", ""])(
    "rejects malformed JSON: %s",
    (text) => {
      expect(() => split(jsonParser(sink()), text)).toThrow();
    },
  );
  it("preserves XML namespaces, CDATA and split entities", () => {
    const target = sink();
    split(
      xmlParser(target),
      '<r xmlns:x="urn:test"><x:item a="01">hello &amp; <![CDATA[world]]><b>nested</b></x:item></r>',
    );
    const item = [...target.nodes.values()].find((n) => n.name === "x:item")!;
    expect(JSON.parse(item.value)).toEqual({
      attributes: { "@a": "01" },
      text: "hello & world",
    });
  });
  it.each([
    "<!DOCTYPE r><r/>",
    "<r><x></r>",
    "<r>&unknown;</r>",
    '<r a="1" a="2"/>',
  ])("rejects malformed or unsafe XML: %s", (text) => {
    expect(() => split(xmlParser(sink()), text)).toThrow();
  });
  it("retains CSV quoting across all chunk boundaries", () => {
    const target = sink();
    split(
      createParser("csv", target, defaultCsvOptions),
      '\uFEFFID;Name\r\n001;"a;\r\nb"\r\n002;"a""b"\r\n',
    );
    expect([...target.nodes.values()].map((n) => JSON.parse(n.value))).toEqual([
      { ID: "001", Name: "a;\r\nb" },
      { ID: "002", Name: 'a"b' },
    ]);
  });
  it("bounds excessive depth and individual XML/JSON values", () => {
    expect(() => split(jsonParser(sink()), "[".repeat(129), 64)).toThrow("128");
    expect(() =>
      split(jsonParser(sink()), '"' + "a".repeat(1100000), 65536),
    ).toThrow("large");
    expect(() =>
      split(xmlParser(sink()), "<r>" + "a".repeat(1100000) + "</r>", 65536),
    ).toThrow("large");
  });
  it("rejects unsafe YAML tags, aliases and malformed documents", () => {
    for (const text of ["x: !unsafe value", "x: [", "x: &x [*x]"])
      expect(() =>
        split(createParser("yaml", sink(), defaultCsvOptions), text),
      ).toThrow();
  });
});
describe("connector lifecycle", () => {
  it("reads at most 64 KiB per pull and propagates cancellation", async () => {
    const controller = new AbortController();
    const connector = new FileConnector(new Blob([new Uint8Array(200000)]));
    await connector.open(controller.signal);
    const iterator = connector.read()[Symbol.asyncIterator]();
    expect((await iterator.next()).value!.length).toBeLessThanOrEqual(65536);
    controller.abort();
    await expect(iterator.next()).rejects.toThrow();
    await connector.close();
  });
});

it("rejects conflicting MIME types and unbounded field names", () => {
  expect(() =>
    formatFor({ name: "file.csv", type: "application/xml" }),
  ).toThrow("disagree");
  expect(() =>
    split(jsonParser(sink()), JSON.stringify({ ["x".repeat(1025)]: "value" })),
  ).toThrow("1,024");
});

it("imports KYAML flow syntax with comments, trailing commas and explicit string types", () => {
  const format = formatFor({ name: "resources.KYAML", type: "application/yaml" });
  expect(format).toBe("yaml");
  expect(formatFor({ name: "resources.kyaml" })).toBe("yaml");
  expect(() => formatFor({ name: "resources.kyaml", type: "application/xml" })).toThrow();
  const target = sink();
  split(createParser(format, target, defaultCsvOptions), `---
  {items: [
    # Quoted strings must retain their types.
    {id: "001", enabled: "true", count: 2, nested: {name: "Ä",},},
  ],}`);
  expect([...target.nodes.values()].filter((node) => node.tablePath)).toHaveLength(1);
  expect([...target.nodes.values()].find((node) => node.name === "id")?.value).toBe('"001"');
  expect([...target.nodes.values()].find((node) => node.name === "enabled")?.value).toBe('"true"');
  expect([...target.nodes.values()].find((node) => node.name === "count")?.value).toBe('2');
  expect(() => split(createParser(format, sink(), defaultCsvOptions), '---\n{items: [}')).toThrow();
});
