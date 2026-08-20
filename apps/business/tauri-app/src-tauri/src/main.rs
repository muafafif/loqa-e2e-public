// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

struct BackendProcess(Mutex<Option<Child>>);

fn find_backend_binary() -> Option<std::path::PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let app_dir = exe.parent()?;

    let candidates = [
        // Windows / Linux: binary sits next to the exe
        app_dir.join("loqa-work-backend.exe"),
        app_dir.join("loqa-work-backend"),
        // macOS .app bundle: exe is at Contents/MacOS/, resources at Contents/Resources/
        app_dir.join("../Resources/loqa-work-backend"),
        // Tauri v1 on macOS sometimes resolves to Contents/MacOS/../Resources
        app_dir.join("../../Resources/loqa-work-backend"),
    ];

    candidates.into_iter().find(|p| p.exists())
}

fn start_backend() -> Option<Child> {
    let binary = find_backend_binary()?;
    // DATA_DIR and MODELS_DIR are set by run.py to ~/LOQA/work/data and
    // ~/LOQA/models respectively. Do not override them here.
    Command::new(binary).spawn().ok()
}

fn main() {
    tauri::Builder::default()
        .manage(BackendProcess(Mutex::new(None)))
        .setup(|app| {
            let state = app.state::<BackendProcess>();
            let child = start_backend();
            *state.0.lock().unwrap() = child;

            // Poll until backend is ready (max 30s) instead of a fixed sleep
            for _ in 0..60 {
                if std::net::TcpStream::connect("127.0.0.1:8001").is_ok() {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(500));
            }
            Ok(())
        })
        .on_window_event(|event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event.event() {
                let state = event.window().state::<BackendProcess>();
                if let Some(mut child) = state.0.lock().unwrap().take() {
                    child.kill().ok();
                };
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
