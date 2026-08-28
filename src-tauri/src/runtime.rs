use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{Mutex, Notify};

const HANDSHAKE_PREFIX: &str = "ADELPHA_RUNTIME_READY ";
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(90);
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Handshake {
    pub ok: bool,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub token: Option<String>,
    pub version: Option<String>,
    pub session: Option<String>,
    pub services: Option<serde_json::Value>,
    pub required_failed: Option<Vec<String>>,
    pub base_url: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RuntimeStatus {
    pub ok: bool,
    pub ready: bool,
    pub base_url: String,
    pub token: String,
    pub version: String,
    pub session: String,
    pub services: serde_json::Value,
    pub required_failed: Vec<String>,
    pub error: Option<String>,
    pub python_runtime_version: String,
    pub adelpha_version: String,
    pub tauri_version: String,
}

impl RuntimeStatus {
    fn failed(message: &str) -> Self {
        Self {
            ok: false,
            ready: false,
            base_url: String::new(),
            token: String::new(),
            version: String::new(),
            session: String::new(),
            services: serde_json::json!({}),
            required_failed: Vec::new(),
            error: Some(message.to_string()),
            python_runtime_version: String::new(),
            adelpha_version: env!("CARGO_PKG_VERSION").to_string(),
            tauri_version: tauri::VERSION.to_string(),
        }
    }
}

pub struct RuntimeManager {
    inner: Mutex<Inner>,
    notify: Notify,
}

struct Inner {
    child: Option<Child>,
    handshake: Option<Handshake>,
    error: Option<String>,
    token: String,
}

impl RuntimeManager {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            inner: Mutex::new(Inner {
                child: None,
                handshake: None,
                error: None,
                token: uuid::Uuid::new_v4().to_string().replace('-', ""),
            }),
            notify: Notify::new(),
        })
    }

    pub async fn start(self: &Arc<Self>, app: &AppHandle) -> Result<(), String> {
        {
            let guard = self.inner.lock().await;
            if guard.child.is_some() {
                return Ok(());
            }
        }
        match spawn_supervisor(app, self).await {
            Ok(()) => Ok(()),
            Err(err) => {
                let mut guard = self.inner.lock().await;
                guard.error = Some(err.clone());
                self.notify.notify_waiters();
                Err(err)
            }
        }
    }

    pub async fn status(&self) -> RuntimeStatus {
        let started = tokio::time::Instant::now();
        loop {
            {
                let guard = self.inner.lock().await;
                if guard.handshake.is_some() || guard.error.is_some() {
                    return snapshot(&guard);
                }
            }
            let remaining = HANDSHAKE_TIMEOUT.saturating_sub(started.elapsed());
            if remaining.is_zero() {
                return RuntimeStatus::failed("Python runtime did not become ready");
            }
            if tokio::time::timeout(remaining, self.notify.notified()).await.is_err() {
                return RuntimeStatus::failed("Python runtime did not become ready");
            }
        }
    }

    pub async fn shutdown(&self) {
        let mut guard = self.inner.lock().await;
        if let Some(hs) = &guard.handshake {
            if let (Some(port), Some(token)) = (hs.port, hs.token.clone()) {
                let _ = request_shutdown(port, &token).await;
            }
        }
        if let Some(mut child) = guard.child.take() {
            let graceful = tokio::time::timeout(SHUTDOWN_TIMEOUT, child.wait()).await;
            if graceful.is_err() {
                let _ = child.start_kill();
                let _ = child.wait().await;
            }
        }
        guard.handshake = None;
    }
}

fn snapshot(guard: &Inner) -> RuntimeStatus {
    if let Some(hs) = &guard.handshake {
        let failed = hs.required_failed.clone().unwrap_or_default();
        RuntimeStatus {
            ok: hs.ok && failed.is_empty(),
            ready: true,
            base_url: hs.base_url.clone().unwrap_or_default(),
            token: hs.token.clone().unwrap_or_else(|| guard.token.clone()),
            version: hs.version.clone().unwrap_or_default(),
            session: hs.session.clone().unwrap_or_default(),
            services: hs.services.clone().unwrap_or_else(|| serde_json::json!({})),
            required_failed: failed,
            error: hs.error.clone().or_else(|| service_error_message(hs)),
            python_runtime_version: hs.version.clone().unwrap_or_default(),
            adelpha_version: env!("CARGO_PKG_VERSION").to_string(),
            tauri_version: tauri::VERSION.to_string(),
        }
    } else {
        RuntimeStatus::failed(
            guard
                .error
                .as_deref()
                .unwrap_or("Python runtime did not become ready"),
        )
    }
}

