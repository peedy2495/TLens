---
name: connectors
description: Database, HTTP and API source connectors, streaming contracts, capabilities, credentials and connector-side security. Load only for connector work.
---

# Connectors

## Principles

- Keep source-specific access behind a connector contract so ingestion/mapping does not depend on a specific database or API.
- Prefer incremental reads and backpressure-aware async primitives for large result sets.
- Support cancellation and cleanup across open/read/close lifecycles.
- Normalize source-specific errors at the connector boundary where useful.
- Expose only capabilities the connector actually supports; do not simulate unsupported behavior.
- Keep credentials on the appropriate trusted side. Do not persist passwords/tokens in ordinary browser preferences, import metadata or logs.
- Parameterize server-side SQL and validate identifiers/inputs where parameterization is not available.

Read only when relevant:

- `references/connector-contracts.md` for interface/capability guidance.
- `references/security.md` for connector and parser security considerations.

Optional example: `examples/connector-example.ts` when a concrete connector shape is useful.
