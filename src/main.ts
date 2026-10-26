import { inspectNumbering, sortByQuestionNumber, type NumberedPage } from "./domain/ordering";

interface ImportedPage extends NumberedPage {
  file: File;
  previewUrl: string;
  fileSize: number;
}

const fileInput = document.querySelector<HTMLInputElement>("#file-input")!;
const chooseImagesButton = document.querySelector<HTMLButtonElement>("#choose-images")!;
const addMoreButton = document.querySelector<HTMLButtonElement>("#add-more")!;
const dropzone = document.querySelector<HTMLElement>("#dropzone")!;
const importPanel = document.querySelector<HTMLElement>("#import-panel")!;
const reviewSection = document.querySelector<HTMLElement>("#review-section")!;
const imageGrid = document.querySelector<HTMLElement>("#image-grid")!;
const bundleStats = document.querySelector<HTMLElement>("#bundle-stats")!;
const reviewNotice = document.querySelector<HTMLElement>("#review-notice")!;
const sortButton = document.querySelector<HTMLButtonElement>("#sort-images")!;
const clearButton = document.querySelector<HTMLButtonElement>("#clear-bundle")!;
const toast = document.querySelector<HTMLElement>("#toast")!;

let pages: ImportedPage[] = [];
let nextOriginalIndex = 0;
let toastTimer = 0;

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

function showToast(message: string): void {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 3200);
}

function addFiles(fileList: FileList | File[]): void {
  const incoming = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
  if (!incoming.length) {
    showToast("Choose image files such as JPG, PNG, or WebP.");
    return;
  }

  const known = new Set(pages.map((page) => page.file.name + ":" + page.file.size + ":" + page.file.lastModified));
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
      previewUrl: URL.createObjectURL(file),
      fileSize: file.size,
      questionNumber: null,
      originalIndex: nextOriginalIndex++,
    });
  }

  if (incoming.length > unique.length) showToast((incoming.length - unique.length) + " duplicate file(s) were skipped.");
  render();
}

function removePage(id: string): void {
  const page = pages.find((item) => item.id === id);
  if (page) URL.revokeObjectURL(page.previewUrl);
  pages = pages.filter((item) => item.id !== id);
  render();
}

function clearBundle(): void {
  for (const page of pages) URL.revokeObjectURL(page.previewUrl);
  pages = [];
  nextOriginalIndex = 0;
  fileInput.value = "";
  render();
}

