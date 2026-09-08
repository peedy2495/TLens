# Search, Filters, Tables, and Saved Views

## Search and filters

- Search string matches across data values, including nested values.
- Search is case-insensitive.
- Combine field filters with search text.
- Every active filter must match the record.
- Discover filter fields and values recursively in nested objects/arrays.
- Example: `Personal[].PersonID` must match its containing event.
- Offer filter fields ascending A–Z with natural numeric ordering.
- Offer unique existing values descending while allowing manual input.
- Leave filter value input empty without example placeholder.
- Clear entered value when switching filter fields.
- Use date/time pickers for corresponding fields.
- Time pickers follow selected start/end mappings.

Search clear behavior:

- clear button only appears for nonempty search text
- no replacement symbol/shortcut badge when empty
- current compact geometry: 12 px cross in a 24 px button with 4.5 px right
  inset for the 45 px search field height

Event interaction:

- opening an event row or clicking its timeline bar sets an exact `EventID`
  filter
- replace an existing `EventID` filter
- preserve other filters and search text

## Tables

- Display a separate table per data path or source table.
- Allow selecting variable names/columns to display.
- Initially select scalar columns.
- Omit selected columns from a table when they do not exist in filtered records.
- Sort each table independently, scoped by source and data path.
- Sort cycle: ascending → descending → unsorted.
- Unsorted is the initial state and restores source order.
- Active sorting uses orange `#f97316` upward/downward arrow.
- Inactive sort uses neutral sort symbol.
- Open full record as expandable hierarchy on row click or Enter/Space,
  regardless of visible columns.

## Saved views

- Save current display selection as a reusable view.
- Optionally include current filters and search text.
- Allow a view to be the default.
