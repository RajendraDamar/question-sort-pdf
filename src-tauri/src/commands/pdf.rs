use serde::Serialize;
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Seek, Write},
    path::{Path, PathBuf},
};

const PAGE_WIDTH: f64 = 595.28;
const PAGE_HEIGHT: f64 = 841.89;
const PAGE_MARGIN: f64 = 18.0;
const MAX_PAGES: usize = 1000;

#[derive(Debug, Serialize)]
pub struct PdfExportResult {
    pub output_path: String,
    pub page_count: usize,
    pub file_size: u64,
}

fn validated_image_paths(raw_paths: &[String]) -> Result<Vec<PathBuf>, String> {
    if raw_paths.is_empty() {
        return Err("Belum ada gambar untuk disimpan.".to_string());
    }
    if raw_paths.len() > MAX_PAGES {
        return Err(format!(
            "Jumlah gambar melewati batas {MAX_PAGES} halaman dalam satu PDF."
        ));
    }

    let mut paths = Vec::with_capacity(raw_paths.len());
    for raw in raw_paths {
        let path = Path::new(raw)
            .canonicalize()
            .map_err(|error| format!("Berkas gambar tidak dapat dibuka: {error}"))?;
        if !path.is_file() {
            return Err(format!("Berkas tidak ditemukan: {}", path.display()));
        }
        let extension = path
            .extension()
            .and_then(|part| part.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        if !matches!(extension.as_str(), "jpg" | "jpeg" | "png" | "webp") {
            return Err(format!("Format gambar tidak didukung: {}", path.display()));
        }
        paths.push(path);
    }
    Ok(paths)
}

fn rgb_over_white(image: image::DynamicImage) -> image::RgbImage {
    // Move non-transparent photo buffers directly into RGB instead of keeping
    // a second full-size copy in memory. Transparent images need white compositing.
    if !image.color().has_alpha() {
        return image.into_rgb8();
    }

    let rgba = image.into_rgba8();
    let mut rgb = image::RgbImage::new(rgba.width(), rgba.height());
    for (x, y, pixel) in rgba.enumerate_pixels() {
        let alpha = u32::from(pixel[3]);
        let red = (u32::from(pixel[0]) * alpha + 255 * (255 - alpha)) / 255;
        let green = (u32::from(pixel[1]) * alpha + 255 * (255 - alpha)) / 255;
        let blue = (u32::from(pixel[2]) * alpha + 255 * (255 - alpha)) / 255;
        rgb.put_pixel(x, y, image::Rgb([red as u8, green as u8, blue as u8]));
    }
    rgb
}

fn image_jpeg(path: &Path) -> Result<(u32, u32, Vec<u8>), String> {
    let metadata = fs::metadata(path).map_err(|error| format!("Gagal membaca berkas: {error}"))?;
    if metadata.len() > 100 * 1024 * 1024 {
        return Err(format!("Ukuran gambar melebihi 100 MB: {}", path.display()));
    }

    let (width, height) = image::ImageReader::open(path)
        .map_err(|error| format!("Gambar tidak dapat dibuka: {error}"))?
        .with_guessed_format()
        .map_err(|error| format!("Format gambar tidak dikenali: {error}"))?
        .into_dimensions()
        .map_err(|error| format!("Dimensi gambar tidak dapat dibaca: {error}"))?;

    if width == 0 || height == 0 || u64::from(width) * u64::from(height) > 40_000_000 {
        return Err(format!(
            "Dimensi gambar terlalu besar (batas 40 megapiksel): {}",
            path.display()
        ));
    }

    let decoded = image::open(path)
        .map_err(|error| format!("Gambar rusak atau tidak dapat dibaca: {error}"))?;
    let rgb = rgb_over_white(decoded);
    let mut bytes = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut bytes, 90)
        .encode_image(&image::DynamicImage::ImageRgb8(rgb))
        .map_err(|error| format!("Gagal menyiapkan gambar untuk PDF: {error}"))?;
    Ok((width, height, bytes))
}

struct PdfWriter {
    file: File,
    offsets: Vec<u64>,
}

