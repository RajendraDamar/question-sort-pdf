use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde::Serialize;
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    process::Command,
};
use tauri::Manager;

#[derive(Debug, Clone, Serialize)]
pub struct NumberCandidate {
    pub number: u32,
    pub confidence: f32,
    pub evidence: String,
    pub top_ratio: f32,
    pub left_ratio: f32,
}

#[derive(Debug, Serialize)]
pub struct OcrResult {
    pub question_number: Option<u32>,
    pub confidence: Option<f32>,
    pub evidence: String,
    pub candidates: Vec<NumberCandidate>,
    pub source_page_number: Option<u32>,
    pub source_page_confidence: Option<f32>,
    pub source_page_evidence: String,
    pub engine: String,
}

#[derive(Debug, Serialize)]
pub struct ImageInfo {
    pub path: String,
    pub file_name: String,
    pub file_size: u64,
    pub width: u32,
    pub height: u32,
    pub thumbnail_base64: String,
}

fn validate_image_path(raw_path: &str) -> Result<std::path::PathBuf, String> {
    if raw_path.trim().is_empty() {
        return Err("Lokasi gambar kosong.".to_string());
    }

    let path = Path::new(raw_path)
        .canonicalize()
        .map_err(|error| format!("Gambar tidak dapat dibuka: {error}"))?;

    if !path.is_file() {
        return Err("Lokasi yang dipilih bukan berkas gambar.".to_string());
    }

    let extension = path
        .extension()
        .and_then(|part| part.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if !matches!(extension.as_str(), "jpg" | "jpeg" | "png" | "webp") {
        return Err("Format gambar tidak didukung. Gunakan JPG, PNG, atau WebP.".to_string());
    }

    let metadata = std::fs::metadata(&path)
        .map_err(|error| format!("Informasi gambar tidak dapat dibaca: {error}"))?;
    if metadata.len() > 100 * 1024 * 1024 {
        return Err("Ukuran gambar melebihi batas 100 MB.".to_string());
    }

    Ok(path)
}

fn checked_dimensions(path: &Path) -> Result<(u32, u32), String> {
    let (width, height) = image::ImageReader::open(path)
        .map_err(|error| format!("Gambar tidak dapat dibuka: {error}"))?
        .with_guessed_format()
        .map_err(|error| format!("Format gambar tidak dapat dikenali: {error}"))?
        .into_dimensions()
        .map_err(|error| format!("Dimensi gambar tidak dapat dibaca: {error}"))?;

    if width == 0 || height == 0 || u64::from(width) * u64::from(height) > 40_000_000 {
        return Err(
            "Dimensi gambar terlalu besar untuk diproses dengan aman (batas 40 megapiksel)."
                .to_string(),
        );
    }
    Ok((width, height))
}

fn inspect_image_inner(path: String) -> Result<ImageInfo, String> {
    let path = validate_image_path(&path)?;
    let metadata = std::fs::metadata(&path)
        .map_err(|error| format!("Informasi gambar tidak dapat dibaca: {error}"))?;
    let (width, height) = checked_dimensions(&path)?;
    let decoded = image::open(&path)
        .map_err(|error| format!("Isi gambar rusak atau tidak didukung: {error}"))?;

    let thumbnail = decoded.thumbnail(440, 560).to_rgb8();
    let mut encoded = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut encoded, 72)
        .encode_image(&image::DynamicImage::ImageRgb8(thumbnail))
        .map_err(|error| format!("Pratinjau gambar gagal dibuat: {error}"))?;

    let file_name = path
        .file_name()
        .and_then(|part| part.to_str())
        .unwrap_or("gambar")
        .to_string();

    Ok(ImageInfo {
        path: path.to_string_lossy().to_string(),
        file_name,
        file_size: metadata.len(),
        width,
        height,
        thumbnail_base64: STANDARD.encode(encoded),
    })
}