function renderPage(page: ImportedPage, visualIndex: number): HTMLElement {
  const card = document.createElement("article");
  card.className = "image-card";
  card.draggable = true;
  card.dataset.pageId = page.id;
  const numberText = page.questionNumber === null ? "" : String(page.questionNumber);
  const isNumbered = page.questionNumber !== null;
  const label = isNumbered ? "Number assigned" : "Needs number";
  const safeName = escapeHtml(page.file.name);

  card.innerHTML =
    '<div class="image-card-top">' +
      '<span class="position-badge">' + String(visualIndex + 1).padStart(2, "0") + '</span>' +
      '<button class="remove-page" type="button" aria-label="Remove ' + safeName + '" title="Remove image">' +
        '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m6 6 8 8m0-8-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' +
      '</button>' +
    '</div>' +
    '<div class="image-preview">' +
      '<img src="' + page.previewUrl + '" alt="Preview of ' + safeName + '" loading="lazy" />' +
    '</div>' +
    '<div class="image-card-body">' +
      '<div class="file-name" title="' + safeName + '">' + safeName + '</div>' +
      '<div class="file-meta">' + formatBytes(page.fileSize) + ' <span class="meta-dot">·</span> Original image</div>' +
      '<label class="number-field-label" for="question-' + page.id + '">Question number</label>' +
      '<div class="number-field-row">' +
        '<input id="question-' + page.id + '" class="number-input" type="number" min="1" max="9999" step="1" inputmode="numeric" placeholder="—" value="' + numberText + '" aria-label="Question number for ' + safeName + '" />' +
        '<span class="number-status ' + (isNumbered ? "is-set" : "is-empty") + '">' + label + '</span>' +
      '</div>' +
      '<div class="card-order-controls">' +
        '<button class="move-page" type="button" data-direction="-1" aria-label="Move earlier" title="Move earlier" ' + (visualIndex === 0 ? "disabled" : "") + '><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 12 5-5 5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
        '<button class="move-page" type="button" data-direction="1" aria-label="Move later" title="Move later" ' + (visualIndex === pages.length - 1 ? "disabled" : "") + '><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 8 5 5 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
        '<span class="drag-hint">Drag to reorder</span>' +
      '</div>' +
    '</div>';

  card.querySelector<HTMLButtonElement>(".remove-page")?.addEventListener("click", () => removePage(page.id));
  const numberInput = card.querySelector<HTMLInputElement>(".number-input")!;
  numberInput.addEventListener("change", () => {
    const raw = numberInput.value.trim();
    const parsed = raw ? Number(raw) : Number.NaN;
    page.questionNumber = Number.isInteger(parsed) && parsed >= 1 && parsed <= 9999 ? parsed : null;
    if (raw && page.questionNumber === null) showToast("Enter a whole question number from 1 to 9999.");
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
  render();
}

function movePageTo(sourceId: string, targetId: string): void {
  const from = pages.findIndex((page) => page.id === sourceId);
  const to = pages.findIndex((page) => page.id === targetId);
  if (from < 0 || to < 0 || from === to) return;
  const page = pages.splice(from, 1)[0];
  pages.splice(to, 0, page);
  render();
}

function renderNotice(): void {
  const report = inspectNumbering(pages);
  const messages: string[] = [];
  if (report.unnumberedPageIds.length) messages.push(report.unnumberedPageIds.length + " image(s) still need a question number.");
  if (report.duplicateNumbers.length) messages.push("Repeated numbers: " + report.duplicateNumbers.join(", ") + ".");
  if (report.missingNumbers.length) {
    const shown = report.missingNumbers.slice(0, 8).join(", ");
    messages.push("Possible gaps between the smallest and largest number: " + shown +
      (report.missingNumbers.length > 8 ? ", …" : "") + ". Check whether these are intentional.");
  }

  if (!messages.length) {
    reviewNotice.className = "review-notice is-positive";
    reviewNotice.innerHTML = '<span class="notice-icon" aria-hidden="true">✓</span><div><strong>Numbering looks consistent</strong><p>Still check the page previews before exporting. OCR and numbering checks cannot prove the order by themselves.</p></div>';
    return;
  }

  reviewNotice.className = "review-notice is-attention";
  reviewNotice.innerHTML = '<span class="notice-icon" aria-hidden="true">!</span><div><strong>Review recommended</strong><p>' +
    messages.map(escapeHtml).join(" ") +
    ' Numbering checks are clues, not proof that any page is missing.</p></div>';
}

function render(): void {
  const hasPages = pages.length > 0;
  importPanel.hidden = hasPages;
  reviewSection.hidden = !hasPages;
  if (!hasPages) return;

  const numberedCount = pages.filter((page) => page.questionNumber !== null).length;
  bundleStats.innerHTML =
    '<span class="stat-chip"><strong>' + pages.length + '</strong> ' + (pages.length === 1 ? "image" : "images") + '</span>' +
    '<span class="stat-divider" aria-hidden="true"></span>' +
    '<span class="stat-chip"><strong>' + numberedCount + '</strong> numbered</span>' +
    '<span class="stat-divider" aria-hidden="true"></span>' +
    '<span class="stat-chip"><strong>' + (pages.length - numberedCount) + '</strong> to review</span>';

  imageGrid.replaceChildren(...pages.map((page, index) => renderPage(page, index)));
  renderNotice();
}

chooseImagesButton.addEventListener("click", () => fileInput.click());
addMoreButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  if (fileInput.files) addFiles(fileInput.files);
  fileInput.value = "";
});

sortButton.addEventListener("click", () => {
  pages = sortByQuestionNumber(pages);
  render();
  showToast("Images sorted by assigned question number. Check duplicate numbers and page continuity.");
});

clearButton.addEventListener("click", () => {
  if (pages.length && window.confirm("Clear all images from this workspace? Your original files will not be deleted.")) clearBundle();
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
  if (event.dataTransfer?.files) addFiles(event.dataTransfer.files);
});

window.addEventListener("beforeunload", () => {
  for (const page of pages) URL.revokeObjectURL(page.previewUrl);
});

render();
