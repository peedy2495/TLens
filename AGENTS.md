# EventPlaner

A tool for filtering and displaying hierarchical data structures as well as relational data.

## Features

- Data source selection.
- Supported data sources: YAML, JSON, Jazz sync database, SQLite, MariaDB, PostgreSQL.
- Search for string matches in the data.
- Select which variable names/columns to display as columns in the view.
- The current display selection can be saved as a reusable view, with or without the current filters.
- A view can be designated as the default view.
- A timeline for today or the next matching day. A day can be selected from the filtered matches using the calendar icon. The displayed date appears on the left above the timeline. When displaying today, the current time is indicated by a red arrow on the timeline. The timeline dynamically scales its intervals to the filtered events, with a one-hour margin before and after them.
- Display a separate table for each data path or source table.
- Data sources can be configured in the settings; currently, only Jazz. Language selection is also available; currently, German and English.
- In the source display, show files with the file icon as in the image, and database connections with the database icon.
- A database source has a name in the settings. This name is displayed under databases in the source selector.
- Process dates and times separately.
- Use pickers for dates and times.
- If a column selected in the display configuration is not present in a path/table when filtering, omit that column from the corresponding view.

## Tech Stack

- Vite
- Jazz sync database
- Reference: https://github.com/carlassmann/alkalye, using:
  - Jazz for local-first sync and encryption
  - Astro 5 + React 19
  - TanStack Router for routing
  - Tailwind CSS 4 + shadcn/ui (base-lyra style)
- Host the app as a demo on Vercel via GitHub import.

## Design
Follow the structure and design of the mockup image as closely as possible.
Use Heroicons (outline).
All corners, except those of arrows, and all line ends should be rounded.
The design should work in both dark and light modes.

## Miscellaneous

Code comments must be in English.
Use only royalty-free elements.
