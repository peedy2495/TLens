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
  CloudIcon,
  Cog6ToothIcon,
  DocumentChartBarIcon,
  EyeIcon,
  FolderIcon,
  FunnelIcon,
  InformationCircleIcon,
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
  matchingFilterColumns,
  matchingFilterValues,
  reconcileFilterColumn,
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
import { PwaSettings } from "./PwaSettings";
import { usePwa } from "../lib/pwa";
import { applyTheme, persistThemeChoice, readThemePreference, resolveTheme, systemPrefersDark } from "../lib/theme";
import {
  canonicalUrl,
  connectorIdentityFor,
  displayNameFor,
  discoverConnectorSources,
  filenameFromUrl,
  findIdentityMatches,
  findLocalReloadTargets,
  genuineFilePath,
  isLocalFileDataset,
  localIdentityFor,
  newLocalGroupId,
  newProfileId,
  readConnectorProfiles,
  saveConnectorProfiles,
  urlIdentityFor,
  validateLocalReloadSelection,
  type ConnectorProfile,
} from "../lib/source-identity";
import { DLensAccount } from "../lib/jazz";
import { StorageClient } from "../lib/storage/client";
import { downloadStorage } from "../lib/storage/download";
import { formatFor, type ImportWarning, type ImportDecision, type Dataset, type Query, type QueryResult, type Progress, type PageTable } from "../lib/ingestion/contracts";

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
  const [dark, setDark] = useState(() => resolveTheme());
  const manualTheme = useRef(readThemePreference() !== null);
  const [files, setFiles] = useState<Dataset[]>([]);
  const storage = useRef<StorageClient | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [resultContext, setResultContext] = useState<string | null>(null);
  const [importWarning, setImportWarning] = useState<ImportWarning | null>(null);
  const warningAnswer = useRef<((decision: ImportDecision) => void) | null>(null);
  function answerWarning(decision: ImportDecision) {
    warningAnswer.current?.(decision); warningAnswer.current = null; setImportWarning(null);
  }
  function confirmImport(warning: ImportWarning): Promise<ImportDecision> {
    setImportWarning(warning);
    return new Promise((resolve) => { warningAnswer.current = resolve; });
  }
  useEffect(() => () => { warningAnswer.current?.("cancel"); }, []);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [working, setWorking] = useState(false);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [connectors, setConnectors] = useState<ConnectorProfile[]>(() => readConnectorProfiles());
  const [expandedConnector, setExpandedConnector] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [urlHelpOpen, setUrlHelpOpen] = useState(false);
  const [localPath, setLocalPath] = useState("");
  const [connectorChoice, setConnectorChoice] = useState("");
  const [connectorSource, setConnectorSource] = useState("");
  const [connectorSources, setConnectorSources] = useState<string[]>([]);
  const [connectorToken, setConnectorToken] = useState("");
  const [connectorLoading, setConnectorLoading] = useState(false);
  const discoveryController = useRef<AbortController | null>(null);
  useEffect(() => {
    discoveryController.current?.abort();
    setConnectorLoading(false);
    return () => discoveryController.current?.abort();
  }, [connectorChoice]);
  useEffect(() => { saveConnectorProfiles(connectors); }, [connectors]);
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
  const pwa = usePwa(working);
  const showPwaUpdate = pwa.updateAvailable && !pwa.updateDeferred;
  const fileInput = useRef<HTMLInputElement>(null);
  const localReloadInput = useRef<HTMLInputElement>(null);
  const pendingLocalReload = useRef<string | null>(null);
  useEffect(() => {
    // Dismissing the reload picker fires no change event: drop the pending
    // target so it can never leak into a later ordinary import.
    const element = localReloadInput.current;
    if (!element) return;
    const onCancel = () => { pendingLocalReload.current = null; };
    element.addEventListener("cancel", onCancel);
    return () => element.removeEventListener("cancel", onCancel);
  }, []);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const view = views.find((v) => v.default);
    if (view) applyView(view);
  }, []);
  useEffect(() => {
    applyTheme(dark);
  }, [dark]);
  useEffect(() => {
    // Follow the operating system while no manual choice is stored.
    if (manualTheme.current) return;
    applyTheme(systemPrefersDark());
    setDark(systemPrefersDark());
    let query: MediaQueryList | null = null;
    const onChange = (event: MediaQueryListEvent) => {
      if (manualTheme.current) return;
      setDark(event.matches);
    };
    try {
      query = window.matchMedia("(prefers-color-scheme: dark)");
      if (typeof query.addEventListener === "function") query.addEventListener("change", onChange);
      else query.addListener(onChange);
    } catch {
      query = null;
    }
    return () => {
      if (!query) return;
      try {
        if (typeof query.removeEventListener === "function") query.removeEventListener("change", onChange);
        else query.removeListener(onChange);
      } catch { /* Ignore cleanup failures. */ }
    };
  }, []);
  function chooseTheme(next: boolean) {
    manualTheme.current = true;
    setDark(next);
    persistThemeChoice(next);
    applyTheme(next);
  }
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
  const timeColumns = timeColumnsBySource[source] ?? selectedDataset?.mapping ?? detectTimeColumns(allColumns);
  const timelineSourceData = selectedDataset?.generation ?? (source === "jazz" && me.$isLoaded ? me.root.data : undefined);
  const queryRequest: Query = { dataset: source, query, filters, language, filterColumn, filterValue, day: selectedDate, today: localDate(now), mapping: timeColumns, colorColumn, sorts: tableSorts, pages, timelinePage, pathPage, valuePage };
  const queryKey = JSON.stringify(queryRequest);
  const filtersKey = JSON.stringify(filters);
  // Freshness is derived synchronously so the first render after a context
  // change never offers stale choices: only an accepted result whose request
  // context (query, generation, revision) matches the current one is fresh.
  const requestContext = selectedDataset ? `${queryKey}|${selectedDataset.generation}|${revision}` : null;
  const resultFresh = Boolean(selectedDataset && result && resultContext === requestContext);
  const freshResult = resultFresh ? result : null;
  // Display columns stay source-wide; filter choices follow current matches.
  const availableFilterColumns = (selectedDataset ? freshResult?.filterFields ?? [] : matchingFilterColumns(tables, query, filters)).slice().sort((a, b) => a.localeCompare(b, language, { numeric: true, sensitivity: "base" }));
  const availableFilterValues = selectedDataset ? freshResult?.values ?? [] : matchingFilterValues(tables, query, filters, filterColumn, filterValue);
  const filterPending = Boolean(selectedDataset && !resultFresh);
  const displayedFilterValues = availableFilterValues;
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
    const isUrl = file.source?.kind === "url";
    const isLocal = isLocalFileDataset(file);
    const deleteLabel = t(`Quelle „${file.name}“ löschen`, `Delete source “${file.name}”`);
    const reloadUrl = file.source?.kind === "url" ? file.source.url : undefined;
    const reloadLabel = (reloadUrl || isLocal) ? t(`Quelle „${file.name}“ erneut laden`, `Reload source “${file.name}”`) : "";
    return <div className="source-option" key={file.id}>
      <button className="source-select" onClick={() => {
        setResult(null); setSource(file.id); setColumns(file.scalarColumns);
        setFilters([]); setQuery(""); setPanel("");
      }}>
        {database ? <CircleStackIcon /> : isUrl ? <CloudIcon /> : <DocumentChartBarIcon />}
        <span className="source-name" title={reloadUrl ?? undefined}>{file.name}</span>
        {database && <small>SQLite · {t("lokale Kopie", "local copy")}</small>}
        {source === file.id && <CheckIcon />}
      </button>
      <div className="source-actions">
        <button className="source-delete icon-button" disabled={working} title={deleteLabel} aria-label={deleteLabel} onClick={() => void deleteImported("source", file)}>
          <TrashIcon />
        </button>
        {reloadUrl && (
          <button className="source-reload icon-button" disabled={working} title={reloadLabel} aria-label={reloadLabel} onClick={() => void importFromUrl(reloadUrl)}>
            <ArrowPathIcon />
          </button>
        )}
        {!reloadUrl && isLocal && (
          <button className="source-reload icon-button" disabled={working} title={reloadLabel} aria-label={reloadLabel} onClick={() => requestLocalReload(file)}>
            <ArrowPathIcon />
          </button>
        )}
      </div>
    </div>;
  }
  useEffect(() => {
    if (!selectedDataset || !storage.current) { setResult(null); setResultContext(null); return; }
    let cancelled = false;
    setLoading(true);
    const acceptedContext = requestContext;
    const timer = setTimeout(() => {
      storage.current!.request<QueryResult>({ type: "query", query: queryRequest }).then((data) => {
        if (!cancelled) { setResult(data); setResultContext(acceptedContext); setLoading(false); }
      }).catch((error) => { if (!cancelled) { setNotice(String(error)); setLoading(false); } });
    }, 150);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [queryKey, selectedDataset?.generation, revision]);
  useEffect(() => { setPages({}); setTimelinePage(0); setPathPage(0); }, [source, query, JSON.stringify(filters), JSON.stringify(tableSorts), selectedDate]);
  useEffect(() => { setDetail(null); }, [source, selectedDataset?.generation]);
  useEffect(() => { setValuePage(0); }, [source, selectedDataset?.generation, revision, query, filtersKey, filterColumn, filterValue]);
  const availableColumnsKey = JSON.stringify(availableFilterColumns);
  useEffect(() => {
    // Reconcile an unavailable selected field after fresh results (SQLite) or
    // synchronously derived matches (legacy); keep valid manual input.
    if (selectedDataset && (!freshResult || !resultFresh)) return;
    const reconciled = reconcileFilterColumn(availableFilterColumns, filterColumn);
    if (reconciled !== filterColumn) {
      setFilterColumn(reconciled);
      setFilterValue("");
    }
    // Reconcile once per fresh result; keep valid manual input unchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshResult, resultFresh, availableColumnsKey, selectedDataset]);
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
  async function refreshAfterReplacement() {
    if (!storage.current) return [];
    try {
      const datasets = await storage.current.request<Dataset[]>({ type: "list" });
      setFiles(datasets);
      if (!datasets.some((item) => item.id === source)) {
        setSource(""); setDetail(null); setResult(null); setResultContext(null);
        setPages({}); setPathPage(0); setTimelinePage(0); setValuePage(0);
      }
      setRevision((value) => value + 1);
      return datasets;
    } catch {
      return [];
    }
  }
  async function importFile(file: File | undefined) {
    if (!file || working) return;
    try {
      formatFor(file);
      if (!storage.current) throw new Error("Datenbank noch nicht bereit / Database not ready");
      const identity = localIdentityFor(file, localPath);
      const display = displayNameFor(identity);
      const matches = findIdentityMatches(files, identity);
      setWorking(true); setProgress({ phase: "reading", bytes: 0, total: file.size, records: 0 });
      // Fully delete the previous datasets for this source before reloading.
      for (const match of matches) {
        await storage.current.request<Dataset[]>({ type: "delete", dataset: match.id });
      }
      if (matches.length) {
        const remaining = await storage.current.request<Dataset[]>({ type: "list" }).catch(() => null);
        if (remaining) setFiles(remaining);
      }
      const imported = await storage.current.request<Dataset | Dataset[]>({
        type: "import", file, csv: csvOptions, language,
        source: { kind: "local", path: identity.kind === "local" ? identity.path : "", filename: file.name, groupId: newLocalGroupId() },
        displayName: display,
      }, { progress: setProgress, confirm: confirmImport });
      const datasets = Array.isArray(imported) ? imported : [imported];
      const dataset = datasets[0];
      setFiles(await storage.current.request<Dataset[]>({ type: "list" }));
      setTimeColumnsBySource((previous) => ({ ...previous, ...Object.fromEntries(datasets.map((data) => [data.id, data.mapping])) }));
      setResult(null); setResultContext(null); setSource(dataset.id);
      setTimeColumnsBySource((previous) => ({ ...previous, [dataset.id]: dataset.mapping }));
      setColumns(dataset.scalarColumns); setFilters([]); setQuery(""); setPanel("");
      setNotice(t("Datei lokal gespeichert", "File stored locally"));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
      await refreshAfterReplacement();
    }
    finally { setWorking(false); setProgress(null); }
  }
  function requestLocalReload(file: Dataset) {
    if (working) return;
    // The browser keeps no durable file handle: capture only the target here
    // and read a freshly selected file when the picker resolves.
    pendingLocalReload.current = file.id;
    localReloadInput.current?.click();
  }
  async function importLocalReloadFile(file: File | undefined) {
    const targetId = pendingLocalReload.current;
    pendingLocalReload.current = null;
    if (!file || working) return;
    try {
      formatFor(file);
      if (!storage.current) throw new Error("Datenbank noch nicht bereit / Database not ready");
      const target = files.find((entry) => entry.id === targetId);
      if (!target || !isLocalFileDataset(target)) throw new Error("Quelle nicht gefunden / Source not found.");
      // Validate the fresh selection against the explicitly chosen source
      // before deleting anything; a mismatch or dismissed picker keeps data.
      validateLocalReloadSelection(target, file);
      const targets = findLocalReloadTargets(files, target.id);
      const previous = target.source?.kind === "local" ? target.source : undefined;
      const genuine = genuineFilePath(file);
      const groupId = previous?.groupId ?? newLocalGroupId();
      const path = genuine || previous?.path || "";
      setWorking(true); setProgress({ phase: "reading", bytes: 0, total: file.size, records: 0 });
      // Fully delete the previous datasets of this source before reloading.
      for (const match of targets) {
        await storage.current.request<Dataset[]>({ type: "delete", dataset: match.id });
      }
      if (targets.length) {
        const remaining = await storage.current.request<Dataset[]>({ type: "list" }).catch(() => null);
        if (remaining) setFiles(remaining);
      }
      const imported = await storage.current.request<Dataset | Dataset[]>({
        type: "import", file, csv: csvOptions, language,
        source: { kind: "local", path, filename: file.name, groupId },
        displayName: file.name,
      }, { progress: setProgress, confirm: confirmImport });
      const datasets = Array.isArray(imported) ? imported : [imported];
      const dataset = datasets[0];
      setFiles(await storage.current.request<Dataset[]>({ type: "list" }));
      setTimeColumnsBySource((previousTime) => ({ ...previousTime, ...Object.fromEntries(datasets.map((data) => [data.id, data.mapping])) }));
      setResult(null); setResultContext(null); setSource(dataset.id);
      setTimeColumnsBySource((previousTime) => ({ ...previousTime, [dataset.id]: dataset.mapping }));
      setColumns(dataset.scalarColumns); setFilters([]); setQuery(""); setPanel("");
      setNotice(t("Datei lokal gespeichert", "File stored locally"));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
      await refreshAfterReplacement();
    }
    finally { setWorking(false); setProgress(null); }
  }
  async function importFromUrl(explicitUrl?: string) {
    const raw = (explicitUrl ?? urlInput).trim();
    if (!storage.current || working || !raw) return;
    try {
      const identity = urlIdentityFor(raw);
      setWorking(true); setProgress(null);
      const matches = findIdentityMatches(files, identity);
      for (const match of matches) {
        await storage.current.request<Dataset[]>({ type: "delete", dataset: match.id });
      }
      if (matches.length) {
        const remaining = await storage.current.request<Dataset[]>({ type: "list" }).catch(() => null);
        if (remaining) setFiles(remaining);
      }
      const imported = await storage.current.request<Dataset | Dataset[]>({
        type: "url-import", url: canonicalUrl(raw), csv: csvOptions, language,
        source: { kind: "url", url: identity.kind === "url" ? identity.url : canonicalUrl(raw), filename: identity.filename },
        displayName: displayNameFor(identity),
      }, { progress: setProgress, confirm: confirmImport });
      const datasets = Array.isArray(imported) ? imported : [imported];
      setFiles(await storage.current.request<Dataset[]>({ type: "list" }));
      setTimeColumnsBySource((previous) => ({ ...previous, ...Object.fromEntries(datasets.map((data) => [data.id, data.mapping])) }));
      setResult(null); setResultContext(null); setSource(datasets[0].id);
      setColumns(datasets[0].scalarColumns); setFilters([]); setQuery(""); setPanel("");
      if (explicitUrl === undefined) setUrlInput("");
      setNotice(t("Datei lokal gespeichert", "File stored locally"));
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); await refreshAfterReplacement(); }
    finally { setWorking(false); setProgress(null); }
  }
  async function loadConnectorSources(profileId: string, token: string) {
    const profile = connectors.find((entry) => entry.id === profileId);
    if (!profile || !storage.current) { setConnectorSources([]); return; }
    if (profile.kind === "ndjson") { setConnectorSources([filenameFromUrl(profile.endpoint)]); return; }
    discoveryController.current?.abort();
    const controller = new AbortController();
    discoveryController.current = controller;
    setConnectorLoading(true);
    try {
      const discovered = await discoverConnectorSources(profile, token, controller.signal);
      if (!controller.signal.aborted) setConnectorSources(discovered);
    } catch (error) { if (!controller.signal.aborted) { setNotice(error instanceof Error ? error.message : String(error)); setConnectorSources([]); } }
    finally { if (!controller.signal.aborted) setConnectorLoading(false); }
  }
  async function importConnectorPull() {
    const profile = connectors.find((entry) => entry.id === connectorChoice);
    if (!profile || !storage.current || working || !connectorSource) return;
    try {
      const identity = connectorIdentityFor(profile, connectorSource);
      setWorking(true); setProgress(null);
      const matches = findIdentityMatches(files, identity);
      for (const match of matches) {
        await storage.current.request<Dataset[]>({ type: "delete", dataset: match.id });
      }
      if (matches.length) {
        const remaining = await storage.current.request<Dataset[]>({ type: "list" }).catch(() => null);
        if (remaining) setFiles(remaining);
      }
      const dataset = await storage.current.request<Dataset>({
        type: "connector-pull", profileId: profile.id, profileName: profile.name,
        kind: profile.kind, endpoint: profile.endpoint, sourceName: connectorSource, token: connectorToken,
      }, { progress: setProgress, confirm: confirmImport });
      setFiles(await storage.current.request<Dataset[]>({ type: "list" }));
      setResult(null); setResultContext(null); setSource(dataset.id);
      setColumns(dataset.scalarColumns); setFilters([]); setQuery(""); setPanel("");
      setNotice(t("Connector-Daten lokal gespeichert", "Connector data stored locally"));
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); await refreshAfterReplacement(); }
    finally { setConnectorToken(""); setWorking(false); setProgress(null); }
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
              ) : selectedDataset?.source?.kind === "url" ? (
                <CloudIcon />
              ) : (
                <DocumentChartBarIcon />
              )}
              <span>
                <strong title={selectedDataset?.source?.kind === "url" ? selectedDataset.source.url : undefined}>
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
                {selectedDataset?.paths ?? tables.length} {(selectedDataset?.paths ?? tables.length) === 1 ? t("Pfad", "path") : t("Pfade", "paths")}
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
          <input
            ref={localReloadInput}
            type="file"
            className="local-reload-input"
            disabled={!storageReady || working}
            accept=".json,.yaml,.yml,.kyaml,.csv,.xml"
            hidden
            onChange={(event) => {
              const selected = event.target.files?.[0];
              event.target.value = "";
              void importLocalReloadFile(selected);
            }}
          />
          {panel === "sources" && (
            <div className="inline-panel sources">
              <div className="source-heading"><span>{t("Daten importieren", "Import Data")}</span></div>
              {files.filter((file) => !["jazz", "api"].includes(file.format)).map(sourceOption)}
              <button onClick={() => fileInput.current?.click()}>
                <PlusIcon />
                {t("Datei auswählen", "Select file")}
                <small>JSON / YAML / KYAML / CSV / XML</small>
              </button>
              <label>
                {t("Lokaler Quellpfad (optional)", "Local source path (optional)")}
                <input
                  value={localPath}
                  onChange={(e) => setLocalPath(e.target.value)}
                  placeholder={t("/pfad/zur/datei.json", "/path/to/file.json")}
                />
              </label>
              <form
                className="url-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void importFromUrl();
                }}
              >
                <div className="source-heading">
                  <span id="url-heading-label">Web Source</span>
                  <button
                    type="button"
                    className="icon-button url-info"
                    aria-expanded={urlHelpOpen}
                    aria-controls="url-help"
                    title={t("Hilfe zu Web-Quellen", "Web source help")}
                    aria-label={t("Hilfe zu Web-Quellen", "Web source help")}
                    onClick={() => setUrlHelpOpen((open) => !open)}
                  >
                    <InformationCircleIcon />
                  </button>
                </div>
                {urlHelpOpen && (
                  <div id="url-help">
                    <p className="subtle">
                      {t(
                        "URLs müssen nicht auf eine Dateiendung enden; der vom Server geladene Dateiname bestimmt das Format. Unterstützt: JSON, YAML, YML, KYAML, CSV, XML.",
                        "URLs need not end in a file extension; the server's downloaded filename determines the format. Supported: JSON, YAML, YML, KYAML, CSV, XML.",
                      )}
                    </p>
                    <p className="subtle">
                      {t(
                        "Browser geben keinen absoluten Dateipfad preis. Ohne Pfadangabe wird jeder Import als neue Quelle angelegt; gleiche Dateinamen werden nicht zusammengeführt. Mit Pfad identifiziert der volle Pfad die Quelle für den vollständigen Ersatz beim Reimport. Das Nachladen-Symbol einer lokalen Quelle öffnet die Dateiauswahl neu: Die frisch gewählte Datei muss denselben Dateinamen tragen und ersetzt genau diese Quelle (einschließlich aller YAML-Teile); eine abweichende Auswahl oder ein abgebrochener Dialog lässt die Daten unverändert.",
                        "Browsers do not expose absolute file paths. Without a path each import creates a new source; equal file names are never merged. With a path, the full path identifies the source for complete replacement on reimport. A local source's reload icon reopens file selection: the freshly chosen file must carry the same filename and replaces exactly that source (including all YAML parts); a mismatched selection or dismissed dialog leaves the data untouched.",
                      )}
                    </p>
                  </div>
                )}
                <span className="url-field">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://example.org/data.json"
                    aria-label={t("Datei-URL", "File URL")}
                  />
                  <button
                    type="submit"
                    className="icon-button url-submit"
                    disabled={!urlInput.trim() || working}
                    title={t("URL importieren", "Import URL")}
                    aria-label={t("URL importieren", "Import URL")}
                  >
                    <ArrowDownTrayIcon />
                  </button>
                </span>
              </form>
              <div className="source-heading"><span>{t("Datenbanken / API", "Databases / API")}</span></div>
              {files.filter((file) => ["jazz", "api"].includes(file.format)).map(sourceOption)}
              <label>
                {t("Connector", "Connector")}
                <span className="select-wrap">
                  <select value={connectorChoice} onChange={(e) => { setConnectorChoice(e.target.value); setConnectorSource(""); setConnectorSources([]); setConnectorToken(""); }}>
                    <option value="">{t("Bitte auswählen", "Please select")}</option>
                    {connectors.map((entry) => (
                      <option key={entry.id} value={entry.id}>{entry.name}</option>
                    ))}
                  </select>
                  <ChevronDownIcon aria-hidden="true" />
                </span>
              </label>
              {connectorChoice && (
                <>
                  <button
                    disabled={connectorLoading}
                    onClick={() => void loadConnectorSources(connectorChoice, connectorToken)}
                  >
                    {t("Verfügbare Quellen laden", "Load available sources")}
                  </button>
                  {!!connectorSources.length && (
                    <label>
                      {t("Quelle", "Source")}
                      <span className="select-wrap">
                        <select value={connectorSource} onChange={(e) => setConnectorSource(e.target.value)}>
                          <option value="">{t("Bitte auswählen", "Please select")}</option>
                          {connectorSources.map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                        <ChevronDownIcon aria-hidden="true" />
                      </span>
                    </label>
                  )}
                  <label>
                    {t("Zugriffstoken (nur für diesen Import)", "Access token (only for this import)")}
                    <input type="password" autoComplete="off" value={connectorToken} onChange={(e) => setConnectorToken(e.target.value)} />
                  </label>
                  <button disabled={!connectorSource || working} onClick={() => void importConnectorPull()}>
                    <PlusIcon />
                    {t("Connector importieren", "Import connector")}
                  </button>
                </>
              )}
            </div>
          )}
          {storageError && <p role="alert">{storageError}</p>}
          {working && <div className="import-progress" role="status">
            {progress ? `${progress.phase === "reading" ? t("Einlesen", "Reading") : t("Aufbereiten", "Indexing")}: ${(progress.bytes / 1000000).toFixed(1)}${progress.total ? ` / ${(progress.total / 1000000).toFixed(1)}` : ""} MB · ${progress.records} ${t("Datensätze gespeichert", "records stored")}` : t("Verarbeitung läuft …", "Processing …")}
            <button onClick={() => { answerWarning("cancel"); storage.current?.cancel(); }}>{t("Abbrechen", "Cancel")}</button>
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
              onClick={() => chooseTheme(!dark)}
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </IconButton>
          </div>
          {panel === "filter" && (
            <form
              className="inline-panel filter-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (filterPending) return;
                if (!filterColumn || !availableFilterColumns.includes(filterColumn)) return;
                if (filterValue.trim() && filterColumn) {
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
                {t("Feld", "Field")}
                <select
                  value={filterColumn}
                  disabled={filterPending}
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
                  {displayedFilterValues.map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
                {selectedDataset && (valuePage > 0 || freshResult?.moreValues) && <div className="data-pagination">
                  <button type="button" disabled={!valuePage || filterPending} onClick={() => setValuePage((p) => Math.max(0, p - 100))}>←</button>
                  {t("Wertvorschläge", "Value suggestions")} {valuePage + 1}–{valuePage + displayedFilterValues.length}
                  <button type="button" disabled={!freshResult?.moreValues || filterPending} onClick={() => setValuePage((p) => p + displayedFilterValues.length)}>→</button>
                </div>}
              </label>
              <button
                className="primary"
                type="submit"
                disabled={
                  filterPending ||
                  !filterColumn ||
                  !availableFilterColumns.includes(filterColumn) ||
                  !availableFilterColumns.length ||
                  (selectedDataset ? freshResult?.total === 0 : filtered.length === 0)
                }
              >
                <PlusIcon />
                {t("Filter hinzufügen", "Add filter")}
              </button>
            </form>
          )}
          {panel === "columns" && (
            <div className="inline-panel column-options">
              <span>{t("Sichtbare Felder", "Visible fields")}</span>
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
                    "Speichere deine erste Ansicht – mit genau den Feldern, die du brauchst.",
                    "Save your first view with just the fields you need.",
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
        {showPwaUpdate && (
          <div className="pwa-update-banner" role="status">
            <span>
              {t(
                "Eine neue DLens-Version ist bereit.",
                "A new DLens version is ready.",
              )}
            </span>
            <button
              className="primary"
              disabled={working}
              onClick={() => void pwa.applyUpdate()}
              title={
                working
                  ? t(
                      "Während Import/Löschen deaktiviert",
                      "Disabled during import/deletion",
                    )
                  : undefined
              }
            >
              <ArrowPathIcon />
              {t("Aktualisieren", "Update")}
            </button>
            <button onClick={pwa.deferUpdate}>{t("Später", "Later")}</button>
          </div>
        )}
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
                        "Wähle unter Anzeige mindestens ein vorhandenes Feld.",
                        "Select at least one available field under Display.",
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
      <Dialog.Root open={importWarning !== null} onOpenChange={(open) => { if (!open) answerWarning("cancel"); }}>
        <Dialog.Portal>
          <Dialog.Backdrop className="dialog-backdrop" />
          <Dialog.Popup className="dialog import-warning">
            <Dialog.Title>{t("Großer Datensatz", "Large record")}</Dialog.Title>
            <Dialog.Description>
              {t("Ein Datensatz überschreitet", "A record exceeds")} {importWarning ? importWarning.bytes / 1048576 : 2} MiB {t("oder", "or")} {importWarning?.nodes.toLocaleString(language)} {t("Knoten. Fortsetzen kann viel Arbeitsspeicher benötigen. Beim Abbruch werden die Daten dieses Imports entfernt; der bisherige Bestand bleibt erhalten.", "nodes. Continuing may require substantial memory. Cancelling removes this import's data and preserves the previous dataset.")}
            </Dialog.Description>
            <div className="empty-actions">
              <button onClick={() => answerWarning("cancel")}>{t("Import abbrechen", "Cancel import")}</button>
              <button className="primary" onClick={() => answerWarning("continue")}>{t("Fortsetzen", "Continue")}</button>
              {importWarning && importWarning.interval >= 2 && <button onClick={() => answerWarning("ignore")}>{t("Fortsetzen und für diesen Import nicht erneut fragen", "Continue without further warnings for this import")}</button>}
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
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
            <PwaSettings language={language} working={working} pwa={pwa} />
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
              {t("Zeitfelder werden anhand üblicher Feldnamen vorausgewählt. Die Zuordnung gilt für die aktuelle Quelle.", "Time fields are preselected using common field names. The mapping applies to the current source.")}
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
            <h3><CircleStackIcon />{t("Datenbanken", "Databases")}</h3>
            <button
              type="button"
              disabled={working}
              onClick={() => {
                const profile: ConnectorProfile = { id: newProfileId(), name: t("Neue Datenbank", "New database"), kind: "postgres", endpoint: "" };
                setConnectors((previous) => [...previous, profile]);
                setExpandedConnector(profile.id);
              }}
            >
              <PlusIcon />
              {t("Datenbank hinzufügen +", "Add database +")}
            </button>
            {connectors.map((profile) => {
              const expanded = expandedConnector === profile.id;
              return (
                <div key={profile.id}>
                  <div className="source-option">
                    <CircleStackIcon aria-hidden="true" />
                    <span className="source-name">{profile.name}</span>
                    <button
                      type="button"
                      className="icon-button"
                      title={t(`Verbindung „${profile.name}“ löschen`, `Delete connection “${profile.name}”`)}
                      aria-label={t(`Verbindung „${profile.name}“ löschen`, `Delete connection “${profile.name}”`)}
                      disabled={working}
                      onClick={() => {
                        if (!window.confirm(t(`Verbindung „${profile.name}“ löschen?`, `Delete connection “${profile.name}”?`))) return;
                        setConnectors((previous) => previous.filter((entry) => entry.id !== profile.id));
                        if (expandedConnector === profile.id) setExpandedConnector(null);
                        if (connectorChoice === profile.id) { setConnectorChoice(""); setConnectorSource(""); setConnectorSources([]); }
                      }}
                    >
                      <TrashIcon />
                    </button>
                    <button
                      type="button"
                      className="icon-button source-chevron"
                      title={expanded ? t("Einstellungen einklappen", "Collapse settings") : t("Einstellungen bearbeiten", "Edit settings")}
                      aria-label={expanded ? t("Einstellungen einklappen", "Collapse settings") : t("Einstellungen bearbeiten", "Edit settings")}
                      aria-expanded={expanded}
                      onClick={() => setExpandedConnector(expanded ? null : profile.id)}
                    >
                      <ChevronDownIcon className={expanded ? "" : "rotated"} />
                    </button>
                  </div>
                  {expanded && (
                    <div className="inline-panel">
                      <label>
                        {t("Name", "Name")}
                        <input
                          value={profile.name}
                          onChange={(e) => setConnectors((previous) => previous.map((entry) => entry.id === profile.id ? { ...entry, name: e.target.value } : entry))}
                        />
                      </label>
                      <label>
                        {t("Typ", "Type")}
                        <select
                          value={profile.kind}
                          onChange={(e) => setConnectors((previous) => previous.map((entry) => entry.id === profile.id ? { ...entry, kind: e.target.value as ConnectorProfile["kind"] } : entry))}
                        >
                          <option value="postgres">PostgreSQL</option>
                          <option value="mariadb">MariaDB</option>
                          <option value="ndjson">NDJSON</option>
                        </select>
                      </label>
                      <label>
                        {profile.kind === "ndjson" ? "URL" : t("Connector-URL", "Connector URL")}
                        <input
                          type="url"
                          value={profile.endpoint}
                          onChange={(e) => setConnectors((previous) => previous.map((entry) => entry.id === profile.id ? { ...entry, endpoint: e.target.value } : entry))}
                          placeholder={profile.kind === "ndjson" ? "https://example.org/records" : "http://127.0.0.1:8787"}
                        />
                      </label>
                      <p className="subtle">
                        {profile.kind === "ndjson"
                          ? t("Tokens werden nicht gespeichert und gelten nur für den laufenden Import.", "Tokens are not stored and apply only to the running import.")
                          : t("Zugangsdaten liegen ausschließlich im Connector-Backend. Gespeichert werden nur Name, Typ und URL.", "Credentials stay in the connector backend. Only name, type and URL are stored.")}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
            <div className="settings-divider" />
            <h3><CircleStackIcon />{t("Lokaler Datenspeicher", "Local data storage")}</h3>
            {storageStats && <p>{t("Datenbank", "Database")}: {(storageStats.databaseBytes / 2 ** 20).toFixed(1)} MiB · {t("Geschätzter freier Browserspeicher", "Estimated available browser storage")}: {storageStats.quota ? ((storageStats.quota - (storageStats.usage ?? 0)) / 2 ** 30).toFixed(1) + " GiB" : "—"} · {storageStats.persisted ? t("Dauerhafter Speicher gewährt", "Persistent storage granted") : t("Speicherung unterliegt Browserbereinigung", "Storage subject to browser eviction")}</p>}
            <p>{t("Importierte Dateien bleiben lokal in diesem Browser gespeichert. Die Originaldatei wird nicht zusätzlich kopiert.", "Imported files persist locally in this browser. Original files are not duplicated.")}</p>
            <button onClick={() => { void navigator.storage?.persist().then((granted) => setNotice(granted ? t("Dauerhafter Speicher gewährt", "Persistent storage granted") : t("Browser hat dauerhaften Speicher nicht gewährt", "Browser did not grant persistent storage"))); }}>{t("Dauerhaften Browserspeicher anfragen", "Request persistent browser storage")}</button>
            {selectedDataset && <button disabled={working} onClick={() => void deleteImported("source")}>{t("Ausgewählte Quelle löschen", "Delete selected source")}</button>}
            <button disabled={working} onClick={() => void deleteImported("all")}>{t("Alle importierten Daten löschen", "Delete all imported data")}</button>
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
