---
name: data-ingestion
description: File import, parsing, normalization, hierarchy mapping and large-file ingestion for JSON, YAML, CSV and XML. Load only for ingestion-related work.
---

# Data ingestion

## Principles

- Process large sources incrementally with bounded memory; never require a multi-GB source to be loaded completely into RAM.
- Keep expensive parsing/normalization/import work off the UI thread when it can materially block interaction.
- Preserve cancellation, progress reporting and backpressure through long-running ingestion flows.
- Keep parsing, normalization/mapping and persistence responsibilities separable.
- Preserve source traceability when it is needed for diagnostics, re-import or mapping.
- Treat malformed input and resource limits as explicit errors; do not silently truncate or reinterpret data.
- Do not duplicate original large source files automatically.

## Format guidance

The application currently supports JSON, YAML/YML, CSV and XML. Derive exact current UI behavior, limits and conversion semantics from implementation/tests before changing them.

Read only when relevant:

- `references/file-formats.md` for parser/format-specific concerns.
- `references/streaming.md` for workers, progress, cancellation, batching and backpressure.
