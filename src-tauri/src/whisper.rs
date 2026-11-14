use crate::system::{get_base_dir, get_bin_dir};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::RwLock;
use tauri::{AppHandle, Emitter, Manager};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Static telemetry & system scan cache to ensure instant UI loads (0ms latency on tab switches)
static SYSTEM_TELEMETRY_CACHE: RwLock<Option<(serde_json::Value, serde_json::Value)>> = RwLock::new(None);

pub fn invalidate_whisper_cache() {
    if let Ok(mut lock) = SYSTEM_TELEMETRY_CACHE.write() {
        *lock = None;
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelDownloadProgress {
    pub model: String,
    pub percentage: f64,
    pub downloaded_mb: f64,
    pub total_mb: f64,
}

/// Helper: Prepend bin_dir to command's PATH so subprocesses can locate ffmpeg and other tools
fn configure_subprocess_path(cmd: &mut Command, bin_dir: &Path) {
    let current_path = std::env::var_os("PATH").unwrap_or_default();
    let mut new_path = std::ffi::OsString::new();
    new_path.push(bin_dir);
    #[cfg(target_os = "windows")]
    new_path.push(";");
    #[cfg(not(target_os = "windows"))]
    new_path.push(":");
    new_path.push(current_path);

    cmd.env("PATH", new_path);
}

/// Resolve the absolute path to the ViveStream Whisper neural binary across Windows, Linux, and macOS
pub fn get_whisper_bin_path(app: &AppHandle) -> Result<PathBuf, String> {
    let bin_name = if cfg!(target_os = "windows") {
        "vivestream-whisper.exe"
    } else {
        "vivestream-whisper"
    };

    let bin_dir = get_bin_dir(app)?;
    let app_data_bin = bin_dir.join(bin_name);

    // 1. Check local workspace candidates during development
    let mut candidates = Vec::new();

    if let Ok(curr) = std::env::current_dir() {
        candidates.push(curr.join("ViveStream-Whisper").join("target").join("release").join(bin_name));
        candidates.push(curr.join("vivestream-whisper").join("target").join("release").join(bin_name));
        candidates.push(curr.join("target").join("release").join(bin_name));
        candidates.push(curr.join(bin_name));

        if let Some(parent) = curr.parent() {
            candidates.push(parent.join("ViveStream-Whisper").join("target").join("release").join(bin_name));
            candidates.push(parent.join("vivestream-whisper").join("target").join("release").join(bin_name));
            candidates.push(parent.join(bin_name));
            if let Some(grand) = parent.parent() {
                candidates.push(grand.join("ViveStream-Whisper").join("target").join("release").join(bin_name));
                candidates.push(grand.join("vivestream-whisper").join("target").join("release").join(bin_name));
            }
        }
    }

    // 2. Check current executable folder (for packaged builds and portable distributions)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            candidates.push(exe_dir.join(bin_name));
            candidates.push(exe_dir.join("bin").join(bin_name));
            candidates.push(exe_dir.join("resources").join(bin_name));
        }
    }

    // 3. Check Tauri bundled resources directory
    if let Ok(res_dir) = app.path().resource_dir() {
        candidates.push(res_dir.join(bin_name));
        candidates.push(res_dir.join("bin").join(bin_name));
    }

    for cand in &candidates {
        if cand.is_file() {
            // Check if workspace build is newer than installed app_data_bin
            let is_newer = if app_data_bin.is_file() {
                let cand_mtime = cand.metadata().and_then(|m| m.modified()).ok();
                let dest_mtime = app_data_bin.metadata().and_then(|m| m.modified()).ok();
                match (cand_mtime, dest_mtime) {
                    (Some(c), Some(d)) => c > d,
                    _ => false,
                }
            } else {
                true
            };

            if is_newer {
                let _ = fs::create_dir_all(&bin_dir);
                let _ = fs::copy(cand, &app_data_bin);
                #[cfg(not(target_os = "windows"))]
                {
                    use std::os::unix::fs::PermissionsExt;
                    if let Ok(meta) = fs::metadata(&app_data_bin) {
                        let mut perms = meta.permissions();
                        perms.set_mode(0o755);
                        let _ = fs::set_permissions(&app_data_bin, perms);
                    }
                }
            }

            if app_data_bin.is_file() {
                return Ok(app_data_bin);
            }
            return Ok(cand.clone());
        }
    }

    // 4. Check AppData/bin for packaged production runtime
    if app_data_bin.is_file() {
        #[cfg(not(target_os = "windows"))]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(meta) = fs::metadata(&app_data_bin) {
                let mut perms = meta.permissions();
                if perms.mode() & 0o111 == 0 {
                    perms.set_mode(0o755);
                    let _ = fs::set_permissions(&app_data_bin, perms);
                }
            }
        }
        return Ok(app_data_bin);
    }

    // 5. Fallback to standard Unix/macOS locations if installed globally
    #[cfg(unix)]
    {
        let system_paths = ["/usr/local/bin", "/usr/bin", "/opt/homebrew/bin"];
        for sp in &system_paths {
            let p = PathBuf::from(sp).join(bin_name);
            if p.is_file() {
                return Ok(p);
            }
        }
    }

    Ok(app_data_bin)
}

/// Resolve the Whisper neural models directory across Windows, Linux, and macOS
pub fn get_whisper_models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base_dir = get_base_dir(app)?;
    let models_dir = base_dir.join("AI").join("Whisper");

    // 1. Primary path: %USERPROFILE%\ViveStream\AI\Whisper
    if models_dir.exists() {
        return Ok(models_dir);
    }

    // 2. Backward-compatibility fallback: ViveStream/whisper/models
    let legacy = base_dir.join("whisper").join("models");
    if legacy.exists() {
        return Ok(legacy);
    }

    // 3. Check local workspace models folder during development if it contains actual models
    if let Ok(curr) = std::env::current_dir() {
        let p1 = curr.join("models");
        if p1.is_dir() {
            if let Ok(entries) = fs::read_dir(&p1) {
                if entries.flatten().any(|e| {
                    e.path()
                        .extension()
                        .and_then(|s| s.to_str())
                        == Some("safetensors")
                }) {
                    return Ok(p1);
                }
            }
        }
        if let Some(parent) = curr.parent() {
            let p2 = parent.join("models");
            if p2.is_dir() {
                if let Ok(entries) = fs::read_dir(&p2) {
                    if entries.flatten().any(|e| {
                        e.path()
                            .extension()
                            .and_then(|s| s.to_str())
                            == Some("safetensors")
                    }) {
                        return Ok(p2);
                    }
                }
            }
        }
    }

    // 4. Create standard path cleanly
    fs::create_dir_all(&models_dir).map_err(|e| {
        format!(
            "Failed to create Whisper models directory at '{}': {}",
            models_dir.display(),
            e
        )
    })?;
    Ok(models_dir)
}

pub fn get_lyrics_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base_dir = get_base_dir(app)?;
    let lyrics_dir = base_dir.join("Lyrics");
    fs::create_dir_all(&lyrics_dir).map_err(|e| {
        format!(
            "Failed to create Lyrics directory at '{}': {}",
            lyrics_dir.display(),
            e
        )
    })?;
    Ok(lyrics_dir)
}

fn run_system_scan(
    app: &AppHandle,
    bin_path: &Path,
    models_dir: &Path,
    binary_installed: bool,
) -> Result<(serde_json::Value, serde_json::Value), String> {
    let mut system_info = serde_json::Value::Null;

    if binary_installed {
        let mut cmd = Command::new(bin_path);
        cmd.arg("--check");
        cmd.arg("--models-dir").arg(models_dir);

        if let Ok(bin_dir) = get_bin_dir(app) {
            configure_subprocess_path(&mut cmd, &bin_dir);
        }

        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        if let Ok(out) = cmd.output() {
            if out.status.success() {
                if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&out.stdout) {
                    system_info = json["system"].clone();
                }
            }
        }
    }

    let full_telemetry = crate::telemetry::scan_full_system();
    let mut system_val = serde_json::to_value(&full_telemetry).unwrap_or(serde_json::Value::Null);

    if let Some(sys_obj) = system_val.as_object_mut() {
        if !system_info.is_null() {
            if let Some(rec) = system_info.get("model_recommendations") {
                sys_obj.insert("model_recommendations".to_string(), rec.clone());
            }
            if let Some(def_m) = system_info.get("recommended_default_model") {
                sys_obj.insert("recommended_default_model".to_string(), def_m.clone());
            }
            if let Some(comp_devs) = system_info.get("compute_devices") {
                sys_obj.insert("compute_devices".to_string(), comp_devs.clone());
            }
            if let Some(rec_dev) = system_info.get("recommended_device_id") {
                sys_obj.insert("recommended_device_id".to_string(), rec_dev.clone());
            }
        }
    }

    if let Ok(mut lock) = SYSTEM_TELEMETRY_CACHE.write() {
        *lock = Some((system_info.clone(), system_val.clone()));
    }

    Ok((system_info, system_val))
}

