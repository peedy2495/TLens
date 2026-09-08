# Future Database and API Connectors

## Database connectors

Plan for sources such as:

- PostgreSQL
- MySQL/MariaDB
- Microsoft SQL Server
- Oracle
- other databases

A normal browser webapp should not directly open classic database protocol
connections or persist database credentials in ordinary browser storage.

Preferred architecture:

```text
Browser Webapp
      │
      │ HTTPS / streaming HTTP / WebSocket
      ▼
Connector Backend
      │
      ├── PostgreSQL
      ├── MySQL
      ├── SQL Server
      ├── Oracle
      └── others
```

The browser should consume database results incrementally:

```text
Remote Database
↓
Backend Connector
↓
Streaming API
↓
Browser Connector
↓
Normalizer
↓
Mapper
↓
SQLite / OPFS
```

Future DB connectors should reuse the same connector contract as file sources.

## API connectors

Design for future support of:

- REST
- GraphQL
- paginated HTTP APIs
- NDJSON
- streaming HTTP
- WebSocket sources

Pagination should appear downstream as normal batches.

```text
REST API
→ page 1 → DataBatch
→ page 2 → DataBatch
→ page 3 → DataBatch
```

## Credentials and secrets

Do not store DB passwords or API secrets in:

- import metadata
- logs
- normal browser storage
- source path metadata

Use an appropriate backend/secret-management approach when those connectors are
implemented.