fn service_error_message(hs: &Handshake) -> Option<String> {
    let failed = hs.required_failed.as_ref()?;
    if failed.is_empty() {
        return None;
    }
    let labels: Vec<String> = failed
        .iter()
        .map(|id| match id.as_str() {
            "twin" => "Twin service failed to initialize".to_string(),
            "console" => "Imaging console failed to initialize".to_string(),
            other => format!("{other} failed to initialize"),
        })
        .collect();
    Some(labels.join(". "))
}

async fn spawn_supervisor(app: &AppHandle, manager: &Arc<RuntimeManager>) -> Result<(), String> {
    let token = {
        let guard = manager.inner.lock().await;
        guard.token.clone()
    };
    let (program, args, cwd) = resolve_supervisor(app)?;
    let data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let config = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let cache = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    let logs = app.path().app_log_dir().map_err(|e| e.to_string())?;
    let temp = app.path().temp_dir().map_err(|e| e.to_string())?;
    let resource = app
        .path()
        .resource_dir()
        .unwrap_or_else(|_| cwd.clone());
    std::fs::create_dir_all(&data).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&config).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&logs).map_err(|e| e.to_string())?;
    terminate_stale_runtime(&data);

    let mut cmd = Command::new(&program);
    cmd.args(&args)
        .current_dir(&cwd)
        .env("ADELPHA_SESSION_TOKEN", &token)
        .env("ADELPHA_DATA_DIR", &data)
        .env("ADELPHA_CONFIG_DIR", &config)
        .env("ADELPHA_CACHE_DIR", &cache)
        .env("ADELPHA_LOG_DIR", &logs)
        .env("ADELPHA_TEMP_DIR", &temp)
        .env("ADELPHA_RESOURCE_DIR", &resource)
        .env("PYTHONUNBUFFERED", "1")
        .env("PYTHONNOUSERSITE", "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    if let Some(key) = read_user_api_key(&config) {
        cmd.env("GOOGLE_API_KEY", key);
        cmd.env("ADELPHA_START_AGENTS", "1");
    }

    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let internal = cwd.join("_internal");
    if internal.join("services").is_dir() {
        cmd.env("ADELPHA_CONSOLE_ROOT", &internal);
    }

    log::info!("starting python runtime {:?}", program);
    let mut child = cmd.spawn().map_err(|e| {
        format!("Python runtime failed to start ({e}). Reinstall Adelpha or run the sidecar build.")
    })?;

    let stdout = child.stdout.take().ok_or("runtime stdout missing")?;
    let stderr = child.stderr.take();
    let handshake = wait_for_handshake(stdout, stderr).await?;
    {
        let mut guard = manager.inner.lock().await;
        guard.child = Some(child);
        guard.handshake = Some(handshake);
        guard.error = None;
    }
    manager.notify.notify_waiters();
    Ok(())
}