fn scan_models_dir(models_dir: &Path) -> serde_json::Value {
    let models = vec![
        ("tiny", 75),
        ("base", 142),
        ("small", 466),
        ("medium", 1500),
        ("large-v2", 3100),
        ("large-v3", 3100),
    ];

    let list: Vec<serde_json::Value> = models
        .into_iter()
        .map(|(name, size)| {
            let p_ggml = models_dir.join(format!("ggml-{}.bin", name));
            let p_bin = models_dir.join(format!("{}.bin", name));
            let p_safe = models_dir.join(format!("{}.safetensors", name));

            let active_path = if p_ggml.is_file() {
                Some(p_ggml)
            } else if p_bin.is_file() {
                Some(p_bin)
            } else if p_safe.is_file() {
                Some(p_safe)
            } else {
                None
            };

            let installed = active_path.is_some();
            let actual_size_mb = active_path.as_ref().and_then(|p| {
                p.metadata()
                    .map(|m| ((m.len() as f64) / (1024.0 * 1024.0) * 10.0).round() / 10.0)
                    .ok()
            });

            serde_json::json!({
                "name": name,
                "expected_size_mb": size,
                "actual_size_mb": actual_size_mb,
                "installed": installed,
                "path": active_path.map(|p| p.to_string_lossy().to_string()),
                "download_url": format!("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-{}.bin", name)
            })
        })
        .collect();
    serde_json::Value::Array(list)
}

/// 1. Check Whisper engine installation, system specs, and model availability (instant cached responses)
#[tauri::command]
pub async fn check_whisper_status(
    app: AppHandle,
    force_refresh: Option<bool>,
) -> Result<serde_json::Value, String> {
    let bin_path = get_whisper_bin_path(&app)?;
    let models_dir = get_whisper_models_dir(&app)?;
    let binary_installed = bin_path.is_file();

    let should_refresh = force_refresh.unwrap_or(false);

    let (_system_info, system_val) = if !should_refresh {
        let cached = SYSTEM_TELEMETRY_CACHE.read().ok().and_then(|c| c.clone());
        if let Some((s_info, s_val)) = cached {
            (s_info, s_val)
        } else {
            run_system_scan(&app, &bin_path, &models_dir, binary_installed)?
        }
    } else {
        run_system_scan(&app, &bin_path, &models_dir, binary_installed)?
    };

    // Fast-path model folder scan: checks 6 files on disk in < 0.1ms
    let models_info = scan_models_dir(&models_dir);

    Ok(serde_json::json!({
        "binary_installed": binary_installed,
        "binary_path": bin_path.to_string_lossy().to_string(),
        "models_dir": models_dir.to_string_lossy().to_string(),
        "system": system_val,
        "models": models_info,
    }))
}

/// 2. Install / Deploy the Whisper Standalone Binary
#[tauri::command]
pub async fn install_whisper_binary(app: AppHandle) -> Result<(), String> {
    if !crate::license::check_license_active(&app) {
        return Err("Deploying the Whisper neural engine requires an active 6-Month Pro Subscription. Please activate your license.".to_string());
    }

    let bin_dir = get_bin_dir(&app)?;
    fs::create_dir_all(&bin_dir).map_err(|e| format!("Failed to create binary directory: {}", e))?;

    let bin_name = if cfg!(target_os = "windows") {
        "vivestream-whisper.exe"
    } else {
        "vivestream-whisper"
    };
    let target_bin = bin_dir.join(bin_name);

    let _ = app.emit("whisper-setup-progress", "Deploying Whisper engine binary...");

    // Check if development or packaged binary is accessible locally first
    let mut candidates = Vec::new();
    if let Ok(curr) = std::env::current_dir() {
        candidates.push(curr.join("ViveStream-Whisper").join("target").join("release").join(bin_name));
        candidates.push(curr.join("vivestream-whisper").join("target").join("release").join(bin_name));
        candidates.push(curr.join(bin_name));

        if let Some(parent) = curr.parent() {
            candidates.push(parent.join("ViveStream-Whisper").join("target").join("release").join(bin_name));
            candidates.push(parent.join("vivestream-whisper").join("target").join("release").join(bin_name));
            candidates.push(parent.join(bin_name));
        }
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            candidates.push(exe_dir.join(bin_name));
            candidates.push(exe_dir.join("bin").join(bin_name));
        }
    }

    for cand in candidates {
        if cand.is_file() {
            fs::copy(&cand, &target_bin).map_err(|e| format!("Failed to copy binary: {}", e))?;
            #[cfg(not(target_os = "windows"))]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Ok(meta) = fs::metadata(&target_bin) {
                    let mut perms = meta.permissions();
                    perms.set_mode(0o755);
                    let _ = fs::set_permissions(&target_bin, perms);
                }
            }
            let _ = app.emit("whisper-setup-progress", "Whisper engine successfully deployed from local build.");
            invalidate_whisper_cache();
            return Ok(());
        }
    }

    // Remote GitHub release download from https://github.com/Vivestream-Next/ViveStream-Whisper
    let client = reqwest::Client::builder()
        .user_agent("ViveStream-Next")
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| format!("Failed to initialize HTTP client: {}", e))?;

    let _ = app.emit("whisper-setup-progress", "Checking latest GitHub release of ViveStream-Whisper...");

    // 1. Query GitHub releases API for latest asset URLs
    let mut download_urls = Vec::new();
    let api_url = "https://api.github.com/repos/Vivestream-Next/ViveStream-Whisper/releases/latest";
    if let Ok(resp) = client.get(api_url).send().await {
        if resp.status().is_success() {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(assets) = json["assets"].as_array() {
                    for asset in assets {
                        let name = asset["name"].as_str().unwrap_or("").to_lowercase();
                        let dl_url = asset["browser_download_url"].as_str().unwrap_or("");
                        if dl_url.is_empty() {
                            continue;
                        }

                        #[cfg(target_os = "windows")]
                        if name.ends_with(".exe") && (name.contains("windows") || name.contains("whisper")) {
                            download_urls.push(dl_url.to_string());
                        }

                        #[cfg(target_os = "linux")]
                        if name.contains("linux") && !name.ends_with(".sha256") && !name.ends_with(".tar.gz") {
                            download_urls.push(dl_url.to_string());
                        }

                        #[cfg(target_os = "macos")]
                        if (name.contains("macos") || name.contains("darwin") || name.contains("apple"))
                            && !name.ends_with(".sha256")
                        {
                            download_urls.push(dl_url.to_string());
                        }
                    }
                }
            }
        }
    }

    // 2. Direct latest release URLs matching CI release matrix as fallbacks
    #[cfg(target_os = "windows")]
    {
        download_urls.push("https://github.com/Vivestream-Next/ViveStream-Whisper/releases/latest/download/vivestream-whisper-windows-x64.exe".to_string());
        download_urls.push("https://github.com/Vivestream-Next/ViveStream-Whisper/releases/latest/download/vivestream-whisper.exe".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        #[cfg(target_arch = "x86_64")]
        download_urls.push("https://github.com/Vivestream-Next/ViveStream-Whisper/releases/latest/download/vivestream-whisper-linux-x64".to_string());
        #[cfg(target_arch = "aarch64")]
        download_urls.push("https://github.com/Vivestream-Next/ViveStream-Whisper/releases/latest/download/vivestream-whisper-linux-arm64".to_string());
        download_urls.push("https://github.com/Vivestream-Next/ViveStream-Whisper/releases/latest/download/vivestream-whisper".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        #[cfg(target_arch = "aarch64")]
        download_urls.push("https://github.com/Vivestream-Next/ViveStream-Whisper/releases/latest/download/vivestream-whisper-macos-arm64".to_string());
        #[cfg(target_arch = "x86_64")]
        download_urls.push("https://github.com/Vivestream-Next/ViveStream-Whisper/releases/latest/download/vivestream-whisper-macos-x64".to_string());
        download_urls.push("https://github.com/Vivestream-Next/ViveStream-Whisper/releases/latest/download/vivestream-whisper".to_string());
    }

    let temp_bin = bin_dir.join(format!("{}.download", bin_name));
    let mut downloaded = false;
    let mut last_err = String::from("No release assets available");

    for url in download_urls {
        let _ = app.emit(
            "whisper-setup-progress",
            "Downloading Whisper engine from GitHub release...",
        );

        let resp = match client.get(&url).send().await {
            Ok(r) if r.status().is_success() => r,
            Ok(r) => {
                last_err = format!("Download error: HTTP {}", r.status());
                continue;
            }
            Err(e) => {
                last_err = format!("Network error: {}", e);
                continue;
            }
        };

        let total_size = resp.content_length().unwrap_or(0);
        let total_mb = (total_size as f64) / (1024.0 * 1024.0);

        let mut file = match File::create(&temp_bin) {
            Ok(f) => f,
            Err(e) => return Err(format!("Failed to create temporary download file: {}", e)),
        };

        let mut current_bytes: u64 = 0;
        let mut resp = resp;
        let mut stream_failed = false;

        while let Some(chunk) = resp.chunk().await.unwrap_or(None) {
            if let Err(e) = file.write_all(&chunk) {
                last_err = format!("Failed writing binary chunk: {}", e);
                stream_failed = true;
                break;
            }
            current_bytes += chunk.len() as u64;

            if total_size > 0 {
                let pct = ((current_bytes as f64) / (total_size as f64)) * 100.0;
                let cur_mb = (current_bytes as f64) / (1024.0 * 1024.0);
                let _ = app.emit(
                    "whisper-setup-progress",
                    format!(
                        "Downloading Whisper engine: {:.1}% ({:.1} / {:.1} MB)",
                        pct, cur_mb, total_mb
                    ),
                );
            }
        }

        if stream_failed {
            let _ = fs::remove_file(&temp_bin);
            continue;
        }

        let _ = file.flush();
        drop(file);

        if fs::rename(&temp_bin, &target_bin).is_ok() {
            #[cfg(not(target_os = "windows"))]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Ok(meta) = fs::metadata(&target_bin) {
                    let mut perms = meta.permissions();
                    perms.set_mode(0o755);
                    let _ = fs::set_permissions(&target_bin, perms);
                }
            }
            downloaded = true;
            break;
        }
    }

    if !downloaded {
        return Err(format!(
            "Failed to download Whisper engine from GitHub releases: {}",
            last_err
        ));
    }

    let _ = app.emit("whisper-setup-progress", "Whisper engine deployed successfully.");
    invalidate_whisper_cache();
    Ok(())
}

