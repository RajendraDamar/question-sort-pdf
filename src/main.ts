import { invoke, isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { inspectNumbering, sortByQuestionNumber, type NumberedPage } from "./domain/ordering";

interface NativeImageInfo {
  path: string;
  file_name: string;
  file_size: number;
  width: number;
  height: number;
  thumbnail_base64: string;
}
interface NumberCandidate {
  number: number;
  confidence: number;
  evidence: string;
  top_ratio: number;
  left_ratio: number;
}
interface OcrResult {
  question_number: number | null;
  confidence: number | null;
  evidence: string;
  candidates: NumberCandidate[];
  engine: string;
}
interface PdfExportResult {
  output_path: string;
  page_count: number;
  file_size: number;
}
type OcrState = "idle" | "processing" | "found" | "not-found" | "error";
type NumberSource = "manual" | "ocr" | null;

interface ImportedPage extends NumberedPage {
  file: File | null;
  path: string | null;
  fileName: string;
  previewUrl: string;
  previewObjectUrl: boolean;
  fileSize: number;
  width: number | null;
  height: number | null;
  ocrState: OcrState;
  ocrConfidence: number | null;
  ocrEvidence: string;
  candidates: NumberCandidate[];
  numberSource: NumberSource;
}

const desktopMode = isTauri();
const fileInput = document.querySelector<HTMLInputElement>("#file-input")!;
const chooseImagesButton = document.querySelector<HTMLButtonElement>("#choose-images")!;
const addMoreButton = document.querySelector<HTMLButtonElement>("#add-more")!;
const dropzone = document.querySelector<HTMLElement>("#dropzone")!;
const dropzoneCopy = document.querySelector<HTMLElement>(".dropzone-copy")!;
const fileHint = document.querySelector<HTMLElement>(".file-hint")!;
const importPanel = document.querySelector<HTMLElement>("#import-panel")!;
const reviewSection = document.querySelector<HTMLElement>("#review-section")!;
const imageGrid = document.querySelector<HTMLElement>("#image-grid")!;
const bundleStats = document.querySelector<HTMLElement>("#bundle-stats")!;
const reviewNotice = document.querySelector<HTMLElement>("#review-notice")!;
const sortButton = document.querySelector<HTMLButtonElement>("#sort-images")!;
const detectButton = document.querySelector<HTMLButtonElement>("#detect-numbers")!;
const exportButton = document.querySelector<HTMLButtonElement>("#export-pdf")!;
const confirmOrder = document.querySelector<HTMLInputElement>("#confirm-order")!;
const clearButton = document.querySelector<HTMLButtonElement>("#clear-bundle")!;
const toast = document.querySelector<HTMLElement>("#toast")!;

let pages: ImportedPage[] = [];
let nextOriginalIndex = 0;
let toastTimer = 0;
let isDetecting = false;
let isExporting = false;

if (desktopMode) {
  dropzoneCopy.textContent = "Pilih foto soal dari komputer. Kamu bisa memilih banyak gambar sekaligus.";
  fileHint.textContent = "JPG, PNG, atau WebP · Pilihan banyak gambar didukung";
  detectButton.title = "Kenali nomor soal menggunakan OCR lokal";
  exportButton.title = "Simpan urutan yang sudah diperiksa sebagai PDF";
} else {
  detectButton.title = "Deteksi otomatis tersedia di aplikasi desktop";
  exportButton.title = "Simpan PDF tersedia di aplikasi desktop";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    };
    return entities[char] ?? char;
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function showToast(message: string, duration = 3600): void {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, duration);
}

function resetReviewConfirmation(): void {
  confirmOrder.checked = false;
  updateExportState();
}

function updateExportState(): void {
  exportButton.disabled =
    !desktopMode ||
    pages.length === 0 ||
    !confirmOrder.checked ||
    pages.some((page) => !page.path) ||
    isExporting;
  detectButton.disabled = !desktopMode || pages.length === 0 || isDetecting;
  sortButton.disabled = pages.length === 0;
  confirmOrder.disabled = pages.length === 0 || isDetecting || isExporting;
}

function releasePreview(page: ImportedPage): void {
  if (page.previewObjectUrl) URL.revokeObjectURL(page.previewUrl);
}

