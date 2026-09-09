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
  TrashIcon,
  XMarkIcon,
  ArrowsUpDownIcon,
} from "@heroicons/react/24/outline";
import { exportCsv, defaultCsvOptions, type CsvOptions } from "../lib/csv";
import {
  eventFilter,
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
  type Filter,
  type Table,
  type View,
} from "../lib/data";
import { StoredRecordTree } from "./StoredRecordTree";
import { RecordTree } from "./RecordTree";
import { DLensAccount } from "../lib/jazz";
import { StorageClient } from "../lib/storage/client";
import { downloadStorage } from "../lib/storage/download";
import { formatFor, type Dataset, type Query, type QueryResult, type Progress, type PageTable } from "../lib/ingestion/contracts";

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
  const [files, setFiles] = useState<Dataset[]>([]);
  const storage = useRef<StorageClient | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [working, setWorking] = useState(false);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [remoteToken, setRemoteToken] = useState("");
  const [storageStats, setStorageStats] = useState<{ databaseBytes: number; quota?: number; usage?: number; persisted: boolean } | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [pages, setPages] = useState<Record<string, number>>({});
  const [timelinePage, setTimelinePage] = useState(0);
  const [pathPage, setPathPage] = useState(0);
  const [valuePage, setValuePage] = useState(0);
  const [source, setSource] = useState("");
  const timelineLoad = useRef<{ source: string; data: unknown } | null>(null);
  const [sourceDragActive, setSourceDragActive] = useState(false);
  const sourceDragDepth = useRef(0);
  const [workspaceDragActive, setWorkspaceDragActive] = useState(false);
  const workspaceDragDepth = useRef(0);
  const [timeColumnsBySource, setTimeColumnsBySource] = useState<
    Record<string, { start: string; end: string }>
  >({});
  const [dbName] = useState(() =>
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
  const [detail, setDetail] = useState<{ row: Row; path: string[]; dataset?: string; record?: number } | null>(
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
  const selectedDataset = files.find((file) => file.id === source);
  const legacyTables: Table[] = (() => {
    if (source !== "jazz" || !me.$isLoaded) return [];
    try { const value = JSON.parse(me.root.data); return Array.isArray(value) ? value : []; } catch { return []; }
  })();
  const tables: Table[] = selectedDataset ? result?.tables ?? [] : legacyTables;
  const allColumns = (selectedDataset?.columns ?? Array.from(new Set(tables.flatMap((table) => table.rows.flatMap(Object.keys))))).slice().sort((a, b) => b.localeCompare(a, language, { numeric: true, sensitivity: "base" }));
  const availableFilterColumns = (selectedDataset?.filterColumns ?? filterColumns(tables)).slice().sort((a, b) => a.localeCompare(b, language, { numeric: true, sensitivity: "base" }));
  const availableFilterValues = selectedDataset ? result?.values ?? [] : filterOptions(tables, filterColumn);
  const timeColumns = timeColumnsBySource[source] ?? selectedDataset?.mapping ?? detectTimeColumns(allColumns);
  const timelineSourceData = selectedDataset?.generation ?? (source === "jazz" && me.$isLoaded ? me.root.data : undefined);
  const queryRequest: Query = { dataset: source, query, filters, language, filterColumn, filterValue, day: selectedDate, today: localDate(now), mapping: timeColumns, colorColumn, sorts: tableSorts, pages, timelinePage, pathPage, valuePage };
  useEffect(() => {
    const client = new StorageClient(); storage.current = client;
    client.request<Dataset[]>({ type: "list" }).then((datasets) => { setFiles(datasets); setStorageReady(true); }).catch((error) => setStorageError(String(error)));
    return () => { client.close(); storage.current = null; };
  }, []);
  useEffect(() => {
    if (settings && storageReady && storage.current) void storage.current.request<{ databaseBytes: number; quota?: number; usage?: number; persisted: boolean }>({ type: "storage" }).then(setStorageStats).catch(() => {});
  }, [settings, storageReady]);
  async function deleteImported(mode: "record" | "source" | "all", target = selectedDataset) {
    if (!storage.current || working) return;
    const message = mode === "all"
      ? t("Alle importierten Daten endgültig löschen? Originaldaten und Einstellungen bleiben erhalten.", "Permanently delete all imported data? Original data and preferences are preserved.")
      : mode === "source"
        ? t(`Quelle „${target?.name}“ mit allen Datensätzen endgültig löschen?`, `Permanently delete source “${target?.name}” and all its records?`)
        : t("Diesen Datensatz einschließlich seiner verschachtelten Daten endgültig löschen?", "Permanently delete this record including its nested data?");
    if (!window.confirm(message)) return;
    setWorking(true);
    try {
      const request = mode === "all" ? { type: "delete-all" as const }
        : mode === "source" ? { type: "delete" as const, dataset: target!.id }
        : { type: "delete-record" as const, dataset: detail!.dataset!, generation: selectedDataset!.generation, record: detail!.record! };
      setFiles(await storage.current.request<Dataset[]>(request));
      if (mode === "all") { setStorageReady(true); setStorageError(""); }
      if (mode !== "source" || target?.id === source) {
        setDetail(null); setResult(null); setPages({}); setPathPage(0); setTimelinePage(0); setValuePage(0);
        if (mode !== "record") setSource("");
      }
      setRevision((value) => value + 1);
      setNotice(t("Importierte Daten gelöscht.", "Imported data deleted."));
      setStorageStats(await storage.current.request({ type: "storage" }));
    } catch (error) {
      setNotice(String(error));
      // A reset may have committed before physical space reclamation failed.
      const remaining = await storage.current.request<Dataset[]>({ type: "list" }).catch(() => null);
      if (remaining) {
        setFiles(remaining);
        if (!remaining.some((item) => item.id === source)) { setSource(""); setDetail(null); setResult(null); }
      }
    }
    finally { setWorking(false); }
  }
  function sourceOption(file: Dataset) {
    const database = ["jazz", "api"].includes(file.format);
    const deleteLabel = t(`Quelle „${file.name}“ löschen`, `Delete source “${file.name}”`);
    return <div className="source-option" key={file.id}>
      <button className="source-select" onClick={() => {
        setResult(null); setSource(file.id); setColumns(file.scalarColumns);
        setFilters([]); setQuery(""); setPanel("");
      }}>
        {database ? <CircleStackIcon /> : <DocumentChartBarIcon />}
        <span className="source-name">{file.name}</span>
        {database && <small>SQLite · {t("lokale Kopie", "local copy")}</small>}
        {source === file.id && <CheckIcon />}
      </button>
      <button className="source-delete icon-button" disabled={working} title={deleteLabel} aria-label={deleteLabel} onClick={() => void deleteImported("source", file)}>
        <TrashIcon />
      </button>
    </div>;
  }
  const queryKey = JSON.stringify(queryRequest);
  useEffect(() => {
    if (!selectedDataset || !storage.current) { setResult(null); return; }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      storage.current!.request<QueryResult>({ type: "query", query: queryRequest }).then((data) => {
        if (!cancelled) { setResult(data); setLoading(false); }
      }).catch((error) => { if (!cancelled) { setNotice(String(error)); setLoading(false); } });
    }, 150);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [queryKey, selectedDataset?.generation, revision]);
  useEffect(() => { setPages({}); setTimelinePage(0); setPathPage(0); }, [source, query, JSON.stringify(filters), JSON.stringify(tableSorts), selectedDate]);
  useEffect(() => { setDetail(null); }, [source, selectedDataset?.generation]);
  useEffect(() => { setValuePage(0); }, [filterColumn, filterValue]);
  useEffect(() => {
    if (!source || timelineSourceData === undefined) return;
    if (timelineLoad.current?.source === source && timelineLoad.current.data === timelineSourceData) return;
    if (selectedDataset && !result) return;
    timelineLoad.current = { source, data: timelineSourceData };
    setShowTimeline(selectedDataset ? result!.timeline : hasTimelineData(tables, timeColumns));
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
  const filtered = selectedDataset ? tables : filterTables(tables, query, filters);
  const rows = filtered.flatMap((table) => table.rows);
  const dates = selectedDataset ? result?.dates ?? [] : [...new Set(rows.map((row) => String(row.Date ?? "")).filter(isDate))].sort();
  const day = selectedDataset ? result?.day ?? "" : dates.includes(selectedDate) ? selectedDate : nextDate(dates, localDate(now));
  const dayRows = selectedDataset ? result?.dayRows ?? [] : rows.filter((row) => row.Date === day && Number.isFinite(rangeForRow(row).start) && Number.isFinite(rangeForRow(row).end));
  const start = selectedDataset ? result?.start ?? 0 : dayRows.length ? Math.floor(Math.min(...dayRows.map((row) => rangeForRow(row).start)) / 60) * 60 : 0;
  const end = selectedDataset ? result?.end ?? 1440 : dayRows.length ? Math.ceil(Math.max(...dayRows.map((row) => rangeForRow(row).end)) / 60) * 60 : 1440;
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
    if (!file || working) return;
    try {
      formatFor(file);
      if (!storage.current) throw new Error("Datenbank noch nicht bereit / Database not ready");
      setWorking(true); setProgress({ phase: "reading", bytes: 0, total: file.size, records: 0 });
      const imported = await storage.current.request<Dataset | Dataset[]>({ type: "import", file, csv: csvOptions, language, replace: files.find((f) => f.name === file.name && f.format !== "jazz")?.id }, { progress: setProgress });
      const datasets = Array.isArray(imported) ? imported : [imported];
      const dataset = datasets[0];
      setFiles(await storage.current.request<Dataset[]>({ type: "list" }));
      setTimeColumnsBySource((previous) => ({ ...previous, ...Object.fromEntries(datasets.map((data) => [data.id, data.mapping])) }));
      setResult(null); setSource(dataset.id);
      setTimeColumnsBySource((previous) => ({ ...previous, [dataset.id]: dataset.mapping }));
      setColumns(dataset.scalarColumns); setFilters([]); setQuery(""); setPanel("");
      setNotice(t("Datei lokal gespeichert", "File stored locally"));
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
    finally { setWorking(false); setProgress(null); }
  }
  async function importRemote() {
    if (!storage.current || working) return;
    try { setWorking(true); setProgress(null);
      const dataset = await storage.current.request<Dataset>({ type: "remote", url: remoteUrl, token: remoteToken, name: "API · " + new URL(remoteUrl).hostname }, { progress: setProgress });
      setFiles((previous) => [...previous, dataset]); setResult(null); setSource(dataset.id); setColumns(dataset.scalarColumns); setFilters([]); setQuery(""); setSettings(false);
      setNotice(t("Remote-Daten lokal gespeichert", "Remote data stored locally"));
    } catch (error) { setNotice(String(error)); } finally { setRemoteToken(""); setWorking(false); setProgress(null); }
  }
  function download() {
    if (selectedDataset && storage.current) {
      void runExport("json"); return;
    }
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
  async function runExport(format: "json" | "csv", path?: string[], columns?: string[]) {
    if (!storage.current || working) return;
    try { setWorking(true); await downloadStorage(storage.current, { type: "export", query: queryRequest, format, csv: csvOptions, path, columns }, `dlens-${format === "csv" ? (path?.join("-") ?? "table").replace(/[<>:"/\\|?*]/g, "_") : "export"}.${format}`); }
    catch (error) { setNotice(String(error)); } finally { setWorking(false); }
  }
  function downloadCsv(table: Table, visible: string[], sortedRows: Row[]) {
    if (selectedDataset) { void runExport("csv", table.path, visible); return; }
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
  const count = selectedDataset?.count ?? tables.reduce((sum, table) => sum + table.rows.length, 0);
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
              {source === "jazz" || ["jazz", "api"].includes(selectedDataset?.format ?? "") ? (
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
                    : selectedDataset?.name || source ||
                      t("Datenquelle auswählen", "Select data source")}
                </strong>
                <small>
                  {sourceDragActive
                    ? "JSON / YAML / KYAML / CSV / XML"
                    : source === "jazz"
                    ? "Jazz · Local-first"
                    : t(
                        "Datei · SQLite · Lokal gespeichert",
                        "File · SQLite · Stored locally",
                      )}
                </small>
              </span>
              <span className="source-count">
                {selectedDataset?.paths ?? tables.length} {t("Pfade", "paths")}
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
            disabled={!storageReady || working}
            accept=".json,.yaml,.yml,.kyaml,.csv,.xml"
            hidden
            onChange={(event) => {
              void importFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          {panel === "sources" && (
            <div className="inline-panel sources">
              <div className="panel-label">{t("DATEIEN", "FILES")}</div>
              {files.filter((file) => !["jazz", "api"].includes(file.format)).map(sourceOption)}
              <button onClick={() => fileInput.current?.click()}>
                <PlusIcon />
                {t("Datei importieren", "Import file")}
                <small>JSON / YAML / KYAML / CSV / XML</small>
              </button>
              <div className="panel-label">{t("DATENBANKEN / API", "DATABASES / API")}</div>
              {files.filter((file) => ["jazz", "api"].includes(file.format)).map(sourceOption)}
              <p>
                MariaDB, PostgreSQL ·{" "}
                {t("über Connector-Backend", "via connector backend")}
              </p>
            </div>
          )}
          {storageError && <p role="alert">{storageError}</p>}
          {working && <div className="import-progress" role="status">
            {progress ? `${progress.phase === "reading" ? t("Einlesen", "Reading") : t("Aufbereiten", "Indexing")}: ${(progress.bytes / 1000000).toFixed(1)}${progress.total ? ` / ${(progress.total / 1000000).toFixed(1)}` : ""} MB · ${progress.records} ${t("Datensätze gespeichert", "records stored")}` : t("Verarbeitung läuft …", "Processing …")}
            <button onClick={() => storage.current?.cancel()}>{t("Abbrechen", "Cancel")}</button>
          </div>}
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
                {selectedDataset && (valuePage > 0 || result?.moreValues) && <div className="data-pagination">
                  <button type="button" disabled={!valuePage} onClick={() => setValuePage((p) => Math.max(0, p - 100))}>←</button>
                  {t("Wertvorschläge", "Value suggestions")} {valuePage + 1}–{valuePage + availableFilterValues.length}
                  <button type="button" disabled={!result?.moreValues} onClick={() => setValuePage((p) => p + availableFilterValues.length)}>→</button>
                </div>}
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
            {selectedDataset ? result?.total ?? 0 : rows.length} {t("von", "of")} {count} {t("Einträgen", "entries")}
          </span>
        </div>
        {showTimeline && <section className="timeline-card">
          <div className="section-heading">
            <div>
              <span className="section-icon">
                <ClockIcon />
              </span>
              <h2>{t("Zeitstrahl", "Timeline")}</h2>
              <span className="subtle">{selectedDataset ? result?.dayCount ?? 0 : dayRows.length} Events</span>
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
              {(selectedDataset ? result?.legend ?? [] : [...new Set(dayRows.map((row) => valueText(row[colorColumn])))].sort()).map((value) => (
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
        {selectedDataset && (result?.dayCount ?? 0) > 100 && showTimeline && <div className="data-pagination">
          <button disabled={!timelinePage} onClick={() => setTimelinePage((p) => p - 1)}>←</button>
          {t("Zeitstrahl-Seite", "Timeline page")} {timelinePage + 1}
          <button disabled={(timelinePage + 1) * 100 >= (result?.dayCount ?? 0)} onClick={() => setTimelinePage((p) => p + 1)}>→</button>
        </div>}
        <div className="results-heading">
          <div>
            <Squares2X2Icon />
            <h2>{t("Deine Daten", "Your data")}</h2>
            <span className="number">{selectedDataset ? result?.tableCount ?? 0 : filtered.length}</span>
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
          const sortedRows = selectedDataset ? table.rows : [...table.rows].sort((a, b) => sort
            ? String(a[sort.column] ?? "").localeCompare(String(b[sort.column] ?? ""), language, { numeric: true }) * sort.direction
            : 0);
          const visible = columns.filter((column) =>
            selectedDataset ? (table as PageTable).columns.includes(column) : table.rows.some((row) => Object.hasOwn(row, column)),
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
                  {selectedDataset ? (table as PageTable).total : table.rows.length} {t("Einträge", "entries")}
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
              {selectedDataset && <div className="data-pagination">
                <button disabled={!(table as PageTable).offset || loading} onClick={() => setPages((p) => ({ ...p, [JSON.stringify(table.path)]: Math.max(0, (table as PageTable).offset - 100) }))}>←</button>
                {(table as PageTable).offset + 1}–{(table as PageTable).offset + table.rows.length} / {(table as PageTable).total}
                <button disabled={(table as PageTable).offset + table.rows.length >= (table as PageTable).total || loading} onClick={() => setPages((p) => ({ ...p, [JSON.stringify(table.path)]: (table as PageTable).offset + table.rows.length }))}>→</button>
              </div>}
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
                                setDetail({ row: selectedDataset ? { EventID: row.EventID ?? null } : row, path: table.path, dataset: selectedDataset?.id, record: selectedDataset ? (table as PageTable).ids[table.rows.indexOf(row)] : undefined });
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
                                  setDetail({ row: selectedDataset ? { EventID: row.EventID ?? null } : row, path: table.path, dataset: selectedDataset?.id, record: selectedDataset ? (table as PageTable).ids[table.rows.indexOf(row)] : undefined });
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
        {selectedDataset && (result?.tableCount ?? 0) > 20 && <div className="data-pagination">
          <button disabled={!pathPage || loading} onClick={() => setPathPage((p) => p - 1)}>←</button>
          {t("Tabellenseite", "Table page")} {pathPage + 1}
          <button disabled={(pathPage + 1) * 20 >= (result?.tableCount ?? 0) || loading} onClick={() => setPathPage((p) => p + 1)}>→</button>
        </div>}
        {loading && <p role="status">{t("Daten werden abgefragt …", "Querying data …")}</p>}
        {!loading && !filtered.length && (
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
                  : "Ziehe eine JSON-, YAML-, KYAML-, CSV- oder XML-Datei hierher oder öffne eine Datei.",
                source
                  ? "Adjust your search or filters."
                  : "Drop a JSON, YAML, KYAML, CSV or XML file here or open a file.",
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
            {detail?.dataset && detail.record !== undefined && <button disabled={working} onClick={() => void deleteImported("record")}>{t("Datensatz löschen", "Delete record")}</button>}
            {detail && (detail.dataset && detail.record !== undefined && storage.current ? <StoredRecordTree client={storage.current} dataset={detail.dataset} record={detail.record} language={language} /> : <RecordTree value={detail.row} />)}
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
            <h3><CircleStackIcon />{t("API / Datenbank-Connector", "API / database connector")}</h3>
            <p>{t("NDJSON-Endpunkt importieren. Datenbank-Zugangsdaten gehören ausschließlich ins separate Connector-Backend.", "Import an NDJSON endpoint. Database credentials belong only in the separate connector backend.")}</p>
            <label>URL<input type="url" value={remoteUrl} onChange={(e) => setRemoteUrl(e.target.value)} placeholder="https://example.org/records?table=events" /></label>
            <label>{t("Zugriffstoken (nur für diesen Import)", "Access token (only for this import)")}<input type="password" autoComplete="off" value={remoteToken} onChange={(e) => setRemoteToken(e.target.value)} /></label>
            <button disabled={!remoteUrl || working} onClick={() => void importRemote()}>{t("Remote-Quelle importieren", "Import remote source")}</button>
            <div className="settings-divider" />
            <h3><CircleStackIcon />SQLite · OPFS</h3>
            {storageStats && <p>{t("Datenbank", "Database")}: {(storageStats.databaseBytes / 2 ** 20).toFixed(1)} MiB · {t("Geschätzter freier Browserspeicher", "Estimated available browser storage")}: {storageStats.quota ? ((storageStats.quota - (storageStats.usage ?? 0)) / 2 ** 30).toFixed(1) + " GiB" : "—"} · {storageStats.persisted ? t("Dauerhafter Speicher gewährt", "Persistent storage granted") : t("Speicherung unterliegt Browserbereinigung", "Storage subject to browser eviction")}</p>}
            <p>{t("Importierte Dateien bleiben lokal in diesem Browser gespeichert. Die Originaldatei wird nicht zusätzlich kopiert.", "Imported files persist locally in this browser. Original files are not duplicated.")}</p>
            <button onClick={() => { void navigator.storage?.persist().then((granted) => setNotice(granted ? t("Dauerhafter Speicher gewährt", "Persistent storage granted") : t("Browser hat dauerhaften Speicher nicht gewährt", "Browser did not grant persistent storage"))); }}>{t("Dauerhaften Browserspeicher anfragen", "Request persistent browser storage")}</button>
            {selectedDataset && <button disabled={working} onClick={() => void deleteImported("source")}>{t("Ausgewählte Quelle löschen", "Delete selected source")}</button>}
            <button disabled={working} onClick={() => void deleteImported("all")}>{t("Alle importierten Daten löschen", "Delete all imported data")}</button>
            <p className="subtle">
              MariaDB · PostgreSQL —{" "}
              {t(
                "über separates Connector-Backend verfügbar",
                "available via separate connector backend",
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
