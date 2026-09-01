mod pty;
mod runtime;

use std::sync::Arc;

use runtime::RuntimeManager;
use tauri::{Manager, Theme};

fn apply_window_chrome(window: &tauri::WebviewWindow) {
    let (os, chrome) = if cfg!(target_os = "macos") {
        ("macos", "native")
    } else if cfg!(target_os = "windows") {
        ("windows", "custom")
    } else {
        ("linux", "custom")
    };

    #[cfg(target_os = "macos")]
    {
        let _ = window.set_decorations(true);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window.set_decorations(false);
    }
    let _ = window.set_theme(Some(Theme::Dark));
    let script = format!(
        r#"document.documentElement.dataset.tauriOs={os:?};document.documentElement.dataset.desktopChrome={chrome:?};window.dispatchEvent(new Event("adelpha:chrome"));"#
    );
    let _ = window.eval(&script);
    let _ = window.show();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let manager = RuntimeManager::new();
    tauri::Builder::default()
        .manage(manager.clone())
        .manage(pty::PtyState::new())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(move |app| {
            if let Some(window) = app.get_webview_window("main") {
                apply_window_chrome(&window);
            }
            let handle = app.handle().clone();
            let mgr = manager.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(err) = mgr.start(&handle).await {
                    log::error!("python runtime failed: {err}");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            runtime::runtime_status,
            runtime::runtime_restart,
            runtime::export_diagnostics,
            runtime::app_quit,
            runtime::google_api_key_status,
            runtime::set_google_api_key,
            runtime::clear_google_api_key,
            runtime::dtam_runtime_prefs,
            runtime::set_dtam_runtime_prefs,
            runtime::reveal_dtam_config_dir,
            pty::terminal_start,
            pty::terminal_write,
            pty::terminal_resize,
            pty::terminal_dispose,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Adelpha")
        .run(|app_handle, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                if let Some(manager) = app_handle.try_state::<Arc<RuntimeManager>>() {
                    let mgr = manager.inner().clone();
                    let _ = std::thread::spawn(move || {
                        tauri::async_runtime::block_on(mgr.shutdown());
                    })
                    .join();
                }
            }
        });
}
