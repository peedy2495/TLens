---
name: product-behavior
description: Cross-cutting DLens product identity and behavior that cannot be localized to a technical skill. Do not use for ordinary implementation details that can be inferred from current code.
---

# Product behavior

Use this skill only when a task changes behavior spanning multiple product areas or product identity.

## Stable rules

- Product name: `DLens`. Use `Data Explorer` as the product descriptor where the application currently exposes one.
- Use `dlens` for new package/export/preference identifiers. Preserve compatibility with existing `tlens-` preferences when that compatibility still exists in the implementation.
- Preserve user data by default. Destructive reset/removal behavior must be explicit and scoped.
- Existing behavior is evidence, not an immutable specification. Prefer simpler or safer behavior when there is a concrete reason to change it.
- Do not turn this skill into a feature catalogue. Feature-level behavior belongs in implementation/tests and product documentation when it is useful to users or developers.

## Sources of truth

1. The explicit task/user requirement.
2. Current implementation and tests.
3. Current product/developer documentation when it describes a public workflow or contract.
4. Git history only to resolve a concrete ambiguity.

Historical agent instructions and obsolete mockups are not normative.
