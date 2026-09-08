export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export type Row = Record<string, JsonValue>;
export type Table = { path: string[]; rows: Row[] };
export function defaultColumns(tables: Table[]): string[] {
  return [
    ...new Set(
      tables.flatMap((table) =>
        table.rows.flatMap((row) =>
          Object.keys(row).filter(
            (key) => row[key] === null || typeof row[key] !== "object",
          ),
        ),
      ),
    ),
  ];
}
export type Filter = {
  column: string;
  value: string;
  operator?: "contains" | "equals";
};
export function valueText(value: JsonValue | undefined): string {
  return value != null && typeof value === "object"
    ? JSON.stringify(value)
    : String(value ?? "");
}
export function eventFilter(filters: Filter[], id: string): Filter[] {
  return [
    ...filters.filter((filter) => filter.column !== "EventID"),
    { column: "EventID", value: id, operator: "equals" },
  ];
}
export type View = {
  id: string;
  name: string;
  columns: string[];
  filters: Filter[];
  query: string;
  default: boolean;
};
export function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function toTables(input: unknown, path = ["Root"]): Table[] {
  if (Array.isArray(input)) {
    const rows = input
      .filter((v) => v && typeof v === "object" && !Array.isArray(v))
      .map((v) => v as Row);
    return rows.length ? [{ path, rows }] : [];
  }
  if (input && typeof input === "object")
    return Object.entries(input).flatMap(([k, v]) => toTables(v, [...path, k]));
  return [];
}
export function filterTables(
  tables: Table[],
  query: string,
  filters: Filter[],
) {
  return tables
    .map((table) => ({
      ...table,
      rows: table.rows.filter(
        (row) =>
          Object.values(row).some((value) =>
            valueText(value).toLowerCase().includes(query.toLowerCase()),
          ) &&
          filters.every((f) =>
            f.operator === "equals"
              ? valueText(row[f.column]) === f.value
              : valueText(row[f.column])
                  .toLowerCase()
                  .includes(f.value.toLowerCase()),
          ),
      ),
    }))
    .filter((table) => table.rows.length);
}
export function minutes(value: unknown): number {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value));
  return match && +match[1] < 24 && +match[2] < 60
    ? +match[1] * 60 + +match[2]
    : NaN;
}
export function eventRange(row: Row) {
  const start = minutes(row.Start);
  let end = minutes(row.End);
  if (end < start) end += 1440;
  return { start, end };
}
export function nextDate(dates: string[], today: string) {
  return dates.find((date) => date >= today) ?? dates.at(-1) ?? "";
}
export function readStored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
