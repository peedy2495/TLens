# Workers, Streaming, Progress, and Backpressure

## Worker responsibilities

Move expensive work away from the main UI thread, including:

- SQLite access
- XML parsing
- CSV parsing
- large JSON/YAML processing
- normalization
- mapping
- batch inserts
- expensive queries
- aggregations

## Message/RPC interface

Define a clear worker API.

Conceptual lifecycle:

```text
UI
→ startImport(sourceConfig)

Worker
→ open source
→ read
→ parse
→ normalize
→ map
→ persist batches
→ report progress
→ complete
```

Useful states:

- `starting`
- `connecting`
- `reading`
- `parsing`
- `normalizing`
- `mapping`
- `importing`
- `progress`
- `completed`
- `cancelled`
- `error`

## Progress

Where available report:

- source name
- file name
- source/file type
- file size
- processed bytes
- percent
- read records
- imported records
- current phase
- runtime
- errors

For DB/API sources, total size may be unknown. In that case show record counts,
batch counts, and elapsed time instead of fake percentages.

## Cancellation

Cancellation must propagate through:

```text
UI
↓
Worker
↓
Connector
↓
Parser
↓
Normalizer/Mapper
↓
DB transaction
```

Prefer an `AbortSignal`-oriented design when compatible with the project.

Cancellation must not leave SQLite in an inconsistent state.

## Batch size

Do not commit each row individually.

Start with configurable batches in the approximate range of 1,000–10,000
records, then tune using real measurements.

Optimize for:

- throughput
- bounded RAM use
- reasonable transaction size
- responsive UI

## Transfer/copy minimization

Avoid repeatedly copying huge buffers/arrays between worker and main thread.

Use where appropriate:

- streams
- transferable objects
- prepared statements
- transactions
- bounded queues
- backpressure-aware async iteration
