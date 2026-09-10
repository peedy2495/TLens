---
name: git
description: Prepare and create commits, push changes, and handle follow-up commits. Use for Git delivery requests, not ordinary implementation or read-only Git inspection.
---

# Git delivery

## Language and commit style

- Write all Git delivery text in English: commit titles and bodies, PR titles and descriptions when requested, and delivery status messages.
- Use a short, descriptive commit title and a brief bullet-point body summarizing the features and adjustments at a high level.
- Focus on observable changes. Omit implementation detail, lengthy explanations, test logs, and conversation history from commit messages.
- For a tiny follow-up, a clear title alone is sufficient. Follow an explicitly requested format when provided.

Example:

```text
Improve workspace controls and icons

- Show URL help in a popup
- Reload local files automatically when supported
- Add smooth settings transitions
- Unify workspace and application icons
```

## Scope and completeness

- Inspect working-tree and staged changes before committing; preserve existing user work.
- Include every change belonging to the requested delivery, including relevant documentation, tests, generated assets, and workflow files. Do not silently omit files solely because they are under `.agents/` or are preview artifacts.
- Do not sweep unrelated changes, secrets, or disposable temporary files into a commit. Include requested artifacts; distinguish them from incidental debugging output.
- Check the remaining working-tree changes after committing. State what remains and why; do not claim a clean working tree unless verified.
- When the user asks to include remaining changes, inspect and deliver those changes in a follow-up commit. Do not amend or rewrite an already pushed commit unless explicitly requested.

## Commit and push

- A request to create a commit authorizes creating it; a push request authorizes pushing the intended commits. Do not infer authorization to commit or push from an implementation-only request.
- Reuse authorization already given for the current delivery; do not ask for redundant confirmation. After a push, a request to send the remaining changes authorizes a follow-up commit and push.
- Run `git diff --check` for the pending changes and use existing relevant verification evidence. Do not repeat full test suites solely to create a commit.
- Pass multiline commit messages through a message file, preserving real newlines and literal text.
- Confirm the branch and upstream before pushing. Use a normal push; do not force-push or rewrite history without explicit authorization.
- After completion, report the commit hash, push destination when applicable, and any remaining changes briefly in English. Claim success only after the Git command succeeds.
