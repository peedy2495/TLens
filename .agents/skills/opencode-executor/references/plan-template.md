# Goal

State Ready or Completed and the exact observable end state. Replace all guidance
with repository-specific decisions before handoff; use "not applicable" where apt.

# Current Architecture

- Relevant modules/components and their current responsibilities.
- Existing data/control flows, public interfaces/types, persistence and utilities.
- Existing patterns and tests to preserve; name concrete symbols and files.

# Constraints

- Dirty/staged/untracked baseline and known verification failures.
- Preserved behavior, immutable APIs, architecture boundaries, performance/security.
- Side-effect and persistence restrictions; authorized effort (default medium).
- Explicitly prohibited changes; no unrelated refactors or dependencies.

# Design Decisions

## Decision 1: Name the question

Chosen solution: exact behavior, signatures/types and component boundary.
Reason: repository-specific rationale.
Do not use: rejected alternatives and the relevant tradeoff.

# File Changes

## `path/to/existing-file.ts`

Current role: responsibility and relevant existing symbols.
Required changes:
- Name each function/class/component changed and its exact contract changes.
- Specify parameters/returns/types, state transitions and existing utilities used.
Do not: signatures/behavior/abstractions that must remain untouched.

# New Files

## `path/to/new-file.ts`

Purpose: one concrete responsibility.
Required exports: names and signatures/types with input/output behavior.
Dependencies: allowed existing modules/packages.
Do not: prohibited responsibilities or abstractions.

# Data Flow

1. Entry point and input data shape.
2. Validation, processing and component interfaces.
3. Persistence/read results and ownership.
4. Return path, UI states and side effects.

Include control ordering, async cancellation/staleness/concurrency and lifecycle
cleanup when relevant. Specify no persistence changes explicitly if appropriate.

# Error Handling

- Concrete trigger -> existing error type/message -> caller/UI behavior.
- Retry/cancel/rollback/state-reset behavior and preserved data.
- No silent failures or unplanned error types.

# Edge Cases

- Empty/missing/invalid inputs; boundary conditions and limits.
- Async ordering, repeated actions, stale state and relevant failure conditions.

# Implementation Tasks

## 1. Concrete task

Files:
- Exact existing/new paths.

Exact changes:
1. Named symbols and deterministic changes.
2. Required state/data/control flow and side effects.

Expected result:
- Observable output/behavior.

Verification:
- Exact command/check and expected outcome.

Dependencies:
- none | Task N

# Tests

## Existing tests to update

- Exact path and cases to add/modify; preserve existing coverage.

## New test cases

1. Happy path: setup -> action -> expected result.
2. Edge case: setup -> action -> expected result.
3. Failure case: setup -> action -> expected error/state/data preservation.

Specify fixtures, meaningful assertions and which acceptance criteria they prove.

# Verification Commands

Run in order; record exact outcomes and any explicitly accepted baseline exception:
1. Focused checks.
2. Relevant full checks (npm test, npm run build includes typecheck; no lint script).
3. Applicable browser checks and git diff --check.
4. Muse self-review: complete diff/staged/new files versus baseline, correctness,
   security, architecture, scope and each acceptance criterion; fix ordinary issues.

# Acceptance Criteria

- [ ] Concrete observable requirement with verification evidence.
- [ ] Required checks complete and Muse self-review complete.
- [ ] Compact `.agents/IMPLEMENTATION_REPORT.md` with actual status and deviations.

# Out of Scope

- Explicit excluded features, APIs, data changes and neighboring refactors.
