use crate::db::get_db_connection;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub fn get_base_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let home_dir = app.path().home_dir().map_err(|e| e.to_string())?;
    Ok(home_dir.join("ViveStream"))
}

pub fn get_bin_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(app_data.join("bin"))
}

/// Automatically migrates videos, thumbnails, avatars, descriptions, and AI models
/// from the legacy directory (%USERPROFILE%\Videos\ViveStream) to the new base directory (%USERPROFILE%\ViveStream).
pub fn auto_migrate_legacy_data(app: &AppHandle) {
    let legacy_dir = match app.path().video_dir() {
        Ok(v) => v.join("ViveStream"),
        Err(_) => return,
    };

    let new_base_dir = match get_base_dir(app) {
        Ok(b) => b,
        Err(_) => return,
    };

    if !legacy_dir.exists() || legacy_dir == new_base_dir {
        return;
    }

    // 1. Move standard media folders (Videos, Thumbnails, Descriptions, Avatars, Lyrics)
    let folders = ["Videos", "Thumbnails", "Descriptions", "Avatars", "Lyrics"];
    for folder in &folders {
        let src_folder = legacy_dir.join(folder);
        let dst_folder = new_base_dir.join(folder);
        if src_folder.is_dir() {
            let _ = fs::create_dir_all(&dst_folder);
            if let Ok(entries) = fs::read_dir(&src_folder) {
                for entry in entries.flatten() {
                    let src_path = entry.path();
                    if src_path.is_file() {
                        let file_name = entry.file_name();
                        let dst_path = dst_folder.join(file_name);
                        if !dst_path.exists() {
                            if fs::rename(&src_path, &dst_path).is_err() {
                                if fs::copy(&src_path, &dst_path).is_ok() {
                                    let _ = fs::remove_file(&src_path);
                                }
                            }
                        } else {
                            let _ = fs::remove_file(&src_path);
                        }
                    }
                }
            }
            let _ = fs::remove_dir(&src_folder);
        }
    }

    // 2. Move Whisper AI models from legacy paths to new_base_dir/AI/Whisper
    let dst_ai_whisper = new_base_dir.join("AI").join("Whisper");
    let legacy_ai_candidates = [
        legacy_dir.join("whisper").join("models"),
        legacy_dir.join("AI").join("Whisper"),
        legacy_dir.join("whisper"),
    ];

    for candidate in &legacy_ai_candidates {
        if candidate.is_dir() {
            let _ = fs::create_dir_all(&dst_ai_whisper);
            if let Ok(entries) = fs::read_dir(candidate) {
                for entry in entries.flatten() {
                    let src_path = entry.path();
                    if src_path.is_file() {
                        let file_name = entry.file_name();
                        let dst_path = dst_ai_whisper.join(file_name);
                        if !dst_path.exists() {
                            if fs::rename(&src_path, &dst_path).is_err() {
                                if fs::copy(&src_path, &dst_path).is_ok() {
                                    let _ = fs::remove_file(&src_path);
                                }
                            }
                        } else {
                            let _ = fs::remove_file(&src_path);
                        }
                    }
                }
            }
            let _ = fs::remove_dir_all(candidate);
        }
    }

    let _ = fs::remove_dir(legacy_dir.join("whisper"));
    let _ = fs::remove_dir(legacy_dir.join("AI"));

    // 3. Update database stored path strings if any exist
    if let Ok(conn) = get_db_connection(app) {
        let legacy_str = legacy_dir.to_string_lossy().to_string();
        let new_str = new_base_dir.to_string_lossy().to_string();
        let _ = conn.execute(
            "UPDATE Videos SET video_path = REPLACE(video_path, ?1, ?2), thumbnail_path = REPLACE(thumbnail_path, ?1, ?2)",
            [&legacy_str, &new_str],
        );
        let _ = conn.execute(
            "UPDATE Artists SET avatar_path = REPLACE(avatar_path, ?1, ?2)",
            [&legacy_str, &new_str],
        );
    }

    // 4. Clean up legacy ViveStream directory if now empty
    let _ = fs::remove_dir(&legacy_dir);
}