function addBrowserFiles(fileList: FileList | File[]): void {
  const incoming = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
  if (!incoming.length) {
    showToast("Pilih berkas gambar seperti JPG, PNG, atau WebP.");
    return;
  }

  const known = new Set(pages.map((page) => page.file ? page.file.name + ":" + page.file.size + ":" + page.file.lastModified : page.path));
  const unique = incoming.filter((file) => {
    const key = file.name + ":" + file.size + ":" + file.lastModified;
    if (known.has(key)) return false;
    known.add(key);
    return true;
  });

  for (const file of unique) {
    pages.push({
      id: crypto.randomUUID(),
      file,
      path: null,
      fileName: file.name,
      previewUrl: URL.createObjectURL(file),
      previewObjectUrl: true,
      fileSize: file.size,
      width: null,
      height: null,
      questionNumber: null,
      originalIndex: nextOriginalIndex++,
      ocrState: "idle",
      ocrConfidence: null,
      ocrEvidence: "",
      candidates: [],
      numberSource: null,
    });
  }

  resetReviewConfirmation();
  if (incoming.length > unique.length) showToast((incoming.length - unique.length) + " gambar duplikat dilewati.");
  render();
}

async function addNativePaths(rawPaths: string[]): Promise<void> {
  const existingPaths = new Set(pages.map((page) => page.path).filter((path): path is string => path !== null));
  const paths = [...new Set(rawPaths)].filter((path) => !existingPaths.has(path));
  if (!paths.length) {
    showToast("Semua gambar yang dipilih sudah ada di kumpulan ini.");
    return;
  }
  if (pages.length + paths.length > 1000) {
    showToast("Satu kumpulan dibatasi hingga 1.000 gambar.");
    return;
  }

  let added = 0;
  const failures: string[] = [];
  for (const [index, path] of paths.entries()) {
    try {
      const info = await invoke<NativeImageInfo>("inspect_image", { path });
      pages.push({
        id: crypto.randomUUID(),
        file: null,
        path: info.path,
        fileName: info.file_name,
        previewUrl: "data:image/jpeg;base64," + info.thumbnail_base64,
        previewObjectUrl: false,
        fileSize: info.file_size,
        width: info.width,
        height: info.height,
        questionNumber: null,
        originalIndex: nextOriginalIndex++,
        ocrState: "idle",
        ocrConfidence: null,
        ocrEvidence: "",
        candidates: [],
        numberSource: null,
      });
      added += 1;
    } catch (error) {
      failures.push(path.split(/[\\/]/).pop() + ": " + String(error));
    }

    // Keep one batch import lightweight: update progress in the toast, render
    // all thumbnails once at the end instead of rebuilding an ever-growing grid.
    if ((index + 1) % 10 === 0 || index === paths.length - 1) {
      showToast("Memuat gambar " + (index + 1) + " dari " + paths.length + "…", 1400);
    }
  }
  resetReviewConfirmation();
  render();
  if (failures.length) {
    showToast(
      "Berhasil memuat " + added + " gambar. " + failures.length +
      " gambar tidak dapat dibuka: " + failures.slice(0, 3).join(" · ") +
      (failures.length > 3 ? " · dan " + (failures.length - 3) + " lainnya." : ""),
      8000,
    );
  } else {
    showToast(added + " gambar berhasil dimuat. Periksa semua foto sebelum mengurutkan.", 4200);
  }
}