async fn wait_for_handshake(
    stdout: impl tokio::io::AsyncRead + Unpin,
    stderr: Option<impl tokio::io::AsyncRead + Unpin>,
) -> Result<Handshake, String> {
    let mut out_lines = BufReader::new(stdout).lines();
    let mut err_lines = stderr.map(BufReader::new).map(|reader| reader.lines());
    let result = tokio::time::timeout(HANDSHAKE_TIMEOUT, async {
        let mut last_err = String::new();
        let mut out_done = false;
        let mut err_done = err_lines.is_none();
        while !out_done || !err_done {
            tokio::select! {
                line = out_lines.next_line(), if !out_done => {
                    match line {
                        Ok(Some(line)) => {
                            if let Some(rest) = line.strip_prefix(HANDSHAKE_PREFIX) {
                                return serde_json::from_str::<Handshake>(rest)
                                    .map_err(|e| format!("invalid runtime handshake: {e}"));
                            }
                            log::info!("python-runtime: {line}");
                        }
                        _ => out_done = true,
                    }
                }
                line = async {
                    match err_lines.as_mut() {
                        Some(lines) => lines.next_line().await,
                        None => Ok(None),
                    }
                }, if !err_done => {
                    match line {
                        Ok(Some(line)) => {
                            log::info!("python-runtime: {line}");
                            last_err = line;
                        }
                        _ => err_done = true,
                    }
                }
            }
        }
        if last_err.is_empty() {
            Err("Python runtime exited before it became ready".to_string())
        } else {
            Err(format!("Python runtime failed: {last_err}"))
        }
    })
    .await
    .map_err(|_| {
        "Twin service failed to initialize (runtime handshake timed out)".to_string()
    })?;
    result
}

fn supervisor_exe_name() -> &'static str {
    if cfg!(windows) {
        "adelpha-python-runtime.exe"
    } else {
        "adelpha-python-runtime"
    }
}

/// Tauri copies `bundle.resources` under `$RESOURCE`. Object notation lands the
/// onedir at `$RESOURCE/python-runtime/`. Array notation used to preserve the
/// `src-tauri/resources/` prefix, so older builds nested it one level deeper.
fn bundled_supervisor_dirs(resource: &std::path::Path) -> [PathBuf; 2] {
    [
        resource.join("python-runtime"),
        resource.join("resources").join("python-runtime"),
    ]
}

