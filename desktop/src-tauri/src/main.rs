// 徒步地球桌面端：Tauri 壳，窗口直接加载网页端部署地址（见 tauri.conf.json app.windows.url）
// 网页端更新即桌面端更新，无需发版；后续如需离线壳再切 frontendDist 本地构建。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("运行徒步地球桌面端失败");
}