async function chooseImages(): Promise<void> {
  if (!desktopMode) {
    fileInput.click();
    return;
  }

  try {
    const selected = await open({
      multiple: true,
      directory: false,
      title: "Pilih foto soal",
      filters: [{ name: "Gambar soal", extensions: ["jpg", "jpeg", "png", "webp"] }],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    await addNativePaths(paths);
  } catch (error) {
    showToast("Jendela pemilihan gambar gagal dibuka: " + String(error), 5200);
  }
}

function removePage(id: string): void {
  const page = pages.find((item) => item.id === id);
  if (page) releasePreview(page);
  pages = pages.filter((item) => item.id !== id);
  resetReviewConfirmation();
  render();
}

function clearBundle(): void {
  for (const page of pages) releasePreview(page);
  pages = [];
  nextOriginalIndex = 0;
  fileInput.value = "";
  confirmOrder.checked = false;
  render();
}

function statusText(page: ImportedPage): string {
  if (page.ocrState === "processing") return "Sedang membaca…";
  if (page.ocrState === "error") return "OCR gagal";
  if (page.ocrState === "not-found") return "Nomor belum terbaca";
  if (page.numberSource === "ocr") return "Hasil OCR · periksa";
  if (page.numberSource === "manual") return "Diisi manual";
  return "Perlu nomor";
}

function renderPage(page: ImportedPage, visualIndex: number): HTMLElement {
  const card = document.createElement("article");
  card.className = "image-card";
  card.draggable = true;
  card.dataset.pageId = page.id;
  const numberText = page.questionNumber === null ? "" : String(page.questionNumber);
  const isNumbered = page.questionNumber !== null;
  const safeName = escapeHtml(page.fileName);
  const safePreview = escapeHtml(page.previewUrl);
  const status = statusText(page);
  const statusClass = page.ocrState === "error" || page.ocrState === "not-found" || !isNumbered
    ? "is-empty"
    : page.numberSource === "ocr" ? "is-ocr" : "is-set";
  const details = page.ocrEvidence
    ? '<div class="ocr-evidence"><span>Bacaan OCR</span><p>' + escapeHtml(page.ocrEvidence) + '</p>' +
      (page.ocrConfidence !== null ? '<small>Keyakinan mesin: ' + page.ocrConfidence.toFixed(0) + '% · tetap perlu diperiksa</small>' : '') +
      (page.candidates.length > 1 ? '<small>Kandidat lain: ' + page.candidates.slice(1, 6).map((item) => item.number).join(", ") + '</small>' : '') +
      '</div>'
    : '';

  card.innerHTML =
    '<div class="image-card-top">' +
      '<span class="position-badge">' + String(visualIndex + 1).padStart(2, "0") + '</span>' +
      '<button class="remove-page" type="button" aria-label="Hapus ' + safeName + '" title="Hapus gambar">' +
        '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m6 6 8 8m0-8-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' +
      '</button>' +
    '</div>' +
    '<div class="image-preview">' +
      '<img src="' + safePreview + '" alt="Pratinjau ' + safeName + '" loading="lazy" />' +
    '</div>' +
    '<div class="image-card-body">' +
      '<div class="file-name" title="' + safeName + '">' + safeName + '</div>' +
      '<div class="file-meta">' + formatBytes(page.fileSize) + (page.width && page.height ? ' <span class="meta-dot">·</span> ' + page.width + ' × ' + page.height + ' px' : '') + '</div>' +
      '<label class="number-field-label" for="question-' + page.id + '">Nomor soal</label>' +
      '<div class="number-field-row">' +
        '<input id="question-' + page.id + '" class="number-input" type="number" min="1" max="9999" step="1" inputmode="numeric" placeholder="—" value="' + numberText + '" aria-label="Nomor soal untuk ' + safeName + '" />' +
        '<span class="number-status ' + statusClass + '">' + status + '</span>' +
      '</div>' +
      details +
      '<div class="card-order-controls">' +
        '<button class="move-page" type="button" data-direction="-1" aria-label="Geser lebih awal" title="Geser lebih awal" ' + (visualIndex === 0 ? "disabled" : "") + '><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 12 5-5 5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
        '<button class="move-page" type="button" data-direction="1" aria-label="Geser lebih akhir" title="Geser lebih akhir" ' + (visualIndex === pages.length - 1 ? "disabled" : "") + '><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 8 5 5 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
        '<span class="drag-hint">Seret untuk mengurutkan</span>' +
      '</div>' +
    '</div>';

  card.querySelector<HTMLButtonElement>(".remove-page")?.addEventListener("click", () => removePage(page.id));
  const numberInput = card.querySelector<HTMLInputElement>(".number-input")!;
  numberInput.addEventListener("change", () => {
    const raw = numberInput.value.trim();
    const parsed = raw ? Number(raw) : Number.NaN;
    page.questionNumber = Number.isInteger(parsed) && parsed >= 1 && parsed <= 9999 ? parsed : null;
    page.numberSource = page.questionNumber === null ? null : "manual";
    if (raw && page.questionNumber === null) showToast("Masukkan nomor bulat antara 1 dan 9.999.");
    resetReviewConfirmation();
    render();
  });

  card.querySelectorAll<HTMLButtonElement>(".move-page").forEach((button) => {
    button.addEventListener("click", () => movePage(page.id, Number(button.dataset.direction)));
  });

  card.addEventListener("dragstart", (event) => {
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", page.id);
    }
    card.classList.add("is-dragging");
  });
  card.addEventListener("dragend", () => {
    card.classList.remove("is-dragging");
    imageGrid.querySelectorAll(".is-drop-target").forEach((element) => element.classList.remove("is-drop-target"));
  });
  card.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    card.classList.add("is-drop-target");
  });
  card.addEventListener("dragleave", (event) => {
    if (!card.contains(event.relatedTarget as Node | null)) card.classList.remove("is-drop-target");
  });
  card.addEventListener("drop", (event) => {
    event.preventDefault();
    card.classList.remove("is-drop-target");
    const sourceId = event.dataTransfer?.getData("text/plain");
    if (sourceId && sourceId !== page.id) movePageTo(sourceId, page.id);
  });

  return card;
}

