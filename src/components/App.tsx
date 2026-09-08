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
import {
  eventFilter,
  defaultColumns,
  valueText,
  type Row,
  eventRange,
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
import { TLensAccount } from "../lib/jazz";

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
  const me = useAccount(TLensAccount, { resolve: { root: true } });
  const [language, setLanguage] = useState<"de" | "en">(() =>
    readStored("tlens-language", "de"),
  );
  const t = (de: string, en: string) => (language === "de" ? de : en);
  const [dark, setDark] = useState(() => readStored("tlens-dark", false));
  const [files, setFiles] = useState<{ name: string; tables: Table[] }[]>([]);
  const [source, setSource] = useState("");
  const [dbName, setDbName] = useState(() =>
    readStored("tlens-db", "Festival Workspace"),
  );
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filter[]>([]);
  const [columns, setColumns] = useState<string[]>(initialColumns);
  const [views, setViews] = useState<View[]>(() =>
    readStored("tlens-views", []),
  );
  const [panel, setPanel] = useState("");
  const [settings, setSettings] = useState(false);
  const [detail, setDetail] = useState<{ row: Row; path: string[] } | null>(
    null,
  );
  const [filterColumn, setFilterColumn] = useState("Area");
  const [filterValue, setFilterValue] = useState("");
  const [viewName, setViewName] = useState("");
  const [withFilters, setWithFilters] = useState(true);
  const [selectedDate, setSelectedDate] = useState("");
  const [sort, setSort] = useState({ column: "Start", direction: 1 });
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
    localStorage.setItem("tlens-dark", JSON.stringify(dark));
  }, [dark]);
  useEffect(() => {
    document.documentElement.lang = language;
    localStorage.setItem("tlens-language", JSON.stringify(language));
  }, [language]);
  useEffect(() => {
    localStorage.setItem("tlens-views", JSON.stringify(views));
  }, [views]);
  useEffect(() => {
    localStorage.setItem("tlens-db", JSON.stringify(dbName));
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
  );
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
      Number.isFinite(eventRange(row).start) &&
      Number.isFinite(eventRange(row).end),
  );
  const start = dayRows.length
    ? Math.max(
        0,
        Math.floor(
          Math.min(...dayRows.map((row) => eventRange(row).start)) / 60,
        ) *
          60 -
          60,
      )
    : 0;
  const end = dayRows.length
    ? Math.ceil(Math.max(...dayRows.map((row) => eventRange(row).end)) / 60) *
        60 +
      60
    : 1440;
  const position = (minute: number) => ((minute - start) / (end - start)) * 100;
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
    if (name === "filter" && !allColumns.includes(filterColumn)) {
      setFilterColumn(allColumns[0] ?? "");
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
      if (file.size > 5_000_000)
        throw new Error(
          t("Maximal 5 MB pro Datei.", "Maximum file size is 5 MB."),
        );
      const content = await file.text();
      const imported = toTables(
        /\.json$/i.test(file.name) ? JSON.parse(content) : parse(content),
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
    a.download = "tlens-export.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const count = tables.reduce((sum, table) => sum + table.rows.length, 0);
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">
            T<span />
          </span>
          TLens
          <span className="brand-divider" />
          <span className="workspace-label">Event Workspace</span>
        </a>
        <div className="top-right">
          <span className="prototype">{t("Prototyp", "Prototype")}</span>
          <span className="avatar">EP</span>
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
              className="source-button"
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
                  {source === "jazz"
                    ? dbName
                    : source ||
                      t("Datenquelle auswählen", "Select data source")}
                </strong>
                <small>
                  {source === "jazz"
                    ? "Jazz · Local-first"
                    : t(
                        "Datei · Hierarchische Daten",
                        "File · Hierarchical data",
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
            accept=".json,.yaml,.yml"
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
                <small>JSON / YAML</small>
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
            {query ? (
              <IconButton
                label={t("Suche löschen", "Clear search")}
                onClick={() => setQuery("")}
              >
                <XMarkIcon />
              </IconButton>
            ) : (
              <kbd>⌘ K</kbd>
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
                  onChange={(e) => setFilterColumn(e.target.value)}
                >
                  {allColumns.map((c) => (
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
                      : ["Start", "End"].includes(filterColumn)
                        ? "time"
                        : "text"
                  }
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  placeholder="Stage 1"
                />
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
        <section className="timeline-card">
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
                  const range = eventRange(row);
                  return (
                    <div className="event-lane" key={index}>
                      <button
                        title={`${row.EventID} · ${row.Start}–${row.End} · ${row.Area}`}
                        className={`event-bar ${row.Area === "Stage 2" ? "purple" : "green"}`}
                        style={{
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
                          {String(row.Start)} – {String(row.End)}
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
                "Keine Events mit Datum und Uhrzeit in dieser Auswahl.",
                "No events with date and time in this selection.",
              )}
            </div>
          )}
          <div className="timeline-footer">
            <div>
              <span className="legend">
                <i />
                Stage 1
              </span>
              <span className="legend">
                <i className="purple-dot" />
                Stage 2
              </span>
            </div>
            <span>
              {t(
                "Zeitraum automatisch · ± 1 Stunde",
                "Automatic range · ± 1 hour",
              )}
            </span>
          </div>
        </section>
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
          const visible = columns.filter((column) =>
            table.rows.some((row) => Object.hasOwn(row, column)),
          );
          return (
            <section className="data-card" key={key}>
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
                                sort.column === column
                                  ? sort.direction === 1
                                    ? "ascending"
                                    : "descending"
                                  : "none"
                              }
                            >
                              <button
                                onClick={() =>
                                  setSort({
                                    column,
                                    direction:
                                      sort.column === column
                                        ? -sort.direction
                                        : 1,
                                  })
                                }
                              >
                                {column}
                                <ArrowsUpDownIcon />
                              </button>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...table.rows]
                          .sort(
                            (a, b) =>
                              String(a[sort.column] ?? "").localeCompare(
                                String(b[sort.column] ?? ""),
                                language,
                                { numeric: true },
                              ) * sort.direction,
                          )
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
                                  {column === "Area" ? (
                                    <span
                                      className={`area-badge ${row[column] === "Stage 2" ? "purple" : "green"}`}
                                    >
                                      <i />
                                      {valueText(row[column]) || "—"}
                                    </span>
                                  ) : column === "EventID" ? (
                                    <span className="event-id">
                                      <span
                                        className={
                                          row.Area === "Stage 2"
                                            ? "purple-dot"
                                            : ""
                                        }
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
          <div className="empty-state">
            <MagnifyingGlassIcon />
            <h2>
              {source
                ? t("Keine Treffer", "No matches")
                : t("Dein Workspace ist leer", "Your workspace is empty")}
            </h2>
            <p>
              {t(
                source
                  ? "Passe deine Suche oder Filter an."
                  : "Öffne eine Datei oder lade den Festival-Datensatz.",
                source
                  ? "Adjust your search or filters."
                  : "Open a file or load the festival dataset.",
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
            <span className="footer-logo">T</span>TLens{" "}
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
    <JazzReactProvider AccountSchema={TLensAccount} sync={{ when: "never" }}>
      <RouterProvider router={router} />
    </JazzReactProvider>
  );
}