impl PdfWriter {
    fn new(path: &Path, object_count: usize) -> io::Result<Self> {
        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(path)?;
        file.write_all(b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")?;
        Ok(Self {
            file,
            offsets: vec![0; object_count + 1],
        })
    }

    fn write_object(&mut self, id: usize, body: &[u8]) -> io::Result<()> {
        self.offsets[id] = self.file.stream_position()?;
        writeln!(self.file, "{id} 0 obj")?;
        self.file.write_all(body)?;
        self.file.write_all(b"\nendobj\n")?;
        Ok(())
    }

    fn write_stream_object(&mut self, id: usize, dictionary: &str, data: &[u8]) -> io::Result<()> {
        self.offsets[id] = self.file.stream_position()?;
        writeln!(self.file, "{id} 0 obj")?;
        writeln!(self.file, "{dictionary}")?;
        self.file.write_all(b"stream\n")?;
        self.file.write_all(data)?;
        self.file.write_all(b"\nendstream\nendobj\n")?;
        Ok(())
    }

    fn finish(mut self) -> io::Result<()> {
        let xref_offset = self.file.stream_position()?;
        writeln!(self.file, "xref\n0 {}", self.offsets.len())?;
        self.file.write_all(b"0000000000 65535 f \n")?;
        for offset in self.offsets.iter().skip(1) {
            writeln!(self.file, "{offset:010} 00000 n ")?;
        }
        writeln!(
            self.file,
            "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{}\n%%EOF",
            self.offsets.len(),
            xref_offset
        )?;
        self.file.flush()?;
        self.file.sync_all()?;
        Ok(())
    }
}

fn write_pdf(paths: &[PathBuf], output: &Path) -> Result<(), String> {
    let page_count = paths.len();
    let object_count = 2 + page_count * 3;
    let mut writer = PdfWriter::new(output, object_count)
        .map_err(|error| format!("Berkas PDF tidak dapat dibuat: {error}"))?;

    writer
        .write_object(1, b"<< /Type /Catalog /Pages 2 0 R >>")
        .map_err(|error| format!("Gagal menulis struktur PDF: {error}"))?;
    let kids = (0..page_count)
        .map(|index| format!("{} 0 R", 3 + index * 3))
        .collect::<Vec<_>>()
        .join(" ");
    let pages_dict = format!("<< /Type /Pages /Kids [{kids}] /Count {page_count} >>");
    writer
        .write_object(2, pages_dict.as_bytes())
        .map_err(|error| format!("Gagal menulis daftar halaman: {error}"))?;

    for (index, path) in paths.iter().enumerate() {
        let page_id = 3 + index * 3;
        let image_id = page_id + 1;
        let content_id = page_id + 2;
        let (width, height, jpeg) = image_jpeg(path)?;

        let available_width = PAGE_WIDTH - PAGE_MARGIN * 2.0;
        let available_height = PAGE_HEIGHT - PAGE_MARGIN * 2.0;
        let scale = (available_width / f64::from(width)).min(available_height / f64::from(height));
        let rendered_width = f64::from(width) * scale;
        let rendered_height = f64::from(height) * scale;
        let x = (PAGE_WIDTH - rendered_width) / 2.0;
        let y = (PAGE_HEIGHT - rendered_height) / 2.0;

        let page_dict = format!(
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_WIDTH:.2} {PAGE_HEIGHT:.2}] \
             /Resources << /ProcSet [/PDF /ImageC] /XObject << /Im0 {image_id} 0 R >> >> \
             /Contents {content_id} 0 R >>"
        );
        writer
            .write_object(page_id, page_dict.as_bytes())
            .map_err(|error| format!("Gagal menulis halaman {}: {error}", index + 1))?;

        let image_dict = format!(
            "<< /Type /XObject /Subtype /Image /Width {width} /Height {height} \
             /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length {} >>",
            jpeg.len()
        );
        writer
            .write_stream_object(image_id, &image_dict, &jpeg)
            .map_err(|error| format!("Gagal menulis gambar halaman {}: {error}", index + 1))?;

        let content = format!(
            "q\n{rendered_width:.4} 0 0 {rendered_height:.4} {x:.4} {y:.4} cm\n/Im0 Do\nQ\n"
        );
        let content_dict = format!("<< /Length {} >>", content.len());
        writer
            .write_stream_object(content_id, &content_dict, content.as_bytes())
            .map_err(|error| format!("Gagal menulis isi halaman {}: {error}", index + 1))?;
    }

    writer
        .finish()
        .map_err(|error| format!("PDF tidak dapat diselesaikan: {error}"))?;
    Ok(())
}