#[tauri::command]
pub async fn inspect_image(path: String) -> Result<ImageInfo, String> {
    tauri::async_runtime::spawn_blocking(move || inspect_image_inner(path))
        .await
        .map_err(|error| format!("Pemeriksaan gambar dihentikan secara tidak terduga: {error}"))?
}

#[derive(Debug, Clone)]
struct OcrWord {
    text: String,
    left: u32,
    top: u32,
    confidence: f32,
}

fn number_prefix(raw: &str) -> Option<(u32, bool)> {
    let trimmed = raw.trim().trim_start_matches(['(', '[', '{']);
    let digit_count = trimmed.chars().take_while(char::is_ascii_digit).count();
    if digit_count == 0 || digit_count > 4 {
        return None;
    }

    let digits: String = trimmed.chars().take(digit_count).collect();
    let remainder = &trimmed[digit_count..];
    let punctuated = !remainder.is_empty()
        && remainder
            .chars()
            .all(|character| matches!(character, '.' | ')' | ']' | ':' | '-'));

    if !remainder.is_empty() && !punctuated {
        return None;
    }

    let number = digits.parse::<u32>().ok()?;
    if !(1..=9999).contains(&number) {
        return None;
    }

    Some((number, punctuated))
}

fn tsv_candidates(tsv: &str) -> Vec<NumberCandidate> {
    let mut page_width = 0_u32;
    let mut page_height = 0_u32;
    let mut lines: BTreeMap<(u32, u32, u32, u32), Vec<OcrWord>> = BTreeMap::new();

    for row in tsv.lines().skip(1) {
        let columns: Vec<&str> = row.splitn(12, '\t').collect();
        if columns.len() < 12 {
            continue;
        }
        let level = columns[0].parse::<u8>().unwrap_or_default();

        if level == 1 {
            page_width = columns[8].parse().unwrap_or_default();
            page_height = columns[9].parse().unwrap_or_default();
            continue;
        }

        if level != 5 || page_width == 0 || page_height == 0 {
            continue;
        }

        let text = columns[11].trim();
        if text.is_empty() {
            continue;
        }

        let key = (
            columns[1].parse().unwrap_or_default(),
            columns[2].parse().unwrap_or_default(),
            columns[3].parse().unwrap_or_default(),
            columns[4].parse().unwrap_or_default(),
        );

        lines.entry(key).or_default().push(OcrWord {
            text: text.to_string(),
            left: columns[6].parse().unwrap_or_default(),
            top: columns[7].parse().unwrap_or_default(),
            confidence: columns[10].parse().unwrap_or(0.0_f32).clamp(0.0, 100.0),
        });
    }

    if page_width == 0 || page_height == 0 {
        return Vec::new();
    }

    let mut candidates = Vec::new();

    for (_, mut words) in lines {
        words.sort_by_key(|word| word.left);
        let Some(first) = words.first() else { continue };

        // Question numbers usually begin near the left edge of the text body.
        // This intentionally remains a candidate generator, not a proof engine.
        let left_ratio = first.left as f32 / page_width as f32;
        let top_ratio = first.top as f32 / page_height as f32;
        if left_ratio > 0.38 || !(0.015..=0.92).contains(&top_ratio) {
            continue;
        }

        let second_is_punctuation = words
            .get(1)
            .map(|word| matches!(word.text.as_str(), "." | ")" | "]" | ":" | "-"))
            .unwrap_or(false);
        // Do not treat a bare number as a question label. This used to turn
        // body text such as "250 gram" into question 250. Require explicit
        // punctuation, either attached to the number ("7.") or recognized as
        // the following OCR word ("7", ".", "Sebuah").
        let number = match number_prefix(&first.text) {
            Some((number, true)) => number,
            Some((number, false)) if second_is_punctuation => number,
            Some(_) if !second_is_punctuation => continue,
            Some(_) | None => {
                if !second_is_punctuation {
                    continue;
                }
                let Some((number, true)) = number_prefix(&format!("{}.", first.text)) else {
                    continue;
                };
                number
            }
        };

        let evidence = words
            .iter()
            .take(14)
            .map(|word| word.text.as_str())
            .collect::<Vec<_>>()
            .join(" ");
        candidates.push(NumberCandidate {
            number,
            confidence: first.confidence,
            evidence,
            top_ratio,
            left_ratio,
        });
    }

    candidates.sort_by(|a, b| {
        a.top_ratio
            .total_cmp(&b.top_ratio)
            .then_with(|| a.left_ratio.total_cmp(&b.left_ratio))
            .then_with(|| b.confidence.total_cmp(&a.confidence))
    });

    // Keep a compact list of unique candidate numbers for the review UI.
    let mut seen = std::collections::HashSet::new();
    candidates.retain(|candidate| seen.insert(candidate.number));
    candidates.truncate(12);
    candidates
}

