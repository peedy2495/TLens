import { Tokenizer, TokenType as T } from "@streamparser/json";
import { SaxesParser } from "saxes";
import { parseDocument } from "yaml";
import { parseCsv, type CsvOptions } from "../csv";
import {
  limits,
  SourceError,
  type Entity,
  type EntitySink,
  type Format,
  type Parser,
} from "./contracts";

function bound(value: string) {
  if (value.length > limits.valueChars)
    throw new SourceError(
      "LIMIT",
      "Einzelwert zu groß / Individual value too large (1 Mi characters).",
    );
}
export function jsonParser(sink: EntitySink): Parser {
  let next = 0,
    root = false;
  type Frame = {
    id: number;
    kind: "array" | "object";
    state: "key" | "colon" | "value" | "comma" | "nextKey" | "nextValue";
    key: string;
    position: number;
    path: string[];
    insideArray: boolean;
  };
  const stack: Frame[] = [];
  const tokenizer = new Tokenizer({ emitPartialTokens: true });
  tokenizer.onToken = ({ token, value, partial }) => {
    if (typeof value === "string") bound(value);
    if (partial) return;
    const parent = stack.at(-1);
    if (token === T.RIGHT_BRACE || token === T.RIGHT_BRACKET) {
      if (
        !parent ||
        (token === T.RIGHT_BRACE) !== (parent.kind === "object") ||
        !["key", "value", "comma"].includes(parent.state)
      )
        throw new Error("JSON: invalid closing token");
      if (parent.kind === "object" && parent.state === "value")
        throw new Error("JSON: missing value");
      stack.pop();
      return;
    }
    if (
      parent?.kind === "object" &&
      (parent.state === "key" || parent.state === "nextKey")
    ) {
      if (token !== T.STRING) throw new Error("JSON: expected key");
      if (String(value).length > limits.fieldNameChars)
        throw new Error("Field name exceeds 1,024 characters.");
      parent.key = String(value);
      parent.state = "colon";
      return;
    }
    if (parent?.state === "colon") {
      if (token !== T.COLON) throw new Error("JSON: expected colon");
      parent.state = "value";
      return;
    }
    if (parent?.state === "comma") {
      if (token !== T.COMMA) throw new Error("JSON: expected comma");
      parent.state = parent.kind === "object" ? "nextKey" : "nextValue";
      return;
    }
    if (!parent && root) throw new Error("JSON: multiple roots");
    if (
      ![
        T.LEFT_BRACE,
        T.LEFT_BRACKET,
        T.STRING,
        T.NUMBER,
        T.NULL,
        T.TRUE,
        T.FALSE,
      ].includes(token)
    )
      throw new Error("JSON: expected value");
    root = true;
    const kind =
      token === T.LEFT_BRACE
        ? "object"
        : token === T.LEFT_BRACKET
          ? "array"
          : "value";
    const position = parent ? parent.position++ : 0;
    const name = parent?.kind === "object" ? parent.key : String(position);
    const path = parent ? [...parent.path, name] : ["Root"];
    const entity: Entity = {
      id: ++next,
      parent: parent?.id ?? null,
      position,
      name,
      kind,
      value: kind === "value" ? JSON.stringify(value) : "",
      path,
      replaceExisting: parent?.kind === "object",
    };
    if (kind === "object" && parent?.kind === "array" && !parent.insideArray)
      entity.tablePath = parent.path;
    sink.add(entity);
    if (parent) parent.state = "comma";
    if (kind !== "value") {
      if (stack.length >= limits.depth)
        throw new SourceError("LIMIT", "JSON: nesting exceeds 128");
      stack.push({
        id: next,
        kind,
        state: kind === "object" ? "key" : "value",
        key: "",
        position: 0,
        path,
        insideArray:
          !!parent && (parent.insideArray || parent.kind === "array"),
      });
    }
  };
  return {
    write: (chunk) => tokenizer.write(chunk),
    end() {
      if (!tokenizer.isEnded) tokenizer.end();
      if (!root || stack.length) throw new Error("JSON: incomplete document");
    },
  };
}

