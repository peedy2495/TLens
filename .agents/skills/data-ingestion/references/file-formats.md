# File Format Handling

## XML

Large XML files must use a streaming/SAX-style parser.

Do not use whole-file:

```js
await file.text()
```

or full DOM parsing for large sources.

Required properties:

- incremental chunk parsing
- bounded parser state/stack
- namespace handling
- attribute handling
- encoding handling
- correct behavior when chunks split tags or text
- malformed XML errors
- cancellation
- no automatic loading of external entities/resources

For unknown XML structures:

- elements may map to generic entities
- `parent_id` preserves hierarchy
- `position` preserves sibling order when relevant
- attributes may map to JSON attributes
- source path should be retained where useful

## JSON

Small JSON files may use normal parsing.

For large JSON, prefer incremental approaches, particularly for:

- very large arrays
- NDJSON
- JSON Lines
- repeated structures

Avoid unnecessary copies of huge strings/object graphs.

For unknown nested structures:

- objects may map to entities when useful
- arrays should preserve ordering
- primitive values may become attributes or value entities depending on the
  selected internal model

## YAML

Continue supporting YAML.

For small/medium files, normal parsing is acceptable.

For large YAML:

- measure and constrain memory use
- document parser limitations
- avoid pretending a parser is streaming if it is not
- fail clearly if a source exceeds safe limits

Use safe YAML parsing.

Do not allow unsafe custom tags/object instantiation unless explicitly required
and secured.

## CSV

Large CSV must be parsed incrementally.

Correctly handle:

- quoted values
- escaped quotes
- delimiters inside quotes
- newlines inside quoted fields
- UTF-8
- any other encodings already supported by the app

CSV is primarily tabular and should usually map to relational tables or a
generic row model.

## File type detection

Use a combination of:

- extension
- MIME type
- content sniffing when needed

Do not rely solely on filename extension.
