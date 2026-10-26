# Architecture

## Goals

1. Keep the install lightweight; do not bundle a vision-language model.
2. Process exam bundles locally by default.
3. Separate OCR, ordering, human review, persistence, and PDF creation.
4. Make uncertainty visible and require review before export.
5. Preserve source images and map every output page back to its source.

## Layers

### Desktop shell

Tauri 2 uses the system WebView and exposes only explicitly registered commands. Permissions should remain narrow; never grant blanket filesystem access.

### UI

The src directory uses plain TypeScript, HTML, and semantic CSS. The UI owns transient state and previews but does not decide that a detected number is trustworthy.

### Domain logic

The src/domain/ordering.ts module implements pure numeric sorting and numbering diagnostics. It intentionally does not use WhatsApp timestamps or filenames as the primary sort key. Timestamps may be retained as supporting metadata.

### Native services (planned)

- **Import:** enumerate supported image files, compute source hashes, and preserve filenames and metadata.
- **Preprocessing:** use disposable working images for orientation, crop, deskew, or contrast improvements without modifying originals.
- **OCR:** return candidate question numbers, bounding boxes, engine/language version, and confidence evidence.
- **Resolver:** apply explicit rules, detect duplicates and possible gaps, and leave unresolved cases unresolved.
- **Review manifest:** record the approved sequence, corrections, review state, source hash, and provenance.
- **PDF export:** render from the approved sequence and validate output count and source-to-page mapping.

### Storage (planned)

Use SQLite for project records and a portable manifest. Avoid storing full-resolution image bytes in the database; do not run a persistent service.

## Ordering contract

- Compare question numbers numerically (2 comes before 10).
- Treat missing or ambiguous numbers as unresolved, not zero.
- Stable-sort duplicates and flag them for human review.
- A numbering gap is a warning, not proof of a missing page.
- Cover pages, diagrams, unnumbered pages, and continuation pages need an explicit reviewed placement.
- Never mark the sequence verified while unresolved decisions remain.
- Retain source-to-output mapping for every exported page.

## Weight budget

- No React/Vue runtime or component framework.
- No bundled VLM, Ollama, Python runtime, or model server.
- Prefer one compact OCR engine and only the language data actually required.
- Process image files incrementally; downsample disposable OCR copies where appropriate.
- Measure release size, cold start, idle memory, and peak processing memory before claiming a specific footprint.

## Security

- Do not store absolute repo paths as durable IDs.
- Escape filenames before putting them into HTML.
- Limit Tauri permissions to user-selected import, project, and export locations.
- Normal processing should not need network access. Any remote model integration must be a separately opted-in future feature.
