#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod install;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

static IS_UNINSTALL_MODE: AtomicBool = AtomicBool::new(false);
static IS_TEMP_UNINSTALLER: AtomicBool = AtomicBool::new(false);
static CUSTOM_INSTALL_DIR: Mutex<Option<String>> = Mutex::new(None);

#[tauri::command]
fn get_app_mode() -> String {
    if IS_UNINSTALL_MODE.load(Ordering::SeqCst) {
        "uninstall".to_string()
    } else {
        "install".to_string()
    }
}

#[tauri::command]
fn get_uninstall_info() -> install::UninstallInfo {
    let custom_dir = CUSTOM_INSTALL_DIR.lock().unwrap().clone();
    install::get_uninstall_info(custom_dir)
}

#[tauri::command]
async fn start_uninstallation(app: AppHandle, delete_app_data: bool) -> Result<(), String> {
    let custom_dir = CUSTOM_INSTALL_DIR.lock().unwrap().clone();
    install::execute_uninstallation(&app, delete_app_data, custom_dir).await
}

#[tauri::command]
fn close_uninstaller(window: tauri::Window) {
    if IS_TEMP_UNINSTALLER.load(Ordering::SeqCst) {
        if let Ok(current_exe) = std::env::current_exe() {
            let exe_str = current_exe.to_string_lossy().to_string();
            let script = format!("timeout /t 1 /nobreak > NUL & del /f /q \"{}\"", exe_str);
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                let mut cmd = std::process::Command::new("cmd");
                cmd.creation_flags(0x00000008); // DETACHED_PROCESS
                let _ = cmd.args(["/C", &script]).spawn();
            }
        }
    }
    let _ = window.close();
}

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
    let args: Vec<String> = std::env::args().collect();
    let current_exe = std::env::current_exe().unwrap_or_default();
    let exe_name = current_exe
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();

    let is_uninstall = exe_name.contains("uninstall") || args.iter().any(|arg| arg == "--uninstall");
    let is_temp = args.iter().any(|arg| arg == "--temp-uninstaller");

    // Check if custom install dir was passed
    for i in 0..args.len() {
        if args[i] == "--install-dir" && i + 1 < args.len() {
            *CUSTOM_INSTALL_DIR.lock().unwrap() = Some(args[i + 1].clone());
        }
    }

    if is_uninstall {
        IS_UNINSTALL_MODE.store(true, Ordering::SeqCst);

        // If not running from temp, copy self to TEMP and relaunch so the installed directory is completely unlocked
        if !is_temp {
            let temp_dir = std::env::temp_dir();
            let temp_uninstaller = temp_dir.join("vivestream-uninstaller.exe");
            let install_dir = current_exe
                .parent()
                .unwrap_or(&current_exe)
                .to_string_lossy()
                .to_string();

            if std::fs::copy(&current_exe, &temp_uninstaller).is_ok() {
                let mut cmd = std::process::Command::new(&temp_uninstaller);
                cmd.args([
                    "--uninstall",
                    "--temp-uninstaller",
                    "--install-dir",
                    &install_dir,
                ]);
                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    cmd.creation_flags(0x00000008); // DETACHED_PROCESS
                }
                if cmd.spawn().is_ok() {
                    return; // Exit original process immediately
                }
            }
        } else {
            IS_TEMP_UNINSTALLER.store(true, Ordering::SeqCst);
        }
    }

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_app_mode,
            get_uninstall_info,
            start_uninstallation,
            close_uninstaller,
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
