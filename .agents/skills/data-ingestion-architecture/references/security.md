# Security

Treat imported/source data as untrusted.

## XML

- disable or avoid external entity resolution
- do not automatically load remote external resources
- constrain parser state and resource use

## YAML

- use safe parsing
- do not allow unsafe custom tags/object construction by default

## Database/API connectors

- do not persist database passwords in ordinary browser storage
- do not place secrets in logs or import metadata
- parameterize server-side SQL
- do not concatenate unvalidated user input into SQL
- keep credential handling on the appropriate trusted side of the architecture

## Error handling

Use a consistent source error representation where practical:

```ts
interface SourceError {
  code: string;
  message: string;
  sourceType: string;
  recoverable?: boolean;

  location?: {
    line?: number;
    column?: number;
    row?: number;
    path?: string;
  };
}
```

Handle at least:

- malformed XML
- malformed JSON
- malformed YAML
- malformed CSV
- mapping errors
- quota/storage failures
- SQLite failures
- cancellation
- worker termination
- future network/database errors