/// 3. Download a Whisper Model on demand with streaming progress
#[tauri::command]
pub async fn download_whisper_model(app: AppHandle, model_name: String) -> Result<(), String> {
    if !crate::license::check_license_active(&app) {
        return Err("AI Studio model downloads are locked behind the 6-Month Pro Subscription. Please activate your license.".to_string());
    }

    let models_dir = get_whisper_models_dir(&app)?;
    fs::create_dir_all(&models_dir).map_err(|e| format!("Failed to create models directory: {}", e))?;

    let target_file = models_dir.join(format!("ggml-{}.bin", model_name));
    let temp_file = models_dir.join(format!("ggml-{}.bin.part", model_name));

    let url = match model_name.as_str() {
        "tiny" | "base" | "small" | "medium" | "large-v2" | "large-v3" => {
            format!(
                "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-{}.bin",
                model_name
            )
        }
        "large" | "large-v1" => {
            "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin".to_string()
        }
        other => {
            return Err(format!(
                "Unsupported Whisper model size: '{}'. Supported sizes: tiny, base, small, medium, large-v2, large-v3",
                other
            ));
        }
    };

    let client = reqwest::Client::builder()
        .user_agent("ViveStream-Next")
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Model download request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download failed with HTTP {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);
    let total_mb = (total_size as f64) / (1024.0 * 1024.0);

    let mut file = File::create(&temp_file).map_err(|e| format!("Failed to create part file: {}", e))?;
    let mut downloaded: u64 = 0;
    let mut response = response;

    while let Some(chunk) = response.chunk().await.map_err(|e| {
        let _ = fs::remove_file(&temp_file);
        format!("Stream error during model download: {}", e)
    })? {
        if let Err(e) = file.write_all(&chunk) {
            let _ = fs::remove_file(&temp_file);
            return Err(format!("Failed to write chunk: {}", e));
        }
        downloaded += chunk.len() as u64;

        let downloaded_mb = (downloaded as f64) / (1024.0 * 1024.0);
        let percentage = if total_size > 0 {
            ((downloaded as f64) / (total_size as f64)) * 100.0
        } else {
            0.0
        };

        let _ = app.emit(
            "whisper-model-progress",
            ModelDownloadProgress {
                model: model_name.clone(),
                percentage: (percentage * 10.0).round() / 10.0,
                downloaded_mb: (downloaded_mb * 10.0).round() / 10.0,
                total_mb: (total_mb * 10.0).round() / 10.0,
            },
        );
    }

    file.flush().map_err(|e| format!("Failed to flush file: {}", e))?;
    drop(file);

    fs::rename(&temp_file, &target_file).map_err(|e| format!("Failed to save completed model: {}", e))?;
    invalidate_whisper_cache();

    Ok(())
}

/// 4. Delete a downloaded Whisper Model to free disk space
#[tauri::command]
pub async fn delete_whisper_model(app: AppHandle, model_name: String) -> Result<(), String> {
    if !crate::license::check_license_active(&app) {
        return Err("AI Studio model management requires an active 6-Month Pro Subscription. Please activate your license.".to_string());
    }

    let models_dir = get_whisper_models_dir(&app)?;
    let mut deleted = false;
    let candidates = [
        models_dir.join(format!("ggml-{}.bin", model_name)),
        models_dir.join(format!("{}.bin", model_name)),
        models_dir.join(format!("{}.safetensors", model_name)),
        models_dir.join(format!("ggml-{}.bin.part", model_name)),
        models_dir.join(format!("{}.safetensors.part", model_name)),
    ];
    for cand in &candidates {
        if cand.is_file() {
            let _ = fs::remove_file(cand);
            deleted = true;
        }
    }
    let sub_folder = models_dir.join(&model_name);
    if sub_folder.is_dir() {
        let _ = fs::remove_dir_all(&sub_folder);
        deleted = true;
    }
    if !deleted {
        return Err(format!("Model '{}' not found on disk.", model_name));
    }
    invalidate_whisper_cache();
    Ok(())
}

/// Parse standard and word-level enhanced LRC content into structured LyricLines
pub fn parse_lrc_content(lrc: &str) -> Vec<crate::models::LyricLine> {
    let mut lines = Vec::new();
    let mut line_id = 0;

    for raw_line in lrc.lines() {
        let trimmed = raw_line.trim();
        if trimmed.is_empty()
            || trimmed.starts_with("[ti:")
            || trimmed.starts_with("[ar:")
            || trimmed.starts_with("[al:")
            || trimmed.starts_with("[by:")
            || trimmed.starts_with("[offset:")
        {
            continue;
        }

        if let Some(idx) = trimmed.find(']') {
            if trimmed.starts_with('[') && idx > 1 {
                let time_str = &trimmed[1..idx];
                let content = trimmed[idx + 1..].trim();

                let parts: Vec<&str> = time_str.split(':').collect();
                if parts.len() == 2 {
                    if let (Ok(mins), Ok(secs)) =
                        (parts[0].parse::<f64>(), parts[1].parse::<f64>())
                    {
                        let start_sec = mins * 60.0 + secs;
                        let mut words = Vec::new();
                        let mut clean_text = String::new();

                        if content.contains('<') && content.contains('>') {
                            let mut remainder = content;
                            while let Some(open) = remainder.find('<') {
                                if let Some(close) = remainder[open..].find('>') {
                                    let close_idx = open + close;
                                    let word_time_str = &remainder[open + 1..close_idx];
                                    let after_tag = &remainder[close_idx + 1..];
                                    let next_open =
                                        after_tag.find('<').unwrap_or(after_tag.len());
                                    let word_text = after_tag[..next_open].trim();

                                    let w_parts: Vec<&str> = word_time_str.split(':').collect();
                                    if w_parts.len() == 2 {
                                        if let (Ok(wm), Ok(ws)) = (
                                            w_parts[0].parse::<f64>(),
                                            w_parts[1].parse::<f64>(),
                                        ) {
                                            let w_start = wm * 60.0 + ws;
                                            if !word_text.is_empty() {
                                                words.push(crate::models::LyricWord {
                                                    word: word_text.to_string(),
                                                    start: w_start,
                                                    end: w_start + 0.4,
                                                    probability: 0.95,
                                                });
                                                if !clean_text.is_empty() {
                                                    clean_text.push(' ');
                                                }
                                                clean_text.push_str(word_text);
                                            }
                                        }
                                    }
                                    remainder = &remainder[close_idx + 1 + next_open..];
                                } else {
                                    break;
                                }
                            }
                        }

                        if clean_text.is_empty() {
                            clean_text = content.to_string();
                        }

                        if !clean_text.is_empty() {
                            lines.push(crate::models::LyricLine {
                                id: line_id,
                                start: start_sec,
                                end: start_sec + 3.5,
                                text: clean_text,
                                translation: None,
                                words,
                            });
                            line_id += 1;
                        }
                    }
                }
            }
        }
    }

    let count = lines.len();
    for i in 0..count {
        if i + 1 < count {
            let next_start = lines[i + 1].start;
            if next_start > lines[i].start {
                lines[i].end = next_start;
            }
        }
    }

    lines
}

