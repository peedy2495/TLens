# DLens Agent Instructions

DLens is a **Data Explorer** for filtering and displaying hierarchical and relational data.

For work involving persistence, imports, file formats, connectors, SQLite WASM,
OPFS, Web Workers, large-file processing, hierarchical storage, or future
database/API integrations, follow:

```text
.agents/skills/data-ingestion-architecture/SKILL.md
```

## Product identity

- Product name: `DLens`
- Product descriptor: `Data Explorer`
- Use `dlens` for package names, export filenames, and new browser preference keys.
- Preserve legacy `tlens-` preferences as fallback when no corresponding
  `dlens-` value exists.
- Do not recreate or clear the existing Jazz database solely because of the
  rename.

## Documentation workflow

Keep `README.md` and the project's ./.skills strucured topics aligned with feature,
behavior, configuration, architecture, and workflow changes.

When reorganizing requirements:
- preserve existing requirements,
- distinguish implemented/current behavior from planned/target behavior,
- inspect implementation and commit history when behavior is unclear.

Code comments must be in English. Use only royalty-free visual assets.

## Toolchain

- Node.js 22
- Run relevant tests with `npm test`
- Verify application changes with `npm run build` as appropriate

## Architecture migration note

The application currently uses Jazz for local persistence and currently has
small-file import behavior documented in the legacy requirements. The target
architecture introduces SQLite WASM + OPFS and streaming imports for large
files.

Treat the migration as an evolution of the existing product, not as permission
to discard current product behavior.

Preserve data semantics, UI behavior, CSV/XML conversion rules, filtering,
tables, timeline behavior, settings, design constraints, demo-data behavior,
and compatibility requirements unless a task explicitly changes them.

See the structured baseline references in the skill for details.
