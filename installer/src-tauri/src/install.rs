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

pub fn get_default_install_dir() -> PathBuf {
    if let Some(local_data) = dirs_next::data_local_dir() {
        local_data.join("Programs").join("ViveStream-Next")
    } else {
        PathBuf::from(r"C:\Program Files\ViveStream-Next")
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

        if file.name().ends_with('/') {
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
        let _ = app.emit(
            "install-progress",
            ProgressPayload {
                percent: progress,
                status: format!("Extracting {} ({} of {})", file.name(), i + 1, total_files),
            },
        );
    }

    Ok(())
}

pub fn copy_uninstaller(target_dir: &Path) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    if let Ok(current_exe) = std::env::current_exe() {
        let uninstaller_dest = target_dir.join("uninstall.exe");
        let _ = fs::copy(current_exe, uninstaller_dest);
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

    // 1. Desktop shortcut
    if desktop {
        if let Some(desktop_dir) = dirs_next::desktop_dir() {
            let desktop_link = desktop_dir.join("ViveStream Next.lnk");
            create_single_shortcut(&exe_str, &working_dir_str, &desktop_link);
        }
    }

    // 2. Start menu shortcut
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

pub fn perform_uninstall() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Remove shortcuts
    if let Some(desktop_dir) = dirs_next::desktop_dir() {
        let _ = fs::remove_file(desktop_dir.join("ViveStream Next.lnk"));
    }
    if let Some(appdata) = dirs_next::data_dir() {
        let _ = fs::remove_file(
            appdata
                .join(r"Microsoft\Windows\Start Menu\Programs")
                .join("ViveStream Next.lnk"),
        );
    }

    // 2. Remove Registry entries
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let _ = hkcu.delete_subkey(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\ViveStream-Next");

    // 3. Delete directory via background batch command once this uninstaller exits
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(install_dir) = current_exe.parent() {
            let install_dir_str = install_dir.to_string_lossy().to_string();
            let script = format!(
                "timeout /t 1 /nobreak > NUL & rmdir /s /q \"{}\"",
                install_dir_str
            );
            let _ = std::process::Command::new("cmd")
                .args(["/C", &script])
                .spawn();
        }
    }

    Ok(())
}
