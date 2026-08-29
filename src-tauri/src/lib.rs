mod pty;
mod runtime;

use std::sync::Arc;

use runtime::RuntimeManager;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let manager = RuntimeManager::new();
    tauri::Builder::default()
        .manage(manager.clone())
        .manage(pty::PtyState::new())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(move |app| {
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
