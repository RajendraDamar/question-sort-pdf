# Roadmap and acceptance criteria

## Phase 0 — Foundation scaffold

- [x] Tauri 2 + vanilla TypeScript scaffold
- [x] Responsive GUI foundation
- [x] Batch image import, thumbnails, manual numbering, stable numeric sorting, and reorder controls
- [x] Warnings for unassigned numbers, duplicates, and possible gaps
- [x] Original images remain untouched
- [ ] Native app compile verified on target OSes
- [ ] OCR, persistence, and PDF export implemented

## Phase 1 — Import and project model

- Support JPG/JPEG, PNG, and WebP.
- Preserve source name, modification metadata, an optional parsed WhatsApp timestamp, and a cryptographic content hash.
- Detect identical content independently from filename/size collisions.
- Add reopenable projects and an auditable manifest.
- Never rename source files.

**Acceptance:** every input is accounted for exactly once or explicitly excluded; large bundles do not require all full-resolution images to be resident in memory.

## Phase 2 — Local OCR

- Benchmark Tesseract using suitable compact models on representative exam photos.
- Read question numbers using text, location, and surrounding context.
- Keep raw recognition evidence.
- Retry with alternate preprocessing only when it adds useful evidence.
- Validate Indonesian/English accuracy, offline packaging, license, and size before selecting default language data.

**Acceptance:** every detection is reproducible and traceable to a source image and text/region evidence.

## Phase 3 — Resolution and verification

- Deterministic numeric ordering is the normal path.
- Detect duplicates, possible gaps, unreadable labels, unnumbered cover/diagram pages, and likely continuation pages.
- Add an optional vision model only if benchmark results show a meaningful improvement; never bundle it in the base installer.
- Provide visual preview, direct correction, and keyboard-accessible manual reorder.
- Keep final verification closed until flagged ambiguities are resolved by a person.

**Acceptance:** model agreement and OCR confidence are never represented as proof of correctness.

## Phase 4 — PDF export

- Generate pages in the exact approved sequence.
- Preserve source image quality where practical; handle orientation and page sizing deliberately.
- Validate PDF page count and source-to-output mapping.
- Save to a new destination without overwriting input files.
- Reopen/inspect the final file before reporting success.

**Acceptance:** output has a manifest of the approved ordering and a validated export.

## Phase 5 — Packaging and performance

- Build release bundles for each target OS.
- Add reproducible CI and smoke checks.
- Measure installer size, launch time, idle memory, OCR peak memory, and processing time on a representative bundle.
- Decide whether to bundle Tesseract or detect a host install based on measured size and ease of use.

**Acceptance:** documented dependencies, tested installation/upgrade path, no unexpected network calls, and passing regression tests.
