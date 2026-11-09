use std::fs::{self, File};
use std::io::{self, Cursor};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use serde::Serialize;
use winreg::enums::*;
use winreg::RegKey;

// Embedded zip payload compiled into the binary
pub const APP_PAYLOAD: &[u8] = include_bytes!("../app_payload.zip");

#[derive(Clone, Serialize)]
pub struct ProgressPayload {
    pub percent: f64,
    pub status: String,
}

#[derive(Clone, Serialize)]
pub struct UninstallInfo {
    pub app_name: String,
    pub version: String,
    pub install_path: String,
    pub data_path: String,
    pub data_size_formatted: String,
    pub data_exists: bool,
}

pub fn get_default_install_dir() -> PathBuf {
    if let Some(local_data) = dirs_next::data_local_dir() {
        local_data.join("Programs").join("ViveStream-Next")
    } else {
        PathBuf::from(r"C:\Program Files\ViveStream-Next")
    }
}

pub fn get_user_data_dir() -> PathBuf {
    if let Some(home) = dirs_next::home_dir() {
        home.join("ViveStream")
    } else {
        PathBuf::from(r"C:\Users\Public\ViveStream")
    }
}

pub fn get_roaming_data_dir() -> Option<PathBuf> {
    dirs_next::data_dir().map(|d| d.join("com.localghost.vivestream-next"))
}

pub fn get_local_data_dir() -> Option<PathBuf> {
    dirs_next::data_local_dir().map(|d| d.join("com.localghost.vivestream-next"))
}

pub fn calculate_dir_size(path: &Path) -> u64 {
    let mut total = 0u64;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                if let Ok(meta) = p.metadata() {
                    total += meta.len();
                }
            } else if p.is_dir() {
                total += calculate_dir_size(&p);
            }
        }
    }
    total
}

pub fn format_size(bytes: u64) -> String {
    if bytes >= 1024 * 1024 * 1024 {
        format!("{:.1} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    } else if bytes >= 1024 * 1024 {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    } else if bytes >= 1024 {
        format!("{:.0} KB", bytes as f64 / 1024.0)
    } else {
        format!("{} B", bytes)
    }
}

pub fn get_uninstall_info(custom_install_dir: Option<String>) -> UninstallInfo {
    let install_dir = if let Some(dir) = custom_install_dir {
        PathBuf::from(dir)
    } else if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            if parent.join("vivestream-next.exe").exists() {
                parent.to_path_buf()
            } else {
                get_default_install_dir()
            }
        } else {
            get_default_install_dir()
        }
    } else {
        get_default_install_dir()
    };

    let user_data = get_user_data_dir();
    let roaming_data = get_roaming_data_dir();
    let local_data = get_local_data_dir();

    let mut total_size = 0u64;
    let mut data_exists = false;

    if user_data.exists() {
        data_exists = true;
        total_size += calculate_dir_size(&user_data);
    }
    if let Some(r) = &roaming_data {
        if r.exists() {
            data_exists = true;
            total_size += calculate_dir_size(r);
        }
    }
    if let Some(l) = &local_data {
        if l.exists() {
            data_exists = true;
            total_size += calculate_dir_size(l);
        }
    }

    UninstallInfo {
        app_name: "ViveStream Next".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        install_path: install_dir.to_string_lossy().to_string(),
        data_path: user_data.to_string_lossy().to_string(),
        data_size_formatted: format_size(total_size),
        data_exists,
    }
}

pub fn safe_remove_file(path: &Path) -> bool {
    if !path.exists() {
        return true;
    }
    #[cfg(target_os = "windows")]
    {
        if let Ok(meta) = fs::metadata(path) {
            let mut perms = meta.permissions();
            if perms.readonly() {
                perms.set_readonly(false);
                let _ = fs::set_permissions(path, perms);
            }
        }
    }
    for attempt in 0..6 {
        if fs::remove_file(path).is_ok() || !path.exists() {
            return true;
        }
        std::thread::sleep(std::time::Duration::from_millis(80 * (attempt + 1) as u64));
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = std::process::Command::new("cmd");
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        let _ = cmd
            .args(["/C", "del", "/f", "/q", "/a", &path.to_string_lossy()])
            .output();
    }
    !path.exists()
}

