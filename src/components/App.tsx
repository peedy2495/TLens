import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { JazzReactProvider, useAccount } from "jazz-tools/react";
import { Dialog } from "@base-ui/react/dialog";
import {
  ArrowUpIcon,
  ArrowDownIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  ArrowPathIcon,
  BookmarkIcon,
  CalendarDaysIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleStackIcon,
  ClockIcon,
  Cog6ToothIcon,
  DocumentChartBarIcon,
  EyeIcon,
  FolderIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  PlusIcon,
  Squares2X2Icon,
  StarIcon,
  SunIcon,
  XMarkIcon,
  ArrowsUpDownIcon,
} from "@heroicons/react/24/outline";
import { parse } from "yaml";
import { parseCsv, exportCsv, defaultCsvOptions, type CsvOptions } from "../lib/csv";
import { parseXml } from "../lib/xml";
import {
  eventFilter,
  defaultColumns,
  filterColumns,
  filterOptions,
  valueText,
  type Row,
  eventRange,
  detectTimeColumns,
  hasTimelineData,
  filterTables,
  isDate,
  localDate,
  nextDate,
  readStored,
  toTables,
  type Filter,
  type Table,
  type View,
} from "../lib/data";
import { RecordTree } from "./RecordTree";
import { DLensAccount } from "../lib/jazz";

