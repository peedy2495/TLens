---
name: agent-maintenance
description: Maintain .agents instructions, skill routing, references, and agent workflow design. Use only when changes to agent instructions or skill structure are explicitly requested.
---

# Agent maintenance

Use this skill only for explicit changes to `.agents/`, skill architecture, routing, reference structure, or agent workflow design. It is not part of normal feature implementation.

## Objectives

Optimize for a small default context, precise routing, low duplication, low maintenance overhead, and cache-friendly delegated execution. Prefer removing or narrowing instructions over accumulating more permanent context.

## Sources of truth

- There is no separate product specification in `.agents/`.
- Current implementation and tests are the primary evidence for current product behavior.
- Product/developer documentation records behavior or architecture users/developers actually need to understand; it is not a mandatory mirror of every code change.
- Git history is the source for historical requirements and superseded agent instructions. Do not preserve historical snapshots in active skills merely for traceability.
- Existing behavior and architecture may be questioned when there is a concrete reason; agent instructions must not freeze accidental legacy behavior.

## Instruction architecture

Keep `.agents/AGENTS.md` small. It should contain only:

- global rules that apply to nearly every task;
- routing to narrowly scoped skills;
- minimal context-discipline rules needed before routing.

Do not turn `AGENTS.md` into a product specification, changelog, architecture handbook, UI specification, or workflow transcript.

Put cross-cutting product rules that do not belong to a technical area in a dedicated product-behavior skill rather than expanding `AGENTS.md`.

Create or keep a skill only when it represents a recurring, materially distinct class of work. Prefer narrowly routed skills when that avoids loading irrelevant context, but do not split skills so finely that routing becomes ambiguous or duplicated.

Mixed tasks may load multiple skills when each is materially relevant. Never load adjacent skills merely as precautionary background.

## Skill contents

A skill should contain durable working principles and constraints that are relevant to a substantial share of tasks in its scope.

Do not put into skills:

- historical requirements or superseded behavior;
- one-off feature decisions that are evident from current implementation;
- obsolete mockup or screenshot requirements;
- exact UI pixel/color/icon details unless they are genuine reusable design-system rules;
- transient task state, completed plans, reports, or debugging history;
- instructions to update the skill after ordinary implementation work;
- broad context copied from another skill for convenience.

For UI work, the implemented UI and existing design-system/component patterns are the primary design reference. Do not preserve obsolete mockups as normative context.

## References

Use references only for deeper knowledge that is not needed for most tasks using the parent skill.

- A skill must say when each reference should be read.
- References are loaded on demand to answer a concrete uncertainty or subproblem.
- Do not instruct agents to read all references by default.
- Consolidate overlapping references rather than retaining multiple snapshots of the same rules.
- Remove a reference when its useful content is already obvious from implementation, tests, or a smaller durable rule in the parent skill.

## Context and token discipline

Minimize information loaded before it is needed.

- Inspect the relevant implementation first.
- Load only task-relevant skills.
- Load references only after a concrete question arises or when the task clearly requires that specialized knowledge.
- Inspect Git history only to resolve a concrete uncertainty.
- Avoid persistent catch-all context files such as a continually appended `CONTEXT.md`.
- Do not maintain duplicate summaries of the repository merely to avoid future inspection; stale summaries create more reconciliation work than they save.

When choosing between more permanent instructions and targeted inspection, prefer targeted inspection unless the rule is durable, recurring, and costly to rediscover.

## Cache-friendly design

Keep reusable prompt prefixes stable and deterministic where execution tooling permits it.

- Stable executor/instruction text should precede task-local content.
- Routed skills/references should be included in deterministic path order.
- Dynamic task text, plans, diffs, test output, timestamps, run IDs, and other changing material should come after stable context whenever practical.
- Do not rewrite stable skill text merely to record completed work; unnecessary edits reduce cache reuse and create instruction churn.
- Prompt caching is an optimization, not a reason to load irrelevant context. Routing and fewer agent/tool turns take priority over maximizing cacheable prefix size.

For changes to delegated OpenCode/Muse execution, also load `.agents/skills/opencode-executor/SKILL.md`; executor-specific contracts belong there rather than being duplicated here.

## Planning and delegated execution

Prefer focused plans for local implementation. Require architecture-level detail only when the task materially affects interfaces, persistence semantics, multiple coupled subsystems, security/concurrency boundaries, or migrations.

For delegated execution:

- Codex performs routing and resolves only material uncertainty required for handoff.
- The executor receives only explicitly selected task skills/references plus the task plan/contract.
- Do not make the delegated executor reread global project instructions already resolved by the router when the workflow can safely disable that ambient context.
- Stable routed instructions should precede the dynamic plan in the handoff.
- Do not add automatic retry, model fallback, escalating reasoning effort, duplicate full review, or repeated repository traversal as default behavior.
- A successful delegated run should not trigger a second full review unless risk or the user explicitly warrants it.

## Maintenance behavior

Normal implementation must not modify `.agents/` as a side effect. Change agent instructions only when explicitly requested or when the explicit task is agent/workflow maintenance.

When maintaining `.agents/`:

1. Identify the concrete recurring problem the instruction is meant to solve.
2. Prefer editing/removing an existing rule over adding a new overlapping layer.
3. Put the rule at the narrowest scope that reliably reaches relevant tasks.
4. Remove superseded or redundant instructions in the same change.
5. Preserve a single normative location for each rule.
6. Test workflow scripts directly when their behavior changes.
7. Do not update unrelated product documentation merely because agent instructions changed.

## Review criteria

Before finishing an agent-maintenance change, check:

- Does default context stay small?
- Can an unrelated task avoid loading this new instruction?
- Is routing unambiguous?
- Is any rule duplicated elsewhere?
- Are references truly on-demand?
- Did historical or task-local material leak into active instructions?
- Did the change create mandatory documentation/testing/refactoring side work without clear value?
- For delegated execution, is stable context before dynamic context and is ordering deterministic?
- Could an obsolete instruction be deleted instead of adding another precedence rule?

Prefer simplification when answers are unclear.
