#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{fs, io::Read};
const MAX_GPX: u64 = 5 * 1024 * 1024;

// Paths are selected in native dialogs, never provided by web content.
#[tauri::command]
async fn choose_gpx() -> Result<Option<String>, String> {
    let selected = rfd::AsyncFileDialog::new().add_filter("GPX", &["gpx"]).pick_file().await;
    let Some(file) = selected else { return Ok(None); };
    let file = fs::File::open(file.path()).map_err(|_| "无法打开文件".to_string())?;
    if !file.metadata().map_err(|_| "无法读取文件信息".to_string())?.is_file() {
        return Err("请选择普通 GPX 文件".into());
    }
    let mut bytes = Vec::new();
    file.take(MAX_GPX + 1).read_to_end(&mut bytes).map_err(|_| "文件读取失败".to_string())?;
    if bytes.len() as u64 > MAX_GPX { return Err("文件超过5 MB".into()); }
    String::from_utf8(bytes).map(Some).map_err(|_| "GPX文件需要UTF-8编码".into())
}
#[tauri::command]
async fn save_gpx(name: String, content: String) -> Result<bool, String> {
    if content.len() as u64 > MAX_GPX { return Err("文件超过5 MB".into()); }
    let safe: String = name.chars().filter(|c| !c.is_control() && !"/\\:*?\"<>|".contains(*c)).take(80).collect();
    let filename = format!("{}.gpx", if safe.is_empty() { "徒步轨迹" } else { safe.trim_end_matches(".gpx") });
    let selected = rfd::AsyncFileDialog::new().add_filter("GPX", &["gpx"]).set_file_name(&filename).save_file().await;
    let Some(file) = selected else { return Ok(false); };
    // Do not truncate an existing file until a complete new copy exists.
    let parent = file.path().parent().ok_or("保存位置无效")?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|_| "无法创建保存文件".to_string())?;
    use std::io::Write;
    temporary.write_all(content.as_bytes()).map_err(|_| "文件写入失败".to_string())?;
    temporary.as_file().sync_all().map_err(|_| "文件写入失败".to_string())?;
    temporary.persist(file.path()).map_err(|_| "无法完成保存，请检查文件权限".to_string())?;
    Ok(true)
}
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![choose_gpx, save_gpx])
        .run(tauri::generate_context!())
        .expect("运行徒步地球桌面端失败");
}