/// Parse standard SubRip (.srt) subtitle content into structured LyricLines
pub fn parse_srt_content(srt: &str) -> Vec<crate::models::LyricLine> {
    let mut lines = Vec::new();
    let mut current_id = 0;
    let mut current_start = 0.0;
    let mut current_end = 0.0;
    let mut current_text = Vec::new();
    let mut in_timing = false;

    let parse_time = |t_str: &str| -> Option<f64> {
        let clean = t_str.trim().replace(',', ".");
        let time_parts: Vec<&str> = clean.split(':').collect();
        if time_parts.len() == 3 {
            let h = time_parts[0].parse::<f64>().ok()?;
            let m = time_parts[1].parse::<f64>().ok()?;
            let s = time_parts[2].parse::<f64>().ok()?;
            Some(h * 3600.0 + m * 60.0 + s)
        } else if time_parts.len() == 2 {
            let m = time_parts[0].parse::<f64>().ok()?;
            let s = time_parts[1].parse::<f64>().ok()?;
            Some(m * 60.0 + s)
        } else {
            None
        }
    };

    for raw_line in srt.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            if in_timing && !current_text.is_empty() {
                lines.push(crate::models::LyricLine {
                    id: current_id,
                    start: current_start,
                    end: current_end,
                    text: current_text.join(" "),
                    translation: None,
                    words: Vec::new(),
                });
                current_id += 1;
                current_text.clear();
                in_timing = false;
            }
            continue;
        }

        if line.contains("-->") {
            let parts: Vec<&str> = line.split("-->").collect();
            if parts.len() == 2 {
                if let (Some(t1), Some(t2)) = (parse_time(parts[0]), parse_time(parts[1])) {
                    if in_timing && !current_text.is_empty() {
                        lines.push(crate::models::LyricLine {
                            id: current_id,
                            start: current_start,
                            end: current_end,
                            text: current_text.join(" "),
                            translation: None,
                            words: Vec::new(),
                        });
                        current_id += 1;
                        current_text.clear();
                    }
                    current_start = t1;
                    current_end = t2;
                    in_timing = true;
                    continue;
                }
            }
        }

        if in_timing {
            current_text.push(line.to_string());
        }
    }

    if in_timing && !current_text.is_empty() {
        lines.push(crate::models::LyricLine {
            id: current_id,
            start: current_start,
            end: current_end,
            text: current_text.join(" "),
            translation: None,
            words: Vec::new(),
        });
    }

    lines
}

/// Shift timestamps in standard or enhanced LRC content by offset_sec
pub fn shift_lrc_offset(lrc: &str, offset_sec: f64) -> String {
    let mut result = Vec::new();
    for line in lrc.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("[by:")
            || trimmed.starts_with("[ti:")
            || trimmed.starts_with("[ar:")
            || trimmed.starts_with("[al:")
            || trimmed.starts_with("[offset:")
        {
            result.push(line.to_string());
            continue;
        }

        let mut shifted_line = String::new();
        let chars: Vec<char> = line.chars().collect();
        let mut i = 0;
        let len = chars.len();

        while i < len {
            let c = chars[i];
            if c == '[' || c == '<' {
                let close_char = if c == '[' { ']' } else { '>' };
                let mut j = i + 1;
                while j < len && chars[j] != close_char {
                    j += 1;
                }
                if j < len && chars[j] == close_char {
                    let tag: String = chars[i + 1..j].iter().collect();
                    let parts: Vec<&str> = tag.split(':').collect();
                    if parts.len() == 2 {
                        if let (Ok(m), Ok(s)) = (parts[0].parse::<f64>(), parts[1].parse::<f64>()) {
                            let total_sec = (m * 60.0 + s + offset_sec).max(0.0);
                            let new_m = (total_sec / 60.0).floor() as u32;
                            let new_s = total_sec % 60.0;
                            if c == '[' {
                                shifted_line.push_str(&format!("[{:02}:{:05.2}]", new_m, new_s));
                            } else {
                                shifted_line.push_str(&format!("<{:02}:{:05.2}>", new_m, new_s));
                            }
                            i = j + 1;
                            continue;
                        }
                    }
                }
            }
            shifted_line.push(c);
            i += 1;
        }
        result.push(shifted_line);
    }
    result.join("\n")
}

/// Shift timestamps in SRT or WebVTT content by offset_sec
pub fn shift_srt_or_vtt_offset(content: &str, offset_sec: f64) -> String {
    let mut result = Vec::new();
    for line in content.lines() {
        if line.contains("-->") {
            let parts: Vec<&str> = line.split("-->").collect();
            if parts.len() == 2 {
                let parse_time = |t_str: &str| -> Option<f64> {
                    let clean = t_str.trim().replace(',', ".");
                    let time_parts: Vec<&str> = clean.split(':').collect();
                    if time_parts.len() == 3 {
                        let h = time_parts[0].parse::<f64>().ok()?;
                        let m = time_parts[1].parse::<f64>().ok()?;
                        let s = time_parts[2].parse::<f64>().ok()?;
                        Some(h * 3600.0 + m * 60.0 + s)
                    } else if time_parts.len() == 2 {
                        let m = time_parts[0].parse::<f64>().ok()?;
                        let s = time_parts[1].parse::<f64>().ok()?;
                        Some(m * 60.0 + s)
                    } else {
                        None
                    }
                };

                let format_time = |sec: f64, is_comma: bool| -> String {
                    let total = sec.max(0.0);
                    let h = (total / 3600.0).floor() as u32;
                    let m = ((total % 3600.0) / 60.0).floor() as u32;
                    let s = (total % 60.0).floor() as u32;
                    let ms = ((total % 1.0) * 1000.0).round() as u32;
                    let sep = if is_comma { ',' } else { '.' };
                    format!("{:02}:{:02}:{:02}{}{:03}", h, m, s, sep, ms.min(999))
                };

                if let (Some(t1), Some(t2)) = (parse_time(parts[0]), parse_time(parts[1])) {
                    let is_comma = parts[0].contains(',');
                    let new_t1 = format_time(t1 + offset_sec, is_comma);
                    let new_t2 = format_time(t2 + offset_sec, is_comma);
                    result.push(format!("{} --> {}", new_t1, new_t2));
                    continue;
                }
            }
        }
        result.push(line.to_string());
    }
    result.join("\n")
}

pub fn detect_initial_silence_offset(app: &AppHandle, audio_path: &str) -> Option<f64> {
    let bin_dir = get_bin_dir(app).ok()?;
    let (_, ffmpeg_path, _) = crate::downloader::get_binary_paths(&bin_dir);
    let ffmpeg_cmd = if ffmpeg_path.is_file() {
        ffmpeg_path
    } else {
        PathBuf::from("ffmpeg")
    };

    let mut cmd = Command::new(&ffmpeg_cmd);
    cmd.arg("-t").arg("30");
    cmd.arg("-i").arg(audio_path);
    cmd.arg("-af").arg("silencedetect=noise=-35dB:d=0.3");
    cmd.arg("-f").arg("null").arg("-");

    configure_subprocess_path(&mut cmd, &bin_dir);

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output().ok()?;
    let stderr = String::from_utf8_lossy(&output.stderr);

    let mut saw_start_zero = false;
    for line in stderr.lines() {
        if line.contains("silence_start: 0") {
            saw_start_zero = true;
        }
        if saw_start_zero && line.contains("silence_end:") {
            if let Some(idx) = line.find("silence_end:") {
                let rest = &line[idx + "silence_end:".len()..];
                let end_str = rest.split('|').next().unwrap_or("").trim();
                if let Ok(end_sec) = end_str.parse::<f64>() {
                    if end_sec >= 0.5 {
                        return Some(end_sec);
                    }
                }
            }
        }
    }
    None
}

