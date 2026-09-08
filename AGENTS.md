# DLens

A tool for filtering and displaying hierarchical data structures as well as relational data.

- Use `Data Explorer` as the product descriptor in the header and page title. General product descriptions should refer to data rather than only event data.

- The product name is DLens. Use DLens in the UI, logos, metadata, code and documentation; use `dlens` for package names, export filenames and new browser preference keys.
- Preserve existing data during renaming: read legacy `tlens-` preferences as a fallback when no `dlens-` value exists. Do not recreate or clear the Jazz database. Historical mockups and the existing repository directory may retain the old name.

## Documentation and development workflow

- The SQLite WASM/OPFS migration is implemented for local files and HTTP NDJSON. Read `docs/data-architecture-migration.md`, `docs/data-architecture-decisions.md` and `docs/data-architecture-validation.md` for implementation status, limits and remaining integration gates. Follow `.agents/skills/data-ingestion-architecture/SKILL.md`; preserve existing Jazz data and product semantics. Keep README and these requirements aligned.

- Maintain both `README.md` and `AGENTS.md` alongside future feature, behavior, configuration and workflow changes. README describes usage and current implementation; AGENTS records requirements and development guidance.
- Preserve existing requirements when reorganizing documentation. Distinguish implemented behavior from planned capabilities.
- Inspect the implementation and, where needed, commit history to resolve unclear behavior.
- Code comments must be in English. Use only royalty-free elements.
- Use Node.js 22. Run relevant tests with `npm test` and application checks with `npm run build`. Browser/OPFS checks use `npm run test:browser`; large-file measurements use `npm run test:large`. Exclude generated `artifacts/` and Vite caches from TypeScript and version control. Keep server credentials only in backend environment variables. The optional backend is deployed separately from the static app.

## Data sources and import

- Provide a data source selector. The app starts without a selected source or automatically loaded demo data.
- The empty workspace is also a file drop target when no source is selected. Highlight it during file drags and reuse the same import validation and single-file restriction as the source selector. The filtered "No matches" state is not a drop target.
- Support dragging a single file onto the source selector, with a highlighted drop target. Share file-extension validation between drag-and-drop and the file picker: accept only JSON, YAML/YML, CSV and XML (case-insensitive), and show a localized notice for unsupported formats before reading them. Reject multi-file drops with a clear notice; preserve the current source on rejected imports.
- Supported file imports: YAML, JSON, CSV and XML. XML/CSV/JSON use bounded streaming in a worker; YAML remains limited to 5,000,000 bytes. File imports now persist in SQLite/OPFS across sessions, replacing the old session-only behavior. Never duplicate original large files automatically. Enforce the documented per-value, depth, record and page limits with explicit errors.
- XML uses a strict streaming SAX parser; the old DOM parser is retained only as a compatibility reference. Repeated sibling elements form table rows; plain collection wrappers are traversed, and single records are supported. Preserve nested elements, names and text values; prefix attributes with `@` and store direct mixed text/CDATA under `#text`. Reject malformed XML and DTD declarations. This is a data-oriented conversion, not a lossless XML document editor (mixed-content ordering, comments and processing instructions are not retained).
- SQLite WASM with OPFS SAHPool is the primary local database. One worker owns the database via Web Locks; report unavailable storage or a competing tab without a silent memory fallback. Jazz remains a read-only legacy source. The optional server connector implements PostgreSQL and MariaDB/MySQL streaming adapters; isolated PostgreSQL 16 and MariaDB 11 integration tests passed. HTTP NDJSON uses the shared connector/ingestion contract.
- Show files with the mockup's file icon and database connections with the database icon.
- Database names are configurable in settings and appear under databases in the source selector.
- JSON/YAML arrays of objects become separate tables per data path. Preserve nested objects and arrays.
- CSV defaults: automatic comma/semicolon/tab detection, double quotes as text delimiters and the first row as unique, nonempty column names.
- CSV settings support automatic or explicit comma, semicolon, tab or pipe delimiters; double quotes, single quotes or no quoting; and optional headers. Without headers, generate `Column1`, `Column2`, etc.
- Preserve CSV values as text, including leading zeros, dates and times. Support UTF-8 BOM, escaped quotes, multiline fields and blank lines. Reject malformed quoting, invalid headers and inconsistent field counts.
- Save CSV settings in the browser, apply them to subsequent imports and exports and provide a restore-defaults action.
- Export filtered tables as JSON.
- Offer a CSV download button in each table header. Export that table's filtered rows, visible columns and current sort order; disable export when no columns are visible. Serialize nested cell values as JSON text.
- CSV exports use saved format options (automatic delimiter means comma), UTF-8 BOM and CRLF record endings. If quoting is disabled and a value contains a delimiter or line break, report an error instead of producing malformed CSV.

## Search and filters

- Search for string matches across data values, including nested values, without case sensitivity.
- Combine field filters with the search text. Each active filter must match the record.
- Find filter fields and values recursively in nested objects and arrays: for example, `Personal[].PersonID` must match its containing event.
- Offer filter fields in ascending order (A–Z, with natural numeric ordering). Offer unique existing values in descending order while allowing manual input.
- Leave the filter value input empty without an example placeholder. Clear the entered value when switching filter fields.
- Use date/time pickers for the corresponding fields; time pickers follow the selected start/end mappings.
- The search clear button appears only for nonempty search text. Show no replacement symbol or shortcut badge when empty.
- Keep the search clear icon compact: currently a 12 px cross in a 24 px button, with a 4.5 px right inset (10% of the 45 px search field height).
- Opening an event row or clicking its timeline bar sets an exact EventID filter, replacing an existing EventID filter while preserving other filters and search text.

