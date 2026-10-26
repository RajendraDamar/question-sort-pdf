use serde::Serialize;

/// Feature status exposed to the UI. Optional engines are unavailable until
/// their implementations and verification tests are in place.
#[derive(Serialize)]
pub struct AppStatus {
    pub app_version: String,
    pub ocr_ready: bool,
    pub pdf_export_ready: bool,
}

#[tauri::command]
pub fn app_status() -> AppStatus {
    AppStatus {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        ocr_ready: false,
        pdf_export_ready: false,
    }
}
