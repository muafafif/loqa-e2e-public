#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

// ── State ─────────────────────────────────────────────────────────────────────

struct RunningApps(Mutex<HashMap<String, Child>>);

// ── Helpers ───────────────────────────────────────────────────────────────────

fn apps_install_dir(app: &AppHandle) -> PathBuf {
    let data_dir = tauri::api::path::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("KnowledgeAI")
        .join("apps");
    std::fs::create_dir_all(&data_dir).ok();
    data_dir
}

fn app_dir(app: &AppHandle, app_id: &str) -> PathBuf {
    apps_install_dir(app).join(app_id)
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Check if a sub-app is installed. Returns the version string if installed.
#[tauri::command]
fn check_installed(app: AppHandle, app_id: String) -> Option<String> {
    let manifest_path = app_dir(&app, &app_id).join("manifest.json");
    if !manifest_path.exists() {
        return None;
    }
    let content = std::fs::read_to_string(&manifest_path).ok()?;
    let v: serde_json::Value = serde_json::from_str(&content).ok()?;
    v["version"].as_str().map(|s| s.to_string())
}

/// Launch a sub-app. The sub-app binary is expected at:
///   <data_dir>/KnowledgeAI/apps/<app_id>/<binary_name>
/// It will start its own backend + open a new window on the given port.
#[tauri::command]
fn launch_app(
    app: AppHandle,
    state: State<RunningApps>,
    app_id: String,
) -> Result<(), String> {
    let dir = app_dir(&app, &app_id);

    // Binary name matches app_id (e.g. "personal" → "personal" / "personal.exe")
    #[cfg(target_os = "windows")]
    let bin = dir.join(format!("{}.exe", app_id));
    #[cfg(not(target_os = "windows"))]
    let bin = dir.join(&app_id);

    if !bin.exists() {
        return Err(format!("Binary not found: {}", bin.display()));
    }

    let child = Command::new(&bin)
        .current_dir(&dir)
        .spawn()
        .map_err(|e| e.to_string())?;

    state.0.lock().unwrap().insert(app_id, child);
    Ok(())
}

/// Kill a running sub-app.
#[tauri::command]
fn kill_app(state: State<RunningApps>, app_id: String) {
    if let Some(mut child) = state.0.lock().unwrap().remove(&app_id) {
        child.kill().ok();
    }
}

/// Check if a sub-app process is still running.
#[tauri::command]
fn is_app_running(state: State<RunningApps>, app_id: String) -> bool {
    if let Some(child) = state.0.lock().unwrap().get_mut(&app_id) {
        // try_wait: None means still running
        matches!(child.try_wait(), Ok(None))
    } else {
        false
    }
}

// ── Main ──────────────────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .manage(RunningApps(Mutex::new(HashMap::new())))
        .invoke_handler(tauri::generate_handler![
            check_installed,
            launch_app,
            kill_app,
            is_app_running,
        ])
        .on_window_event(|event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event.event() {
                // Kill all running sub-apps when shell closes
                let state = event.window().state::<RunningApps>();
                let mut map = state.0.lock().unwrap();
                for (_, mut child) in map.drain() {
                    child.kill().ok();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