fn resolve_supervisor(app: &AppHandle) -> Result<(PathBuf, Vec<String>, PathBuf), String> {
    // `tauri dev` copies resources into target/debug, including a leftover
    // frozen sidecar. Always prefer the repo venv there so ADK can spawn
    // with a real interpreter (`python -c` / `adk`). Set ADELPHA_USE_FROZEN=1
    // to exercise the bundled onedir from a debug build.
    let use_frozen = std::env::var("ADELPHA_USE_FROZEN")
        .map(|v| matches!(v.to_ascii_lowercase().as_str(), "1" | "true" | "yes"))
        .unwrap_or(false);
    if cfg!(debug_assertions) && !use_frozen {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let repo = manifest.parent().unwrap_or(&manifest).to_path_buf();
        let python = resolve_dev_python(&repo)?;
        return Ok((
            python,
            vec![
                "-m".into(),
                "adelpha_runtime".into(),
                "--dev".into(),
            ],
            repo.join("runtime/python"),
        ));
    }

    let resource = app.path().resource_dir().ok();
    let mut tried = Vec::new();
    if let Some(resource) = &resource {
        let name = supervisor_exe_name();
        for dir in bundled_supervisor_dirs(resource) {
            let exe = dir.join(name);
            tried.push(exe.clone());
            if exe.is_file() {
                return Ok((exe, Vec::new(), dir));
            }
        }
    }

    if cfg!(debug_assertions) {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let repo = manifest.parent().unwrap_or(&manifest).to_path_buf();
        let python = resolve_dev_python(&repo)?;
        return Ok((
            python,
            vec![
                "-m".into(),
                "adelpha_runtime".into(),
                "--dev".into(),
            ],
            repo.join("runtime/python"),
        ));
    }

    let looked = if tried.is_empty() {
        "app resource directory (unavailable)".to_string()
    } else {
        tried
            .iter()
            .map(|p| p.display().to_string())
            .collect::<Vec<_>>()
            .join(", ")
    };
    Err(format!(
        "Bundled Python runtime is missing (looked in {looked}). Reinstall Adelpha."
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_dirs_prefer_python_runtime_then_nested_resources() {
        let root = std::path::Path::new("/app/Resources");
        let dirs = bundled_supervisor_dirs(root);
        assert_eq!(dirs[0], root.join("python-runtime"));
        assert_eq!(dirs[1], root.join("resources").join("python-runtime"));
    }
}

fn resolve_dev_python(repo: &std::path::Path) -> Result<PathBuf, String> {
    if let Ok(explicit) = std::env::var("ADELPHA_DEV_PYTHON") {
        return Ok(PathBuf::from(explicit));
    }
    let runtime_venv = venv_python(repo.join("runtime/python/.venv"));
    let dtam_venv = venv_python(repo.join("dtam/.venv"));
    // DTAM's venv already has numpy/structlog/ADK. Prefer it when present so
    // `tauri-dev` does not depend on a 3.14 runtime venv that lacks those packages.
    for candidate in [dtam_venv, runtime_venv] {
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    Err(
        "Python runtime venv is missing. Run `make install`, then retry.".into(),
    )
}

fn venv_python(venv: PathBuf) -> PathBuf {
    if cfg!(windows) {
        venv.join("Scripts/python.exe")
    } else {
        venv.join("bin/python")
    }
}

/// Cargo/`tauri dev` can SIGKILL the Rust process without Drop, leaving the
/// supervisor (and its flock) behind. Stop that leftover before we spawn again.
fn terminate_stale_runtime(data_dir: &std::path::Path) {
    let lock = data_dir.join("adelpha-python-runtime.lock");
    let Ok(text) = std::fs::read_to_string(&lock) else {
        return;
    };
    let Ok(pid) = text.trim().parse::<u32>() else {
        return;
    };
    if pid == 0 {
        return;
    }
    log::warn!("stopping leftover python runtime pid={pid}");
    #[cfg(unix)]
    {
        let pid_s = pid.to_string();
        let alive = std::process::Command::new("kill")
            .args(["-0", &pid_s])
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if !alive {
            return;
        }
        let _ = std::process::Command::new("kill")
            .args(["-TERM", &pid_s])
            .status();
        for _ in 0..30 {
            let still = std::process::Command::new("kill")
                .args(["-0", &pid_s])
                .status()
                .map(|s| s.success())
                .unwrap_or(false);
            if !still {
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        let _ = std::process::Command::new("kill")
            .args(["-KILL", &pid_s])
            .status();
        std::thread::sleep(Duration::from_millis(200));
    }
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .status();
    }
}

fn read_user_api_key(config_dir: &std::path::Path) -> Option<String> {
    let file = config_dir.join("google_api_key");
    if let Ok(raw) = std::fs::read_to_string(&file) {
        let key = raw.trim();
        if !key.is_empty() {
            return Some(key.to_string());
        }
    }
    if let Ok(key) = std::env::var("GOOGLE_API_KEY") {
        let key = key.trim().to_string();
        if !key.is_empty() {
            return Some(key);
        }
    }
    #[cfg(debug_assertions)]
    {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        if let Some(repo) = manifest.parent() {
            if let Some(key) = parse_dotenv_key(&repo.join("dtam/.env"), "GOOGLE_API_KEY") {
                log::info!("using GOOGLE_API_KEY from dtam/.env (development)");
                return Some(key);
            }
        }
    }
    None
}

#[cfg(debug_assertions)]
fn parse_dotenv_key(path: &std::path::Path, name: &str) -> Option<String> {
    let text = std::fs::read_to_string(path).ok()?;
    let prefix = format!("{name}=");
    for line in text.lines() {
        let mut stripped = line.trim();
        if stripped.is_empty() || stripped.starts_with('#') {
            continue;
        }
        if let Some(rest) = stripped.strip_prefix("export ") {
            stripped = rest.trim();
        }
        let Some(raw) = stripped.strip_prefix(&prefix) else {
            continue;
        };
        let mut value = raw.trim().to_string();
        if value.len() >= 2 {
            let bytes = value.as_bytes();
            let quote = bytes[0];
            if (quote == b'"' || quote == b'\'') && bytes[bytes.len() - 1] == quote {
                value = value[1..value.len() - 1].to_string();
            }
        }
        let value = value.trim().to_string();
        if !value.is_empty() {
            return Some(value);
        }
    }
    None
}

async fn request_shutdown(port: u16, token: &str) -> Result<(), String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpStream;

    let mut stream = TcpStream::connect(("127.0.0.1", port))
        .await
        .map_err(|e| e.to_string())?;
    let req = format!(
        "POST /runtime/shutdown HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {token}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(req.as_bytes()).await.map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; 256];
    let _ = stream.read(&mut buf).await;
    Ok(())
}

#[tauri::command]
pub async fn runtime_status(manager: State<'_, Arc<RuntimeManager>>) -> Result<RuntimeStatus, String> {
    Ok(manager.status().await)
}

#[tauri::command]
pub async fn runtime_restart(
    app: AppHandle,
    manager: State<'_, Arc<RuntimeManager>>,
) -> Result<RuntimeStatus, String> {
    manager.shutdown().await;
    manager.start(&app).await?;
    Ok(manager.status().await)
}

#[tauri::command]
pub async fn export_diagnostics(
    app: AppHandle,
    manager: State<'_, Arc<RuntimeManager>>,
) -> Result<String, String> {
    let status = manager.status().await;
    let logs = app.path().app_log_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&logs).map_err(|e| e.to_string())?;
    let recent = read_recent_logs(&logs);
    let payload = serde_json::json!({
        "adelpha_version": status.adelpha_version,
        "tauri_version": status.tauri_version,
        "python_runtime_version": status.python_runtime_version,
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "sidecar": {
            "ok": status.ok,
            "ready": status.ready,
            "base_url": status.base_url,
            "error": status.error,
            "required_failed": status.required_failed,
            "services": status.services,
        },
        "recent_logs": recent,
    });
    let path = logs.join("diagnostics.json");
    std::fs::write(&path, serde_json::to_vec_pretty(&payload).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

fn read_recent_logs(log_dir: &std::path::Path) -> Vec<String> {
    let path = log_dir.join("supervisor.log");
    let Ok(text) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    text.lines().rev().take(200).map(str::to_string).collect::<Vec<_>>().into_iter().rev().collect()
}

#[tauri::command]
pub async fn app_quit(app: AppHandle, manager: State<'_, Arc<RuntimeManager>>) -> Result<(), String> {
    manager.shutdown().await;
    app.exit(0);
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
pub struct GoogleApiKeyStatus {
    pub configured: bool,
    pub hint: String,
    pub source: String,
    pub agents_status: String,
    pub error: Option<String>,
}

fn google_api_key_path(app: &AppHandle) -> Result<PathBuf, String> {
    let config = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&config).map_err(|e| e.to_string())?;
    Ok(config.join("google_api_key"))
}

fn key_hint(key: &str) -> String {
    let trimmed = key.trim();
    let chars: Vec<char> = trimmed.chars().collect();
    if chars.len() <= 4 {
        return "••••".into();
    }
    chars[chars.len() - 4..].iter().collect()
}

fn write_google_api_key_file(path: &std::path::Path, key: &str) -> Result<(), String> {
    std::fs::write(path, format!("{key}\n")).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn agents_status_of(status: &RuntimeStatus) -> String {
    status
        .services
        .get("agents")
        .and_then(|v| v.get("status"))
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string()
}

async fn post_supervisor_json(
    manager: &RuntimeManager,
    path: &str,
    json_body: &str,
) -> Result<(u16, String), String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpStream;

    let (port, token) = {
        let guard = manager.inner.lock().await;
        let hs = guard
            .handshake
            .as_ref()
            .ok_or_else(|| "Python runtime is not ready".to_string())?;
        let port = hs.port.ok_or_else(|| "Python runtime is not ready".to_string())?;
        let token = hs
            .token
            .clone()
            .unwrap_or_else(|| guard.token.clone());
        (port, token)
    };

    let req = format!(
        "POST {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{json_body}",
        json_body.len()
    );
    let mut stream = TcpStream::connect(("127.0.0.1", port))
        .await
        .map_err(|e| e.to_string())?;
    stream
        .write_all(req.as_bytes())
        .await
        .map_err(|e| e.to_string())?;
    let mut buf = Vec::new();
    stream.read_to_end(&mut buf).await.map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&buf);
    let (head, body) = text.split_once("\r\n\r\n").unwrap_or((text.as_ref(), ""));
    let status = head
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|code| code.parse::<u16>().ok())
        .unwrap_or(0);
    Ok((status, body.trim().to_string()))
}

fn status_from_sources(
    app: &AppHandle,
    agents_status: String,
    error: Option<String>,
) -> Result<GoogleApiKeyStatus, String> {
    let path = google_api_key_path(app)?;
    if let Ok(raw) = std::fs::read_to_string(&path) {
        let key = raw.trim();
        if !key.is_empty() {
            return Ok(GoogleApiKeyStatus {
                configured: true,
                hint: key_hint(key),
                source: "settings".into(),
                agents_status,
                error,
            });
        }
    }
    let config = app.path().app_config_dir().map_err(|e| e.to_string())?;
    if let Some(key) = read_user_api_key(&config) {
        return Ok(GoogleApiKeyStatus {
            configured: true,
            hint: key_hint(&key),
            source: "environment".into(),
            agents_status,
            error,
        });
    }
    Ok(GoogleApiKeyStatus {
        configured: false,
        hint: String::new(),
        source: "none".into(),
        agents_status,
        error,
    })
}

#[tauri::command]
pub async fn google_api_key_status(
    app: AppHandle,
    manager: State<'_, Arc<RuntimeManager>>,
) -> Result<GoogleApiKeyStatus, String> {
    let runtime = manager.status().await;
    status_from_sources(&app, agents_status_of(&runtime), None)
}

#[tauri::command]
pub async fn set_google_api_key(
    app: AppHandle,
    manager: State<'_, Arc<RuntimeManager>>,
    key: String,
) -> Result<GoogleApiKeyStatus, String> {
    let key = key.trim().to_string();
    if key.len() < 8 {
        return Err("Paste a valid API key (at least 8 characters).".into());
    }
    let path = google_api_key_path(&app)?;
    write_google_api_key_file(&path, &key)?;
    log::info!("google api key saved to app config");

    let body = serde_json::json!({ "api_key": key }).to_string();
    let posted = tokio::time::timeout(
        Duration::from_secs(45),
        post_supervisor_json(&manager, "/runtime/secrets/google-api-key", &body),
    )
    .await;

    let runtime = manager.status().await;
    match posted {
        Ok(Ok((code, response))) if (200..300).contains(&code) => {
            let agents_status = serde_json::from_str::<serde_json::Value>(&response)
                .ok()
                .and_then(|v| {
                    v.get("agents")
                        .and_then(|a| a.get("status"))
                        .and_then(|s| s.as_str())
                        .map(str::to_string)
                })
                .unwrap_or_else(|| agents_status_of(&runtime));
            status_from_sources(&app, agents_status, None)
        }
        Ok(Ok((_code, response))) => {
            let detail = serde_json::from_str::<serde_json::Value>(&response)
                .ok()
                .and_then(|v| v.get("detail").and_then(|d| d.as_str()).map(str::to_string))
                .unwrap_or_else(|| "Failed to start agents with this key.".into());
            status_from_sources(&app, "error".into(), Some(detail))
        }
        Ok(Err(err)) => status_from_sources(
            &app,
            agents_status_of(&runtime),
            Some(format!(
                "Key saved. Restart Adelpha if agents stay offline ({err})."
            )),
        ),
        Err(_) => status_from_sources(
            &app,
            agents_status_of(&runtime),
            Some(
                "Key saved. The agent runtime timed out starting — retry from the Agents tab."
                    .into(),
            ),
        ),
    }
}

#[tauri::command]
pub async fn clear_google_api_key(
    app: AppHandle,
    manager: State<'_, Arc<RuntimeManager>>,
) -> Result<GoogleApiKeyStatus, String> {
    let path = google_api_key_path(&app)?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    let body = serde_json::json!({ "api_key": serde_json::Value::Null }).to_string();
    let _ = tokio::time::timeout(
        Duration::from_secs(8),
        post_supervisor_json(&manager, "/runtime/secrets/google-api-key", &body),
    )
    .await;
    let runtime = manager.status().await;
    status_from_sources(&app, agents_status_of(&runtime), None)
}