pub fn srt_to_vtt(srt: &str) -> String {
    let mut vtt = String::from("WEBVTT\n\n");
    for line in srt.lines() {
        if line.contains("-->") {
            vtt.push_str(&line.replace(',', "."));
        } else {
            vtt.push_str(line);
        }
        vtt.push('\n');
    }
    vtt
}

/// 5. Generate Synchronized Lyrics & Subtitles for Audio/Video File with real-time progress streaming
#[tauri::command]
pub async fn generate_track_lyrics(
    app: AppHandle,
    audio_path: String,
    track_id: Option<String>,
    model: Option<String>,
    task: Option<String>,
    language: Option<String>,
    device: Option<String>,
) -> Result<serde_json::Value, String> {
    if !crate::license::check_license_active(&app) {
        return Err("AI Studio features are locked behind the 6-Month Pro Subscription. Please activate your license.".to_string());
    }

    if !Path::new(&audio_path).is_file() {
        return Err(format!("Audio file not found at '{}'", audio_path));
    }

    let bin_path = get_whisper_bin_path(&app)?;
    let models_dir = get_whisper_models_dir(&app)?;
    let lyrics_dir = get_lyrics_dir(&app)?;
    let base_dir = get_base_dir(&app)?;
    let bin_dir = get_bin_dir(&app)?;

    if !bin_path.is_file() {
        return Err("Whisper engine binary is not installed yet. Please install it from AI Settings.".to_string());
    }

    // Resolve requested model, or gracefully fall back to an installed model in models_dir
    let mut resolved_model = model.unwrap_or_else(|| "base".to_string());
    let is_model_installed = |m: &str| -> bool {
        models_dir.join(format!("ggml-{}.bin", m)).is_file()
            || models_dir.join(format!("{}.bin", m)).is_file()
            || models_dir.join(format!("{}.safetensors", m)).is_file()
    };

    if !is_model_installed(&resolved_model) {
        // Find if ANY model is already downloaded and installed (prioritize GGML models for GPU)
        let fallback_candidates = ["base", "tiny", "small", "medium", "large-v3", "large-v2"];
        let mut found_fallback = None;
        for cand in &fallback_candidates {
            if is_model_installed(cand) {
                found_fallback = Some(cand.to_string());
                break;
            }
        }

        if let Some(fb) = found_fallback {
            resolved_model = fb;
        } else {
            return Err(format!(
                "No Whisper models found in '{}'. Please open AI Studio > Neural Hub & Models to download a model (e.g. Base or Medium).",
                models_dir.display()
            ));
        }
    }

    let model_name = resolved_model;
    let task_mode = task.unwrap_or_else(|| "transcribe".to_string());
    let lang = language.unwrap_or_else(|| "auto".to_string());
    let target_device = device.unwrap_or_else(|| "auto".to_string());

    let mut cmd = Command::new(&bin_path);
    cmd.arg(&audio_path);
    cmd.arg("--model").arg(&model_name);
    cmd.arg("--task").arg(&task_mode);
    cmd.arg("--language").arg(&lang);
    cmd.arg("--device").arg(&target_device);
    cmd.arg("--models-dir").arg(&models_dir);
    cmd.arg("-f").arg("all");
    cmd.arg("-o").arg(&lyrics_dir);
    cmd.arg("--json");
    cmd.arg("--progress");
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    configure_subprocess_path(&mut cmd, &bin_dir);

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn whisper engine: {}", e))?;

    let stderr = child.stderr.take();
    let emit_handle = app.clone();

    // Stream progress events from stderr in real-time
    let stderr_thread = std::thread::spawn(move || {
        let mut err_lines = Vec::new();
        if let Some(err) = stderr {
            let reader = BufReader::new(err);
            for line in reader.lines().flatten() {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                    if json.get("type").and_then(|t| t.as_str()) == Some("progress") {
                        let _ = emit_handle.emit("whisper-transcribe-progress", json);
                        continue;
                    }
                }
                err_lines.push(line);
            }
        }
        err_lines.join("\n")
    });

    let mut stdout_buf = Vec::new();
    if let Some(mut out) = child.stdout.take() {
        let _ = out.read_to_end(&mut stdout_buf);
    }

    let status = child
        .wait()
        .map_err(|e| format!("Error waiting on whisper engine: {}", e))?;

    let stderr_output = stderr_thread.join().unwrap_or_default();

    if !status.success() {
        let stdout_str = String::from_utf8_lossy(&stdout_buf);
        return Err(format!("Whisper error: {}\n{}", stderr_output.trim(), stdout_str.trim()));
    }

    let parsed_json = serde_json::from_slice::<serde_json::Value>(&stdout_buf)
        .map_err(|e| format!("Failed to parse whisper JSON output: {}", e))?;

    // Determine target track id and title for automatic linking
    let audio_file_stem = PathBuf::from(&audio_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();

    let resolved_id = track_id.unwrap_or_else(|| {
        if audio_file_stem.starts_with("raw_") {
            audio_file_stem.trim_start_matches("raw_").to_string()
        } else {
            audio_file_stem.clone()
        }
    });

    // Detect if music starts with silence / lead-in, and automatically shift chunk 0
    let lead_in_offset = detect_initial_silence_offset(&app, &audio_path).unwrap_or(0.0);
    let should_offset = lead_in_offset >= 0.5;

    let mut final_json = parsed_json;
    if should_offset {
        if let Some(segs) = final_json.get_mut("segments").and_then(|s| s.as_array_mut()) {
            for seg in segs.iter_mut() {
                if let Some(st) = seg.get("start").and_then(|s| s.as_f64()) {
                    if let Some(start_mut) = seg.get_mut("start") {
                        *start_mut = serde_json::json!((st + lead_in_offset).max(0.0));
                    }
                }
                if let Some(en) = seg.get("end").and_then(|e| e.as_f64()) {
                    if let Some(end_mut) = seg.get_mut("end") {
                        *end_mut = serde_json::json!((en + lead_in_offset).max(0.0));
                    }
                }
                if let Some(words) = seg.get_mut("words").and_then(|w| w.as_array_mut()) {
                    for w in words.iter_mut() {
                        if let Some(st) = w.get("start").and_then(|s| s.as_f64()) {
                            if let Some(start_mut) = w.get_mut("start") {
                                *start_mut = serde_json::json!((st + lead_in_offset).max(0.0));
                            }
                        }
                        if let Some(en) = w.get("end").and_then(|e| e.as_f64()) {
                            if let Some(end_mut) = w.get_mut("end") {
                                *end_mut = serde_json::json!((en + lead_in_offset).max(0.0));
                            }
                        }
                    }
                }
            }
        }
    }

    // Save final JSON with offset applied
    let json_dest_stem = lyrics_dir.join(format!("{}.json", audio_file_stem));
    let _ = fs::write(&json_dest_stem, serde_json::to_string_pretty(&final_json).unwrap_or_default());
    if !resolved_id.is_empty() {
        let json_dest_id = lyrics_dir.join(format!("{}.json", resolved_id));
        let _ = fs::write(&json_dest_id, serde_json::to_string_pretty(&final_json).unwrap_or_default());
    }

    // Mirror output files into standard naming: <id>.lrc, <id>.enhanced.lrc, <id>.vtt
    let mut lrc_str_final = None;
    let mut elrc_str_final = None;
    let mut srt_str_final = None;

    let src_lrc = lyrics_dir.join(format!("{}.lrc", audio_file_stem));
    if let Ok(content) = fs::read_to_string(&src_lrc) {
        let shifted = if should_offset { shift_lrc_offset(&content, lead_in_offset) } else { content };
        let _ = fs::write(&src_lrc, &shifted);
        if !resolved_id.is_empty() {
            let dest_lrc = lyrics_dir.join(format!("{}.lrc", resolved_id));
            let _ = fs::write(&dest_lrc, &shifted);
        }
        lrc_str_final = Some(shifted);
    }

    let src_elrc = lyrics_dir.join(format!("{}.enhanced.lrc", audio_file_stem));
    if let Ok(content) = fs::read_to_string(&src_elrc) {
        let shifted = if should_offset { shift_lrc_offset(&content, lead_in_offset) } else { content };
        let _ = fs::write(&src_elrc, &shifted);
        if !resolved_id.is_empty() {
            let dest_elrc = lyrics_dir.join(format!("{}.enhanced.lrc", resolved_id));
            let _ = fs::write(&dest_elrc, &shifted);
        }
        elrc_str_final = Some(shifted);
    }

    let src_srt = lyrics_dir.join(format!("{}.srt", audio_file_stem));
    if let Ok(srt_str) = fs::read_to_string(&src_srt) {
        let shifted_srt = if should_offset { shift_srt_or_vtt_offset(&srt_str, lead_in_offset) } else { srt_str };
        let _ = fs::write(&src_srt, &shifted_srt);
        let vtt_str = srt_to_vtt(&shifted_srt);
        if !resolved_id.is_empty() {
            let dest_vtt_lyrics = lyrics_dir.join(format!("{}.vtt", resolved_id));
            let dest_vtt_videos = base_dir.join("Videos").join(format!("{}.vtt", resolved_id));
            let _ = fs::write(&dest_vtt_lyrics, &vtt_str);
            let _ = fs::write(&dest_vtt_videos, &vtt_str);
        }
        srt_str_final = Some(shifted_srt);
    }

    // Ensure lrc, enhanced_lrc, and srt fields exist on final_json
    if let Some(obj) = final_json.as_object_mut() {
        if let Some(s) = lrc_str_final {
            obj.insert("lrc".to_string(), serde_json::Value::String(s));
        }
        if let Some(s) = elrc_str_final {
            obj.insert("enhanced_lrc".to_string(), serde_json::Value::String(s));
        }
        if let Some(s) = srt_str_final {
            obj.insert("srt".to_string(), serde_json::Value::String(s));
        }
    }

    if !resolved_id.is_empty() {
        // Emit high-priority event so active player immediately renders synced lyrics
        let _ = app.emit("lyrics-ready", serde_json::json!({
            "track_id": resolved_id,
            "title": audio_file_stem,
        }));
    }

    Ok(final_json)
}

