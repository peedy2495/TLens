---
name: testing
description: Test strategy, test infrastructure and substantial test-only work. Ordinary feature work should use focused existing tests without loading this skill unless testing itself is the task.
---

# Testing

- Add or update tests when they provide meaningful regression protection for changed behavior or risk.
- Prefer focused tests near the affected behavior; expand to broader suites when scope/risk warrants it.
- Do not add tests merely to satisfy a blanket "every change needs a test" rule.
- For persistence/import work, prioritize failure, cancellation, rollback/data-preservation and boundary cases when relevant.
- For UI work, test externally observable behavior rather than incidental implementation details.
- Reuse existing fixtures/helpers before creating new test infrastructure.
- Keep meaningful browser regressions in tracked tests or `scripts/`, with a reproducible command and isolated fixtures/profiles. Temporary probes are exploratory evidence, not durable regression coverage; retain a focused check when it protects a recurring failure.
