# QuestionSort PDF

A lightweight, local-first desktop application for sorting exam images by the question numbers printed on them, reviewing the proposed sequence, and exporting a PDF.

**Product principle:** OCR proposes; deterministic checks flag inconsistencies; a person verifies ambiguous decisions. The app must never silently claim an uncertain ordering is correct.

## Project status

**Foundation scaffold.** The current GUI can import image files, preview them, let a person assign question numbers, sort them numerically, flag duplicates and gaps, and rearrange pages manually. OCR integration, durable project saving, and PDF export are not implemented yet. The export control intentionally remains disabled until the actual exporter and verification gate exist.

## Technology

- Tauri 2 desktop shell
- Vanilla TypeScript + Vite UI; no React or UI framework
- Rust for native services and filesystem/PDF work
- Tesseract OCR is the first candidate for a compact local recognition engine; validate against real images before freezing model/language data
- SQLite for saved project state when persistence is implemented
- No cloud processing by default

## Requirements

- Node.js 22 or a compatible current LTS release, with npm
- Rust stable toolchain and Cargo
- Tauri Linux system prerequisites for local desktop builds, including WebKitGTK development packages
- Tesseract OCR will be needed for the OCR milestone, but is not required for the current UI scaffold

## Development

Install the frontend dependencies and launch the UI preview:

    npm install
    npm run dev

The frontend preview is available without compiling the native Rust desktop shell.

For a full desktop build, after installing Rust and the operating system's Tauri prerequisites:

    npm run tauri dev

Type-check and production-build the frontend:

    npm run check
    npm run build

## Privacy and file handling

- Images are opened from the user's local machine and previewed in memory.
- The current prototype does not upload images to a service.
- The current prototype does not delete, rename, or modify source files.
- Persistent project data, OCR, and export are future milestones and must preserve those guarantees.
- Never log image contents or include exam images in telemetry.

## Documentation

- Architecture and boundaries: docs/ARCHITECTURE.md
- Implementation roadmap and acceptance criteria: docs/ROADMAP.md

## License

No license has been selected yet. Do not redistribute this project until its license and repository visibility have been explicitly chosen by the owner.