/// 6. Retrieve structured lyrics with full line and word timestamps
#[tauri::command]
pub async fn get_track_lyrics(
    app: AppHandle,
    track_id: String,
    track_title: Option<String>,
) -> Result<crate::models::TrackLyricsPayload, String> {
    let lyrics_dir = get_lyrics_dir(&app)?;
    let base_dir = get_base_dir(&app)?;

    let mut candidate_stems = vec![track_id.clone()];
    if let Some(ref title) = track_title {
        let safe_name = title.replace(|c: char| !c.is_alphanumeric() && c != '_' && c != '-', "_");
        candidate_stems.push(safe_name);
        candidate_stems.push(title.clone());
    }

    let mut found_json_path = None;
    let mut found_elrc_path = None;
    let mut found_lrc_path = None;
    let mut found_srt_path = None;

    for stem in &candidate_stems {
        let p_json = lyrics_dir.join(format!("{}.json", stem));
        if p_json.exists() && found_json_path.is_none() {
            found_json_path = Some(p_json);
        }
        let p_elrc = lyrics_dir.join(format!("{}.enhanced.lrc", stem));
        if p_elrc.exists() && found_elrc_path.is_none() {
            found_elrc_path = Some(p_elrc);
        }
        let p_lrc = lyrics_dir.join(format!("{}.lrc", stem));
        if p_lrc.exists() && found_lrc_path.is_none() {
            found_lrc_path = Some(p_lrc);
        }
        let p_srt = lyrics_dir.join(format!("{}.srt", stem));
        if p_srt.exists() && found_srt_path.is_none() {
            found_srt_path = Some(p_srt);
        }
    }

    // Also check Videos/<id>.vtt fallback
    let video_vtt = base_dir.join("Videos").join(format!("{}.vtt", track_id));
    let has_vtt = video_vtt.exists();

    let has_lyrics = found_json_path.is_some()
        || found_elrc_path.is_some()
        || found_lrc_path.is_some()
        || found_srt_path.is_some()
        || has_vtt;

    if !has_lyrics {
        return Ok(crate::models::TrackLyricsPayload {
            track_id: track_id.clone(),
            title: track_title.unwrap_or_default(),
            has_lyrics: false,
            format: "none".to_string(),
            language: "auto".to_string(),
            duration: 0.0,
            lines: Vec::new(),
            raw_lrc: None,
            raw_enhanced_lrc: None,
            raw_srt: None,
        });
    }

    let raw_enhanced_lrc = found_elrc_path.and_then(|p| fs::read_to_string(p).ok());
    let raw_lrc = found_lrc_path.and_then(|p| fs::read_to_string(p).ok());
    let raw_srt = found_srt_path.and_then(|p| fs::read_to_string(p).ok());

    let mut lines = Vec::new();
    let mut duration = 0.0;
    let mut language = "en".to_string();
    let mut format = "lrc".to_string();

    // 1. Try parsing from Whisper JSON output for highest precision
    if let Some(json_path) = found_json_path {
        if let Ok(content) = fs::read_to_string(json_path) {
            if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(&content) {
                duration = json_val
                    .get("duration")
                    .and_then(|d| d.as_f64())
                    .unwrap_or(0.0);
                language = json_val
                    .get("language")
                    .and_then(|l| l.as_str())
                    .unwrap_or("en")
                    .to_string();

                if let Some(segs) = json_val.get("segments").and_then(|s| s.as_array()) {
                    for (idx, seg) in segs.iter().enumerate() {
                        let start = seg.get("start").and_then(|s| s.as_f64()).unwrap_or(0.0);
                        let end = seg.get("end").and_then(|e| e.as_f64()).unwrap_or(start + 3.0);
                        let text = seg.get("text").and_then(|t| t.as_str()).unwrap_or("").trim().to_string();

                        let mut words = Vec::new();
                        if let Some(w_list) = seg.get("words").and_then(|w| w.as_array()) {
                            for w in w_list {
                                let w_start = w.get("start").and_then(|s| s.as_f64()).unwrap_or(start);
                                let w_end = w.get("end").and_then(|e| e.as_f64()).unwrap_or(w_start + 0.3);
                                let w_text = w.get("word").and_then(|wt| wt.as_str()).unwrap_or("").trim().to_string();
                                let prob = w.get("probability").and_then(|p| p.as_f64()).unwrap_or(0.95);
                                if !w_text.is_empty() {
                                    words.push(crate::models::LyricWord {
                                        word: w_text,
                                        start: w_start,
                                        end: w_end,
                                        probability: prob,
                                    });
                                }
                            }
                        }

                        if !text.is_empty() {
                            lines.push(crate::models::LyricLine {
                                id: idx,
                                start,
                                end,
                                text,
                                translation: None,
                                words,
                            });
                        }
                    }
                    if !lines.is_empty() {
                        format = "karaoke".to_string();
                    }
                }
            }
        }
    }

    // 2. If lines empty, fallback to Enhanced LRC, standard LRC, or SRT parser
    if lines.is_empty() {
        if let Some(ref elrc) = raw_enhanced_lrc {
            lines = parse_lrc_content(elrc);
            format = "enhanced_lrc".to_string();
        } else if let Some(ref lrc) = raw_lrc {
            lines = parse_lrc_content(lrc);
            format = "lrc".to_string();
        } else if let Some(ref srt) = raw_srt {
            lines = parse_srt_content(srt);
            format = "srt".to_string();
        }
    }

    Ok(crate::models::TrackLyricsPayload {
        track_id: track_id.clone(),
        title: track_title.unwrap_or_default(),
        has_lyrics: !lines.is_empty() || raw_lrc.is_some() || raw_srt.is_some(),
        format,
        language,
        duration,
        lines,
        raw_lrc,
        raw_enhanced_lrc,
        raw_srt,
    })
}

