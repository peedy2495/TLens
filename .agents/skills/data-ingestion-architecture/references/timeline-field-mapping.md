# Timeline and Field Mapping

## Timeline selection

- Provide a timeline for today or the next matching day.
- If needed, fall back to the latest available past day.
- Allow selecting a day from filtered matches via calendar icon.
- Show the date on the left above the timeline.

When displaying today:

- mark current time with a red arrow if it lies within the displayed range
- marker is a small red downward triangle at the top
- draw a vertical red line behind event bars
- line extends slightly below data lanes
- bars stay above the marker
- marker stays above the grid
- marker must not intercept clicks

## Range calculation

Scale dynamically to filtered events with no extra padding:

- round earliest start down to full hour
- round latest end up to full hour
- exact full-hour boundaries stay unchanged
- handle events ending after midnight
- avoid division by zero for zero-duration ranges

## Date/time data

- process dates and times separately
- current date field is `Date` in `YYYY-MM-DD`
- time values use `HH:mm`

## Field mapping

Start/end fields are configurable per source and are used for:

- event placement
- range calculations
- labels
- filter time pickers

On import:

- preselect common field names case-insensitively
- ignore spaces, underscores, and hyphens when matching aliases
- do not guess unrelated fields
- unmatched mappings remain empty for manual selection
- show a settings hint when mapping is incomplete

Start aliases:

`start`, `starttime`, `startzeit`, `beginn`, `beginnzeit`, `anfang`,
`anfangszeit`, `begin`, `beginning`, `begintime`, `von`, `zeitvon`

End aliases:

`end`, `endtime`, `endzeit`, `ende`, `endezeit`, `stop`, `finish`,
`finishtime`, `bis`, `zeitbis`

Behavior:

- preserve manual mappings when switching loaded sources
- reimporting a file runs detection again

## Timeline visibility

- setting can show/hide timeline
- default is on
- persist preference in browser

On loading, reimporting, or switching a source:

- inspect the unfiltered source
- show timeline only when at least one record has:
  - valid `Date`
  - valid mapped start time
  - valid mapped end time
- otherwise hide timeline

Subsequent search/filter changes must not reset the user's manual visibility
switch.

## Coloring and legend

- allow choosing the color field
- default color field is `Area`
- equal values use consistent colors across timeline bars and the selected
  visible table column
- keep event ID dots consistent
- derive legend from displayed day's values
- use neutral colors for missing values
- support light and dark themes
- persist color-field choice
