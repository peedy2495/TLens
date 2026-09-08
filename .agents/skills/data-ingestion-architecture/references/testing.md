# Testing Requirements

## Storage

Test:

- SQLite CRUD
- schema migrations
- transactions
- rollback
- legacy `localStorage` migration
- idempotent migration behavior

## Hierarchy

Test:

- root entity without parent
- multiple levels
- many children
- deterministic sibling order
- descendants
- ancestors
- path to root
- deep trees
- subtree deletion
- re-import behavior

## XML

Test:

- small XML
- large simulated stream
- namespaces
- attributes
- deep nesting
- malformed XML
- chunk boundary in tag
- chunk boundary in text
- cancellation

## JSON

Test:

- nested objects
- arrays
- large arrays
- NDJSON/JSON Lines
- order preservation
- cancellation where supported

## YAML

Test:

- nested mappings
- sequences
- malformed YAML
- safe parser configuration
- resource limits/large-file behavior

## CSV

Test:

- quoted fields
- escaped quotes
- embedded delimiters
- embedded newlines
- large streams
- chunk boundaries

## Connectors

Test:

- open/read/close lifecycle
- batching
- cancellation
- error propagation
- backpressure
- preview
- capability reporting

Implement a mock connector that emits controlled batches so the ingestion
pipeline can be tested independently of real files.

## Ingestion

Test:

- successful import
- failure mid-import
- cancel
- quota failure
- rollback
- re-import
- import metadata/status updates
