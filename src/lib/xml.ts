import type { JsonValue, Row, Table } from "./data";

function elementValue(element: Element): JsonValue {
  const children = Array.from(element.children);
  const attributes = Array.from(element.attributes).map(
    (attribute) => [`@${attribute.name}`, attribute.value] as const,
  );
  if (!children.length && !attributes.length) return element.textContent ?? "";
  const groups = new Map<string, JsonValue[]>();
  for (const child of children) {
    const values = groups.get(child.tagName) ?? [];
    values.push(elementValue(child));
    groups.set(child.tagName, values);
  }
  const result: Row = Object.fromEntries(attributes);
  for (const [name, values] of groups) {
    Object.defineProperty(result, name, {
      value: values.length === 1 ? values[0] : values,
      enumerable: true,
    });
  }
  // Keep direct text and CDATA without duplicating descendant text.
  const text = Array.from(element.childNodes)
    .filter((node) => node.nodeType === 3 || node.nodeType === 4)
    .map((node) => node.nodeValue ?? "")
    .join("");
  if (text.trim()) result["#text"] = text;
  return result;
}

export function xmlDocumentTables(document: Document): Table[] {
  const tables: Table[] = [];
  const row = (element: Element): Row => {
    const value = elementValue(element);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value
      : { "#text": value };
  };
  const visit = (elements: Element[], path: string[]) => {
    const element = elements[0];
    const children = Array.from(element.children);
    const hasDirectText = Array.from(element.childNodes).some(
      (node) => (node.nodeType === 3 || node.nodeType === 4) && node.nodeValue?.trim(),
    );
    // A repeated element or an element with scalar fields represents records.
    if (elements.length > 1 || element.attributes.length || hasDirectText || !children.length ||
        children.some((child) => !child.children.length)) {
      tables.push({ path, rows: elements.map(row) });
      return;
    }
    const groups = new Map<string, Element[]>();
    for (const child of children) {
      const siblings = groups.get(child.tagName) ?? [];
      siblings.push(child);
      groups.set(child.tagName, siblings);
    }
    for (const [name, siblings] of groups) visit(siblings, [...path, name]);
  };
  const root = document.documentElement;
  visit([root], [root.tagName]);
  return tables;
}

export function parseXml(input: string): Table[] {
  if (/<!DOCTYPE\s/i.test(input))
    throw new Error("XML: DTDs werden nicht unterstützt / DTDs are not supported.");
  const document = new DOMParser().parseFromString(input, "application/xml");
  if (document.getElementsByTagName("parsererror").length || !document.documentElement)
    throw new Error("XML: Ungültiges Dokument / Invalid document.");
  return xmlDocumentTables(document);
}
