use crate::system::{get_base_dir, get_bin_dir};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelDownloadProgress {
    pub model: String,
    pub percentage: f64,
    pub downloaded_mb: f64,
    pub total_mb: f64,
}

pub fn get_whisper_bin_path(app: &AppHandle) -> Result<PathBuf, String> {
    let bin_name = if cfg!(target_os = "windows") {
        "vivestream-whisper.exe"
    } else {
        "vivestream-whisper"
    };

    let bin_dir = get_bin_dir(app)?;
    let app_data_bin = bin_dir.join(bin_name);

    // 1. Check local workspace candidates during development FIRST
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
            }

            if app_data_bin.is_file() {
                return Ok(app_data_bin);
            }
            return Ok(cand.clone());
        }
    }

    // 2. Fallback to AppData/bin for packaged production runtime
    if app_data_bin.is_file() {
        return Ok(app_data_bin);
    }

    Ok(app_data_bin)
}

pub fn get_whisper_models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    // 1. Primary path: %USERPROFILE%\ViveStream\AI\Whisper
    if let Ok(base_dir) = get_base_dir(app) {
        let p = base_dir.join("AI").join("Whisper");
        if p.exists() {
            return Ok(p);
        }
        // Backward-compatibility fallback: ViveStream/whisper/models
        let legacy = base_dir.join("whisper").join("models");
        if legacy.exists() {
            return Ok(legacy);
        }
    }

    // 2. Check local workspace parent models folder during development
    if let Ok(curr) = std::env::current_dir() {
        let p1 = curr.join("models");
        if p1.is_dir() {
            return Ok(p1);
        }
        if let Some(parent) = curr.parent() {
            let p2 = parent.join("models");
            if p2.is_dir() {
                return Ok(p2);
            }
        }
    }

    let base_dir = get_base_dir(app)?;
    let models_dir = base_dir.join("AI").join("Whisper");
    fs::create_dir_all(&models_dir).ok();
    Ok(models_dir)
}

pub fn get_lyrics_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base_dir = get_base_dir(app)?;
    let lyrics_dir = base_dir.join("Lyrics");
    fs::create_dir_all(&lyrics_dir).map_err(|e| e.to_string())?;
    Ok(lyrics_dir)
}

