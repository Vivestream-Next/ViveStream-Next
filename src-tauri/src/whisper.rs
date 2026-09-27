use crate::system::{get_base_dir, get_bin_dir};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;
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

    // 1. Check AppData/bin
    if app_data_bin.is_file() {
        return Ok(app_data_bin);
    }

    // 2. Check local workspace candidates during development
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

    for cand in candidates {
        if cand.is_file() {
            let _ = fs::create_dir_all(&bin_dir);
            let _ = fs::copy(&cand, &app_data_bin);
            if app_data_bin.is_file() {
                return Ok(app_data_bin);
            }
            return Ok(cand);
        }
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

    Ok(serde_json::json!({
        "binary_installed": binary_installed,
        "binary_path": bin_path.to_string_lossy().to_string(),
        "models_dir": models_dir.to_string_lossy().to_string(),
        "system": system_info,
        "models": models_info,
    }))
}

/// 2. Install / Deploy the Whisper Standalone Binary
#[tauri::command]
pub async fn install_whisper_binary(app: AppHandle) -> Result<(), String> {
    let bin_dir = get_bin_dir(&app)?;
    fs::create_dir_all(&bin_dir).map_err(|e| e.to_string())?;

    let target_bin = bin_dir.join(if cfg!(target_os = "windows") {
        "vivestream-whisper.exe"
    } else {
        "vivestream-whisper"
    });

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
            let _ = app.emit("whisper-setup-progress", "Whisper engine successfully deployed from local build.");
            return Ok(());
        }
    }

    // Remote GitHub release fallback
    let client = reqwest::Client::builder()
        .user_agent("ViveStream-Next")
        .build()
        .map_err(|e| e.to_string())?;

    let download_url = if cfg!(target_os = "windows") {
        "https://github.com/yt-dlp/yt-dlp/releases" // Placeholder or GitHub releases asset url
    } else {
        "https://github.com/yt-dlp/yt-dlp/releases"
    };

    let _ = app.emit("whisper-setup-progress", "Fetching binary from releases...");
    let bytes = client
        .get(download_url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    File::create(&target_bin)
        .and_then(|mut f| f.write_all(&bytes))
        .map_err(|e| e.to_string())?;

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

    let url = format!(
        "https://huggingface.co/openai/whisper-{}/resolve/main/model.safetensors",
        model_name
    );

    let client = reqwest::Client::builder()
        .user_agent("ViveStream-Next")
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

/// 4. Generate Synchronized Lyrics & Subtitles for Audio/Video File
#[tauri::command]
pub async fn generate_track_lyrics(
    app: AppHandle,
    audio_path: String,
    model: Option<String>,
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

    let mut cmd = Command::new(&bin_path);
    cmd.arg(&audio_path);
    cmd.arg("--model").arg(&model_name);
    cmd.arg("--models-dir").arg(&models_dir);
    cmd.arg("-f").arg("all");
    cmd.arg("-o").arg(&lyrics_dir);
    cmd.arg("--json");

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute whisper engine: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        let out = String::from_utf8_lossy(&output.stdout);
        return Err(format!("Whisper error: {}\n{}", err, out));
    }

    serde_json::from_slice::<serde_json::Value>(&output.stdout)
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

    let lrc_path = lyrics_dir.join(format!("{}.lrc", safe_name));
    let elrc_path = lyrics_dir.join(format!("{}.enhanced.lrc", safe_name));
    let srt_path = lyrics_dir.join(format!("{}.srt", safe_name));

    let lrc = fs::read_to_string(&lrc_path).ok();
    let enhanced_lrc = fs::read_to_string(&elrc_path).ok();
    let srt = fs::read_to_string(&srt_path).ok();

    Ok(serde_json::json!({
        "found": lrc.is_some() || enhanced_lrc.is_some(),
        "lrc": lrc,
        "enhanced_lrc": enhanced_lrc,
        "srt": srt,
    }))
}