/// Extract the printed source-page number from a footer, independently of
/// question numbers in the body. Many exam pages use a footer such as
/// "Matematika | 7"; the question-only detector discarded it because the line
/// is near the right edge of the page.
fn tsv_source_page_number(tsv: &str) -> Option<NumberCandidate> {
    let mut page_width = 0_u32;
    let mut page_height = 0_u32;
    let mut lines: BTreeMap<(u32, u32, u32, u32), Vec<OcrWord>> = BTreeMap::new();

    for row in tsv.lines().skip(1) {
        let columns: Vec<&str> = row.splitn(12, '\t').collect();
        if columns.len() < 12 {
            continue;
        }
        let level = columns[0].parse::<u8>().unwrap_or_default();
        if level == 1 {
            page_width = columns[8].parse().unwrap_or_default();
            page_height = columns[9].parse().unwrap_or_default();
            continue;
        }
        if level != 5 || page_width == 0 || page_height == 0 {
            continue;
        }

        let text = columns[11].trim();
        if text.is_empty() {
            continue;
        }
        let key = (
            columns[1].parse().unwrap_or_default(),
            columns[2].parse().unwrap_or_default(),
            columns[3].parse().unwrap_or_default(),
            columns[4].parse().unwrap_or_default(),
        );
        lines.entry(key).or_default().push(OcrWord {
            text: text.to_string(),
            left: columns[6].parse().unwrap_or_default(),
            top: columns[7].parse().unwrap_or_default(),
            confidence: columns[10].parse().unwrap_or(0.0_f32).clamp(0.0, 100.0),
        });
    }

    if page_width == 0 || page_height == 0 {
        return None;
    }

    let mut candidates = Vec::new();
    for (_, mut words) in lines {
        words.sort_by_key(|word| word.left);
        let Some(first) = words.first() else { continue };
        let left_ratio = first.left as f32 / page_width as f32;
        let top_ratio = first.top as f32 / page_height as f32;

        // A footer candidate must be low on the page and on its right half.
        if top_ratio < 0.88 || left_ratio < 0.50 {
            continue;
        }

        let evidence = words
            .iter()
            .take(12)
            .map(|word| word.text.as_str())
            .collect::<Vec<_>>()
            .join(" ");
        let has_footer_marker = words.iter().any(|word| word.text.trim() == "|") || {
            let lower = evidence.to_ascii_lowercase();
            ["halaman", "page", "lembar"]
                .iter()
                .any(|marker| lower.contains(marker))
        };
        if !has_footer_marker {
            continue;
        }

        let Some((number, confidence)) = words.iter().rev().find_map(|word| {
            let digits = word
                .text
                .trim_matches(|character: char| !character.is_ascii_digit());
            if digits.is_empty() || !digits.chars().all(|character| character.is_ascii_digit()) {
                return None;
            }
            let value = digits.parse::<u32>().ok()?;
            (1..=9999)
                .contains(&value)
                .then_some((value, word.confidence))
        }) else {
            continue;
        };

        candidates.push(NumberCandidate {
            number,
            confidence,
            evidence,
            top_ratio,
            left_ratio,
        });
    }

    // Prefer the footer closest to the bottom-right corner, then confidence.
    candidates.sort_by(|a, b| {
        b.top_ratio
            .total_cmp(&a.top_ratio)
            .then_with(|| b.left_ratio.total_cmp(&a.left_ratio))
            .then_with(|| b.confidence.total_cmp(&a.confidence))
    });
    candidates.into_iter().next()
}

