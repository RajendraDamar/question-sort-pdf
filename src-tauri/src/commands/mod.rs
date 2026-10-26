pub mod ocr;
pub mod pdf;

use serde::Serialize;

#[derive(Serialize)]
pub struct AppStatus {
    pub app_version: String,
    pub ocr_ready: bool,
    pub pdf_export_ready: bool,
}

#[tauri::command]
pub fn app_status() -> AppStatus {
    let ocr_ready = std::process::Command::new("tesseract")
        .arg("--version")
        .output()
        .map(|result| result.status.success())
        .unwrap_or(false);

    AppStatus {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        ocr_ready,
        pdf_export_ready: true,
    }
}
