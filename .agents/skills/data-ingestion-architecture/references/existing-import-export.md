# Existing Data Source, Import, and Export Behavior

This file records behavior that exists or is already required by the product
baseline. Preserve it while migrating to the new connector/SQLite architecture
unless the task explicitly changes it.

## Source selection

- Provide a data source selector.
- The app starts without a selected source and without automatically loaded demo
  data.
- The empty workspace is a file drop target when no source is selected.
- Highlight the empty workspace during file drags.
- Reuse the same validation and single-file restriction as the source selector.
- The filtered `No matches` state is not a drop target.
- Support dragging one file onto the source selector.
- Highlight the source selector while dragging.

## File validation

Share validation between drag-and-drop and the file picker.

Accepted extensions, case-insensitive:

- JSON
- YAML / YML
- CSV
- XML

Requirements:

- show a localized notice for unsupported formats before reading them
- reject multi-file drops with a clear notice
- preserve the current source when an import is rejected

## Current baseline vs target architecture

Current baseline:

- file imports are documented as up to 5 MB
- imported files remain available for the session
- XML currently uses the browser XML parser
- Jazz is the current local database implementation
- MariaDB, PostgreSQL, and SQLite are required target data sources but their
  adapters are not yet connected

Target migration from this skill:

- remove the architectural dependency on a small fixed file-size ceiling
- large XML/CSV/JSON must use bounded-memory streaming/incremental processing
- SQLite WASM + OPFS becomes the primary local structured persistence target
- Jazz migration/compatibility must be handled deliberately; do not silently
  delete existing local data

## XML conversion semantics to preserve

Existing XML behavior is data-oriented rather than lossless editing.

Preserve these semantics where possible when moving from DOM parsing to a
streaming parser:

- repeated sibling elements form table rows
- plain collection wrappers are traversed
- single records are supported
- nested elements are preserved
- names and text values are preserved
- attributes use `@` prefix
- direct mixed text/CDATA uses `#text`
- malformed XML is rejected
- DTD declarations are rejected

Not required to preserve losslessly:

- mixed-content ordering
- comments
- processing instructions

## JSON / YAML

- arrays of objects become separate tables per data path
- preserve nested objects and arrays

When migrating to the hybrid SQLite model, preserve this user-visible table/data
behavior even if internal persistence changes.

## CSV defaults

Default import settings:

- automatic comma / semicolon / tab detection
- double quotes as text delimiters
- first row as headers
- header names must be unique and nonempty

Configurable options:

- delimiter: automatic, comma, semicolon, tab, pipe
- quoting: double quote, single quote, none
- headers: optional
- without headers generate `Column1`, `Column2`, etc.

CSV value semantics:

- preserve values as text
- preserve leading zeros
- preserve dates/times as text
- support UTF-8 BOM
- support escaped quotes
- support multiline fields
- support blank lines
- reject malformed quoting
- reject invalid headers
- reject inconsistent field counts

Persist CSV settings in the browser, apply them to subsequent imports and
exports, and provide a restore-defaults action.

## Export

- Export filtered tables as JSON.
- Provide a CSV download button in each table header.
- CSV export includes:
  - filtered rows
  - visible columns
  - current sort order
- Disable CSV export if no columns are visible.
- Serialize nested cell values as JSON text.

CSV export formatting:

- use saved CSV options
- automatic delimiter means comma for export
- UTF-8 BOM
- CRLF record endings
- if quoting is disabled and a value contains delimiter or line break, report
  an error rather than emitting malformed CSV

## Source icons and database labels

- file sources use the mockup's file icon
- database connections use the database icon
- database names are configurable in settings
- configured names appear under databases in the source selector