pub fn safe_remove_dir_all(dir: &Path) -> bool {
    if !dir.exists() {
        return true;
    }
    clean_directory_contents(dir);
    for _ in 0..5 {
        if fs::remove_dir_all(dir).is_ok() || !dir.exists() {
            return true;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = std::process::Command::new("cmd");
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        let _ = cmd
            .args(["/C", "rmdir", "/s", "/q", &dir.to_string_lossy()])
            .output();
    }
    !dir.exists()
}

pub fn clean_directory_contents(dir: &Path) {
    if !dir.exists() {
        return;
    }
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() || p.is_symlink() {
                safe_remove_file(&p);
            } else if p.is_dir() {
                safe_remove_dir_all(&p);
            }
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Ok(mut remaining) = fs::read_dir(dir) {
            if remaining.next().is_some() {
                use std::os::windows::process::CommandExt;
                let mut cmd = std::process::Command::new("cmd");
                cmd.creation_flags(0x08000000);
                let _ = cmd
                    .args([
                        "/C",
                        "del",
                        "/f",
                        "/s",
                        "/q",
                        "/a",
                        &format!(r"{}\*", dir.to_string_lossy()),
                    ])
                    .output();
            }
        }
    }
}

pub fn kill_running_processes() {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let targets = [
            "vivestream-next.exe",
            "vivestream.exe",
            "vivestream-cli.exe",
            "ffmpeg.exe",
            "ffprobe.exe",
            "yt-dlp.exe",
            "deno.exe",
            "vivestream-whisper.exe",
        ];
        for t in &targets {
            let mut cmd = std::process::Command::new("taskkill");
            cmd.creation_flags(0x08000000);
            let _ = cmd.args(["/F", "/IM", t, "/T"]).output();
        }
        std::thread::sleep(std::time::Duration::from_millis(300));
    }
    #[cfg(not(target_os = "windows"))]
    {
        let targets = [
            "vivestream-next",
            "vivestream",
            "vivestream-cli",
            "ffmpeg",
            "ffprobe",
            "yt-dlp",
            "deno",
            "vivestream-whisper",
        ];
        for t in &targets {
            let _ = std::process::Command::new("pkill")
                .args(["-9", "-f", t])
                .output();
        }
        std::thread::sleep(std::time::Duration::from_millis(300));
    }
}

pub fn extract_payload(
    app: &AppHandle,
    target_dir: &Path,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    fs::create_dir_all(target_dir)?;

    let reader = Cursor::new(APP_PAYLOAD);
    let mut archive = zip::ZipArchive::new(reader)?;
    let total_files = archive.len();

    let _ = app.emit(
        "install-progress",
        ProgressPayload {
            percent: 10.0,
            status: "Unpacking application files...".to_string(),
        },
    );

    for i in 0..total_files {
        let mut file = archive.by_index(i)?;
        let outpath = match file.enclosed_name() {
            Some(path) => target_dir.join(path),
            None => continue,
        };

        if file.is_dir() {
            fs::create_dir_all(&outpath)?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(p)?;
                }
            }
            let mut outfile = File::create(&outpath)?;
            io::copy(&mut file, &mut outfile)?;
        }

        let progress = 10.0 + ((i as f64 / total_files as f64) * 60.0);
        let display_name = file.name().map(|n| n.to_string()).unwrap_or_else(|_| "file".to_string());
        let _ = app.emit(
            "install-progress",
            ProgressPayload {
                percent: progress,
                status: format!("Extracting {} ({} of {})", display_name, i + 1, total_files),
            },
        );
    }

    Ok(())
}

pub fn copy_uninstaller(target_dir: &Path) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    if let Ok(current_exe) = std::env::current_exe() {
        let uninstaller_dest = target_dir.join("uninstall.exe");
        let _ = fs::copy(&current_exe, &uninstaller_dest);
    }
    Ok(())
}

fn create_single_shortcut(target_exe: &str, working_dir: &str, lnk_path: &Path) {
    let script = format!(
        "$ws = New-Object -ComObject WScript.Shell; \
         $s = $ws.CreateShortcut('{}'); \
         $s.TargetPath = '{}'; \
         $s.WorkingDirectory = '{}'; \
         $s.IconLocation = '{},0'; \
         $s.Save();",
        lnk_path.to_string_lossy().replace('\'', "''"),
        target_exe.replace('\'', "''"),
        working_dir.replace('\'', "''"),
        target_exe.replace('\'', "''")
    );

    let mut cmd = std::process::Command::new("powershell");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let _ = cmd.args(["-NoProfile", "-Command", &script]).output();
}

