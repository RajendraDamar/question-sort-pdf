mod commands;
mod services;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::app_status,
            commands::ocr::inspect_image,
            commands::ocr::detect_question_number,
            commands::pdf::export_pdf
        ])
        .run(tauri::generate_context!())
        .expect("error while running QuestionSort");
}