export function xmlParser(sink: EntitySink): Parser {
  let next = 0,
    sinceEvent = 0,
    prefix = "",
    decoder: TextDecoder | undefined,
    initial = new Uint8Array(0);
  const parser = new SaxesParser({ xmlns: true });
  const stack: {
    id: number;
    position: number;
    path: string[];
    attributes: Record<string, string>;
    text: string;
  }[] = [];
  parser.on("doctype", () => {
    throw new Error(
      "XML: DTDs are not supported / DTDs werden nicht unterstützt.",
    );
  });
  parser.on("opentag", (tag) => {
    sinceEvent = 0;
    if (stack.length >= limits.depth)
      throw new SourceError("LIMIT", "XML: nesting exceeds 128");
    const parent = stack.at(-1);
    if (
      tag.name.length > limits.fieldNameChars ||
      Object.values(tag.attributes).some(
        (a) => a.name.length > limits.fieldNameChars,
      )
    )
      throw new Error("XML name exceeds 1,024 characters.");
    const attributes = Object.fromEntries(
      Object.values(tag.attributes).map((a) => [`@${a.name}`, a.value]),
    );
    const path = [...(parent?.path ?? []), tag.name];
    const id = ++next;
    sink.add({
      id,
      parent: parent?.id ?? null,
      position: parent ? parent.position++ : 0,
      name: tag.name,
      kind: "xml",
      value: JSON.stringify({ attributes, text: "" }),
      path,
    });
    stack.push({ id, position: 0, path, attributes, text: "" });
  });
  const text = (value: string) => {
    sinceEvent = 0;
    const parent = stack.at(-1);
    if (parent) {
      parent.text += value;
      bound(parent.text);
    }
  };
  parser.on("text", text);
  parser.on("cdata", text);
  parser.on("comment", () => {
    sinceEvent = 0;
  });
  parser.on("processinginstruction", () => {
    sinceEvent = 0;
  });
  parser.on("closetag", () => {
    sinceEvent = 0;
    const node = stack.pop()!;
    sink.update(
      node.id,
      JSON.stringify({ attributes: node.attributes, text: node.text }),
    );
  });
  const feed = (value: string) => {
    if (/<!DOCTYPE\s/i.test(prefix + value))
      throw new Error(
        "XML: DTDs are not supported / DTDs werden nicht unterstützt.",
      );
    prefix = (prefix + value).slice(-16);
    sinceEvent += value.length;
    if (sinceEvent > limits.valueChars)
      throw new Error("XML: token exceeds 1 Mi characters.");
    parser.write(value);
  };
  function write(chunk: Uint8Array) {
    if (!decoder) {
      const combined = new Uint8Array(initial.length + chunk.length);
      combined.set(initial);
      combined.set(chunk, initial.length);
      initial = combined;
      if (initial.length < 256) return;
      const head = new TextDecoder().decode(initial.subarray(0, 256));
      const encoding =
        initial[0] === 255 && initial[1] === 254
          ? "utf-16le"
          : initial[0] === 254 && initial[1] === 255
            ? "utf-16be"
            : (/encoding\s*=\s*['"]([^'"]+)/i.exec(head)?.[1] ?? "utf-8");
      decoder = new TextDecoder(encoding, { fatal: true });
      chunk = initial;
      initial = new Uint8Array(0);
    }
    feed(decoder.decode(chunk, { stream: true }));
  }
  return {
    write,
    end() {
      if (!decoder) {
        const head = new TextDecoder().decode(initial);
        const encoding =
          initial[0] === 255 && initial[1] === 254
            ? "utf-16le"
            : initial[0] === 254 && initial[1] === 255
              ? "utf-16be"
              : (/encoding\s*=\s*['"]([^'"]+)/i.exec(head)?.[1] ?? "utf-8");
        decoder = new TextDecoder(encoding, { fatal: true });
        feed(decoder.decode(initial));
      } else feed(decoder.decode());
      parser.close();
    },
  };
}

// Split logical CSV records without interpreting field values; the existing parser
// remains the authority for delimiters, headers and malformed quoting.
export function csvParser(sink: EntitySink, options: CsvOptions): Parser {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let record = "",
    quoted = false,
    pendingQuote = false,
    skipLF = false,
    first = true,
    headers: string[] | undefined,
    next = 0;
  let activeOptions = { ...options };
  let headerRecord = "";
  const emit = () => {
    if (!record.trim()) {
      record = "";
      return;
    }
    if (!headers) {
      const rows = parseCsv(record, { ...activeOptions, header: false });
      if (!rows.length) {
        record = "";
        return;
      }
      if (activeOptions.delimiter === "auto") {
        for (const delimiter of [",", ";", "\t"] as const) {
          try {
            if (
              Object.keys(
                parseCsv(record, {
                  ...activeOptions,
                  delimiter,
                  header: false,
                })[0],
              ).length === Object.keys(rows[0]).length
            ) {
              activeOptions.delimiter = delimiter;
              break;
            }
          } catch {
            /* Other delimiters may be invalid for this record. */
          }
        }
      }
      headers = options.header
        ? Object.values(rows[0]).map((v) => String(v).trim())
        : Object.keys(rows[0]);
      if (
        headers.some((h) => !h || h.length > limits.fieldNameChars) ||
        new Set(headers).size !== headers.length
      )
        throw new Error(
          "CSV: Headers must be unique and nonempty / Spaltennamen müssen eindeutig und nicht leer sein.",
        );
      if (options.header) {
        headerRecord = record;
        record = "";
        return;
      }
    }
    const rows = parseCsv(
      options.header ? headerRecord + "\r\n" + record : record,
      activeOptions,
    );
    for (const row of rows) {
      if (Object.keys(row).length !== headers.length)
        throw new Error(
          "CSV: Wrong number of fields / Falsche Anzahl an Feldern.",
        );
      sink.add({
        id: ++next,
        parent: null,
        position: next - 1,
        name: String(next),
        kind: "value",
        value: JSON.stringify(row),
        path: ["Root", String(next)],
        tablePath: ["Root"],
      });
    }
    record = "";
  };
  function feed(text: string) {
    for (const char of text) {
      if (first) {
        first = false;
        if (char === "\uFEFF") continue;
      }
      if (pendingQuote) {
        pendingQuote = false;
        if (char === options.quote) {
          record += char;
          continue;
        }
        quoted = false;
      }
      if (skipLF) {
        skipLF = false;
        if (char === "\n") continue;
      }
      if (char === options.quote && options.quote) {
        record += char;
        if (quoted) pendingQuote = true;
        else quoted = true;
      } else if (!quoted && (char === "\r" || char === "\n")) {
        emit();
        skipLF = char === "\r";
      } else record += char;
      bound(record);
    }
  }
  return {
    write(chunk) {
      feed(decoder.decode(chunk, { stream: true }));
    },
    end() {
      feed(decoder.decode());
      if (pendingQuote) quoted = false;
      if (quoted)
        throw new Error(
          "CSV: Unclosed quotation / Nicht geschlossene Anführungszeichen.",
        );
      emit();
    },
  };
}
export function createParser(
  format: Format,
  sink: EntitySink,
  csv: CsvOptions,
): Parser {
  if (format === "json") return jsonParser(sink);
  if (format === "xml") return xmlParser(sink);
  if (format === "csv") return csvParser(sink, csv);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "",
    bytes = 0;
  return {
    write(chunk) {
      bytes += chunk.length;
      if (bytes > limits.yamlBytes) throw new Error("YAML: Maximum 5 MB.");
      text += decoder.decode(chunk, { stream: true });
    },
    end() {
      text += decoder.decode();
      const document = parseDocument(text, { uniqueKeys: true });
      if (document.errors.length) throw document.errors[0];
      if (document.warnings.length) throw document.warnings[0];
      const value = document.toJS({ maxAliasCount: 50 });
      const parser = jsonParser(sink);
      // YAML stays deliberately bounded; JSON tokenization validates depth and values.
      parser.write(new TextEncoder().encode(JSON.stringify(value)));
      parser.end();
    },
  };
}