pub fn create_shortcuts(
    install_dir: &Path,
    desktop: bool,
    start_menu: bool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let main_exe = install_dir.join("vivestream-next.exe");
    let exe_str = main_exe.to_string_lossy().to_string();
    let working_dir_str = install_dir.to_string_lossy().to_string();

    if desktop {
        if let Some(desktop_dir) = dirs_next::desktop_dir() {
            let desktop_link = desktop_dir.join("ViveStream Next.lnk");
            create_single_shortcut(&exe_str, &working_dir_str, &desktop_link);
        }
    }

    if start_menu {
        if let Some(appdata) = dirs_next::data_dir() {
            let programs_dir = appdata.join(r"Microsoft\Windows\Start Menu\Programs");
            if programs_dir.exists() {
                let start_link = programs_dir.join("ViveStream Next.lnk");
                create_single_shortcut(&exe_str, &working_dir_str, &start_link);
            }
        }
    }

    Ok(())
}

pub fn register_uninstall_entry(
    install_dir: &Path,
    version: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let subkey = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\ViveStream-Next";
    let (key, _) = hkcu.create_subkey(subkey)?;

    let main_exe = install_dir.join("vivestream-next.exe");
    let uninstaller_exe = install_dir.join("uninstall.exe");

    key.set_value("DisplayName", &"ViveStream Next")?;
    key.set_value("DisplayVersion", &version)?;
    key.set_value("Publisher", &"LocalGhost")?;
    key.set_value("InstallLocation", &install_dir.to_string_lossy().as_ref())?;
    key.set_value(
        "DisplayIcon",
        &format!("{},0", main_exe.to_string_lossy()),
    )?;
    key.set_value(
        "UninstallString",
        &format!("\"{}\" --uninstall", uninstaller_exe.to_string_lossy()),
    )?;
    key.set_value("NoModify", &1u32)?;
    key.set_value("NoRepair", &1u32)?;

    Ok(())
}

pub async fn execute_uninstallation(
    app: &AppHandle,
    delete_app_data: bool,
    custom_install_dir: Option<String>,
) -> Result<(), String> {
    let _ = app.emit(
        "uninstall-progress",
        ProgressPayload {
            percent: 10.0,
            status: "Terminating running application processes...".to_string(),
        },
    );
    kill_running_processes();

    let _ = app.emit(
        "uninstall-progress",
        ProgressPayload {
            percent: 25.0,
            status: "Removing application shortcuts...".to_string(),
        },
    );
    if let Some(desktop_dir) = dirs_next::desktop_dir() {
        safe_remove_file(&desktop_dir.join("ViveStream Next.lnk"));
    }
    if let Some(appdata) = dirs_next::data_dir() {
        safe_remove_file(
            &appdata
                .join(r"Microsoft\Windows\Start Menu\Programs")
                .join("ViveStream Next.lnk"),
        );
    }

    let _ = app.emit(
        "uninstall-progress",
        ProgressPayload {
            percent: 40.0,
            status: "Cleaning Windows registry entries...".to_string(),
        },
    );
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let _ = hkcu.delete_subkey(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\ViveStream-Next");

    if delete_app_data {
        let _ = app.emit(
            "uninstall-progress",
            ProgressPayload {
                percent: 55.0,
                status: "Removing downloaded media library and assets...".to_string(),
            },
        );
        let user_data = get_user_data_dir();
        if user_data.exists() {
            safe_remove_dir_all(&user_data);
        }

        let _ = app.emit(
            "uninstall-progress",
            ProgressPayload {
                percent: 70.0,
                status: "Removing databases, AI models, and local cache...".to_string(),
            },
        );
        if let Some(r) = get_roaming_data_dir() {
            if r.exists() {
                safe_remove_dir_all(&r);
            }
        }
        if let Some(l) = get_local_data_dir() {
            if l.exists() {
                safe_remove_dir_all(&l);
            }
        }
    } else {
        let _ = app.emit(
            "uninstall-progress",
            ProgressPayload {
                percent: 65.0,
                status: "Preserving downloaded media and library files...".to_string(),
            },
        );
    }

    let _ = app.emit(
        "uninstall-progress",
        ProgressPayload {
            percent: 85.0,
            status: "Removing program files...".to_string(),
        },
    );

    let info = get_uninstall_info(custom_install_dir);
    let install_dir = PathBuf::from(info.install_path);
    if install_dir.exists() {
        safe_remove_dir_all(&install_dir);
    }

    let _ = app.emit(
        "uninstall-progress",
        ProgressPayload {
            percent: 100.0,
            status: "Uninstallation complete!".to_string(),
        },
    );

    Ok(())
}