function movePage(id: string, direction: number): void {
  const index = pages.findIndex((page) => page.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= pages.length) return;
  const page = pages.splice(index, 1)[0];
  pages.splice(target, 0, page);
  resetReviewConfirmation();
  render();
}

function movePageTo(sourceId: string, targetId: string): void {
  const from = pages.findIndex((page) => page.id === sourceId);
  const to = pages.findIndex((page) => page.id === targetId);
  if (from < 0 || to < 0 || from === to) return;
  const page = pages.splice(from, 1)[0];
  pages.splice(to, 0, page);
  resetReviewConfirmation();
  render();
}

function renderNotice(): void {
  const report = inspectNumbering(pages);
  const messages: string[] = [];
  if (report.unnumberedPageIds.length) messages.push(report.unnumberedPageIds.length + " gambar belum memiliki nomor soal.");
  if (report.duplicateNumbers.length) messages.push("Nomor berulang: " + report.duplicateNumbers.join(", ") + ".");
  if (report.missingNumbers.length) {
    const shown = report.missingNumbers.slice(0, 8).join(", ");
    messages.push("Kemungkinan nomor terlewat di antara nomor terkecil dan terbesar: " + shown +
      (report.missingNumbers.length > 8 ? ", …" : "") + ". Pastikan apakah ini memang disengaja.");
  }
  if (isDetecting) messages.push("Deteksi nomor sedang berlangsung. Tunggu hingga semua gambar selesai diproses.");

  if (!messages.length) {
    reviewNotice.className = "review-notice is-positive";
    reviewNotice.innerHTML = '<span class="notice-icon" aria-hidden="true">✓</span><div><strong>Penomoran tampak konsisten</strong><p>Tetap periksa gambar dan urutan akhirnya. Nilai OCR dan pemeriksaan nomor bukan jaminan bahwa urutan sudah benar.</p></div>';
    return;
  }

  reviewNotice.className = "review-notice is-attention";
  reviewNotice.innerHTML = '<span class="notice-icon" aria-hidden="true">!</span><div><strong>Perlu diperiksa</strong><p>' +
    messages.map(escapeHtml).join(" ") +
    ' Celah nomor tidak selalu berarti ada gambar yang hilang.</p></div>';
}

function render(): void {
  const hasPages = pages.length > 0;
  importPanel.hidden = hasPages;
  reviewSection.hidden = !hasPages;

  if (hasPages) {
    const numberedCount = pages.filter((page) => page.questionNumber !== null).length;
    bundleStats.innerHTML =
      '<span class="stat-chip"><strong>' + pages.length + '</strong> gambar</span>' +
      '<span class="stat-divider" aria-hidden="true"></span>' +
      '<span class="stat-chip"><strong>' + numberedCount + '</strong> sudah bernomor</span>' +
      '<span class="stat-divider" aria-hidden="true"></span>' +
      '<span class="stat-chip"><strong>' + (pages.length - numberedCount) + '</strong> perlu diperiksa</span>';

    imageGrid.replaceChildren(...pages.map((page, index) => renderPage(page, index)));
    renderNotice();
  }
  updateExportState();
}

async function detectNumbers(): Promise<void> {
  if (!desktopMode) {
    showToast("Deteksi OCR tersedia di aplikasi desktop QuestionSort PDF, bukan di pratinjau peramban.");
    return;
  }
  if (isDetecting || !pages.length) return;

  isDetecting = true;
  resetReviewConfirmation();
  detectButton.textContent = "Sedang membaca…";
  detectButton.disabled = true;
  let completed = 0;
  let detected = 0;
  render();

  try {
    for (const page of pages) {
      if (page.path && page.numberSource !== "manual") {
        page.ocrState = "processing";
        try {
          const result = await invoke<OcrResult>("detect_question_number", { path: page.path });
          page.candidates = result.candidates ?? [];
          page.ocrConfidence = result.confidence;
          page.ocrEvidence = result.evidence;
          if (result.question_number !== null && result.question_number !== undefined) {
            page.questionNumber = result.question_number;
            page.numberSource = "ocr";
            page.ocrState = "found";
            detected += 1;
          } else {
            page.questionNumber = null;
            page.numberSource = null;
            page.ocrState = "not-found";
          }
        } catch (error) {
          page.ocrState = "error";
          page.ocrEvidence = String(error);
        }
      }

      completed += 1;
      // Avoid rebuilding the entire grid after every image in large bundles.
      if (completed % 5 === 0 || completed === pages.length) {
        render();
        showToast("Membaca gambar " + completed + " dari " + pages.length + "…", 1500);
      }
    }

    pages = sortByQuestionNumber(pages);
    render();
    showToast("Deteksi selesai: " + detected + " dari " + pages.length + " gambar memiliki kandidat nomor. Periksa hasilnya satu per satu.", 6000);
  } finally {
    isDetecting = false;
    detectButton.innerHTML = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M8.5 3.5H4.2c-.4 0-.7.3-.7.7v4.3m8-5h4.3c.4 0 .7.3.7.7v4.3m-5 8h4.3c.4 0 .7-.3.7-.7v-4.3m-8 5H4.2c-.4 0-.7-.3-.7-.7v-4.3M6.5 7.5h7v5h-7z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg> Deteksi nomor otomatis';
    resetReviewConfirmation();
    render();
  }
}