/// 1. Check Whisper engine installation, system specs, and model availability
#[tauri::command]
pub async fn check_whisper_status(app: AppHandle) -> Result<serde_json::Value, String> {
    let bin_path = get_whisper_bin_path(&app)?;
    let models_dir = get_whisper_models_dir(&app)?;

    let binary_installed = bin_path.is_file();

    let mut system_info = serde_json::Value::Null;
    let mut models_info = serde_json::Value::Null;

    if binary_installed {
        // Run --check
        let mut cmd = Command::new(&bin_path);
        cmd.arg("--check");
        cmd.arg("--models-dir").arg(&models_dir);

        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        if let Ok(out) = cmd.output() {
            if out.status.success() {
                if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&out.stdout) {
                    system_info = json["system"].clone();
                    models_info = json["models"].clone();
                }
            }
        }
    }

    // Fallback model list if binary isn't runnable yet
    if models_info.is_null() {
        let models = vec![
            ("tiny", 75),
            ("base", 140),
            ("small", 460),
            ("medium", 1500),
            ("large-v3", 3100),
        ];

        let list: Vec<serde_json::Value> = models
            .into_iter()
            .map(|(name, size)| {
                let p = models_dir.join(format!("{}.safetensors", name));
                let installed = p.is_file();
                serde_json::json!({
                    "name": name,
                    "expected_size_mb": size,
                    "installed": installed,
                    "path": if installed { Some(p.to_string_lossy().to_string()) } else { None },
                    "download_url": format!("https://huggingface.co/openai/whisper-{}/resolve/main/model.safetensors", name)
                })
            })
            .collect();
        models_info = serde_json::Value::Array(list);
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
        }
    }

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
    fs::create_dir_all(&bin_dir).map_err(|e| e.to_string())?;

    let bin_name = if cfg!(target_os = "windows") {
        "vivestream-whisper.exe"
    } else {
        "vivestream-whisper"
    };
    let target_bin = bin_dir.join(bin_name);

    let _ = app.emit("whisper-setup-progress", "Deploying Whisper engine binary...");

    // Check if development binary is accessible locally first
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
            return Ok(());
        }
    }

    // Remote GitHub release download from https://github.com/Vivestream-Next/ViveStream-Whisper
    let client = reqwest::Client::builder()
        .user_agent("ViveStream-Next")
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| e.to_string())?;

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

    // 2. Direct latest release URLs matching CI release.yml matrix as fallbacks
    #[cfg(target_os = "windows")]
    {
        download_urls.push("https://github.com/Vivestream-Next/ViveStream-Whisper/releases/latest/download/vivestream-whisper-windows-x64.exe".to_string());
        download_urls.push("https://github.com/Vivestream-Next/ViveStream-Whisper/releases/latest/download/vivestream-whisper.exe".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        download_urls.push("https://github.com/Vivestream-Next/ViveStream-Whisper/releases/latest/download/vivestream-whisper-linux-x64".to_string());
        download_urls.push("https://github.com/Vivestream-Next/ViveStream-Whisper/releases/latest/download/vivestream-whisper".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        download_urls.push("https://github.com/Vivestream-Next/ViveStream-Whisper/releases/latest/download/vivestream-whisper-macos-arm64".to_string());
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
            Err(e) => return Err(e.to_string()),
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
    Ok(())
}

/// 3. Download a Whisper Model on demand with streaming progress
#[tauri::command]
pub async fn download_whisper_model(app: AppHandle, model_name: String) -> Result<(), String> {
    if !crate::license::check_license_active(&app) {
        return Err("AI Studio model downloads are locked behind the 6-Month Pro Subscription. Please activate your license.".to_string());
    }

    let models_dir = get_whisper_models_dir(&app)?;
    fs::create_dir_all(&models_dir).map_err(|e| e.to_string())?;

    let target_file = models_dir.join(format!("{}.safetensors", model_name));
    let temp_file = models_dir.join(format!("{}.safetensors.part", model_name));

    let repo_name = match model_name.as_str() {
        "tiny" => "openai/whisper-tiny",
        "base" => "openai/whisper-base",
        "small" => "openai/whisper-small",
        "medium" => "openai/whisper-medium",
        "large-v2" => "openai/whisper-large-v2",
        "large-v3" => "openai/whisper-large-v3",
        other => {
            return Err(format!("Unsupported Whisper model size: {}", other));
        }
    };

    let url = format!(
        "https://huggingface.co/{}/resolve/main/model.safetensors",
        repo_name
    );

    let client = reqwest::Client::builder()
        .user_agent("ViveStream-Next")
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Network request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download failed with HTTP {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);
    let total_mb = (total_size as f64) / (1024.0 * 1024.0);

    let mut file = File::create(&temp_file).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let mut response = response;

    while let Some(chunk) = response.chunk().await.map_err(|e| format!("Stream error: {}", e))? {
        file.write_all(&chunk).map_err(|e| e.to_string())?;
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

    file.flush().map_err(|e| e.to_string())?;
    drop(file);

    fs::rename(&temp_file, &target_file).map_err(|e| e.to_string())?;

    Ok(())
}

/// 4. Delete a downloaded Whisper Model to free disk space
#[tauri::command]
pub async fn delete_whisper_model(app: AppHandle, model_name: String) -> Result<(), String> {
    if !crate::license::check_license_active(&app) {
        return Err("AI Studio model management requires an active 6-Month Pro Subscription. Please activate your license.".to_string());
    }

    let models_dir = get_whisper_models_dir(&app)?;
    let target_file = models_dir.join(format!("{}.safetensors", model_name));
    if target_file.is_file() {
        fs::remove_file(&target_file).map_err(|e| format!("Failed to delete model file: {}", e))?;
    }
    let sub_folder = models_dir.join(&model_name);
    if sub_folder.is_dir() {
        let _ = fs::remove_dir_all(&sub_folder);
    }
    Ok(())
}

/// 4. Generate Synchronized Lyrics & Subtitles for Audio/Video File
/// 4. Generate Synchronized Lyrics & Subtitles for Audio/Video File with real-time progress streaming
#[tauri::command]
pub async fn generate_track_lyrics(
    app: AppHandle,
    audio_path: String,
    model: Option<String>,
    task: Option<String>,
    language: Option<String>,
    device: Option<String>,
) -> Result<serde_json::Value, String> {
    if !crate::license::check_license_active(&app) {
        return Err("AI Studio features are locked behind the 6-Month Pro Subscription. Please activate your license.".to_string());
    }

    let bin_path = get_whisper_bin_path(&app)?;
    let models_dir = get_whisper_models_dir(&app)?;
    let lyrics_dir = get_lyrics_dir(&app)?;

    if !bin_path.is_file() {
        return Err("Whisper engine binary is not installed yet. Please install it from AI Settings.".to_string());
    }

    let model_name = model.unwrap_or_else(|| "base".to_string());
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
        return Err(format!("Whisper error: {}\n{}", stderr_output, stdout_str));
    }

    serde_json::from_slice::<serde_json::Value>(&stdout_buf)
        .map_err(|e| format!("Failed to parse whisper JSON output: {}", e))
}

/// 5. Retrieve cached lyrics from the Lyrics directory
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

/// 6. Open a Whisper folder (models or lyrics) in OS file manager
#[tauri::command]
pub async fn open_whisper_folder(app: AppHandle, target: String) -> Result<(), String> {
    let dir = match target.as_str() {
        "lyrics" => get_lyrics_dir(&app)?,
        _ => get_whisper_models_dir(&app)?,
    };

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }

    Ok(())
}

/// 7. List all previously generated lyric files in the lyrics directory
#[tauri::command]
pub async fn list_cached_lyrics_files(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let lyrics_dir = get_lyrics_dir(&app)?;
    let mut files = Vec::new();

    if let Ok(entries) = fs::read_dir(&lyrics_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                    if ext == "lrc" || ext == "srt" || ext == "json" {
                        let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
                        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                        files.push(serde_json::json!({
                            "filename": path.file_name().and_then(|s| s.to_str()).unwrap_or(""),
                            "stem": name,
                            "ext": ext,
                            "size_bytes": size,
                            "path": path.to_string_lossy().to_string(),
                        }));
                    }
                }
            }
        }
    }

    Ok(files)
}

