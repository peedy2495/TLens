import { valueText, type Row } from "./data";

export type CsvOptions = {
  delimiter: "auto" | "," | ";" | "\t" | "|";
  quote: '"' | "'" | "";
  header: boolean;
};
export const defaultCsvOptions: CsvOptions = { delimiter: "auto", quote: '"', header: true };

export function exportCsv(rows: Row[], columns: string[], options: CsvOptions = defaultCsvOptions): string {
  const delimiter = options.delimiter === "auto" ? "," : options.delimiter;
  const cell = (value: string) => {
    if (!options.quote) {
      if (value.includes(delimiter) || /[\r\n]/.test(value))
        throw new Error("CSV: Bitte Textbegrenzungszeichen aktivieren / Enable a quote character for these values.");
      return value;
    }
    return options.quote + value.split(options.quote).join(options.quote.repeat(2)) + options.quote;
  };
  const records = rows.map((row) => columns.map((column) => valueText(row[column])));
  if (options.header) records.unshift(columns);
  return "\uFEFF" + records.map((record) => record.map(cell).join(delimiter)).join("\r\n") + "\r\n";
}

export function parseCsv(input: string, options: CsvOptions = defaultCsvOptions): Row[] {
  const text = input.replace(/^\uFEFF/, "");
  const counts = new Map([[",", 0], [";", 0], ["\t", 0]]);
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === options.quote) {
      if (quoted && text[i + 1] === options.quote) i++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (char === "\n" || char === "\r") break;
      if (counts.has(char)) counts.set(char, counts.get(char)! + 1);
    }
  }
  const delimiter = options.delimiter === "auto"
    ? [...counts].sort((a, b) => b[1] - a[1])[0][0]
    : options.delimiter;
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let state: "plain" | "quoted" | "closed" = "plain";
  const finishField = () => {
    record.push(field);
    field = "";
    state = "plain";
  };
  const finishRecord = () => {
    finishField();
    if (record.length > 1 || record[0].trim() !== "") records.push(record);
    record = [];
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (state === "quoted") {
      if (char === options.quote) {
        if (text[i + 1] === options.quote) {
          field += options.quote;
          i++;
        } else state = "closed";
      } else field += char;
    } else if (char === delimiter) finishField();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      finishRecord();
    } else if (char === options.quote && state === "plain" && field === "") {
      state = "quoted";
    } else {
      if (state === "closed" || char === options.quote)
        throw new Error("CSV: Invalid quotation / Ungültige Anführungszeichen.");
      field += char;
    }
  }
  if (state === "quoted")
    throw new Error("CSV: Unclosed quotation / Nicht geschlossene Anführungszeichen.");
  finishRecord();
  if (!records.length) return [];
  const headers = options.header
    ? records.shift()!.map((header) => header.trim())
    : records[0].map((_, index) => `Column${index + 1}`);
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length)
    throw new Error("CSV: Headers must be unique and nonempty / Spaltennamen müssen eindeutig und nicht leer sein.");
  return records.map((values, index) => {
    if (values.length !== headers.length)
      throw new Error(`CSV: Record / Datensatz ${index + 2}: Wrong number of fields / Falsche Anzahl an Feldern.`);
    // Preserve IDs, leading zeros, dates and times exactly as supplied.
    return Object.fromEntries(headers.map((header, i) => [header, values[i]]));
  });
}
