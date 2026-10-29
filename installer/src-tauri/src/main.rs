#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod install;

use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

#[tauri::command]
fn get_default_install_path() -> String {
    install::get_default_install_dir().to_string_lossy().to_string()
}

#[tauri::command]
fn select_folder(current_path: Option<String>) -> Option<String> {
    let initial = current_path.unwrap_or_default().replace('\'', "''");
    let script = format!(
        "[System.Reflection.Assembly]::LoadWithPartialName('System.windows.forms') | Out-Null; \
         $d = New-Object System.Windows.Forms.FolderBrowserDialog; \
         $d.SelectedPath = '{}'; \
         if($d.ShowDialog() -eq 'OK'){{ Write-Output $d.SelectedPath }}",
        initial
    );

    let mut cmd = std::process::Command::new("powershell");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.args(["-NoProfile", "-Command", &script]).output().ok()?;
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        None
    } else {
        Some(path)
    }
}

#[tauri::command]
async fn start_installation(
    app: AppHandle,
    path: String,
    desktop_shortcut: bool,
    start_menu_shortcut: bool,
) -> Result<(), String> {
    let target_dir = PathBuf::from(path);

    // 1. Extract payload
    install::extract_payload(&app, &target_dir).map_err(|e| e.to_string())?;

    // 2. Configure uninstaller
    let _ = app.emit(
        "install-progress",
        install::ProgressPayload {
            percent: 75.0,
            status: "Configuring uninstaller...".to_string(),
        },
    );
    install::copy_uninstaller(&target_dir).map_err(|e| e.to_string())?;

    // 3. Create shortcuts
    let _ = app.emit(
        "install-progress",
        install::ProgressPayload {
            percent: 85.0,
            status: "Creating shortcuts...".to_string(),
        },
    );
    install::create_shortcuts(&target_dir, desktop_shortcut, start_menu_shortcut)
        .map_err(|e| e.to_string())?;

    // 4. Windows Registry integration
    let _ = app.emit(
        "install-progress",
        install::ProgressPayload {
            percent: 95.0,
            status: "Registering in Windows...".to_string(),
        },
    );
    install::register_uninstall_entry(&target_dir, env!("CARGO_PKG_VERSION"))
        .map_err(|e| e.to_string())?;

    let _ = app.emit(
        "install-progress",
        install::ProgressPayload {
            percent: 100.0,
            status: "Installation complete!".to_string(),
        },
    );

    Ok(())
}

#[tauri::command]
fn launch_installed_app(install_path: String) -> Result<(), String> {
    let install_dir = PathBuf::from(&install_path);
    let exe = install_dir.join("vivestream-next.exe");
    if exe.exists() {
        let mut cmd = std::process::Command::new(exe);
        cmd.current_dir(&install_dir);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x00000008); // DETACHED_PROCESS
        }
        cmd.spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn close_installer(window: tauri::Window) {
    let _ = window.close();
}

#[tauri::command]
fn minimize_installer(window: tauri::Window) {
    let _ = window.minimize();
}

fn main() {
    // If launched with --uninstall, perform cleanup and exit without launching GUI
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|arg| arg == "--uninstall") {
        let _ = install::perform_uninstall();
        return;
    }

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_default_install_path,
            select_folder,
            start_installation,
            launch_installed_app,
            close_installer,
            minimize_installer,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ViveStream installer");
}