const initialColumns = [
  "EventID",
  "Date",
  "Start",
  "End",
  "Area",
  "Description",
];
function IconButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className="icon-button"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function WorkspaceApp() {
  const me = useAccount(DLensAccount, { resolve: { root: true } });
  const [language, setLanguage] = useState<"de" | "en">(() =>
    readStored("dlens-language", "de"),
  );
  const t = (de: string, en: string) => (language === "de" ? de : en);
  const [dark, setDark] = useState(() => readStored("dlens-dark", false));
  const [files, setFiles] = useState<{ name: string; tables: Table[] }[]>([]);
  const [source, setSource] = useState("");
  const timelineLoad = useRef<{ source: string; data: unknown } | null>(null);
  const [sourceDragActive, setSourceDragActive] = useState(false);
  const sourceDragDepth = useRef(0);
  const [workspaceDragActive, setWorkspaceDragActive] = useState(false);
  const workspaceDragDepth = useRef(0);
  const [timeColumnsBySource, setTimeColumnsBySource] = useState<
    Record<string, { start: string; end: string }>
  >({});
  const [dbName, setDbName] = useState(() =>
    readStored("dlens-db", "Festival Workspace"),
  );
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filter[]>([]);
  const [columns, setColumns] = useState<string[]>(initialColumns);
  const [views, setViews] = useState<View[]>(() =>
    readStored("dlens-views", []),
  );
  const [panel, setPanel] = useState("");
  const [settings, setSettings] = useState(false);
  const [csvOptions, setCsvOptions] = useState<CsvOptions>(() =>
    ({ ...defaultCsvOptions, ...readStored("dlens-csv-options", {}) }),
  );
  useEffect(() => {
    localStorage.setItem("dlens-csv-options", JSON.stringify(csvOptions));
  }, [csvOptions]);
  const [showTimeline, setShowTimeline] = useState<boolean>(() =>
    readStored("dlens-show-timeline", true),
  );
  useEffect(() => {
    localStorage.setItem("dlens-show-timeline", JSON.stringify(showTimeline));
  }, [showTimeline]);
  const [colorColumn, setColorColumn] = useState<string>(() =>
    readStored("dlens-color-column", "Area"),
  );
  useEffect(() => {
    localStorage.setItem("dlens-color-column", JSON.stringify(colorColumn));
  }, [colorColumn]);
  const [detail, setDetail] = useState<{ row: Row; path: string[] } | null>(
    null,
  );
  const [filterColumn, setFilterColumn] = useState("Area");
  const [filterValue, setFilterValue] = useState("");
  const [viewName, setViewName] = useState("");
  const [withFilters, setWithFilters] = useState(true);
  const [selectedDate, setSelectedDate] = useState("");
  const [tableSorts, setTableSorts] = useState<
    Record<string, { column: string; direction: 1 | -1 } | null>
  >({});
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(new Date());
  const fileInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const view = views.find((v) => v.default);
    if (view) applyView(view);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("dlens-dark", JSON.stringify(dark));
  }, [dark]);
  useEffect(() => {
    document.documentElement.lang = language;
    localStorage.setItem("dlens-language", JSON.stringify(language));
  }, [language]);
  useEffect(() => {
    localStorage.setItem("dlens-views", JSON.stringify(views));
  }, [views]);
  useEffect(() => {
    localStorage.setItem("dlens-db", JSON.stringify(dbName));
  }, [dbName]);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (notice) {
      const id = setTimeout(() => setNotice(""), 4500);
      return () => clearTimeout(id);
    }
  }, [notice]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        searchInput.current?.focus();
      }
      if (event.key === "Escape") setPanel("");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  let tables = files.find((file) => file.name === source)?.tables ?? [];
  if (source === "jazz" && me.$isLoaded) {
    try {
      tables = JSON.parse(me.root.data);
    } catch {
      tables = [];
    }
  }
  const allColumns = Array.from(
    new Set(
      tables.flatMap((table) => table.rows.flatMap((row) => Object.keys(row))),
    ),
  ).sort((a, b) =>
    b.localeCompare(a, language, { numeric: true, sensitivity: "base" }),
  );
  const availableFilterColumns = filterColumns(tables).sort((a, b) =>
    a.localeCompare(b, language, { numeric: true, sensitivity: "base" }),
  );
  const availableFilterValues = filterOptions(tables, filterColumn);
  const timeColumns = timeColumnsBySource[source] ?? detectTimeColumns(allColumns);
  const timelineSourceData = source === "jazz"
    ? (me.$isLoaded ? me.root.data : undefined)
    : files.find((file) => file.name === source)?.tables;
  useEffect(() => {
    if (!source || timelineSourceData === undefined) return;
    if (timelineLoad.current?.source === source && timelineLoad.current.data === timelineSourceData) return;
    timelineLoad.current = { source, data: timelineSourceData };
    setShowTimeline(hasTimelineData(tables, timeColumns));
  });
  const rangeForRow = (row: Row) => eventRange(row, timeColumns.start, timeColumns.end);
  function colorStyle(value: string) {
    let hash = 0;
    for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    const hue = (hash * 137.508) % 360;
    return {
      backgroundColor: value ? `hsl(${hue} 45% ${dark ? 24 : 91}%)` : "var(--soft)",
      color: value ? `hsl(${hue} 65% ${dark ? 82 : 27}%)` : "var(--muted)",
      borderColor: value ? `hsl(${hue} 55% 55%)` : "var(--line)",
    };
  }
  const filtered = filterTables(tables, query, filters);
  const rows = filtered.flatMap((table) => table.rows);
  const dates = [
    ...new Set(rows.map((row) => String(row.Date ?? "")).filter(isDate)),
  ].sort();
  const day = dates.includes(selectedDate)
    ? selectedDate
    : nextDate(dates, localDate(now));
  const dayRows = rows.filter(
    (row) =>
      row.Date === day &&
      Number.isFinite(rangeForRow(row).start) &&
      Number.isFinite(rangeForRow(row).end),
  );
  const start = dayRows.length
    ? Math.floor(Math.min(...dayRows.map((row) => rangeForRow(row).start)) / 60) * 60
    : 0;
  const end = dayRows.length
    ? Math.ceil(Math.max(...dayRows.map((row) => rangeForRow(row).end)) / 60) *
        60
    : 1440;
  const position = (minute: number) => ((minute - start) / Math.max(1, end - start)) * 100;
  const clock = now.getHours() * 60 + now.getMinutes();
  const dateLabel = (value: string) =>
    value
      ? new Intl.DateTimeFormat(language, {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).format(new Date(value + "T12:00:00"))
      : "—";
  function toggle(name: string) {
    if (name === "filter" && !availableFilterColumns.includes(filterColumn)) {
      setFilterColumn(availableFilterColumns[0] ?? "");
      setFilterValue("");
    }
    setPanel(panel === name ? "" : name);
  }
  function applyView(view: View) {
    setColumns(view.columns);
    setFilters(view.filters);
    setQuery(view.query);
    setPanel("");
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      if (!/\.(json|ya?ml|csv|xml)$/i.test(file.name))
        throw new Error(t(
          "Nicht unterstütztes Dateiformat. Erlaubt sind JSON, YAML, YML, CSV und XML.",
          "Unsupported file format. Supported formats: JSON, YAML, YML, CSV and XML.",
        ));
      if (file.size > 5_000_000)
        throw new Error(
          t("Maximal 5 MB pro Datei.", "Maximum file size is 5 MB."),
        );
      const content = await file.text();
      const imported = /\.xml$/i.test(file.name) ? parseXml(content) : toTables(
        /\.csv$/i.test(file.name)
          ? parseCsv(content, csvOptions)
          : /\.json$/i.test(file.name) ? JSON.parse(content) : parse(content),
      );
      if (!imported.length)
        throw new Error(
          t(
            "Keine Tabellen gefunden. Verwende Arrays mit Objekten.",
            "No tables found. Use arrays of objects.",
          ),
        );
      setFiles((prev) => [
        ...prev.filter((f) => f.name !== file.name),
        { name: file.name, tables: imported },
      ]);
      setSource(file.name);
      setTimeColumnsBySource((previous) => ({
        ...previous,
        [file.name]: detectTimeColumns(
          [...new Set(imported.flatMap((table) => table.rows.flatMap(Object.keys)))],
        ),
      }));
      setColumns(defaultColumns(imported));
      setFilters([]);
      setQuery("");
      setPanel("");
      setNotice(t("Datei importiert", "File imported"));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }
  async function loadFestival() {
    try {
      const response = await fetch("/demo/weitklang-festival-2027.json");
      if (!response.ok)
        throw new Error(
          t(
            "Festivaldatei konnte nicht geladen werden.",
            "Could not load festival file.",
          ),
        );
      await importFile(
        new File([await response.text()], "weitklang-festival-2027.json", {
          type: "application/json",
        }),
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }
  function download() {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dlens-export.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function downloadCsv(table: Table, visible: string[], sortedRows: Row[]) {
    try {
      const blob = new Blob([exportCsv(sortedRows, visible, csvOptions)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${table.path.join("-").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_") || "table"}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }
  const count = tables.reduce((sum, table) => sum + table.rows.length, 0);
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">
            D<span />
          </span>
          DLens
          <span className="brand-divider" />
          <span className="workspace-label">Data Explorer</span>
        </a>
        <div className="top-right">
          <span className="prototype">{t("Prototyp", "Prototype")}</span>
          <span className="avatar">DL</span>
        </div>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <div className="eyebrow">YOUR DATA. IN FOCUS.</div>
            <h1>{t("Alles im Blick.", "Everything in view.")}</h1>
            <p>
              {t(
                "Entdecke Zusammenhänge. Plane den nächsten Moment.",
                "Discover connections. Plan the next moment.",
              )}
            </p>
          </div>
          <span className="local-status">
            <span />
            {t("Lokal gespeichert", "Stored locally")}
          </span>
        </div>
        <section
          className="controls"
          aria-label={t("Daten und Filter", "Data and filters")}
        >
          <div className="source-line">
            <button
              className={`source-button${sourceDragActive ? " drop-active" : ""}`}
              onDragEnter={(event) => {
                if (!event.dataTransfer.types.includes("Files")) return;
                event.preventDefault();
                sourceDragDepth.current++;
                setSourceDragActive(true);
              }}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes("Files")) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }}
              onDragLeave={() => {
                sourceDragDepth.current = Math.max(0, sourceDragDepth.current - 1);
                if (!sourceDragDepth.current) setSourceDragActive(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                sourceDragDepth.current = 0;
                setSourceDragActive(false);
                if (event.dataTransfer.files.length !== 1) {
                  setNotice(t("Bitte genau eine Datei ablegen.", "Please drop exactly one file."));
                  return;
                }
                void importFile(event.dataTransfer.files[0]);
              }}
              onClick={() => toggle("sources")}
              aria-expanded={panel === "sources"}
            >
              {source === "jazz" ? (
                <CircleStackIcon />
              ) : (
                <DocumentChartBarIcon />
              )}
              <span>
                <strong>
                  {sourceDragActive
                    ? t("Datei zum Importieren ablegen", "Drop file to import")
                    : source === "jazz"
                    ? dbName
                    : source ||
                      t("Datenquelle auswählen", "Select data source")}
                </strong>
                <small>
                  {sourceDragActive
                    ? "JSON / YAML / CSV / XML"
                    : source === "jazz"
                    ? "Jazz · Local-first"
                    : t(
                        "Datei · Zum Importieren hier ablegen",
                        "File · Drop here to import",
                      )}
                </small>
              </span>
              <span className="source-count">
                {tables.length} {t("Pfade", "paths")}
              </span>
              <ChevronDownIcon />
            </button>
            <IconButton
              label={t("Datei öffnen", "Open file")}
              onClick={() => fileInput.current?.click()}
            >
              <FolderIcon />
            </IconButton>
            <IconButton
              label={t("Einstellungen", "Settings")}
              onClick={() => setSettings(true)}
            >
              <Cog6ToothIcon />
            </IconButton>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".json,.yaml,.yml,.csv,.xml"
            hidden
            onChange={(event) => {
              void importFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          {panel === "sources" && (
            <div className="inline-panel sources">
              <div className="panel-label">{t("DATEIEN", "FILES")}</div>
              {files.map((file) => (
                <button
                  key={file.name}
                  onClick={() => {
                    setSource(file.name);
                    setFilters([]);
                    setQuery("");
                    setColumns(defaultColumns(file.tables));
                    setPanel("");
                  }}
                >
                  <DocumentChartBarIcon />
                  {file.name}
                  {source === file.name && <CheckIcon />}
                </button>
              ))}
              <button onClick={() => fileInput.current?.click()}>
                <PlusIcon />
                {t("Datei importieren", "Import file")}
                <small>JSON / YAML / CSV / XML</small>
              </button>
              <button onClick={() => void loadFestival()}>
                <CalendarDaysIcon />
                {t("Festival-Datensatz laden", "Load festival dataset")}
                <small>16.–21.06.2027</small>
              </button>
              <div className="panel-label">{t("DATENBANKEN", "DATABASES")}</div>
              <button
                onClick={() => {
                  setSource("jazz");
                  setColumns(initialColumns);
                  setFilters([]);
                  setQuery("");
                  setPanel("");
                }}
              >
                <CircleStackIcon />
                {dbName}
                <small>Jazz · {t("lokal", "local")}</small>
              </button>
              <p>
                SQLite, MariaDB, PostgreSQL ·{" "}
                {t("Anbindung folgt", "connection coming soon")}
              </p>
            </div>
          )}
          <div className="search-box">
            <MagnifyingGlassIcon />
            <input
              ref={searchInput}
              aria-label={t("Daten durchsuchen", "Search data")}
              placeholder={t("Suche in deinen Daten …", "Search your data …")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <IconButton
                label={t("Suche löschen", "Clear search")}
                onClick={() => setQuery("")}
              >
                <XMarkIcon />
              </IconButton>
            )}
          </div>
          <div className="toolbar">
            <button
              className={panel === "filter" ? "active" : ""}
              onClick={() => toggle("filter")}
              aria-expanded={panel === "filter"}
            >
              <FunnelIcon />
              {t("Filter", "Filters")}
              {filters.length > 0 && (
                <span className="number">{filters.length}</span>
              )}
              <ChevronDownIcon />
            </button>
            <button
              className={panel === "columns" ? "active" : ""}
              onClick={() => toggle("columns")}
              aria-expanded={panel === "columns"}
            >
              <EyeIcon />
              {t("Anzeige", "Display")}
              <ChevronDownIcon />
            </button>
            <div className="toolbar-spacer" />
            <button
              onClick={() => toggle("views")}
              aria-expanded={panel === "views"}
            >
              <BookmarkIcon />
              {t("Ansichten", "Views")}
              <ChevronDownIcon />
            </button>
            <span className="toolbar-divider" />
            <IconButton
              label={t(
                dark ? "Hellmodus" : "Dunkelmodus",
                dark ? "Light mode" : "Dark mode",
              )}
              onClick={() => setDark(!dark)}
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </IconButton>
          </div>
          {panel === "filter" && (
            <form
              className="inline-panel filter-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (filterValue.trim()) {
                  setFilters([
                    ...filters,
                    { column: filterColumn, value: filterValue.trim() },
                  ]);
                  setFilterValue("");
                  setPanel("");
                }
              }}
            >
              <label>
                {t("Spalte", "Column")}
                <select
                  value={filterColumn}
                  onChange={(e) => {
                    setFilterColumn(e.target.value);
                    setFilterValue("");
                  }}
                >
                  {availableFilterColumns.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                {t("Enthält", "Contains")}
                <input
                  required
                  aria-label={t("Filterwert", "Filter value")}
                  type={
                    filterColumn === "Date"
                      ? "date"
                      : [timeColumns.start, timeColumns.end].includes(filterColumn)
                        ? "time"
                        : "text"
                  }
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  list="filter-value-options"
                />
                <datalist id="filter-value-options">
                  {availableFilterValues.map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
              </label>
              <button className="primary" type="submit">
                <PlusIcon />
                {t("Filter hinzufügen", "Add filter")}
              </button>
            </form>
          )}
          {panel === "columns" && (
            <div className="inline-panel column-options">
              <span>{t("Sichtbare Spalten", "Visible columns")}</span>
              {allColumns.map((column) => (
                <label key={column}>
                  <input
                    type="checkbox"
                    checked={columns.includes(column)}
                    onChange={() =>
                      setColumns(
                        columns.includes(column)
                          ? columns.filter((c) => c !== column)
                          : [...columns, column],
                      )
                    }
                  />
                  {column}
                </label>
              ))}
            </div>
          )}
          {panel === "views" && (
            <div className="inline-panel">
              <div className="panel-label">
                {t("GESPEICHERTE ANSICHTEN", "SAVED VIEWS")}
              </div>
              {views.length === 0 && (
                <p>
                  {t(
                    "Speichere deine erste Ansicht – mit genau den Spalten, die du brauchst.",
                    "Save your first view with just the columns you need.",
                  )}
                </p>
              )}
              {views.map((view) => (
                <div className="view-row" key={view.id}>
                  <button onClick={() => applyView(view)}>
                    <BookmarkIcon />
                    {view.name}
                  </button>
                  <IconButton
                    label={t("Als Standard festlegen", "Set as default")}
                    onClick={() =>
                      setViews(
                        views.map((v) => ({
                          ...v,
                          default: v.id === view.id ? !v.default : false,
                        })),
                      )
                    }
                  >
                    <StarIcon className={view.default ? "starred" : ""} />
                  </IconButton>
                  <IconButton
                    label={t("Ansicht löschen", "Delete view")}
                    onClick={() =>
                      setViews(views.filter((v) => v.id !== view.id))
                    }
                  >
                    <XMarkIcon />
                  </IconButton>
                </div>
              ))}
              <form
                className="save-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  setViews([
                    ...views,
                    {
                      id: crypto.randomUUID(),
                      name: viewName.trim(),
                      columns,
                      filters: withFilters ? filters : [],
                      query: withFilters ? query : "",
                      default: false,
                    },
                  ]);
                  setViewName("");
                  setNotice(t("Ansicht gespeichert", "View saved"));
                }}
              >
                <input
                  aria-label={t("Name der Ansicht", "View name")}
                  placeholder={t("Name der Ansicht", "View name")}
                  required
                  value={viewName}
                  onChange={(e) => setViewName(e.target.value)}
                />
                <label>
                  <input
                    type="checkbox"
                    checked={withFilters}
                    onChange={(e) => setWithFilters(e.target.checked)}
                  />
                  {t("Mit Filtern", "Include filters")}
                </label>
                <button className="primary" disabled={!viewName.trim()}>
                  <PlusIcon />
                  {t("Speichern", "Save")}
                </button>
              </form>
            </div>
          )}
        </section>
        <div className="filter-summary">
          <div className="chips">
            {filters.length === 0 ? (
              <span className="muted">
                <FunnelIcon />
                {t(
                  "Alle Daten · Keine Filter aktiv",
                  "All data · No active filters",
                )}
              </span>
            ) : (
              filters.map((f, index) => (
                <button
                  className="chip"
                  key={index}
                  onClick={() =>
                    setFilters(filters.filter((_, i) => i !== index))
                  }
                >
                  {f.column}
                  {f.operator === "equals" ? " = " : ": "}{" "}
                  <strong>{f.value}</strong>
                  <XMarkIcon />
                </button>
              ))
            )}
            {filters.length > 0 && (
              <button
                className="text-button"
                onClick={() => {
                  setFilters([]);
                  setQuery("");
                }}
              >
                {t("Zurücksetzen", "Reset")}
              </button>
            )}
          </div>
          <span>
            {rows.length} {t("von", "of")} {count} {t("Einträgen", "entries")}
          </span>
        </div>
        {showTimeline && <section className="timeline-card">
          <div className="section-heading">
            <div>
              <span className="section-icon">
                <ClockIcon />
              </span>
              <h2>{t("Zeitstrahl", "Timeline")}</h2>
              <span className="subtle">{dayRows.length} Events</span>
            </div>
            <span className="timeline-hint">
              {t("Dein Tag auf einen Blick", "Your day at a glance")}
            </span>
          </div>
          <div className="date-navigation">
            <strong>{dateLabel(day)}</strong>
            {day === localDate(now) && (
              <span className="today">{t("Heute", "Today")}</span>
            )}
            <div className="date-actions">
              <IconButton
                label={t("Vorheriger Tag", "Previous day")}
                onClick={() =>
                  setSelectedDate(
                    dates[Math.max(0, dates.indexOf(day) - 1)] ?? "",
                  )
                }
              >
                <ChevronLeftIcon />
              </IconButton>
              <IconButton
                label={t("Nächster Tag", "Next day")}
                onClick={() =>
                  setSelectedDate(
                    dates[Math.min(dates.length - 1, dates.indexOf(day) + 1)] ??
                      "",
                  )
                }
              >
                <ChevronRightIcon />
              </IconButton>
              <button
                onClick={() => toggle("calendar")}
                aria-label={t("Datum wählen", "Choose date")}
              >
                <CalendarDaysIcon />
              </button>
            </div>
          </div>
          {panel === "calendar" && (
            <div className="calendar-panel">
              <label>
                {t("Datum wählen", "Choose date")}
                <input
                  type="date"
                  value={day}
                  onChange={(e) => {
                    if (dates.includes(e.target.value)) {
                      setSelectedDate(e.target.value);
                      setPanel("");
                    } else
                      setNotice(
                        t(
                          "An diesem Tag gibt es keine Treffer.",
                          "No matches on this day.",
                        ),
                      );
                  }}
                />
              </label>
              <div>
                {dates.map((date) => (
                  <button
                    key={date}
                    className={date === day ? "active" : ""}
                    onClick={() => {
                      setSelectedDate(date);
                      setPanel("");
                    }}
                  >
                    {dateLabel(date)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {dayRows.length ? (
            <div className="timeline">
              <div className="tick-grid">
                {Array.from(
                  { length: Math.floor((end - start) / 60) + 1 },
                  (_, i) => {
                    const minute = start + i * 60;
                    return (
                      <div
                        key={minute}
                        style={{ left: `${position(minute)}%` }}
                      >
                        <span>
                          {String(Math.floor(minute / 60) % 24).padStart(
                            2,
                            "0",
                          )}
                          :00
                        </span>
                      </div>
                    );
                  },
                )}
              </div>
              <div className="event-lanes">
                {dayRows.map((row, index) => {
                  const range = rangeForRow(row);
                  return (
                    <div className="event-lane" key={index}>
                      <button
                        title={`${row.EventID} · ${row[timeColumns.start]}–${row[timeColumns.end]} · ${colorColumn}: ${valueText(row[colorColumn]) || "—"}`}
                        className="event-bar colored-event"
                        style={{
                          ...colorStyle(valueText(row[colorColumn])),
                          left: `${position(range.start)}%`,
                          width: `${position(range.end) - position(range.start)}%`,
                        }}
                        onClick={() => {
                          if (row.EventID != null)
                            setFilters(
                              eventFilter(filters, String(row.EventID)),
                            );
                        }}
                      >
                        <span>{String(row.EventID ?? "Event")}</span>
                        <small>
                          {String(row[timeColumns.start])} – {String(row[timeColumns.end])}
                        </small>
                      </button>
                    </div>
                  );
                })}
              </div>
              {day === localDate(now) && clock >= start && clock <= end && (
                <div
                  className="now-marker"
                  style={{ left: `${position(clock)}%` }}
                >
                  <span />
                  <small>{t("Jetzt", "Now")}</small>
                </div>
              )}
            </div>
          ) : (
            <div className="timeline-empty">
              {t(
                !timeColumns.start || !timeColumns.end
                  ? "Bitte Start- und Endzeit-Felder in den Einstellungen auswählen."
                  : "Keine Events mit Datum und Uhrzeit in dieser Auswahl.",
                !timeColumns.start || !timeColumns.end
                  ? "Please select start and end time fields in Settings."
                  : "No events with date and time in this selection.",
              )}
            </div>
          )}
          <div className="timeline-footer">
            <div>
              {[...new Set(dayRows.map((row) => valueText(row[colorColumn])))].sort().map((value) => (
                <span className="legend" key={value} style={{ color: colorStyle(value).color }}>
                  <i style={{ background: "currentColor" }} />
                  {colorColumn}: {value || t("Ohne Wert", "No value")}
                </span>
              ))}
            </div>
            <span>
              {t(
                "Zeitraum automatisch · Volle Stunden",
                "Automatic range · Whole hours",
              )}
            </span>
          </div>
        </section>
        }
        <div className="results-heading">
          <div>
            <Squares2X2Icon />
            <h2>{t("Deine Daten", "Your data")}</h2>
            <span className="number">{filtered.length}</span>
          </div>
          <button className="text-button" onClick={download}>
            <ArrowDownTrayIcon />
            {t("Exportieren", "Export")}
          </button>
        </div>
        {filtered.map((table) => {
          const key = table.path.join("/");
          const sortKey = JSON.stringify([source, table.path]);
          const sort = tableSorts[sortKey];
          const sortedRows = [...table.rows].sort((a, b) => sort
            ? String(a[sort.column] ?? "").localeCompare(String(b[sort.column] ?? ""), language, { numeric: true }) * sort.direction
            : 0);
          const visible = columns.filter((column) =>
            table.rows.some((row) => Object.hasOwn(row, column)),
          );
          return (
            <section className="data-card" key={key}>
              <div className="table-header">
              <button
                className="table-title"
                onClick={() =>
                  setCollapsed(
                    collapsed.includes(key)
                      ? collapsed.filter((c) => c !== key)
                      : [...collapsed, key],
                  )
                }
                aria-expanded={!collapsed.includes(key)}
              >
                <FolderIcon />
                <div className="breadcrumbs">
                  {table.path.map((part, i) => (
                    <span
                      key={i}
                      className={i === table.path.length - 1 ? "last" : ""}
                    >
                      {i > 0 && <ChevronRightIcon />}
                      {part}
                    </span>
                  ))}
                </div>
                <span className="table-count">
                  {table.rows.length} {t("Einträge", "entries")}
                </span>
                <ChevronDownIcon
                  className={collapsed.includes(key) ? "rotated" : ""}
                />
              </button>
              <button
                className="table-csv-export"
                disabled={!visible.length}
                aria-label={t("Tabelle als CSV exportieren: ", "Export table as CSV: ") + key}
                onClick={() => downloadCsv(table, visible, sortedRows)}
              >
                <ArrowDownTrayIcon />
                CSV
              </button>
              </div>
              {!collapsed.includes(key) && (
                <div className="table-scroll">
                  {visible.length ? (
                    <table>
                      <thead>
                        <tr>
                          {visible.map((column) => (
                            <th
                              key={column}
                              aria-sort={
                                sort?.column === column
                                  ? sort.direction === 1
                                    ? "ascending"
                                    : "descending"
                                  : "none"
                              }
                            >
                              <button
                                onClick={() =>
                                  setTableSorts((previous) => {
                                    const current = previous[sortKey];
                                    return {
                                      ...previous,
                                      [sortKey]:
                                        current?.column === column
                                          ? current.direction === 1
                                            ? { column, direction: -1 }
                                            : null
                                          : { column, direction: 1 },
                                    };
                                  })
                                }
                              >
                                {column}
                                {sort?.column === column ? (
                                  sort.direction === 1 ? (
                                    <ArrowUpIcon className="active-sort-icon" />
                                  ) : (
                                    <ArrowDownIcon className="active-sort-icon" />
                                  )
                                ) : (
                                  <ArrowsUpDownIcon />
                                )}
                              </button>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRows
                          .map((row, index) => (
                            <tr
                              key={index}
                              className="selectable-row"
                              tabIndex={0}
                              aria-label={
                                t("Datensatz öffnen: ", "Open record: ") +
                                String(row.EventID ?? index + 1)
                              }
                              onClick={() => {
                                setDetail({ row, path: table.path });
                                if (row.EventID != null)
                                  setFilters(
                                    eventFilter(filters, String(row.EventID)),
                                  );
                              }}
                              onKeyDown={(event) => {
                                if (
                                  event.key === "Enter" ||
                                  event.key === " "
                                ) {
                                  event.preventDefault();
                                  setDetail({ row, path: table.path });
                                  if (row.EventID != null)
                                    setFilters(
                                      eventFilter(filters, String(row.EventID)),
                                    );
                                }
                              }}
                            >
                              {visible.map((column) => (
                                <td key={column}>
                                  {column === colorColumn ? (
                                    <span
                                      className="area-badge"
                                      style={colorStyle(valueText(row[column]))}
                                    >
                                      <i style={{ background: "currentColor" }} />
                                      {column === "Date" && isDate(String(row[column]))
                                        ? dateLabel(String(row[column]))
                                        : valueText(row[column]) || "—"}
                                    </span>
                                  ) : column === "EventID" ? (
                                    <span className="event-id">
                                      <span
                                        style={{ background: colorStyle(valueText(row[colorColumn])).color }}
                                      />
                                      {valueText(row[column]) || "—"}
                                    </span>
                                  ) : column === "Date" &&
                                    isDate(String(row[column])) ? (
                                    dateLabel(String(row[column]))
                                  ) : (
                                    valueText(row[column]) || "—"
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="empty-columns">
                      {t(
                        "Wähle unter Anzeige mindestens eine vorhandene Spalte.",
                        "Select at least one available column under Display.",
                      )}
                    </p>
                  )}
                </div>
              )}
            </section>
          );
        })}
        {!filtered.length && (
          <div
            className={`empty-state${workspaceDragActive ? " drop-active" : ""}`}
            onDragEnter={(event) => {
              if (source || !event.dataTransfer.types.includes("Files")) return;
              event.preventDefault();
              workspaceDragDepth.current++;
              setWorkspaceDragActive(true);
            }}
            onDragOver={(event) => {
              if (source || !event.dataTransfer.types.includes("Files")) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDragLeave={() => {
              workspaceDragDepth.current = Math.max(0, workspaceDragDepth.current - 1);
              if (!workspaceDragDepth.current) setWorkspaceDragActive(false);
            }}
            onDrop={(event) => {
              if (source) return;
              event.preventDefault();
              workspaceDragDepth.current = 0;
              setWorkspaceDragActive(false);
              if (event.dataTransfer.files.length !== 1) {
                setNotice(t("Bitte genau eine Datei ablegen.", "Please drop exactly one file."));
                return;
              }
              void importFile(event.dataTransfer.files[0]);
            }}
          >
            <MagnifyingGlassIcon />
            <h2>
              {workspaceDragActive
                ? t("Datei zum Importieren ablegen", "Drop file to import")
                : source
                ? t("Keine Treffer", "No matches")
                : t("Dein Workspace ist leer", "Your workspace is empty")}
            </h2>
            <p>
              {t(
                source
                  ? "Passe deine Suche oder Filter an."
                  : "Ziehe eine JSON-, YAML-, CSV- oder XML-Datei hierher, öffne eine Datei oder lade den Festival-Datensatz.",
                source
                  ? "Adjust your search or filters."
                  : "Drop a JSON, YAML, CSV or XML file here, open a file or load the festival dataset.",
              )}
            </p>
            <button
              onClick={() => {
                setFilters([]);
                setQuery("");
              }}
            >
              <ArrowPathIcon />
              {t("Alles zurücksetzen", "Reset all")}
            </button>
            {!source && (
              <div className="empty-actions">
                <button onClick={() => fileInput.current?.click()}>
                  <FolderIcon />
                  {t("Datei öffnen", "Open file")}
                </button>
                <button className="primary" onClick={() => void loadFestival()}>
                  <CalendarDaysIcon />
                  {t("Festival-Datensatz laden", "Load festival dataset")}
                </button>
              </div>
            )}
          </div>
        )}
        <footer>
          <span>
            <span className="footer-logo">D</span>DLens{" "}
            <span className="subtle">
              · {t("Klarheit für deine Daten", "Clarity for your data")}
            </span>
          </span>
          <span>
            {t("Mit Fokus gemacht.", "Made with focus.")}
            <span className="footer-dot" />
            v0.1
          </span>
        </footer>
      </main>
      <Dialog.Root
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="dialog-backdrop" />
          <Dialog.Popup className="dialog record-dialog">
            <div className="dialog-heading">
              <Dialog.Title>
                {t("Datensatz", "Record")} · {String(detail?.row.EventID ?? "")}
              </Dialog.Title>
              <Dialog.Close
                className="icon-button"
                aria-label={t("Schließen", "Close")}
              >
                <XMarkIcon />
              </Dialog.Close>
            </div>
            <Dialog.Description>{detail?.path.join(" › ")}</Dialog.Description>
            {detail && <RecordTree value={detail.row} />}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={settings} onOpenChange={setSettings}>
        <Dialog.Portal>
          <Dialog.Backdrop className="dialog-backdrop" />
          <Dialog.Popup className="dialog">
            <div className="dialog-heading">
              <Dialog.Title>{t("Einstellungen", "Settings")}</Dialog.Title>
              <Dialog.Close
                className="icon-button"
                aria-label={t("Schließen", "Close")}
              >
                <XMarkIcon />
              </Dialog.Close>
            </div>
            <Dialog.Description>
              {t(
                "Dein Workspace, so wie du ihn brauchst.",
                "Your workspace, just how you need it.",
              )}
            </Dialog.Description>
            <section className="settings-group" aria-labelledby="settings-general">
            <h3 id="settings-general">{t("Allgemein", "General")}</h3>
            <label>
              {t("Sprache", "Language")}
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as "de" | "en")}
              >
                <option value="de">Deutsch</option>
                <option value="en">English</option>
              </select>
            </label>
            </section>
            <section className="settings-group" aria-labelledby="settings-display">
            <h3 id="settings-display">{t("Anzeige", "Display")}</h3>
            <label className="timeline-toggle">
              <input
                type="checkbox"
                role="switch"
                checked={showTimeline}
                onChange={(event) => setShowTimeline(event.target.checked)}
              />
              {t("Zeitstrahl anzeigen", "Show timeline")}
            </label>
            {(["start", "end"] as const).map((kind) => (
              <label key={kind}>
                {kind === "start" ? t("Startzeit-Feld", "Start time field") : t("Endzeit-Feld", "End time field")}
                <select
                  value={timeColumns[kind]}
                  disabled={!source}
                  onChange={(event) => setTimeColumnsBySource((previous) => ({
                    ...previous,
                    [source]: { ...timeColumns, [kind]: event.target.value },
                  }))}
                >
                  <option value="">{t("Bitte auswählen", "Please select")}</option>
                  {[...allColumns].sort((a, b) => a.localeCompare(b, language, { numeric: true })).map((column) => (
                    <option key={column} value={column}>{column}</option>
                  ))}
                </select>
              </label>
            ))}
            <p className="subtle">
              {t("Zeitfelder werden anhand üblicher Spaltennamen vorausgewählt. Die Zuordnung gilt für die aktuelle Quelle.", "Time fields are preselected using common column names. The mapping applies to the current source.")}
            </p>
            <label>
              {t("Einfärbung nach", "Color by")}
              <select value={colorColumn} onChange={(event) => setColorColumn(event.target.value)}>
                {!allColumns.includes(colorColumn) && (
                  <option value={colorColumn}>{colorColumn}</option>
                )}
                {[...allColumns].sort((a, b) => a.localeCompare(b, language, { numeric: true })).map((column) => (
                  <option key={column} value={column}>{column}</option>
                ))}
              </select>
            </label>
            <p className="subtle">
              {t(
                "Gleiche Werte erhalten im Zeitstrahl und in der gewählten Tabellenspalte dieselbe Farbe.",
                "Matching values share a color in the timeline and the selected table column.",
              )}
            </p>
            </section>
            <section className="settings-group" aria-labelledby="settings-sources">
            <h3 id="settings-sources">{t("Datenquellen", "Data sources")}</h3>
            <h4>{t("CSV-Format", "CSV format")}</h4>
            <label>
              {t("Trennzeichen", "Delimiter")}
              <select value={csvOptions.delimiter} onChange={(event) => setCsvOptions((previous) => ({ ...previous, delimiter: event.target.value as CsvOptions["delimiter"] }))}>
                <option value="auto">{t("Automatisch", "Automatic")}</option>
                <option value=",">{t("Komma", "Comma")}</option>
                <option value=";">{t("Semikolon", "Semicolon")}</option>
                <option value={"\t"}>{t("Tabulator", "Tab")}</option>
                <option value="|">{t("Senkrechter Strich |", "Pipe |")}</option>
              </select>
            </label>
            <label>
              {t("Textbegrenzungszeichen", "Quote character")}
              <select value={csvOptions.quote} onChange={(event) => setCsvOptions((previous) => ({ ...previous, quote: event.target.value as CsvOptions["quote"] }))}>
                <option value={'"'}>{t('Doppelte Anführungszeichen (")', 'Double quotes (")')}</option>
                <option value="'">{t("Einfache Anführungszeichen (')", "Single quotes (')")}</option>
                <option value="">{t("Keine", "None")}</option>
              </select>
            </label>
            <label className="timeline-toggle">
              <input type="checkbox" checked={csvOptions.header} onChange={(event) => setCsvOptions((previous) => ({ ...previous, header: event.target.checked }))} />
              {t("Erste Zeile enthält Spaltennamen", "First row contains column names")}
            </label>
            <p className="subtle">{t("Gilt für CSV-Import und -Export. Automatisch verwendet beim Export Komma. Ohne Kopfzeile heißen importierte Spalten Column1, Column2 usw. Werte bleiben als Text erhalten.", "Applies to CSV import and export. Automatic uses commas for export. Without a header, imported columns are named Column1, Column2, etc. Values remain text.")}</p>
            <button type="button" onClick={() => setCsvOptions({ ...defaultCsvOptions })}>{t("CSV-Defaults wiederherstellen", "Restore CSV defaults")}</button>
            <div className="settings-divider" />
            <h3>
              <CircleStackIcon />
              {t("Jazz-Datenquelle", "Jazz data source")}
            </h3>
            <label>
              {t("Name der Datenbank", "Database name")}
              <input
                value={dbName}
                onChange={(e) => setDbName(e.target.value)}
                maxLength={80}
              />
            </label>
            <div className="info-box">
              {t(
                "Jazz speichert deine Daten lokal in diesem Browser. Geräteübergreifender Sync und Anmeldung sind im Prototyp noch nicht eingerichtet.",
                "Jazz stores your data locally in this browser. Cross-device sync and sign-in are not configured in this prototype.",
              )}
            </div>
            <button
              className="primary"
              disabled={!me.$isLoaded || source === "jazz" || !source}
              onClick={() => {
                if (me.$isLoaded) {
                  me.root.$jazz.set("data", JSON.stringify(tables));
                  setNotice(
                    t(
                      "Aktuelle Daten in Jazz gespeichert",
                      "Current data saved to Jazz",
                    ),
                  );
                }
              }}
            >
              <ArrowUpTrayIcon />
              {t(
                "Aktuelle Quelle in Jazz übernehmen",
                "Copy current source to Jazz",
              )}
            </button>
            <p className="subtle">
              SQLite · MariaDB · PostgreSQL —{" "}
              {t(
                "für eine spätere Version vorgesehen",
                "planned for a future version",
              )}
            </p>
            </section>
            <Dialog.Close className="done-button">
              {t("Fertig", "Done")}
            </Dialog.Close>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
      {notice && (
        <div className="toast" role="status">
          {notice}
          <IconButton
            label={t("Schließen", "Close")}
            onClick={() => setNotice("")}
          >
            <XMarkIcon />
          </IconButton>
        </div>
      )}
    </div>
  );
}
const rootRoute = createRootRoute({ component: WorkspaceApp });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/" });
const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute]) });
export default function App() {
  return (
    <JazzReactProvider AccountSchema={DLensAccount} sync={{ when: "never" }}>
      <RouterProvider router={router} />
    </JazzReactProvider>
  );
}
