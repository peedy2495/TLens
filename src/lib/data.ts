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
export function valuesForColumn(
  value: JsonValue,
  column: string,
): JsonValue[] {
  if (Array.isArray(value))
    return value.flatMap((item) => valuesForColumn(item, column));
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([key, nestedValue]) => [
      ...(key === column ? [nestedValue] : []),
      ...valuesForColumn(nestedValue, column),
    ]);
  return [];
}
export function filterColumns(tables: Table[]): string[] {
  const columns = new Set<string>();
  const visit = (value: JsonValue) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (value && typeof value === "object")
      Object.entries(value).forEach(([key, nestedValue]) => {
        columns.add(key);
        visit(nestedValue);
      });
  };
  tables.forEach((table) => table.rows.forEach(visit));
  return [...columns];
}
export function filterOptions(tables: Table[], column: string): string[] {
  return [
    ...new Set(
      tables.flatMap((table) =>
        table.rows.flatMap((row) =>
          valuesForColumn(row, column).map(valueText).filter(Boolean),
        ),
      ),
    ),
  ].sort((a, b) =>
    b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" }),
  );
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
            valuesForColumn(row, f.column).some((value) =>
              f.operator === "equals"
                ? valueText(value) === f.value
                : valueText(value)
                    .toLowerCase()
                    .includes(f.value.toLowerCase()),
            ),
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
export function detectTimeColumns(columns: string[]) {
  const normalize = (name: string) => name.toLowerCase().replace(/[\s_-]/g, "");
  const find = (aliases: string[]) => {
    for (const alias of aliases) {
      const match = columns.find((column) => normalize(column) === alias);
      if (match) return match;
    }
    return "";
  };
  return {
    start: find(["start", "starttime", "startzeit", "beginn", "beginnzeit", "anfang", "anfangszeit", "begin", "beginning", "begintime", "von", "zeitvon"]),
    end: find(["end", "endtime", "endzeit", "ende", "endezeit", "stop", "finish", "finishtime", "bis", "zeitbis"]),
  };
}
export function eventRange(row: Row, startColumn = "Start", endColumn = "End") {
  const start = minutes(row[startColumn]);
  let end = minutes(row[endColumn]);
  if (end < start) end += 1440;
  return { start, end };
}
export function hasTimelineData(tables: Table[], mapping: { start: string; end: string }): boolean {
  if (!mapping.start || !mapping.end) return false;
  return tables.some((table) => table.rows.some((row) => {
    const range = eventRange(row, mapping.start, mapping.end);
    return isDate(String(row.Date ?? "")) && Number.isFinite(range.start) && Number.isFinite(range.end);
  }));
}
export function nextDate(dates: string[], today: string) {
  return dates.find((date) => date >= today) ?? dates.at(-1) ?? "";
}
export function readStored<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    // Read legacy preferences without changing the existing Jazz database.
    const legacy = stored === null && key.startsWith("dlens-")
      ? localStorage.getItem(key.replace(/^dlens-/, "tlens-"))
      : null;
    return JSON.parse(stored ?? legacy ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