## Tables and saved views

- Display a separate logical table for each data path or source table. Load bounded pages and show full-result counts; pagination must not change search, visible-column discovery, source order or export semantics.
- Allow selection of variable names/columns to display. Initially select scalar columns.
- Omit selected columns from a table when they do not exist in its filtered records.
- Sort each table independently, scoped by source and data path. Clicking a column cycles ascending → descending → unsorted; unsorted is the initial state and restores source order.
- Show an orange (`#f97316`) upward/downward arrow for active sorting; use the neutral sort symbol when inactive.
- Open the full record as an expandable hierarchy on row click or Enter/Space, regardless of visible columns. SQLite details load one level at a time with paginated children.
- Save the current display selection as a reusable view, optionally including current filters and search text. Allow a view to be the default.

## Timeline and field mapping

- Provide a timeline for today or the next matching day, falling back to the latest available past day if needed.
- Select a day from filtered matches through the calendar icon. Show the date on the left above the timeline.
- When showing today, mark the current time with a red arrow when within the displayed range.
- Render the current-time marker as a small red downward triangle at the top with a vertical red line behind the event bars, extending slightly below the data lanes. Keep bars above the marker and the marker above the grid; it must not intercept clicks.
- Dynamically scale the timeline to filtered events without extra padding: round the earliest start down and the latest end up to full hours. Exact full-hour boundaries stay unchanged. Handle events ending after midnight and avoid division by zero for a zero-duration range.
- Process dates and times separately. The current date field is `Date` (`YYYY-MM-DD`); time values use `HH:mm`.
- Start/end fields are configurable per source. Use the mappings for event placement, range calculations, labels and filter time pickers.
- On import, preselect common field names without case sensitivity; ignore spaces, underscores and hyphens when matching names. Do not guess unrelated fields: leave unmatched mappings empty for manual selection and show a settings hint.
- Start aliases: `start`, `starttime`, `startzeit`, `beginn`, `beginnzeit`, `anfang`, `anfangszeit`, `begin`, `beginning`, `begintime`, `von`, `zeitvon`.
- End aliases: `end`, `endtime`, `endzeit`, `ende`, `endezeit`, `stop`, `finish`, `finishtime`, `bis`, `zeitbis`.
- Preserve manual mappings when switching between loaded sources; reimporting a file runs detection again.
- Allow showing/hiding the whole timeline in settings; default on and persist the preference in the browser.
- On loading, reimporting or switching a source, override timeline visibility using the unfiltered source: show it only when at least one record has a valid `Date` and valid mapped start/end times. Otherwise hide it. Subsequent search/filter changes must not reset the manual visibility switch.
- Allow choosing the field used for coloring, default `Area`. Equal values share consistent colors across timeline bars and the selected visible table column. Keep event ID dots consistent too.
- Derive the legend from the displayed day's values. Use neutral colors for missing values, support both themes and persist the color-field choice.

## Settings

Group settings into these sections:

- **Allgemein / General:** language selection, currently German and English.
- **Anzeige / Display:** timeline visibility, start/end field mappings and color-field selection.
- **Datenquellen / Data sources:** CSV format, HTTP connector, SQLite storage/quota/persistence status, dataset removal and Jazz configuration. Explicit, idempotent Jazz-to-SQLite migration replaces the former copy-to-Jazz action; preserve the original Jazz account/data. Do not store database passwords or API tokens in preferences or import metadata.

## Design

- Follow the structure and design of `Mokup.png` as closely as possible.
- Use Heroicons (outline).
- All corners, except those of arrows, and all line ends should be rounded.
- Support both dark and light modes and responsive layouts.

## Technology and deployment

- Vite, Astro 5, React 19, TanStack Router and Tailwind CSS 4.
- Legacy Jazz integration; reference: https://github.com/carlassmann/alkalye, using Jazz for local-first sync and encryption.
- Retain the shadcn/ui (base-lyra style) design target. Current implementation uses custom rounded components and Base UI Dialog; a full shadcn/base-lyra component set is not installed.
- The legacy Jazz account remains anonymous and local without network sync. Existing data persists unchanged; authentication and cross-device sync remain future work. New accounts start empty. SQLite import activation and migration fingerprints must commit atomically; failures, cancellation and crash recovery must preserve the previous active generation.
- Host the demo on Vercel via GitHub import: Astro, build `npm run build`, output `dist`. Deployment configuration is present; do not describe deployment as completed unless verified.

## Festival demo data

- `public/demo/weitklang-festival-tag2-2026-09-08.json` is a separate fixed-date variant with festival day 2 on September 8, 2026. Only dates (including day-group keys) are shifted; all other content and the original demo remain unchanged. Import this variant explicitly; it does not automatically track today's date.

- Load the fictional festival dataset explicitly through the source selector or empty workspace action.
- Regenerate it with `node scripts/generate-festival.mjs`; the script writes `public/demo/weitklang-festival-2027.json` directly.
- Preserve stable resource IDs and nested people/equipment in event records so recursive filtering continues to find associated events.