/// 7. Shift and calibrate lyric timestamps by an offset in seconds
#[tauri::command]
pub async fn adjust_lyrics_offset(
    app: AppHandle,
    track_id: String,
    offset_seconds: Option<f64>,
    offset_sec: Option<f64>,
) -> Result<crate::models::TrackLyricsPayload, String> {
    let offset = offset_seconds.or(offset_sec).unwrap_or(0.0);
    let lyrics_dir = get_lyrics_dir(&app)?;
    let base_dir = get_base_dir(&app)?;

    // Shift JSON output if present
    let json_path = lyrics_dir.join(format!("{}.json", track_id));
    if json_path.exists() {
        if let Ok(content) = fs::read_to_string(&json_path) {
            if let Ok(mut json_val) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(segs) = json_val.get_mut("segments").and_then(|s| s.as_array_mut()) {
                    for seg in segs.iter_mut() {
                        if let Some(st) = seg.get("start").and_then(|s| s.as_f64()) {
                            if let Some(m) = seg.get_mut("start") {
                                *m = serde_json::json!((st + offset).max(0.0));
                            }
                        }
                        if let Some(en) = seg.get("end").and_then(|e| e.as_f64()) {
                            if let Some(m) = seg.get_mut("end") {
                                *m = serde_json::json!((en + offset).max(0.0));
                            }
                        }
                        if let Some(words) = seg.get_mut("words").and_then(|w| w.as_array_mut()) {
                            for w in words.iter_mut() {
                                if let Some(st) = w.get("start").and_then(|s| s.as_f64()) {
                                    if let Some(m) = w.get_mut("start") {
                                        *m = serde_json::json!((st + offset).max(0.0));
                                    }
                                }
                                if let Some(en) = w.get("end").and_then(|e| e.as_f64()) {
                                    if let Some(m) = w.get_mut("end") {
                                        *m = serde_json::json!((en + offset).max(0.0));
                                    }
                                }
                            }
                        }
                    }
                }
                let _ = fs::write(&json_path, serde_json::to_string_pretty(&json_val).unwrap_or_default());
            }
        }
    }

    // Shift standard LRC
    let lrc_path = lyrics_dir.join(format!("{}.lrc", track_id));
    if lrc_path.exists() {
        if let Ok(content) = fs::read_to_string(&lrc_path) {
            let shifted = shift_lrc_offset(&content, offset);
            let _ = fs::write(&lrc_path, shifted);
        }
    }

    // Shift Enhanced LRC
    let elrc_path = lyrics_dir.join(format!("{}.enhanced.lrc", track_id));
    if elrc_path.exists() {
        if let Ok(content) = fs::read_to_string(&elrc_path) {
            let shifted = shift_lrc_offset(&content, offset);
            let _ = fs::write(&elrc_path, shifted);
        }
    }

    // Shift SRT
    let srt_path = lyrics_dir.join(format!("{}.srt", track_id));
    if srt_path.exists() {
        if let Ok(content) = fs::read_to_string(&srt_path) {
            let shifted = shift_srt_or_vtt_offset(&content, offset);
            let _ = fs::write(&srt_path, &shifted);
        }
    }

    // Shift WebVTT in lyrics dir and in Videos dir
    let vtt_lyrics = lyrics_dir.join(format!("{}.vtt", track_id));
    if vtt_lyrics.exists() {
        if let Ok(content) = fs::read_to_string(&vtt_lyrics) {
            let shifted = shift_srt_or_vtt_offset(&content, offset);
            let _ = fs::write(&vtt_lyrics, &shifted);
        }
    }
    let vtt_video = base_dir.join("Videos").join(format!("{}.vtt", track_id));
    if vtt_video.exists() {
        if let Ok(content) = fs::read_to_string(&vtt_video) {
            let shifted = shift_srt_or_vtt_offset(&content, offset);
            let _ = fs::write(&vtt_video, &shifted);
        }
    }

    get_track_lyrics(app, track_id, None).await
}

/// 8. Save manually edited lyrics text back to disk
#[tauri::command]
pub async fn save_custom_lyrics(
    app: AppHandle,
    track_id: String,
    lrc_content: String,
) -> Result<crate::models::TrackLyricsPayload, String> {
    let lyrics_dir = get_lyrics_dir(&app)?;
    let base_dir = get_base_dir(&app)?;

    let lrc_path = lyrics_dir.join(format!("{}.lrc", track_id));
    fs::write(&lrc_path, &lrc_content).map_err(|e| format!("Failed to write LRC: {}", e))?;

    // If word-level tags are present, also save to enhanced.lrc
    if lrc_content.contains('<') && lrc_content.contains('>') {
        let elrc_path = lyrics_dir.join(format!("{}.enhanced.lrc", track_id));
        let _ = fs::write(&elrc_path, &lrc_content);
    }

    // Invalidate/delete stale JSON so get_track_lyrics parses the updated custom LRC text
    let json_path = lyrics_dir.join(format!("{}.json", track_id));
    if json_path.exists() {
        let _ = fs::remove_file(json_path);
    }

    // Also update Videos/<id>.vtt and Lyrics/<id>.vtt
    let parsed_lines = parse_lrc_content(&lrc_content);
    let mut vtt_str = String::from("WEBVTT\n\n");
    for (idx, line) in parsed_lines.iter().enumerate() {
        let m1 = (line.start / 60.0).floor() as u32;
        let s1 = line.start % 60.0;
        let m2 = (line.end / 60.0).floor() as u32;
        let s2 = line.end % 60.0;
        vtt_str.push_str(&format!(
            "{}\n00:{:02}:{:06.3} --> 00:{:02}:{:06.3}\n{}\n\n",
            idx + 1,
            m1,
            s1,
            m2,
            s2,
            line.text
        ));
    }
    let vtt_path = base_dir.join("Videos").join(format!("{}.vtt", track_id));
    let _ = fs::write(&vtt_path, &vtt_str);
    let vtt_lyrics = lyrics_dir.join(format!("{}.vtt", track_id));
    let _ = fs::write(&vtt_lyrics, &vtt_str);

    get_track_lyrics(app, track_id, None).await
}

/// 9. Delete generated lyrics files for a track
#[tauri::command]
pub async fn delete_track_lyrics(app: AppHandle, track_id: String) -> Result<(), String> {
    let lyrics_dir = get_lyrics_dir(&app)?;
    let base_dir = get_base_dir(&app)?;

    let extensions = ["json", "lrc", "enhanced.lrc", "srt", "vtt"];
    for ext in &extensions {
        let p = lyrics_dir.join(format!("{}.{}", track_id, ext));
        if p.is_file() {
            let _ = fs::remove_file(p);
        }
    }

    let video_vtt = base_dir.join("Videos").join(format!("{}.vtt", track_id));
    if video_vtt.is_file() {
        let _ = fs::remove_file(video_vtt);
    }

    Ok(())
}

/// 10. Batch transcribe multiple tracks with queue management
#[tauri::command]
pub async fn generate_batch_lyrics(
    app: AppHandle,
    track_ids: Vec<String>,
    model: Option<String>,
    task: Option<String>,
    language: Option<String>,
    device: Option<String>,
) -> Result<Vec<crate::models::TrackLyricsPayload>, String> {
    if !crate::license::check_license_active(&app) {
        return Err("AI Studio batch transcription requires an active 6-Month Pro Subscription.".to_string());
    }

    let videos = crate::db::get_downloaded_videos(app.clone()).await?;
    let total = track_ids.len();
    let mut results = Vec::new();

    for (idx, tid) in track_ids.iter().enumerate() {
        let matching_video = videos.iter().find(|v| &v.id == tid);
        let audio_path = match matching_video {
            Some(v) => v.video_path.clone(),
            None => continue,
        };

        let title = matching_video.map(|v| v.title.clone()).unwrap_or_default();

        let _ = app.emit(
            "whisper-batch-progress",
            crate::models::BatchProgressEvent {
                current_index: idx + 1,
                total_tracks: total,
                track_id: tid.clone(),
                title: title.clone(),
                stage: "transcribing".to_string(),
                percent: ((idx as f64) / (total as f64) * 100.0).round(),
                status: format!("Processing {}/{}", idx + 1, total),
            },
        );

        let _ = generate_track_lyrics(
            app.clone(),
            audio_path,
            Some(tid.clone()),
            model.clone(),
            task.clone(),
            language.clone(),
            device.clone(),
        )
        .await;

        if let Ok(payload) = get_track_lyrics(app.clone(), tid.clone(), Some(title)).await {
            results.push(payload);
        }
    }

    let _ = app.emit(
        "whisper-batch-progress",
        crate::models::BatchProgressEvent {
            current_index: total,
            total_tracks: total,
            track_id: "".to_string(),
            title: "".to_string(),
            stage: "complete".to_string(),
            percent: 100.0,
            status: "All tracks complete".to_string(),
        },
    );

    Ok(results)
}

/// 11. Backward compatible cached lyrics command
#[tauri::command]
pub async fn get_cached_lyrics(
    app: AppHandle,
    track_title: String,
) -> Result<serde_json::Value, String> {
    let lyrics_dir = get_lyrics_dir(&app)?;
    let safe_name = track_title.replace(|c: char| !c.is_alphanumeric() && c != '_' && c != '-', "_");

    let json_path = lyrics_dir.join(format!("{}.json", safe_name));
    let json_val = fs::read_to_string(&json_path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok());

    let lrc_path = lyrics_dir.join(format!("{}.lrc", safe_name));
    let elrc_path = lyrics_dir.join(format!("{}.enhanced.lrc", safe_name));
    let srt_path = lyrics_dir.join(format!("{}.srt", safe_name));

    let lrc = fs::read_to_string(&lrc_path).ok();
    let enhanced_lrc = fs::read_to_string(&elrc_path).ok();
    let srt = fs::read_to_string(&srt_path).ok();

    let segments = json_val
        .as_ref()
        .and_then(|j| j.get("segments"))
        .cloned()
        .unwrap_or_else(|| serde_json::Value::Array(Vec::new()));

    let duration = json_val
        .as_ref()
        .and_then(|j| j.get("duration"))
        .and_then(|d| d.as_f64())
        .unwrap_or(0.0);

    let language = json_val
        .as_ref()
        .and_then(|j| j.get("language"))
        .and_then(|l| l.as_str())
        .unwrap_or("en")
        .to_string();

    let text = json_val
        .as_ref()
        .and_then(|j| j.get("text"))
        .and_then(|t| t.as_str())
        .unwrap_or("")
        .to_string();

    Ok(serde_json::json!({
        "found": lrc.is_some() || enhanced_lrc.is_some() || json_val.is_some(),
        "lrc": lrc,
        "enhanced_lrc": enhanced_lrc,
        "srt": srt,
        "segments": segments,
        "duration": duration,
        "language": language,
        "text": text,
    }))
}

