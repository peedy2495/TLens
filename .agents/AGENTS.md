# DLens agent routing

Keep default context small. Read only the instructions needed for the current task.

## Global rules

- Treat the current implementation and tests as the primary evidence for current behavior. There is no separate product specification.
- Existing behavior may be questioned or changed when the task, product value, correctness, maintainability, security, or performance gives a good reason. Preserve user data unless destructive behavior is explicit.
- Inspect Git history only when it resolves a concrete uncertainty. Historical requirements are not active instructions.
- Do not use obsolete mockups or historical screenshots as requirements. For UI work, use the current implemented UI and existing design system/patterns as the design reference.
- Code comments must be in English. Use Node.js 22 where repository tooling requires Node.
- Avoid unrelated refactors, speculative abstractions, dependencies, documentation changes, and tests that do not provide meaningful regression protection.
- Run the smallest relevant checks for the changed area. Use broader checks when the risk or scope warrants them.
- Update product/developer documentation only when a change materially affects behavior, configuration, supported workflows, public interfaces, or architecture that users/developers need to understand.
- Do not update `.agents/` as a side effect of normal implementation work. Change agent instructions only when explicitly requested.

## Skill routing

Load a skill only when its scope is materially relevant. Mixed tasks may load multiple skills, but do not load adjacent skills "just in case".

- Cross-cutting product identity or behavior: `.agents/skills/product-behavior/SKILL.md`
- File import, parsing, normalization, large-file ingestion: `.agents/skills/data-ingestion/SKILL.md`
- SQLite/OPFS, repositories, schemas, persistence, migrations, quota: `.agents/skills/persistence/SKILL.md`
- Database/API/HTTP connectors and connector contracts: `.agents/skills/connectors/SKILL.md`
- UI components, interaction, styling, accessibility, responsive behavior: `.agents/skills/ui/SKILL.md`
- Test strategy, test infrastructure, or substantial test-only work: `.agents/skills/testing/SKILL.md`
- Delegated implementation through OpenCode/Muse: `.agents/skills/opencode-executor/SKILL.md`

## Context discipline

- Inspect relevant implementation before loading reference material.
- Load a reference only when it answers a concrete question raised by the task or implementation.
- Do not read every reference in a skill by default.
- Prefer focused plans for local work. Use architecture-level planning only when interfaces, persistence semantics, multiple subsystems, security boundaries, or migration behavior require it.
