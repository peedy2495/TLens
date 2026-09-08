# DLens Product and Workflow Requirements

## Identity

DLens is a tool for filtering and displaying hierarchical data structures as
well as relational data.

Use:

- `DLens` in UI, logos, metadata, code, and documentation
- `Data Explorer` as the product descriptor in the header and page title
- `dlens` for package names, export filenames, and new browser preference keys

Preserve rename compatibility:

- read legacy `tlens-` preferences as fallback when no `dlens-` value exists
- do not recreate or clear the Jazz database during renaming
- historical mockups and the existing repository directory may retain the old
  name

## Documentation and development workflow

Maintain both `README.md` and root `AGENTS.md` alongside future feature,
behavior, configuration, and workflow changes.

- README: usage and current implementation
- AGENTS: requirements and development guidance

When reorganizing documentation:

- preserve existing requirements
- distinguish implemented behavior from planned capabilities
- inspect implementation and, where needed, commit history to resolve unclear
  behavior

Other rules:

- code comments must be in English
- use only royalty-free elements
- use Node.js 22
- run relevant tests with `npm test`
- verify application changes with `npm run build` as appropriate