/// Reliably deletes a file with retries and clearing readonly flags on Windows
pub fn safe_remove_file(path: &std::path::Path) -> bool {
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
    for attempt in 0..5 {
        if fs::remove_file(path).is_ok() {
            return true;
        }
        if attempt < 4 {
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
    }
    false
}

/// Recursively empties all files and subdirectories from a directory.
pub fn clean_directory_contents(dir: &std::path::Path) -> usize {
    if !dir.exists() {
        return 0;
    }
    let mut count = 0;
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() || path.is_symlink() {
                if safe_remove_file(&path) {
                    count += 1;
                }
            } else if path.is_dir() {
                count += clean_directory_contents(&path);
                let _ = fs::remove_dir(&path);
            }
        }
    }
    count
}

#[tauri::command]
pub async fn wipe_dependencies(app: AppHandle) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let bin_dir = get_bin_dir(&app)?;
        if bin_dir.exists() {
            clean_directory_contents(&bin_dir);
            let _ = fs::remove_dir_all(&bin_dir);
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn clean_database_and_media(app: AppHandle) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        if let Ok(conn) = get_db_connection(&app) {
            let _ = conn.execute_batch(
                "DELETE FROM Playlist_Videos; DELETE FROM Playlists; DELETE FROM Videos; DELETE FROM Artists; DELETE FROM DownloadHistory;",
            );
        }

        let base_dir = get_base_dir(&app)?;
        if base_dir.exists() {
            let folders = ["Videos", "Thumbnails", "Descriptions", "Avatars", "Lyrics"];
            for folder in &folders {
                let target = base_dir.join(folder);
                clean_directory_contents(&target);
                let _ = fs::create_dir_all(&target);
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn nuclear_wipe(app: AppHandle) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let bin_dir = get_bin_dir(&app)?;
        if bin_dir.exists() {
            clean_directory_contents(&bin_dir);
            let _ = fs::remove_dir_all(&bin_dir);
        }

        if let Ok(conn) = get_db_connection(&app) {
            let _ = conn.execute_batch(
                "DELETE FROM Playlist_Videos; DELETE FROM Playlists; DELETE FROM Videos; DELETE FROM Artists; DELETE FROM DownloadHistory;",
            );
        }

        let base_dir = get_base_dir(&app)?;
        if base_dir.exists() {
            clean_directory_contents(&base_dir);
            let _ = fs::remove_dir_all(&base_dir);
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_clipboard_text() -> Result<String, String> {
    tokio::task::spawn_blocking(|| {
        let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
        clipboard.get_text().map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_clipboard_text(text: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
        clipboard.set_text(text).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(serde::Serialize)]
pub struct PaletteResult {
    pub dominant: String,
    pub palette: Vec<String>,
}

#[tauri::command]
pub async fn extract_video_dominant_colors(
    app: AppHandle,
    video_id: String,
    timestamp: f64,
) -> Result<PaletteResult, String> {
    let base_dir = get_base_dir(&app)?;
    let video_path = base_dir.join("Videos").join(format!("{}.mp4", video_id));
    if !video_path.exists() {
        return Ok(PaletteResult {
            dominant: "#f25c54".to_string(),
            palette: vec![
                "#f25c54".to_string(),
                "#ef233c".to_string(),
                "#3b82f6".to_string(),
                "#10b981".to_string(),
                "#a855f7".to_string(),
            ],
        });
    }

    let bin_dir = get_bin_dir(&app)?;
    let (_, ffmpeg_path, _) = crate::downloader::get_binary_paths(&bin_dir);
    let ffmpeg_cmd = if ffmpeg_path.exists() {
        ffmpeg_path
    } else {
        std::path::PathBuf::from("ffmpeg")
    };

    tokio::task::spawn_blocking(move || {
        let ts_str = format!("{:.3}", timestamp.max(0.0));
        let mut cmd = std::process::Command::new(&ffmpeg_cmd);

        #[cfg(target_os = "windows")]
        {
            #[allow(unused_imports)]
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }

        let output = cmd
            .args([
                "-ss",
                &ts_str,
                "-i",
                &video_path.to_string_lossy(),
                "-vframes",
                "1",
                "-vf",
                "scale=48:27",
                "-f",
                "rawvideo",
                "-pix_fmt",
                "rgb24",
                "pipe:1",
            ])
            .output()
            .map_err(|e| e.to_string())?;

        let bytes = output.stdout;
        if bytes.len() < 48 * 27 * 3 {
            return Ok(PaletteResult {
                dominant: "#f25c54".to_string(),
                palette: vec![
                    "#f25c54".to_string(),
                    "#ef233c".to_string(),
                    "#3b82f6".to_string(),
                    "#10b981".to_string(),
                    "#a855f7".to_string(),
                ],
            });
        }

        use std::collections::HashMap;
        // Key: (is_mono, hue_sector_or_mono_tier, light_band), Value: (count, sum_r, sum_g, sum_b)
        let mut buckets: HashMap<(bool, u8, u8), (f32, f32, f32, f32)> = HashMap::new();

        let w = 48;
        let h = 27;

        for (idx, chunk) in bytes.chunks_exact(3).enumerate() {
            let r = chunk[0];
            let g = chunk[1];
            let b = chunk[2];

            // Ignore pure black letterbox pixels
            if r < 16 && g < 16 && b < 16 {
                continue;
            }

            let rn = r as f32 / 255.0;
            let gn = g as f32 / 255.0;
            let bn = b as f32 / 255.0;
            let max = rn.max(gn).max(bn);
            let min = rn.min(gn).min(bn);
            let chroma = max - min;
            let lightness = (max + min) / 2.0;

            let px = idx % w;
            let py = idx / w;
            let is_edge = px < w / 4 || px >= w * 3 / 4 || py < h / 4 || py >= h * 3 / 4;
            let weight = if is_edge { 1.5 } else { 1.0 };

            let key = if chroma < 0.08 {
                (true, ((lightness * 6.0).floor() as u8).min(5), 0)
            } else {
                let mut hue = if max == rn {
                    ((gn - bn) / chroma).rem_euclid(6.0)
                } else if max == gn {
                    (bn - rn) / chroma + 2.0
                } else {
                    (rn - gn) / chroma + 4.0
                } * 60.0;
                if hue < 0.0 {
                    hue += 360.0;
                }
                let hue_sector = (((hue + 15.0).rem_euclid(360.0) / 30.0).floor() as u8).min(11);
                let light_band = ((lightness * 5.0).floor() as u8).min(4);
                (false, hue_sector, light_band)
            };

            let entry = buckets.entry(key).or_insert((0.0, 0.0, 0.0, 0.0));
            entry.0 += weight;
            entry.1 += r as f32 * weight;
            entry.2 += g as f32 * weight;
            entry.3 += b as f32 * weight;
        }

        if buckets.is_empty() {
            return Ok(PaletteResult {
                dominant: "#f25c54".to_string(),
                palette: vec![
                    "#f25c54".to_string(),
                    "#ef233c".to_string(),
                    "#3b82f6".to_string(),
                    "#10b981".to_string(),
                    "#a855f7".to_string(),
                ],
            });
        }

        let bucket_list: Vec<(f32, f32, f32, f32)> = buckets.into_values().collect();

        let mut sorted: Vec<_> = bucket_list
            .iter()
            .map(|&(count, sum_r, sum_g, sum_b)| {
                let r = (sum_r / count).round().min(255.0) as u8;
                let g = (sum_g / count).round().min(255.0) as u8;
                let b = (sum_b / count).round().min(255.0) as u8;
                let rn = r as f32 / 255.0;
                let gn = g as f32 / 255.0;
                let bn = b as f32 / 255.0;
                let max = rn.max(gn).max(bn);
                let min = rn.min(gn).min(bn);
                let chroma = max - min;
                let lightness = (max + min) / 2.0;
                let value = max;
                let hsv_saturation = if max == 0.0 { 0.0 } else { chroma / max };

                let is_washed_out_white = value > 0.75 && hsv_saturation < 0.35;
                let glare_penalty = if is_washed_out_white { 0.10 } else { 1.0 };
                let is_mud = value < 0.08 && chroma < 0.05;
                let mud_penalty = if is_mud { 0.15 } else { 1.0 };

                let sat_weight = 0.3 + hsv_saturation.powf(1.3) * 2.5 + chroma * 1.5;
                let light_weight = (1.0 - (lightness - 0.45).abs() * 0.9).max(0.4);
                let score =
                    count.powf(1.25) * sat_weight * light_weight * glare_penalty * mud_penalty;
                (score, count, r, g, b)
            })
            .collect();
        sorted.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

        let dominant = format!("#{:02x}{:02x}{:02x}", sorted[0].2, sorted[0].3, sorted[0].4);
        let mut palette = vec![dominant.clone()];

        let mut palette_candidates: Vec<_> = bucket_list
            .iter()
            .filter_map(|&(count, sum_r, sum_g, sum_b)| {
                let r = (sum_r / count).round().min(255.0) as u8;
                let g = (sum_g / count).round().min(255.0) as u8;
                let b = (sum_b / count).round().min(255.0) as u8;
                let rn = r as f32 / 255.0;
                let gn = g as f32 / 255.0;
                let bn = b as f32 / 255.0;
                let max = rn.max(gn).max(bn);
                let min = rn.min(gn).min(bn);
                let chroma = max - min;
                let value = max;
                let hsv_saturation = if max == 0.0 { 0.0 } else { chroma / max };

                // Exclude near-black mud and washed-out white/glare
                if value < 0.12 && chroma < 0.08 {
                    return None;
                }
                if value > 0.82 && hsv_saturation < 0.28 {
                    return None;
                }
                if chroma < 0.10 && hsv_saturation < 0.25 {
                    return None;
                }

                let score = count.powf(0.85) * (0.5 + hsv_saturation * 1.5 + chroma);
                Some((score, r, g, b))
            })
            .collect();
        palette_candidates
            .sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

        for item in palette_candidates {
            let hex = format!("#{:02x}{:02x}{:02x}", item.1, item.2, item.3);
            let is_distinct = palette.iter().all(|existing: &String| {
                if let (Ok(er), Ok(eg), Ok(eb)) = (
                    u8::from_str_radix(&existing[1..3], 16),
                    u8::from_str_radix(&existing[3..5], 16),
                    u8::from_str_radix(&existing[5..7], 16),
                ) {
                    let dr = (item.1 as f32 - er as f32).powi(2);
                    let dg = (item.2 as f32 - eg as f32).powi(2);
                    let db = (item.3 as f32 - eb as f32).powi(2);
                    (dr + dg + db).sqrt() > 36.0
                } else {
                    true
                }
            });
            if is_distinct {
                palette.push(hex);
                if palette.len() >= 6 {
                    break;
                }
            }
        }

        if palette.is_empty() {
            palette.push(dominant.clone());
        }

        Ok(PaletteResult { dominant, palette })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct EncoderTestResult {
    pub id: String,
    pub name: String,
    pub vendor: String,
    pub supported: bool,
    pub speed_fps: Option<f64>,
    pub note: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct HardwareAccelerationReport {
    pub os: String,
    pub ffmpeg_installed: bool,
    pub encoders: Vec<EncoderTestResult>,
    pub recommended_encoder: String,
    pub direct_copy_supported: bool,
    pub advice: String,
}

#[tauri::command]
pub async fn test_hardware_transcoding(app: AppHandle) -> Result<HardwareAccelerationReport, String> {
    tokio::task::spawn_blocking(move || {
        let bin_dir = get_bin_dir(&app)?;
        let (_, ffmpeg_path, _) = crate::downloader::get_binary_paths(&bin_dir);

        if !ffmpeg_path.exists() {
            return Ok(HardwareAccelerationReport {
                os: std::env::consts::OS.to_string(),
                ffmpeg_installed: false,
                encoders: vec![],
                recommended_encoder: "Direct Stream Copy (Fast Remux)".to_string(),
                direct_copy_supported: false,
                advice: "FFmpeg binary is missing. Please download it from Setup Wizard or Settings.".to_string(),
            });
        }

        let candidates = if cfg!(target_os = "windows") {
            vec![
                ("h264_qsv", "Intel QuickSync (QSV H.264)", "Intel"),
                ("hevc_qsv", "Intel QuickSync (QSV HEVC/H.265)", "Intel"),
                ("h264_nvenc", "NVIDIA NVENC (H.264)", "NVIDIA"),
                ("hevc_nvenc", "NVIDIA NVENC (HEVC/H.265)", "NVIDIA"),
                ("h264_amf", "AMD AMF (H.264)", "AMD"),
                ("hevc_amf", "AMD AMF (HEVC/H.265)", "AMD"),
                ("libx264", "Software CPU (libx264)", "CPU"),
            ]
        } else {
            vec![
                ("h264_vaapi", "Linux VAAPI (H.264)", "VAAPI"),
                ("h264_qsv", "Intel QuickSync (QSV H.264)", "Intel"),
                ("h264_nvenc", "NVIDIA NVENC (H.264)", "NVIDIA"),
                ("hevc_nvenc", "NVIDIA NVENC (HEVC/H.265)", "NVIDIA"),
                ("libx264", "Software CPU (libx264)", "CPU"),
            ]
        };

        let mut encoder_results = Vec::new();
        let mut best_hardware = None;

        for (id, name, vendor) in candidates {
            let mut cmd = std::process::Command::new(&ffmpeg_path);
            #[cfg(target_os = "windows")]
            {
                #[allow(unused_imports)]
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x08000000);
            }

            cmd.args([
                "-y",
                "-f",
                "lavfi",
                "-i",
                "testsrc=duration=0.5:size=640x360:rate=30",
                "-c:v",
                id,
                "-f",
                "null",
                "-",
            ]);

            let start = std::time::Instant::now();
            let output = cmd.output();
            let elapsed = start.elapsed().as_secs_f64();

            match output {
                Ok(out) if out.status.success() => {
                    let fps = if elapsed > 0.0 { (15.0 / elapsed).round() } else { 0.0 };
                    encoder_results.push(EncoderTestResult {
                        id: id.to_string(),
                        name: name.to_string(),
                        vendor: vendor.to_string(),
                        supported: true,
                        speed_fps: Some(fps),
                        note: format!("Operational (~{:.0} FPS probe)", fps),
                    });
                    if vendor != "CPU" && best_hardware.is_none() {
                        best_hardware = Some(name.to_string());
                    }
                }
                Ok(out) => {
                    let err = String::from_utf8_lossy(&out.stderr);
                    let last_err = err.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("Unsupported");
                    encoder_results.push(EncoderTestResult {
                        id: id.to_string(),
                        name: name.to_string(),
                        vendor: vendor.to_string(),
                        supported: false,
                        speed_fps: None,
                        note: if last_err.len() > 60 { format!("{}...", &last_err[..60]) } else { last_err.to_string() },
                    });
                }
                Err(e) => {
                    encoder_results.push(EncoderTestResult {
                        id: id.to_string(),
                        name: name.to_string(),
                        vendor: vendor.to_string(),
                        supported: false,
                        speed_fps: None,
                        note: e.to_string(),
                    });
                }
            }
        }

        let recommended = if let Some(hw) = best_hardware {
            format!("Direct Stream Copy (Lossless) / {} fallback", hw)
        } else {
            "Direct Stream Copy (Lossless) / Software CPU fallback".to_string()
        };

        Ok(HardwareAccelerationReport {
            os: std::env::consts::OS.to_string(),
            ffmpeg_installed: true,
            encoders: encoder_results,
            recommended_encoder: recommended,
            direct_copy_supported: true,
            advice: "Direct Stream Copy is active by default. It moves faststart atom in ~0.5s without re-encoding, consuming almost zero RAM even on 8K video.".to_string(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