/// Run Tesseract with an explicit page-segmentation mode and return TSV
/// with word positions. Different modes serve different tasks: normal page
/// layout is better at question labels while sparse-text mode reliably sees
/// the page footer.
fn tesseract_tsv(
    path: &Path,
    psm: u8,
    executable: &Path,
    tessdata_dir: Option<&Path>,
) -> Result<String, String> {
    let mut command = Command::new(executable);
    command.arg(path).arg("stdout");
    if let Some(tessdata_dir) = tessdata_dir {
        command
            .env("TESSDATA_PREFIX", tessdata_dir)
            .arg("--tessdata-dir")
            .arg(tessdata_dir);
    }
    let result = command
        .arg("-l")
        .arg("ind+eng")
        .arg("--psm")
        .arg(psm.to_string())
        .arg("tsv")
        .output()
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                "Mesin OCR Tesseract belum terpasang. Pasang Tesseract dengan data bahasa Indonesia dan Inggris.".to_string()
            } else {
                format!("Mesin OCR tidak dapat dijalankan: {error}")
            }
        })?;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        return Err(format!("OCR gagal membaca gambar: {}", stderr.trim()));
    }

    Ok(String::from_utf8_lossy(&result.stdout).into_owned())
}

fn detect_question_number_with_engine(
    raw_path: String,
    executable: PathBuf,
    tessdata_dir: Option<PathBuf>,
) -> Result<OcrResult, String> {
    let path = validate_image_path(&raw_path)?;
    let _dimensions = checked_dimensions(&path)?;

    // Standard page layout (PSM 3) captures headings like "4. DIMSUM" that
    // sparse-text mode may miss when a page includes a large illustration.
    let layout_tsv = tesseract_tsv(&path, 3, &executable, tessdata_dir.as_deref())?;
    // Sparse-text mode (PSM 11) finds the footer on these same illustrated pages.
    let sparse_tsv = tesseract_tsv(&path, 11, &executable, tessdata_dir.as_deref())?;

    let mut candidates = tsv_candidates(&layout_tsv);
    if candidates.is_empty() {
        candidates = tsv_candidates(&sparse_tsv);
    }
    let primary = candidates.first();
    let source_page = tsv_source_page_number(&sparse_tsv);

    Ok(OcrResult {
        question_number: primary.map(|candidate| candidate.number),
        confidence: primary.map(|candidate| candidate.confidence),
        evidence: primary
            .map(|candidate| candidate.evidence.clone())
            .unwrap_or_default(),
        candidates,
        source_page_number: source_page.as_ref().map(|candidate| candidate.number),
        source_page_confidence: source_page.as_ref().map(|candidate| candidate.confidence),
        source_page_evidence: source_page
            .map(|candidate| candidate.evidence)
            .unwrap_or_default(),
        engine: "Tesseract OCR (Indonesia + Inggris; tata letak halaman + footer)".to_string(),
    })
}

fn bundled_tesseract(resource_dir: Option<PathBuf>) -> (PathBuf, Option<PathBuf>) {
    if let Some(resource_dir) = resource_dir {
        let root = resource_dir.join("tesseract");
        let executable = root.join(if cfg!(windows) {
            "tesseract.exe"
        } else {
            "tesseract"
        });
        let tessdata_dir = root.join("tessdata");
        if executable.is_file()
            && tessdata_dir.join("eng.traineddata").is_file()
            && tessdata_dir.join("ind.traineddata").is_file()
        {
            return (executable, Some(tessdata_dir));
        }
    }
    // Developer installations and Linux currently use the system Tesseract.
    (PathBuf::from("tesseract"), None)
}