fn export_pdf_inner(
    image_paths: Vec<String>,
    output_path: String,
) -> Result<PdfExportResult, String> {
    let paths = validated_image_paths(&image_paths)?;
    let mut output = PathBuf::from(output_path.trim());
    if output.as_os_str().is_empty() {
        return Err("Lokasi penyimpanan PDF belum dipilih.".to_string());
    }
    if output
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|value| value.eq_ignore_ascii_case("pdf"))
        != Some(true)
    {
        output.set_extension("pdf");
    }
    if output.file_name().is_none() {
        return Err("Nama berkas PDF tidak valid.".to_string());
    }

    let file_name = output
        .file_name()
        .and_then(|part| part.to_str())
        .unwrap_or("Soal-Ujian.pdf");
    let staging = output.with_file_name(format!(
        ".{file_name}.questionsort-{}.part",
        std::process::id()
    ));
    let _ = fs::remove_file(&staging);

    if let Err(error) = write_pdf(&paths, &staging) {
        let _ = fs::remove_file(&staging);
        return Err(error);
    }

    let metadata = fs::metadata(&staging).map_err(|error| {
        let _ = fs::remove_file(&staging);
        format!("PDF selesai dibuat, tetapi ukurannya tidak dapat diperiksa: {error}")
    })?;
    if metadata.len() < 100 {
        let _ = fs::remove_file(&staging);
        return Err("PDF yang dihasilkan tidak valid atau terlalu kecil.".to_string());
    }

    fs::rename(&staging, &output).map_err(|error| {
        let _ = fs::remove_file(&staging);
        format!("PDF dibuat sementara, tetapi tidak dapat dipindahkan ke tujuan akhir: {error}")
    })?;

    Ok(PdfExportResult {
        output_path: output.to_string_lossy().to_string(),
        page_count: paths.len(),
        file_size: metadata.len(),
    })
}

#[tauri::command]
pub async fn export_pdf(
    image_paths: Vec<String>,
    output_path: String,
) -> Result<PdfExportResult, String> {
    tauri::async_runtime::spawn_blocking(move || export_pdf_inner(image_paths, output_path))
        .await
        .map_err(|error| format!("Pembuatan PDF dihentikan secara tidak terduga: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::{PAGE_HEIGHT, PAGE_WIDTH, write_pdf};
    use std::{
        fs,
        sync::atomic::{AtomicU64, Ordering},
    };

    static NEXT_TEST_FILE: AtomicU64 = AtomicU64::new(0);

    fn temp_path(extension: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "questionsort-test-{}-{}.{}",
            std::process::id(),
            NEXT_TEST_FILE.fetch_add(1, Ordering::Relaxed),
            extension
        ))
    }

    #[test]
    fn uses_a4_portrait_page_dimensions() {
        assert!(PAGE_WIDTH > 590.0 && PAGE_WIDTH < 600.0);
        assert!(PAGE_HEIGHT > 830.0 && PAGE_HEIGHT < 850.0);
    }

    #[test]
    fn creates_a_pdf_with_every_input_page_in_the_manifested_count() {
        let input_a = temp_path("png");
        let input_b = temp_path("png");
        let output = temp_path("pdf");

        image::RgbImage::from_pixel(80, 120, image::Rgb([255, 255, 255]))
            .save(&input_a)
            .expect("write first fixture");
        image::RgbImage::from_pixel(120, 80, image::Rgb([230, 230, 230]))
            .save(&input_b)
            .expect("write second fixture");

        let result = write_pdf(&[input_a.clone(), input_b.clone()], &output);
        assert!(result.is_ok(), "PDF generation failed: {result:?}");

        let bytes = fs::read(&output).expect("read generated PDF");
        assert!(bytes.starts_with(b"%PDF-1.4"));
        let searchable = String::from_utf8_lossy(&bytes);
        assert!(searchable.contains("/Count 2"));
        assert!(searchable.contains("3 0 obj"));
        assert!(searchable.contains("6 0 obj"));
        assert!(searchable.contains("xref\n0 9"));
        assert!(searchable.trim_end().ends_with("%%EOF"));

        // When Poppler is available, also parse the resulting file with a real PDF reader.
        if let Ok(info) = std::process::Command::new("pdfinfo").arg(&output).output() {
            assert!(
                info.status.success(),
                "pdfinfo rejected generated PDF: {}",
                String::from_utf8_lossy(&info.stderr)
            );
            let details = String::from_utf8_lossy(&info.stdout);
            let page_count = details
                .lines()
                .find(|line| line.starts_with("Pages:"))
                .and_then(|line| line.split_whitespace().last());
            assert_eq!(page_count, Some("2"), "pdfinfo output: {details}");
        }

        let _ = fs::remove_file(input_a);
        let _ = fs::remove_file(input_b);
        let _ = fs::remove_file(output);
    }
}