/// 8. Run synthetic benchmark on a Whisper model and compute device
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

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute benchmark: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        let out = String::from_utf8_lossy(&output.stdout);
        return Err(format!("Benchmark failed: {}\n{}", err, out));
    }

    serde_json::from_slice::<serde_json::Value>(&output.stdout)
        .map_err(|e| format!("Failed to parse benchmark JSON: {}", e))
}

/// 9. Probe media file duration, sample rate, channels, and codec without loading model
#[tauri::command]
pub async fn probe_media_file(
    app: AppHandle,
    media_path: String,
) -> Result<serde_json::Value, String> {
    let bin_path = get_whisper_bin_path(&app)?;
    if !bin_path.is_file() {
        return Err("Whisper engine binary is not installed yet.".to_string());
    }

    let mut cmd = Command::new(&bin_path);
    cmd.arg("--probe");
    cmd.arg(&media_path);
    cmd.arg("--json");

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to probe media file: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Probe failed: {}", err));
    }

    serde_json::from_slice::<serde_json::Value>(&output.stdout)
        .map_err(|e| format!("Failed to parse probe JSON: {}", e))
}

/// 10. Query Whisper engine machine-readable capabilities
#[tauri::command]
pub async fn get_whisper_capabilities(
    app: AppHandle,
) -> Result<serde_json::Value, String> {
    let bin_path = get_whisper_bin_path(&app)?;
    if !bin_path.is_file() {
        return Err("Whisper engine binary is not installed yet.".to_string());
    }

    let mut cmd = Command::new(&bin_path);
    cmd.arg("--capabilities");

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to query capabilities: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Capabilities query failed: {}", err));
    }

    serde_json::from_slice::<serde_json::Value>(&output.stdout)
        .map_err(|e| format!("Failed to parse capabilities JSON: {}", e))
}
