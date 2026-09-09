# Festival Demo Data

- `public/demo/weitklang-festival-tag2-2026-09-08.json` is a separate fixed-date
  variant with festival day 2 on September 8, 2026.
- Only dates, including day-group keys, are shifted.
- All other content and the original demo remain unchanged.
- This variant must be imported explicitly.
- It does not automatically track today's date.
- No dedicated demo-loading action is shown in the UI. Import generated JSON
  through the regular file picker or drag-and-drop. Preserve the generator.
- Regenerate the main demo with:

```bash
node scripts/generate-festival.mjs
```

The script writes:

```text
public/demo/weitklang-festival-2027.json
```

Preserve stable resource IDs and nested people/equipment in event records so
recursive filtering continues to find associated events.
