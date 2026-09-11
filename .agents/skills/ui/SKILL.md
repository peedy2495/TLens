---
name: ui
description: DLens UI components, interaction, styling, accessibility and responsive behavior. Use the implemented application as the design reference.
---

# UI

- Treat the existing implemented UI and existing component/design-system patterns as the primary design reference.
- Do not use obsolete mockups, historical screenshots, old pixel measurements or historical agent requirements as design specifications.
- Reuse existing components and interaction patterns before introducing one-off variants.
- Preserve applicable light/dark, responsive, keyboard and accessibility behavior.
- Derive exact spacing, colors, icon geometry and state styling from neighboring implementation/design tokens unless the task explicitly changes them.
- Avoid broad visual redesign during a focused functional change unless it is required by the task.

## Context menus and separate windows

- For pointer-triggered context menus, position at the pointer in viewport coordinates; account for transformed ancestors, scrolling, clipping and the measured menu size. Check actual browser geometry in centered/scrolled dialogs and near viewport edges. Preserve keyboard anchoring, focus scope and Escape behavior.
- For separate-window UI, define shared-state and resource ownership so child windows do not create competing storage writers. Cover deliberate child close versus parent reload/close, orphan cleanup, preference restoration, blocked popups and synchronization of controls, styles, theme and language. Request a popup-style window but do not promise to override browser window/tab preferences.