async function exportPdf(): Promise<void> {
  if (!desktopMode) {
    showToast("Simpan PDF tersedia setelah aplikasi desktop terpasang.");
    return;
  }
  if (!confirmOrder.checked || !pages.length || pages.some((page) => !page.path)) {
    showToast("Periksa urutan akhir dan pastikan gambar sudah dimuat sebelum menyimpan PDF.");
    return;
  }
  if (isExporting) return;

  try {
    const outputPath = await save({
      title: "Simpan PDF soal",
      defaultPath: "Soal-Ujian.pdf",
      filters: [{ name: "Dokumen PDF", extensions: ["pdf"] }],
    });
    if (!outputPath) return;

    isExporting = true;
    exportButton.textContent = "Menyimpan PDF…";
    updateExportState();
    const result = await invoke<PdfExportResult>("export_pdf", {
      imagePaths: pages.map((page) => page.path),
      outputPath,
    });
    showToast("PDF berhasil disimpan: " + result.page_count + " halaman · " + formatBytes(result.file_size) + " · " + result.output_path, 8000);
  } catch (error) {
    showToast("PDF gagal disimpan: " + String(error), 6500);
  } finally {
    isExporting = false;
    exportButton.innerHTML = 'Simpan PDF <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 3.5v9m0 0 3.5-3.5M10 12.5 6.5 9M4 15v1.5h12V15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    updateExportState();
  }
}

chooseImagesButton.addEventListener("click", () => { void chooseImages(); });
addMoreButton.addEventListener("click", () => { void chooseImages(); });
fileInput.addEventListener("change", () => {
  if (fileInput.files) addBrowserFiles(fileInput.files);
  fileInput.value = "";
});

sortButton.addEventListener("click", () => {
  pages = sortByQuestionNumber(pages);
  resetReviewConfirmation();
  render();
  showToast("Gambar diurutkan menurut nomor yang terisi. Periksa nomor berulang dan kesinambungan soal.");
});
detectButton.addEventListener("click", () => { void detectNumbers(); });
exportButton.addEventListener("click", () => { void exportPdf(); });
confirmOrder.addEventListener("change", updateExportState);

clearButton.addEventListener("click", () => {
  if (pages.length && window.confirm("Kosongkan semua gambar dari ruang kerja ini? Berkas asli tidak akan dihapus.")) clearBundle();
});

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("is-drag-over");
});
dropzone.addEventListener("dragleave", (event) => {
  if (!dropzone.contains(event.relatedTarget as Node | null)) dropzone.classList.remove("is-drag-over");
});
dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("is-drag-over");
  if (!desktopMode && event.dataTransfer?.files) addBrowserFiles(event.dataTransfer.files);
});

// Tauri delivers native OS file-drop events with safe absolute paths. This is
// separate from HTML drag-and-drop, which is used to reorder cards in the grid.
if (desktopMode) {
  void getCurrentWebview().onDragDropEvent((event) => {
    const payload = event.payload;
    if (payload.type === "leave") {
      dropzone.classList.remove("is-drag-over");
      return;
    }

    const x = payload.type === "over" || payload.type === "drop" || payload.type === "enter"
      ? payload.position.x / window.devicePixelRatio
      : -1;
    const y = payload.type === "over" || payload.type === "drop" || payload.type === "enter"
      ? payload.position.y / window.devicePixelRatio
      : -1;
    const bounds = dropzone.getBoundingClientRect();
    const insideDropzone = x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;

    if (payload.type === "enter" || payload.type === "over") {
      dropzone.classList.toggle("is-drag-over", insideDropzone);
      return;
    }

    if (payload.type === "drop") {
      dropzone.classList.remove("is-drag-over");
      if (payload.paths.length) void addNativePaths(payload.paths);
    }
  }).catch((error) => {
    showToast("Fitur seret-lepas berkas tidak dapat diaktifkan: " + String(error));
  });
}

window.addEventListener("beforeunload", () => {
  for (const page of pages) releasePreview(page);
});

render();