#[cfg(test)]
fn detect_question_number_inner(path: String) -> Result<OcrResult, String> {
    detect_question_number_with_engine(path, PathBuf::from("tesseract"), None)
}

#[tauri::command]
pub async fn detect_question_number(
    app: tauri::AppHandle,
    path: String,
) -> Result<OcrResult, String> {
    let resource_dir = app.path().resource_dir().ok();
    tauri::async_runtime::spawn_blocking(move || {
        let (executable, tessdata_dir) = bundled_tesseract(resource_dir);
        detect_question_number_with_engine(path, executable, tessdata_dir)
    })
    .await
    .map_err(|error| format!("Proses OCR dihentikan secara tidak terduga: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::{
        detect_question_number_inner, number_prefix, tsv_candidates, tsv_source_page_number,
    };
    use std::{
        path::{Path, PathBuf},
        process::Command,
    };

    #[test]
    fn bundled_tesseract_requires_executable_and_both_language_models() {
        let root = std::env::temp_dir().join(format!(
            "questionsort-tesseract-test-{}",
            std::process::id()
        ));
        let bundled = root.join("tesseract");
        let tessdata = bundled.join("tessdata");
        std::fs::create_dir_all(&tessdata).unwrap();
        std::fs::write(
            bundled.join(if cfg!(windows) {
                "tesseract.exe"
            } else {
                "tesseract"
            }),
            b"fixture",
        )
        .unwrap();
        std::fs::write(tessdata.join("eng.traineddata"), b"fixture").unwrap();
        std::fs::write(tessdata.join("ind.traineddata"), b"fixture").unwrap();
        let (executable, models) = super::bundled_tesseract(Some(root.clone()));
        assert_eq!(
            executable,
            bundled.join(if cfg!(windows) {
                "tesseract.exe"
            } else {
                "tesseract"
            })
        );
        assert_eq!(models, Some(tessdata.clone()));
        std::fs::remove_file(tessdata.join("ind.traineddata")).unwrap();
        let (fallback, models) = super::bundled_tesseract(Some(root.clone()));
        assert_eq!(fallback, PathBuf::from("tesseract"));
        assert_eq!(models, None);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn parses_punctuated_question_numbers() {
        assert_eq!(number_prefix("12."), Some((12, true)));
        assert_eq!(number_prefix("(7)"), Some((7, true)));
        assert_eq!(number_prefix("4:"), Some((4, true)));
    }

    #[test]
    fn rejects_unrelated_or_out_of_range_text() {
        assert_eq!(number_prefix("2024/"), None);
        assert_eq!(number_prefix("abcd"), None);
        assert_eq!(number_prefix("0."), None);
        assert_eq!(number_prefix("1.25"), None);
    }

    #[test]
    fn local_tesseract_reads_a_number_from_the_real_fixture() {
        let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/question-7.png");
        if !fixture.exists() {
            panic!("OCR fixture missing: {}", fixture.display());
        }

        let output = std::process::Command::new("tesseract")
            .arg(&fixture)
            .arg("stdout")
            .arg("-l")
            .arg("ind+eng")
            .arg("--psm")
            .arg("11")
            .arg("tsv")
            .output()
            .expect("Tesseract must be installed for the native test suite");
        assert!(
            output.status.success(),
            "Tesseract OCR failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );

        let candidates = tsv_candidates(&String::from_utf8_lossy(&output.stdout));
        assert_eq!(
            candidates.first().map(|candidate| candidate.number),
            Some(7),
            "OCR did not prioritize the printed question number: {candidates:?}"
        );
    }

    #[test]
    fn tsv_candidate_reader_uses_left_side_question_lines() {
        let tsv = concat!(
            "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n",
            "1\t1\t0\t0\t0\t0\t0\t0\t1000\t1500\t-1\t\n",
            "5\t1\t1\t1\t1\t1\t100\t230\t20\t30\t94.3\t7.\n",
            "5\t1\t1\t1\t1\t2\t130\t230\t80\t30\t89.0\tSebuah\n",
            "5\t1\t1\t1\t1\t3\t215\t230\t90\t30\t91.0\tcontoh\n",
            "5\t1\t2\t1\t1\t1\t80\t600\t20\t30\t95.0\t2.\n",
        );
        let candidates = tsv_candidates(tsv);
        assert_eq!(
            candidates.first().map(|candidate| candidate.number),
            Some(7)
        );
        assert_eq!(candidates.len(), 2);
    }

    #[test]
    fn does_not_misread_bare_measurement_as_a_question_number() {
        let tsv = concat!(
            "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n",
            "1\t1\t0\t0\t0\t0\t0\t0\t1000\t1500\t-1\t\n",
            "5\t1\t2\t1\t1\t1\t159\t372\t40\t24\t92.9\t250\n",
            "5\t1\t2\t1\t1\t2\t208\t372\t46\t24\t91.5\tgram\n",
        );
        assert!(tsv_candidates(tsv).is_empty());
    }

    #[test]
    fn recognizes_punctuation_when_ocr_splits_it_from_the_question_number() {
        let tsv = concat!(
            "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n",
            "1\t1\t0\t0\t0\t0\t0\t0\t1000\t1500\t-1\t\n",
            "5\t1\t2\t1\t1\t1\t100\t230\t12\t30\t94.0\t7\n",
            "5\t1\t2\t1\t1\t2\t114\t230\t3\t30\t89.0\t.\n",
            "5\t1\t2\t1\t1\t3\t123\t230\t90\t30\t91.0\tContoh\n",
        );
        let candidates = tsv_candidates(tsv);
        assert_eq!(
            candidates.first().map(|candidate| candidate.number),
            Some(7)
        );
    }

    #[test]
    fn reads_a_printed_page_number_from_a_right_side_footer() {
        let tsv = concat!(
            "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n",
            "1\t1\t0\t0\t0\t0\t0\t0\t1000\t1500\t-1\t\n",
            "5\t1\t4\t1\t1\t1\t100\t260\t20\t24\t94.0\t8.\n",
            "5\t1\t41\t1\t1\t1\t700\t1390\t107\t16\t90.0\tMatematika\n",
            "5\t1\t41\t1\t1\t2\t925\t1390\t2\t20\t87.5\t|\n",
            "5\t1\t41\t1\t1\t3\t967\t1388\t7\t19\t91.0\t17\n",
        );
        let candidate = tsv_source_page_number(tsv).expect("the footer should be recognized");
        assert_eq!(candidate.number, 17);
        assert!(candidate.evidence.contains("Matematika"));
    }

    #[test]
    fn does_not_treat_a_body_question_number_as_a_page_footer() {
        let tsv = concat!(
            "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n",
            "1\t1\t0\t0\t0\t0\t0\t0\t1000\t1500\t-1\t\n",
            "5\t1\t4\t1\t1\t1\t100\t260\t20\t24\t94.0\t8.\n",
            "5\t1\t4\t1\t1\t2\t130\t260\t75\t24\t90.0\tDiketahui\n",
        );
        assert!(tsv_source_page_number(tsv).is_none());
    }

    #[test]
    fn end_to_end_tesseract_detects_question_number_when_languages_are_installed() {
        let languages = match Command::new("tesseract").arg("--list-langs").output() {
            Ok(output) if output.status.success() => {
                String::from_utf8_lossy(&output.stdout).into_owned()
            }
            _ => return, // Tesseract is an optional system dependency in CI.
        };
        if !languages.lines().any(|language| language.trim() == "eng")
            || !languages.lines().any(|language| language.trim() == "ind")
        {
            return;
        }

        let fixture =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/question-7.png");
        let result = detect_question_number_inner(fixture.to_string_lossy().into_owned())
            .expect("Tesseract should process the synthetic question fixture");
        assert_eq!(result.question_number, Some(7));
        assert!(result.confidence.unwrap_or_default() > 50.0);
        assert!(result.evidence.contains("Contoh"));
    }
}
