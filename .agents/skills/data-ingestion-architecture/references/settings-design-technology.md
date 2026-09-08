# Settings, Design, Technology, and Deployment

## Settings sections

Group settings into:

### Allgemein / General

- language selection
- currently German and English

### Anzeige / Display

- timeline visibility
- start/end field mappings
- color-field selection

### Datenquellen / Data sources

- CSV format settings
- Jazz configuration
- database name
- action to copy current source into Jazz
- indication of future database adapters

When the SQLite migration is implemented, update this section deliberately
rather than silently deleting Jazz-related behavior. Distinguish current and
target storage in UI/documentation during transition.

## Design

- Follow `Mokup.png` structure/design as closely as possible.
- Use Heroicons outline.
- All corners except arrows should be rounded.
- All line ends should be rounded.
- Support dark and light modes.
- Support responsive layouts.

## Technology

Current stack:

- Vite
- Astro 5
- React 19
- TanStack Router
- Tailwind CSS 4

Current local-first database technology:

- Jazz sync database
- reference implementation:
  `https://github.com/carlassmann/alkalye`
- current prototype uses an anonymous local account without network sync
- copied Jazz data persists locally
- authentication and cross-device sync are future work
- new accounts start empty

UI target:

- retain shadcn/ui `base-lyra` design target
- current implementation uses custom rounded components and Base UI Dialog
- a complete shadcn/base-lyra component set is not installed

## Deployment

Demo hosting target:

- Vercel via GitHub import
- Astro
- build command: `npm run build`
- output directory: `dist`

Deployment configuration exists.

Do not describe deployment as completed unless it has actually been verified.