/// 12. Open a Whisper folder (models or lyrics) in OS file manager
#[tauri::command]
pub async fn open_whisper_folder(app: AppHandle, target: String) -> Result<(), String> {
    let dir = match target.as_str() {
        "lyrics" => get_lyrics_dir(&app)?,
        _ => get_whisper_models_dir(&app)?,
    };

    let _ = fs::create_dir_all(&dir);

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open directory in Explorer: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open directory in Finder: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open directory via xdg-open: {}", e))?;
    }

    Ok(())
}

/// 13. List all previously generated lyric files in the lyrics directory
#[tauri::command]
pub async fn list_cached_lyrics_files(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let lyrics_dir = get_lyrics_dir(&app)?;
    let mut files: Vec<(u64, serde_json::Value)> = Vec::new();

    if let Ok(entries) = fs::read_dir(&lyrics_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                    if ext == "lrc" || ext == "srt" || ext == "json" || ext == "vtt" {
                        let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
                        let meta = entry.metadata().ok();
                        let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
                        let mtime = meta
                            .and_then(|m| m.modified().ok())
                            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                            .map(|d| d.as_secs())
                            .unwrap_or(0);

                        files.push((
                            mtime,
                            serde_json::json!({
                                "filename": path.file_name().and_then(|s| s.to_str()).unwrap_or(""),
                                "stem": name,
                                "ext": ext,
                                "size_bytes": size,
                                "path": path.to_string_lossy().to_string(),
                                "modified_at": mtime,
                            }),
                        ));
                    }
                }
            }
        }
    }

    // Sort newest modified first
    files.sort_by(|a, b| b.0.cmp(&a.0));

    Ok(files.into_iter().map(|(_, val)| val).collect())
}

/// 14. Run synthetic benchmark on a Whisper model and compute device
#[tauri::command]
pub async fn run_whisper_benchmark(
    app: AppHandle,
    model: Option<String>,
    device: Option<String>,
) -> Result<serde_json::Value, String> {
    if !crate::license::check_license_active(&app) {
        return Err("AI Studio neural benchmarks are locked behind the 6-Month Pro Subscription. Please activate your license.".to_string());
    }

    let bin_path = get_whisper_bin_path(&app)?;
    let models_dir = get_whisper_models_dir(&app)?;
    let bin_dir = get_bin_dir(&app)?;

    if !bin_path.is_file() {
        return Err("Whisper engine binary is not installed yet. Please install it from AI Settings.".to_string());
    }

    let model_name = model.unwrap_or_else(|| "base".to_string());
    let target_device = device.unwrap_or_else(|| "auto".to_string());

    let mut cmd = Command::new(&bin_path);
    cmd.arg("--benchmark");
    cmd.arg("--model").arg(&model_name);
    cmd.arg("--device").arg(&target_device);
    cmd.arg("--models-dir").arg(&models_dir);
    cmd.arg("--json");

    configure_subprocess_path(&mut cmd, &bin_dir);

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute benchmark: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let out = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let msg = if !err.is_empty() { err } else { out };
        return Err(format!("Benchmark failed: {}", msg));
    }

    serde_json::from_slice::<serde_json::Value>(&output.stdout)
        .map_err(|e| format!("Failed to parse benchmark JSON: {}", e))
}

/// 15. Probe media file duration, sample rate, channels, and codec without loading model
#[tauri::command]
pub async fn probe_media_file(
    app: AppHandle,
    media_path: String,
) -> Result<serde_json::Value, String> {
    if !Path::new(&media_path).is_file() {
        return Err(format!("Media file not found at '{}'", media_path));
    }

    let bin_path = get_whisper_bin_path(&app)?;
    let bin_dir = get_bin_dir(&app)?;
    if !bin_path.is_file() {
        return Err("Whisper engine binary is not installed yet.".to_string());
    }

    let mut cmd = Command::new(&bin_path);
    cmd.arg("--probe");
    cmd.arg(&media_path);
    cmd.arg("--json");

    configure_subprocess_path(&mut cmd, &bin_dir);

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to probe media file: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!("Probe failed: {}", err));
    }

    serde_json::from_slice::<serde_json::Value>(&output.stdout)
        .map_err(|e| format!("Failed to parse probe JSON: {}", e))
}

/// 16. Query Whisper engine machine-readable capabilities
#[tauri::command]
pub async fn get_whisper_capabilities(
    app: AppHandle,
) -> Result<serde_json::Value, String> {
    let bin_path = get_whisper_bin_path(&app)?;
    let bin_dir = get_bin_dir(&app)?;
    if !bin_path.is_file() {
        return Err("Whisper engine binary is not installed yet.".to_string());
    }

    let mut cmd = Command::new(&bin_path);
    cmd.arg("--capabilities");

    configure_subprocess_path(&mut cmd, &bin_dir);

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to query capabilities: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!("Capabilities query failed: {}", err));
    }

    serde_json::from_slice::<serde_json::Value>(&output.stdout)
        .map_err(|e| format!("Failed to parse capabilities JSON: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_lrc_standard() {
        let lrc = "[00:01.00]First line\n[00:04.50]Second line\n[00:10.00]Third line";
        let lines = parse_lrc_content(lrc);
        assert_eq!(lines.len(), 3);
        assert_eq!(lines[0].text, "First line");
        assert!((lines[0].start - 1.0).abs() < 0.01);
        assert!((lines[0].end - 4.5).abs() < 0.01);
        assert_eq!(lines[1].text, "Second line");
        assert!((lines[1].start - 4.5).abs() < 0.01);
        assert!((lines[1].end - 10.0).abs() < 0.01);
    }

    #[test]
    fn test_parse_lrc_enhanced_karaoke() {
        let elrc = "[00:02.00] <00:02.00> Hello <00:02.50> world <00:03.00> again";
        let lines = parse_lrc_content(elrc);
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].text, "Hello world again");
        assert_eq!(lines[0].words.len(), 3);
        assert_eq!(lines[0].words[0].word, "Hello");
        assert!((lines[0].words[0].start - 2.0).abs() < 0.01);
        assert_eq!(lines[0].words[1].word, "world");
        assert!((lines[0].words[1].start - 2.5).abs() < 0.01);
    }

    #[test]
    fn test_parse_srt_content() {
        let srt = "1\n00:00:01,500 --> 00:00:04,200\nHello from SRT\n\n2\n00:00:05,000 --> 00:00:08,000\nSecond line\n";
        let lines = parse_srt_content(srt);
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].text, "Hello from SRT");
        assert!((lines[0].start - 1.5).abs() < 0.01);
        assert!((lines[0].end - 4.2).abs() < 0.01);
        assert_eq!(lines[1].text, "Second line");
        assert!((lines[1].start - 5.0).abs() < 0.01);
    }

    #[test]
    fn test_shift_lrc_offset() {
        let lrc = "[00:02.00]Hello world";
        let shifted = shift_lrc_offset(lrc, 1.5);
        assert!(shifted.contains("[00:03.50]Hello world"));

        let shifted_neg = shift_lrc_offset(lrc, -1.0);
        assert!(shifted_neg.contains("[00:01.00]Hello world"));
    }

    #[test]
    fn test_shift_srt_offset() {
        let srt = "00:00:02,000 --> 00:00:05,000\nSubtitle text";
        let shifted = shift_srt_or_vtt_offset(srt, 2.0);
        assert!(shifted.contains("00:00:04,000 --> 00:00:07,000"));
    }

    #[test]
    fn test_srt_to_vtt() {
        let srt = "1\n00:00:01,000 --> 00:00:03,500\nTest line";
        let vtt = srt_to_vtt(srt);
        assert!(vtt.starts_with("WEBVTT"));
        assert!(vtt.contains("00:00:01.000 --> 00:00:03.500"));
    }
}
