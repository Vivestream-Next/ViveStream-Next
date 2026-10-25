use crate::db::get_db_connection;
use crate::models::{BinaryCheckStatus, VideoEntry};
use crate::system::{get_base_dir, get_bin_dir};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Write};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};

pub fn get_binary_paths(bin_dir: &Path) -> (PathBuf, PathBuf, PathBuf) {
    #[cfg(target_os = "windows")]
    return (
        bin_dir.join("yt-dlp.exe"),
        bin_dir.join("ffmpeg.exe"),
        bin_dir.join("deno.exe"),
    );
    #[cfg(not(target_os = "windows"))]
    return (
        bin_dir.join("yt-dlp"),
        bin_dir.join("ffmpeg"),
        bin_dir.join("deno"),
    );
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct StoredPoToken {
    pub token: String,
    pub timestamp: u64,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct PoTokenStatus {
    pub active: bool,
    pub token: String,
    pub age_seconds: u64,
    pub ttl_seconds: u64,
}

struct CachedPoTokenState {
    token: Option<String>,
    cached_at: Option<Instant>,
    last_failure: Option<Instant>,
}

static PO_TOKEN_CACHE: std::sync::Mutex<CachedPoTokenState> = std::sync::Mutex::new(CachedPoTokenState {
    token: None,
    cached_at: None,
    last_failure: None,
});

pub fn get_po_token_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let _ = std::fs::create_dir_all(&config_dir);
    Ok(config_dir.join("po_token.json"))
}

pub fn load_saved_po_token(app: &AppHandle) -> Option<String> {
    let file = get_po_token_file_path(app).ok()?;
    if !file.exists() {
        return None;
    }
    let data = std::fs::read_to_string(file).ok()?;
    let stored: StoredPoToken = serde_json::from_str(&data).ok()?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Valid for 12 hours (43,200 seconds)
    if now.saturating_sub(stored.timestamp) < 43200 && !stored.token.trim().is_empty() {
        Some(stored.token.trim().to_string())
    } else {
        None
    }
}

pub fn save_po_token_to_disk(app: &AppHandle, token: &str) {
    let token = token.trim();
    if token.is_empty() {
        return;
    }
    if let Ok(file) = get_po_token_file_path(app) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let stored = StoredPoToken {
            token: token.to_string(),
            timestamp: now,
        };
        if let Ok(json) = serde_json::to_string_pretty(&stored) {
            let _ = std::fs::write(file, json);
        }
    }
}

pub fn get_cached_po_token_fast(app: &AppHandle) -> Option<String> {
    if let Ok(guard) = PO_TOKEN_CACHE.lock() {
        if let Some(ref t) = guard.token {
            if let Some(created) = guard.cached_at {
                if created.elapsed() < std::time::Duration::from_secs(43200) && !t.is_empty() {
                    return Some(t.clone());
                }
            }
        }
    }

    if let Some(token) = load_saved_po_token(app) {
        if let Ok(mut guard) = PO_TOKEN_CACHE.lock() {
            guard.token = Some(token.clone());
            guard.cached_at = Some(Instant::now());
        }
        return Some(token);
    }

    None
}

pub fn extract_youtube_id(url: &str) -> String {
    let trimmed = url.trim();
    if let Some(idx) = trimmed.find("v=") {
        return trimmed[idx + 2..]
            .split('&')
            .next()
            .unwrap_or("bVYw5xR8xFg")
            .to_string();
    }
    if let Some(idx) = trimmed.find("youtu.be/") {
        return trimmed[idx + 9..]
            .split('?')
            .next()
            .unwrap_or("bVYw5xR8xFg")
            .to_string();
    }
    if let Some(idx) = trimmed.find("/shorts/") {
        return trimmed[idx + 8..]
            .split('?')
            .next()
            .unwrap_or("bVYw5xR8xFg")
            .to_string();
    }
    if let Some(idx) = trimmed.find("/embed/") {
        return trimmed[idx + 7..]
            .split('?')
            .next()
            .unwrap_or("bVYw5xR8xFg")
            .to_string();
    }
    if trimmed.len() == 11 && !trimmed.contains('/') {
        return trimmed.to_string();
    }
    "bVYw5xR8xFg".to_string()
}

// Spawns a hidden native WebView, forces YouTube to calculate a BotGuard token via autoplay, and intercepts it
pub async fn extract_po_token(app: &AppHandle, video_id: &str) -> Result<String, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let tx = std::sync::Arc::new(std::sync::Mutex::new(Some(tx)));
    let tx_clone = tx.clone();

    println!(
        "[PO_TOKEN] Spawning hidden native WebView for video ID: {}",
        video_id
    );

    // Using autoplay=1&mute=1 ensures modern browsers allow autoplay without user gesture
    let embed_url = format!(
        "https://www.youtube.com/embed/{}?autoplay=1&mute=1&playsinline=1&enablejsapi=1",
        video_id
    );
    let window_label = format!(
        "pot_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );

    let builder = tauri::WebviewWindowBuilder::new(
        app,
        &window_label,
        tauri::WebviewUrl::External(embed_url.parse().unwrap()),
    )
    .inner_size(1280.0, 720.0)
    .visible(false)
    .initialization_script(
        r#"
        (function() {
            try {
                Object.defineProperty(document, 'hidden', { get: () => false });
                Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
                Object.defineProperty(document, 'webkitVisibilityState', { get: () => 'visible' });
            } catch(e) {}

            function checkAndNotify(bodyData) {
                if (!bodyData) return;
                try {
                    const str = typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData);
                    const match = str.match(/"po_?token"\s*:\s*"([^"]+)"/i);
                    if (match && match[1]) {
                        sendToken(match[1]);
                        return true;
                    }
                    const body = typeof bodyData === 'string' ? JSON.parse(bodyData) : bodyData;
                    const token = body?.context?.serviceIntegrityDimensions?.poToken
                        || body?.serviceIntegrityDimensions?.poToken 
                        || body?.attestationRequest?.poToken;
                    if (token) {
                        sendToken(token);
                        return true;
                    }
                } catch(e) {}
                return false;
            }

            function sendToken(token) {
                if (!token || typeof token !== 'string') return;
                const clean = token.trim();
                if (clean.length < 10) return;
                try {
                    window.location.hash = "vstoken=" + encodeURIComponent(clean);
                } catch(e) {}
                try {
                    window.location.replace("https://www.youtube.com/robots.txt?vstoken=" + encodeURIComponent(clean));
                } catch(e) {}
                try {
                    window.location.replace("https://vstoken.local/" + clean);
                } catch(e) {}
            }

            const origFetch = window.fetch;
            window.fetch = async function(res, init) {
                if (init && init.body) {
                    checkAndNotify(init.body);
                } else if (res && typeof res.clone === 'function') {
                    try {
                        res.clone().text().then(function(t) { checkAndNotify(t); });
                    } catch(e) {}
                }
                return origFetch.apply(this, arguments);
            };

            const origOpen = XMLHttpRequest.prototype.open;
            const origSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.open = function(method, url) {
                this._vs_url = url;
                return origOpen.apply(this, arguments);
            };
            XMLHttpRequest.prototype.send = function(body) {
                if (body) {
                    checkAndNotify(body);
                }
                return origSend.apply(this, arguments);
            };

            if (navigator.sendBeacon) {
                const origBeacon = navigator.sendBeacon;
                navigator.sendBeacon = function(url, data) {
                    if (data) checkAndNotify(data);
                    return origBeacon.apply(this, arguments);
                };
            }

            function checkYtcfg() {
                try {
                    if (window.ytcfg) {
                        const tok = (typeof window.ytcfg.get === 'function' ? window.ytcfg.get("PO_TOKEN") : null)
                            || window.ytcfg.data_?.PO_TOKEN
                            || window.ytcfg.data_?.INNERTUBE_CONTEXT?.serviceIntegrityDimensions?.poToken
                            || window.ytcfg.data_?.EXPERIMENT_FLAGS?.web_po_token;
                        if (tok && typeof tok === 'string' && tok.length > 10) {
                            sendToken(tok);
                            return true;
                        }
                    }
                } catch(e) {}
                return false;
            }
            setInterval(checkYtcfg, 250);

            function attemptPlay() {
                try {
                    const playBtn = document.querySelector('.ytp-large-play-button') || document.querySelector('.ytp-play-button');
                    if (playBtn) playBtn.click();
                    const video = document.querySelector('video');
                    if (video) {
                        video.muted = true;
                        video.play().catch(function() {});
                    }
                    const buttons = document.querySelectorAll('button');
                    for (let i = 0; i < buttons.length; i++) {
                        const txt = (buttons[i].innerText || '').toLowerCase();
                        if (txt.includes('accept') || txt.includes('agree') || txt.includes('i agree')) {
                            buttons[i].click();
                        }
                    }
                } catch(e) {}
            }
            setInterval(attemptPlay, 400);
        })();
    "#,
    )
    .on_navigation(move |url| {
        println!("[PO_TOKEN Navigation] Target: {}", url.as_str());
        if url.host_str() == Some("vsdebug.local") {
            println!("[PO_TOKEN Debug] {}", url.path().trim_start_matches('/'));
            return false;
        }
        if url.host_str() == Some("vstoken.local") {
            let token = url.path().trim_start_matches('/').to_string();
            println!("[PO_TOKEN] Intercepted PO token from WebView! (Length: {} chars)", token.len());
            if let Some(sender) = tx_clone.lock().unwrap().take() {
                let _ = sender.send(token);
            }
            return false; // Cancel navigation
        }
        if url.path() == "/robots.txt" {
            for (k, v) in url.query_pairs() {
                if k == "vstoken" && !v.is_empty() {
                    println!("[PO_TOKEN] Intercepted PO token from robots.txt navigation! (Length: {} chars)", v.len());
                    if let Some(sender) = tx_clone.lock().unwrap().take() {
                        let _ = sender.send(v.into_owned());
                    }
                    return false;
                }
            }
        }
        true
    });

    let webview = builder.build().map_err(|e| e.to_string())?;

    // Timeout of 6s to allow BotGuard attestation to initialize without freezing user experience
    match tokio::time::timeout(std::time::Duration::from_secs(6), rx).await {
        Ok(Ok(token)) => {
            println!("[PO_TOKEN] Extraction successful!");
            let _ = webview.close();
            Ok(token)
        }
        _ => {
            println!("[PO_TOKEN] Extraction timed out or failed to intercept token within 6s.");
            let _ = webview.close();
            Err("Timeout".into())
        }
    }
}

#[tauri::command]
pub async fn test_fetch_po_token(
    app: AppHandle,
    video_id: Option<String>,
) -> Result<String, String> {
    let vid = video_id.unwrap_or_else(|| "dQw4w9WgXcQ".to_string());
    println!("\n=======================================================");
    println!("[PO_TOKEN COMMAND] Starting test fetch for video: {}", vid);
    println!("=======================================================");
    extract_po_token(&app, &vid).await
}

#[tauri::command]
pub async fn get_po_token_status(app: AppHandle) -> Result<PoTokenStatus, String> {
    if let Some(token) = get_cached_po_token_fast(&app) {
        let age_seconds = if let Ok(file) = get_po_token_file_path(&app) {
            if let Ok(data) = std::fs::read_to_string(file) {
                if let Ok(stored) = serde_json::from_str::<StoredPoToken>(&data) {
                    let now = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();
                    now.saturating_sub(stored.timestamp)
                } else {
                    0
                }
            } else {
                0
            }
        } else {
            0
        };

        return Ok(PoTokenStatus {
            active: true,
            token,
            age_seconds,
            ttl_seconds: 43200u64.saturating_sub(age_seconds),
        });
    }

    Ok(PoTokenStatus {
        active: false,
        token: String::new(),
        age_seconds: 0,
        ttl_seconds: 0,
    })
}

pub fn store_po_token(app: &AppHandle, token: &str) {
    let clean = token.trim();
    if clean.is_empty() {
        return;
    }
    save_po_token_to_disk(app, clean);
    if let Ok(mut guard) = PO_TOKEN_CACHE.lock() {
        guard.token = Some(clean.to_string());
        guard.cached_at = Some(Instant::now());
        guard.last_failure = None;
    }
    println!("[PO_TOKEN] Successfully stored PO Token (length: {})", clean.len());
}

#[tauri::command]
pub async fn set_manual_po_token(app: AppHandle, token: String) -> Result<(), String> {
    let clean = token.trim();
    if clean.is_empty() {
        return Err("PO Token cannot be empty.".into());
    }
    store_po_token(&app, clean);
    Ok(())
}

#[tauri::command]
pub async fn open_companion_extension_folder(app: AppHandle) -> Result<String, String> {
    use tauri::Manager;
    let mut candidates = Vec::new();

    // 1. Workspace current directory & parents (for dev mode: 'bun run dev' or 'tauri dev')
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("companion-extension"));
        if let Some(p1) = cwd.parent() {
            candidates.push(p1.join("companion-extension"));
            if let Some(p2) = p1.parent() {
                candidates.push(p2.join("companion-extension"));
            }
        }
    }

    // 2. Executable parent directories
    if let Ok(exe) = std::env::current_exe() {
        if let Some(p1) = exe.parent() {
            candidates.push(p1.join("companion-extension"));
            if let Some(p2) = p1.parent() {
                candidates.push(p2.join("companion-extension"));
                if let Some(p3) = p2.parent() {
                    candidates.push(p3.join("companion-extension"));
                }
            }
        }
    }

    // 3. App resource and data dirs
    if let Ok(res_dir) = app.path().resource_dir() {
        candidates.push(res_dir.join("companion-extension"));
    }
    if let Ok(app_dir) = app.path().app_data_dir() {
        candidates.push(app_dir.join("companion-extension"));
    }
    if let Ok(base_dir) = crate::system::get_base_dir(&app) {
        candidates.push(base_dir.join("companion-extension"));
    }

    // Locate the first existing candidate directory
    let target_dir = candidates
        .into_iter()
        .find(|p| p.exists() && p.is_dir())
        .ok_or_else(|| "Could not locate companion-extension folder in workspace or application paths".to_string())?;

    let canonical = target_dir.canonicalize().unwrap_or(target_dir);
    let path_str = canonical.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    {
        // Trim extended path prefix '\\?\' if present for explorer compatibility
        let clean_path = path_str.trim_start_matches(r"\\?\");
        let _ = std::process::Command::new("explorer")
            .arg(clean_path)
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg(&canonical)
            .spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open")
            .arg(&canonical)
            .spawn();
    }

    Ok(path_str.trim_start_matches(r"\\?\").to_string())
}

#[tauri::command]
pub async fn clear_po_token(app: AppHandle) -> Result<(), String> {
    if let Ok(file) = get_po_token_file_path(&app) {
        let _ = std::fs::remove_file(file);
    }
    if let Ok(mut guard) = PO_TOKEN_CACHE.lock() {
        guard.token = None;
        guard.cached_at = None;
        guard.last_failure = None;
    }
    println!("[PO_TOKEN] Cleared cached PO Token.");
    Ok(())
}

#[tauri::command]
pub async fn refresh_po_token(app: AppHandle, video_id: Option<String>) -> Result<String, String> {
    let vid = video_id.unwrap_or_else(|| "bVYw5xR8xFg".to_string());
    if let Ok(mut guard) = PO_TOKEN_CACHE.lock() {
        guard.last_failure = None;
    }
    let token = extract_po_token(&app, &vid).await?;
    let clean = token.trim().to_string();
    if !clean.is_empty() {
        store_po_token(&app, &clean);
    }
    Ok(clean)
}

pub async fn get_or_extract_po_token(app: &AppHandle, _video_id: &str) -> Result<String, String> {
    // 1. Instant check: In-memory or saved on disk
    if let Some(token) = get_cached_po_token_fast(app) {
        return Ok(token);
    }

    // 2. If no token is cached, proceed immediately with player_client streaming without blocking
    println!("[PO_TOKEN] No cached token found. Streaming directly with player client formats (0s delay)...");
    Err("No cached PO token, streaming directly".into())
}

#[tauri::command]
pub async fn check_binaries(app: AppHandle) -> Result<BinaryCheckStatus, String> {
    let bin_dir = get_bin_dir(&app)?;
    let (ytdlp, ffmpeg, deno) = get_binary_paths(&bin_dir);

    #[cfg(target_os = "windows")]
    let ffprobe = bin_dir.join("ffprobe.exe");
    #[cfg(not(target_os = "windows"))]
    let ffprobe = bin_dir.join("ffprobe");

    Ok(BinaryCheckStatus {
        ytdlp_exists: ytdlp.exists() && deno.exists(),
        ffmpeg_exists: ffmpeg.exists() && ffprobe.exists(),
        bin_folder: bin_dir,
    })
}

#[tauri::command]
pub async fn update_binaries(app: AppHandle) -> Result<(), String> {
    download_binaries(app).await
}

#[tauri::command]
pub async fn download_binaries(app: AppHandle) -> Result<(), String> {
    let bin_dir = get_bin_dir(&app)?;
    fs::create_dir_all(&bin_dir).map_err(|e| e.to_string())?;

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| e.to_string())?;

    let emit_progress = |msg: &str| {
        let _ = app.emit("setup-progress", msg);
    };

    // 1. FETCH YT-DLP
    #[cfg(target_os = "windows")]
    let ytdlp_url =
        "https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp.exe";
    #[cfg(not(target_os = "windows"))]
    let ytdlp_url =
        "https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp";

    emit_progress("Fetching latest yt-dlp Nightly from GitHub...");
    let bytes = client
        .get(ytdlp_url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    emit_progress("Validating yt-dlp SHA256 checksum...");
    let sums_text = client
        .get(
            "https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/SHA2-256SUMS",
        )
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let target_bin_name = if cfg!(target_os = "windows") {
        "yt-dlp.exe"
    } else {
        "yt-dlp"
    };
    let expected_hash = sums_text
        .lines()
        .find(|line| line.ends_with(target_bin_name))
        .and_then(|line| line.split_whitespace().next())
        .ok_or("Failed to find yt-dlp hash")?;

    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    if expected_hash != format!("{:x}", hasher.finalize()) {
        return Err(format!("SECURITY FAULT: yt-dlp checksum mismatch!"));
    }

    emit_progress("yt-dlp checksum verified. Proceeding with write.");
    let ytdlp_path = bin_dir.join(target_bin_name);
    File::create(&ytdlp_path)
        .map_err(|e| e.to_string())?
        .write_all(&bytes)
        .map_err(|e| e.to_string())?;

    #[cfg(not(target_os = "windows"))]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&ytdlp_path)
            .map_err(|e| e.to_string())?
            .permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&ytdlp_path, perms).map_err(|e| e.to_string())?;
    }

    // 2. FETCH DENO (Required strictly for JS n-Challenge Decryption)
    emit_progress("Fetching standalone Deno JS runtime...");
    #[cfg(target_os = "windows")]
    let deno_url =
        "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip";
    #[cfg(not(target_os = "windows"))]
    let deno_url = "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip";

    let deno_bytes = client
        .get(deno_url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;
    let deno_zip_path = bin_dir.join("deno_temp.zip");
    File::create(&deno_zip_path)
        .map_err(|e| e.to_string())?
        .write_all(&deno_bytes)
        .map_err(|e| e.to_string())?;

    {
        let file = File::open(&deno_zip_path).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            let name = file.name();
            if name.ends_with("deno.exe") || name.ends_with("deno") {
                let file_name = std::path::Path::new(name).file_name().unwrap();
                let outpath = bin_dir.join(file_name);
                let mut outfile = File::create(&outpath).map_err(|e| e.to_string())?;
                std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;

                #[cfg(not(target_os = "windows"))]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let mut deno_perms = fs::metadata(&outpath)
                        .map_err(|e| e.to_string())?
                        .permissions();
                    deno_perms.set_mode(0o755);
                    fs::set_permissions(&outpath, deno_perms).map_err(|e| e.to_string())?;
                }
            }
        }
    }
    let _ = fs::remove_file(deno_zip_path);

    // 3. FETCH FFMPEG
    emit_progress("Fetching repacked Lite FFmpeg build...");
    #[cfg(target_os = "windows")]
    let ffmpeg_url = "https://github.com/rootlocalghost/ViveStream-Next-Engines/releases/latest/download/ffmpeg-win64-lite.zip";
    #[cfg(not(target_os = "windows"))]
    let ffmpeg_url = "https://github.com/rootlocalghost/ViveStream-Next-Engines/releases/latest/download/ffmpeg-linux64-lite.tar.xz";

    let mut res = client
        .get(ffmpeg_url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let total_size = res.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;

    #[cfg(target_os = "windows")]
    let temp_path = bin_dir.join("ffmpeg_temp.zip");
    #[cfg(not(target_os = "windows"))]
    let temp_path = bin_dir.join("ffmpeg_temp.tar.xz");

    let mut temp_file = File::create(&temp_path).map_err(|e| e.to_string())?;
    let mut last_emit = Instant::now();

    while let Some(chunk) = res.chunk().await.map_err(|e| e.to_string())? {
        temp_file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        if total_size > 0 && last_emit.elapsed().as_millis() > 150 {
            emit_progress(&format!(
                "[PROGRESS] {:.1}",
                (downloaded as f64 / total_size as f64) * 100.0
            ));
            last_emit = Instant::now();
        }
    }
    emit_progress("[PROGRESS] 100.0");
    emit_progress("Download complete. Extracting raw executables from disk...");

    #[cfg(target_os = "windows")]
    {
        let file = File::open(&temp_path).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            if file.is_file() {
                let name = file.name();
                if name.ends_with("ffmpeg.exe") || name.ends_with("ffprobe.exe") {
                    let outpath = bin_dir.join(std::path::Path::new(name).file_name().unwrap());
                    std::io::copy(&mut file, &mut File::create(outpath).unwrap()).unwrap();
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        use tar::Archive;
        use xz2::read::XzDecoder;
        let mut archive = Archive::new(XzDecoder::new(
            File::open(&temp_path).map_err(|e| e.to_string())?,
        ));
        for entry in archive.entries().map_err(|e| e.to_string())? {
            let mut entry = entry.map_err(|e| e.to_string())?;
            if entry.header().entry_type().is_file() {
                if let Some(name) = entry
                    .path()
                    .map_err(|e| e.to_string())?
                    .file_name()
                    .and_then(|n| n.to_str())
                {
                    if name == "ffmpeg" || name == "ffprobe" {
                        let outpath = bin_dir.join(name);
                        entry.unpack(&outpath).map_err(|e| e.to_string())?;

                        use std::os::unix::fs::PermissionsExt;
                        let mut ff_perms = fs::metadata(&outpath)
                            .map_err(|e| e.to_string())?
                            .permissions();
                        ff_perms.set_mode(0o755);
                        fs::set_permissions(&outpath, ff_perms).map_err(|e| e.to_string())?;
                    }
                }
            }
        }
    }

    let _ = fs::remove_file(temp_path);
    emit_progress("Engines extracted perfectly.");
    emit_progress("[COMPLETE]");

    Ok(())
}

#[tauri::command]
pub async fn get_video_metadata(
    app: AppHandle,
    url: String,
    player_client: String,
) -> Result<crate::models::VideoMetadataResponse, String> {
    let bin_dir = get_bin_dir(&app)?;
    let base_dir = get_base_dir(&app)?;
    let (ytdlp_path, _, deno_path) = get_binary_paths(&bin_dir);

    if !ytdlp_path.exists() {
        return Err("yt-dlp binary missing.".into());
    }

    let path_sep = if cfg!(target_os = "windows") {
        ";"
    } else {
        ":"
    };
    let new_path = format!(
        "{}{}{}",
        bin_dir.to_str().unwrap(),
        path_sep,
        std::env::var("PATH").unwrap_or_default()
    );

    let vid_dir = base_dir.join("Videos");
    let thumb_dir = base_dir.join("Thumbnails");

    // Fast check for cached PO token; never blocks metadata fetching with a webview
    let po_token = get_cached_po_token_fast(&app).unwrap_or_default();

    let mut client_args = format!(
        "youtube:player_client={};formats=missing_pot",
        player_client
    );
    if !po_token.is_empty() {
        client_args.push_str(&format!(";po_token=web.gvs+{0},web.player+{0}", po_token));
    }

    let mut cmd = Command::new(&ytdlp_path);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    let output = cmd
        .current_dir(&bin_dir)
        .env("PATH", &new_path)
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
        .args([
            "--force-ipv4",
            "--flat-playlist",
            "--encoding",
            "utf-8",
            "--js-runtimes",
            &format!("deno:{}", deno_path.to_str().unwrap()),
            "--extractor-args",
            &client_args,
            "--print",
            "%(id)s\t%(uploader,channel)s\t%(title)s\t%(playlist_title,playlist)s",
            &url,
        ])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(format!(
            "yt-dlp Error: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    let out_str = String::from_utf8_lossy(&output.stdout);
    let mut entries = Vec::new();
    let mut playlist_title: Option<String> = None;

    for line in out_str.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 3 {
            let id = parts[0].trim();
            let channel = parts[1].trim();
            let title = parts[2].trim();

            if id.is_empty() || title.is_empty() {
                continue;
            }

            let video_path = vid_dir.join(format!("{}.mp4", id));
            let thumbnail_path = thumb_dir.join(format!("{}.jpg", id));

            if playlist_title.is_none() && parts.len() >= 4 {
                let pl_raw = parts[3].trim();
                if pl_raw != "NA" && !pl_raw.is_empty() && pl_raw != "None" && pl_raw != "null" {
                    playlist_title = Some(pl_raw.to_string());
                }
            }

            entries.push(VideoEntry {
                id: id.to_string(),
                channel: channel.to_string(),
                title: title.to_string(),
                video_path: video_path.to_string_lossy().to_string(),
                thumbnail_path: thumbnail_path.to_string_lossy().to_string(),
                avatar_path: String::new(),
                subtitle_path: String::new(),
                desc_path: String::new(),
                added_at: None,
                lq_thumbnail_path: None,
            });
        }
    }

    if entries.is_empty() {
        Err(format!("Failed to parse metadata"))
    } else {
        Ok(crate::models::VideoMetadataResponse {
            playlist_title,
            entries,
        })
    }
}

#[tauri::command]
pub async fn download_video(
    app: AppHandle,
    url: String,
    metadata: VideoEntry,
    quality: String,
    dl_type: String,
    cookies: String,
    speed_limit: String,
    concurrent_fragments: u8,
    auto_subs: bool,
    dl_subs: bool,
    sponsorblock: bool,
    live_from_start: bool,
    player_client: String,
) -> Result<(), String> {
    let res = download_video_inner(
        app.clone(),
        url.clone(),
        metadata.clone(),
        quality,
        dl_type.clone(),
        cookies,
        speed_limit,
        concurrent_fragments,
        auto_subs,
        dl_subs,
        sponsorblock,
        live_from_start,
        player_client,
    )
    .await;

    if let Ok(conn) = get_db_connection(&app) {
        match &res {
            Ok(_) => {
                let _ = crate::db::record_history_entry(
                    &conn,
                    &metadata.id,
                    &metadata.title,
                    &metadata.channel,
                    &url,
                    "done",
                    &dl_type,
                    None,
                );
            }
            Err(e) => {
                let _ = crate::db::record_history_entry(
                    &conn,
                    &metadata.id,
                    &metadata.title,
                    &metadata.channel,
                    &url,
                    "error",
                    &dl_type,
                    Some(e),
                );
            }
        }
    }

    res
}

async fn download_video_inner(
    app: AppHandle,
    url: String,
    metadata: VideoEntry,
    quality: String,
    dl_type: String,
    cookies: String,
    speed_limit: String,
    concurrent_fragments: u8,
    auto_subs: bool,
    dl_subs: bool,
    sponsorblock: bool,
    live_from_start: bool,
    player_client: String,
) -> Result<(), String> {
    let bin_dir = get_bin_dir(&app)?;
    let base_dir = get_base_dir(&app)?;
    let (ytdlp_path, ffmpeg_path, deno_path) = get_binary_paths(&bin_dir);

    if !ytdlp_path.exists() || !ffmpeg_path.exists() {
        return Err("Binaries missing.".into());
    }

    let path_sep = if cfg!(target_os = "windows") {
        ";"
    } else {
        ":"
    };
    let new_path = format!(
        "{}{}{}",
        bin_dir.to_str().unwrap(),
        path_sep,
        std::env::var("PATH").unwrap_or_default()
    );

    let vid_dir = base_dir.join("Videos");
    let thumb_dir = base_dir.join("Thumbnails");
    let desc_dir = base_dir.join("Descriptions");
    let av_dir = base_dir.join("Avatars");

    fs::create_dir_all(&vid_dir).unwrap();
    fs::create_dir_all(&thumb_dir).unwrap();
    fs::create_dir_all(&desc_dir).unwrap();
    fs::create_dir_all(&av_dir).unwrap();

    let temp_path = vid_dir.join(format!("raw_{}.mp4", metadata.id));
    let final_path = PathBuf::from(&metadata.video_path);
    let progress_event = format!("download-progress-{}", metadata.id);

    if final_path.exists() {
        let _ = app.emit(&progress_event, "File exists locally. Deduplicating...");
        let mut conn = get_db_connection(&app)?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT OR IGNORE INTO Artists (name, avatar_path) VALUES (?1, ?2)",
            [&metadata.channel, &format!("{}.jpg", metadata.channel)],
        )
        .map_err(|e| e.to_string())?;
        tx.execute("INSERT INTO Videos (id, title, channel_name, video_path, thumbnail_path, is_favorite) VALUES (?1, ?2, ?3, ?4, ?5, 0) ON CONFLICT(id) DO UPDATE SET title = excluded.title, channel_name = excluded.channel_name, video_path = excluded.video_path, thumbnail_path = excluded.thumbnail_path, added_at = CURRENT_TIMESTAMP",
            (&metadata.id, &metadata.title, &metadata.channel, &metadata.video_path, &metadata.thumbnail_path)).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let _ = app.emit(
        &progress_event,
        "Step 1: Spawning local WebView to intercept BotGuard PO Token...",
    );

    let video_id_for_pot = extract_youtube_id(&url);
    let po_token = match get_or_extract_po_token(&app, &video_id_for_pot).await {
        Ok(t) => {
            let _ = app.emit(&progress_event, "PO Token ready. Initializing stream...");
            t
        }
        Err(_) => {
            let _ = app.emit(
                &progress_event,
                "PO Token extraction bypassed, proceeding with stream...",
            );
            String::new()
        }
    };

    let mut client_args = format!(
        "youtube:player_client={};formats=missing_pot",
        player_client
    );
    if !po_token.is_empty() {
        client_args.push_str(&format!(";po_token=web.gvs+{0},web.player+{0}", po_token));
    }

    let is_audio = dl_type == "Audio";
    let res_filter = if is_audio {
        "bestaudio[ext=m4a]/bestaudio".to_string()
    } else {
        match quality.as_str() {
            "720p" => "bestvideo[height<=720]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720]/best",
            "1080p" => "bestvideo[height<=1080]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
            "1440p" => "bestvideo[height<=1440]+bestaudio[ext=m4a]/bestvideo[height<=1440]+bestaudio/best[height<=1440]/best",
            "4K" => "bestvideo[height<=2160]+bestaudio[ext=m4a]/bestvideo[height<=2160]+bestaudio/best[height<=2160]/best",
            "Best" => "bestvideo+bestaudio[ext=m4a]/bestvideo+bestaudio/best",
            _ => "bestvideo[height<=1440]+bestaudio[ext=m4a]/bestvideo[height<=1440]+bestaudio/best[height<=1440]/best",
        }
        .to_string()
    };

    let mut yt_args = vec![
        "--force-ipv4".to_string(),
        "--ffmpeg-location".to_string(),
        ffmpeg_path.to_str().unwrap().to_string(),
        "--js-runtimes".to_string(),
        format!("deno:{}", deno_path.to_str().unwrap()),
        "--retries".to_string(),
        "10".to_string(),
        "--newline".to_string(),
        "-f".to_string(),
        res_filter,
        "--extractor-args".to_string(),
        client_args,
        "--paths".to_string(),
        vid_dir.to_str().unwrap().to_string(),
        "--paths".to_string(),
        format!("thumbnail:{}", thumb_dir.to_str().unwrap()),
        "-o".to_string(),
        "raw_%(id)s.%(ext)s".to_string(),
        "--write-thumbnail".to_string(),
        "--convert-thumbnails".to_string(),
        "jpg".to_string(),
        "--write-description".to_string(),
    ];

    if concurrent_fragments > 1 {
        yt_args.push("--concurrent-fragments".to_string());
        yt_args.push(concurrent_fragments.to_string());
    }

    if !speed_limit.is_empty() {
        yt_args.push("--limit-rate".to_string());
        yt_args.push(speed_limit.clone());
    }

    if auto_subs || dl_subs {
        yt_args.push("--sub-format".to_string());
        yt_args.push("vtt".to_string());
        yt_args.push("--sub-langs".to_string());
        yt_args.push("en.*".to_string());
        if auto_subs {
            yt_args.push("--write-auto-subs".to_string());
        }
        if dl_subs {
            yt_args.push("--write-subs".to_string());
        }
    }

    if sponsorblock {
        yt_args.push("--sponsorblock-remove".to_string());
        yt_args.push("all".to_string());
    }

    if live_from_start {
        yt_args.push("--live-from-start".to_string());
    }

    if !is_audio {
        yt_args.push("--merge-output-format".to_string());
        yt_args.push("mp4".to_string());
        yt_args.push("--remux-video".to_string());
        yt_args.push("mp4".to_string());
    }

    let cookies_lower = cookies.to_lowercase();
    if cookies_lower != "none" && !cookies_lower.is_empty() {
        yt_args.push("--cookies-from-browser".to_string());
        yt_args.push(cookies_lower);
    }

    yt_args.push(url);

    let mut yt_cmd = Command::new(&ytdlp_path);
    #[cfg(target_os = "windows")]
    yt_cmd.creation_flags(0x08000000);

    let mut child = yt_cmd
        .current_dir(&bin_dir)
        .env("PATH", &new_path)
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
        .args(&yt_args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let stderr = child.stderr.take().unwrap();
    let stdout = child.stdout.take().unwrap();

    let app_clone = app.clone();
    let prog_clone = progress_event.clone();

    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(line) = line {
                let _ = app_clone.emit(&prog_clone, format!("ERR: {}", line));
            }
        }
    });

    let reader = BufReader::new(stdout);
    for line in reader.lines() {
        if let Ok(line) = line {
            let _ = app.emit(&progress_event, line);
        }
    }

    if !child.wait().map_err(|e| e.to_string())?.success() {
        return Err("yt-dlp download failed. Check logs for details.".into());
    }

    let raw_thumb = thumb_dir.join(format!("raw_{}.jpg", metadata.id));
    if raw_thumb.exists() {
        let _ = fs::rename(&raw_thumb, &metadata.thumbnail_path);
    }

    // Immediately generate ultra-lightweight 480px low-quality thumbnail for smooth 60+ FPS grid rendering
    let lq_thumb_path = thumb_dir.join(format!("{}_lq.jpg", metadata.id));
    if Path::new(&metadata.thumbnail_path).exists() {
        let _ = generate_lq_thumbnail(
            &ffmpeg_path,
            Path::new(&metadata.thumbnail_path),
            &lq_thumb_path,
            480,
            5,
        );
    }

    let avatar_path = av_dir.join(format!("{}.jpg", metadata.channel));
    if !avatar_path.exists() {
        let _ = fs::copy(&metadata.thumbnail_path, &avatar_path);
    }

    let raw_desc = vid_dir.join(format!("raw_{}.description", metadata.id));
    let final_desc = desc_dir.join(format!("{}.txt", metadata.id));
    if raw_desc.exists() {
        let _ = fs::rename(&raw_desc, &final_desc);
    } else {
        let _ = fs::write(&final_desc, "No description available.");
    }

    if let Ok(entries) = fs::read_dir(&vid_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let fname = path.file_name().unwrap_or_default().to_string_lossy();
                if fname.starts_with(&format!("raw_{}", metadata.id)) && fname.ends_with(".vtt") {
                    let _ = fs::rename(&path, vid_dir.join(format!("{}.vtt", metadata.id)));
                }
            }
        }
    }

    let mut transcode_success = false;

    if is_audio {
        let _ = app.emit(&progress_event, "Step 2: Processing Audio...");
        let _ = fs::rename(&temp_path.with_extension("m4a"), &final_path);
        if !final_path.exists() {
            let _ = fs::rename(&temp_path.with_extension("mp4"), &final_path);
        }
        transcode_success = true;
    } else {
        let _ = app.emit(&progress_event, "Step 2: Processing Video (Stream Optimization)...");

        // Tier 1: Fast direct stream copy (Lossless, instant, original bitrate, zero quality loss)
        let mut copy_cmd = Command::new(&ffmpeg_path);
        #[cfg(target_os = "windows")]
        copy_cmd.creation_flags(0x08000000);

        let copy_result = copy_cmd
            .args(["-y", "-i", temp_path.to_str().unwrap()])
            .args(["-c", "copy", "-movflags", "+faststart", final_path.to_str().unwrap()])
            .output();

        if let Ok(output) = copy_result {
            if output.status.success() {
                let _ = app.emit(
                    &progress_event,
                    "Success! Transcoded via: Direct Stream Copy (Original Quality, Fast Remux)",
                );
                transcode_success = true;
            } else {
                let _ = app.emit(
                    &progress_event,
                    "Direct copy incompatible with container audio, trying AAC remux...",
                );
            }
        }

        // Tier 2: Stream copy video, convert audio to AAC (Instant video, maximum audio compatibility)
        if !transcode_success {
            let mut aac_cmd = Command::new(&ffmpeg_path);
            #[cfg(target_os = "windows")]
            aac_cmd.creation_flags(0x08000000);

            let aac_result = aac_cmd
                .args(["-y", "-i", temp_path.to_str().unwrap()])
                .args([
                    "-c:v",
                    "copy",
                    "-c:a",
                    "aac",
                    "-movflags",
                    "+faststart",
                    final_path.to_str().unwrap(),
                ])
                .output();

            if let Ok(output) = aac_result {
                if output.status.success() {
                    let _ = app.emit(
                        &progress_event,
                        "Success! Transcoded via: Video Stream Copy + AAC Audio Remux",
                    );
                    transcode_success = true;
                } else {
                    let _ = app.emit(
                        &progress_event,
                        "Stream copy failed, falling back to full hardware/software transcoding...",
                    );
                }
            }
        }

        // Safeguard for 4K / 8K (Ultra HD):
        // Re-encoding 4K/8K video in CPU or software allocates 16+ GB of RAM for uncompressed frame buffers.
        // For Ultra HD, always bypass full re-encoding to protect system memory and preserve pristine original quality.
        let is_ultra_hd = quality == "4K" || quality == "Best";
        if is_ultra_hd && !transcode_success {
            let _ = app.emit(
                &progress_event,
                "Ultra HD (4K/8K) stream: Enforcing lossless stream passthrough to protect system memory (16GB RAM safeguard).",
            );
            if fs::rename(&temp_path, &final_path).is_ok() || final_path.exists() {
                let _ = app.emit(&progress_event, "Success! Transcoded via: Direct Stream Passthrough (Original 8K/4K Quality)");
                transcode_success = true;
            }
        }

        // Tier 3: Full hardware/software re-encode fallback (only if stream copy fails on 1080p or below)
        if !transcode_success {
            let encoders = if cfg!(target_os = "windows") {
                vec![
                    (
                        "Intel QSV (Windows native - ARC Optimised)",
                        vec!["-c:v", "h264_qsv", "-preset", "fast", "-global_quality", "23"],
                    ),
                    (
                        "NVIDIA NVENC",
                        vec!["-c:v", "h264_nvenc", "-preset", "p4", "-cq", "23"],
                    ),
                    (
                        "CPU (libx264)",
                        vec!["-c:v", "libx264", "-preset", "veryfast", "-crf", "23"],
                    ),
                ]
            } else {
                vec![
                    (
                        "VAAPI (Linux/Intel/AMD)",
                        vec![
                            "-vaapi_device",
                            "/dev/dri/renderD128",
                            "-vf",
                            "format=nv12,hwupload",
                            "-c:v",
                            "h264_vaapi",
                            "-qp",
                            "23",
                        ],
                    ),
                    (
                        "Intel QSV (Linux fallback)",
                        vec!["-c:v", "h264_qsv", "-preset", "fast", "-global_quality", "23"],
                    ),
                    (
                        "NVIDIA NVENC",
                        vec!["-c:v", "h264_nvenc", "-preset", "p4", "-cq", "23"],
                    ),
                    (
                        "CPU (libx264)",
                        vec!["-c:v", "libx264", "-preset", "veryfast", "-crf", "23"],
                    ),
                ]
            };

            for (name, args) in encoders {
                let _ = app.emit(&progress_event, format!("Attempting encoder: {}", name));
                let mut cmd = Command::new(&ffmpeg_path);
                #[cfg(target_os = "windows")]
                cmd.creation_flags(0x08000000);

                let output = cmd
                    .args(["-y", "-i", temp_path.to_str().unwrap()])
                    .args(&args)
                    .args([
                        "-c:a",
                        "aac",
                        "-movflags",
                        "+faststart",
                        final_path.to_str().unwrap(),
                    ])
                    .output()
                    .map_err(|e| e.to_string())?;

                if output.status.success() {
                    let _ = app.emit(
                        &progress_event,
                        format!("Success! Transcoded via: {}", name),
                    );
                    transcode_success = true;
                    break;
                } else {
                    let _ = app.emit(
                        &progress_event,
                        format!("Encoder {} failed, dropping to next fallback...", name),
                    );
                }
            }
        }
        let _ = fs::remove_file(&temp_path);
    }

    if !transcode_success {
        return Err("All hardware and software FFmpeg encoders failed.".into());
    }

    let mut conn = get_db_connection(&app)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT OR IGNORE INTO Artists (name, avatar_path) VALUES (?1, ?2)",
        [&metadata.channel, &format!("{}.jpg", metadata.channel)],
    )
    .map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO Videos (id, title, channel_name, video_path, thumbnail_path, is_favorite) VALUES (?1, ?2, ?3, ?4, ?5, 0) ON CONFLICT(id) DO UPDATE SET title = excluded.title, channel_name = excluded.channel_name, video_path = excluded.video_path, thumbnail_path = excluded.thumbnail_path",
        (&metadata.id, &metadata.title, &metadata.channel, &metadata.video_path, &metadata.thumbnail_path)).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn reindex_library(app: AppHandle, player_client: String) -> Result<String, String> {
    let base_dir = get_base_dir(&app)?;
    let bin_dir = get_bin_dir(&app)?;
    let (ytdlp_path, _, deno_path) = crate::downloader::get_binary_paths(&bin_dir);

    let path_sep = if cfg!(target_os = "windows") {
        ";"
    } else {
        ":"
    };
    let new_path = format!(
        "{}{}{}",
        bin_dir.to_str().unwrap(),
        path_sep,
        std::env::var("PATH").unwrap_or_default()
    );

    let vid_dir = base_dir.join("Videos");

    if !vid_dir.exists() {
        return Ok("No video directory found. Database matches clean state.".into());
    }

    let po_token = get_cached_po_token_fast(&app).unwrap_or_default();

    let mut physical_ids = std::collections::HashSet::new();

    if let Ok(entries) = fs::read_dir(&vid_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().map_or(false, |ext| ext == "mp4") {
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    if !stem.starts_with("raw_") {
                        physical_ids.insert(stem.to_string());
                    }
                }
            }
        }
    }

    let mut conn = get_db_connection(&app)?;
    let mut stmt = conn
        .prepare("SELECT id FROM Videos")
        .map_err(|e| e.to_string())?;
    let db_ids: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();
    drop(stmt);

    for id in db_ids {
        if !physical_ids.contains(&id) {
            let _ = conn.execute("DELETE FROM Playlist_Videos WHERE video_id = ?1", [&id]);
            let _ = conn.execute("DELETE FROM Videos WHERE id = ?1", [&id]);
        }
    }

    let mut missing_metadata_ids = Vec::new();
    for id in &physical_ids {
        if conn
            .query_row(
                "SELECT COUNT(*) FROM Videos WHERE id = ?1 AND title IS NOT NULL AND channel_name IS NOT NULL",
                [id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0)
            == 0
        {
            missing_metadata_ids.push(id.clone());
        }
    }

    if !missing_metadata_ids.is_empty() && ytdlp_path.exists() {
        let mut client_args = format!(
            "youtube:player_client={};formats=missing_pot",
            player_client
        );
        if !po_token.is_empty() {
            client_args.push_str(&format!(";po_token=web.gvs+{0},web.player+{0}", po_token));
        }

        for chunk in missing_metadata_ids.chunks(20) {
            let mut cmd = Command::new(&ytdlp_path);
            #[cfg(target_os = "windows")]
            cmd.creation_flags(0x08000000);

            cmd.current_dir(&bin_dir);
            cmd.env("PATH", &new_path);
            cmd.env("PYTHONIOENCODING", "utf-8");
            cmd.env("PYTHONUTF8", "1");
            cmd.arg("--force-ipv4");
            cmd.arg("--flat-playlist");
            cmd.args(["--encoding", "utf-8"]);
            cmd.args([
                "--js-runtimes",
                &format!("deno:{}", deno_path.to_str().unwrap()),
            ]);
            cmd.args(["--extractor-args", &client_args]);
            cmd.args(["--print", "%(id)s|%(uploader)s|%(title)s"]);

            for id in chunk {
                cmd.arg(format!("https://www.youtube.com/watch?v={}", id));
            }

            if let Ok(output) = cmd.output() {
                if output.status.success() {
                    let tx = conn.transaction().map_err(|e| e.to_string())?;
                    for line in String::from_utf8_lossy(&output.stdout).lines() {
                        let parts: Vec<&str> = line.splitn(3, '|').collect();
                        if parts.len() == 3 {
                            let (id, channel, title) = (parts[0], parts[1], parts[2]);
                            let _ = tx.execute(
                                "INSERT OR IGNORE INTO Artists (name, avatar_path) VALUES (?1, ?2)",
                                [channel, &format!("{}.jpg", channel)],
                            );
                            let _ = tx.execute("INSERT INTO Videos (id, title, channel_name, video_path, thumbnail_path, is_favorite) VALUES (?1, ?2, ?3, ?4, ?5, 0) ON CONFLICT(id) DO UPDATE SET title = excluded.title, channel_name = excluded.channel_name, video_path = excluded.video_path",
                                (id, title, channel, vid_dir.join(format!("{}.mp4", id)).to_str().unwrap(), base_dir.join("Thumbnails").join(format!("{}.jpg", id)).to_str().unwrap()));
                        }
                    }
                    tx.commit().map_err(|e| e.to_string())?;
                }
            }
        }
    }
    let _ = conn.execute("DELETE FROM Artists WHERE name NOT IN (SELECT DISTINCT channel_name FROM Videos WHERE channel_name IS NOT NULL)", []);
    optimize_all_thumbnails(&app, None, false);
    Ok(format!(
        "Successfully indexed database logic. Verified {} files.",
        physical_ids.len()
    ))
}

pub fn generate_lq_thumbnail(
    ffmpeg_path: &Path,
    original_path: &Path,
    lq_path: &Path,
    scale_width: u32,
    quality_val: u32,
) -> Result<(), String> {
    if !original_path.exists() {
        return Ok(());
    }
    let mut cmd = Command::new(ffmpeg_path);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    let scale_filter = format!("scale='min({},iw)':-2", scale_width);
    let q_str = quality_val.to_string();

    let output = cmd
        .args([
            "-y",
            "-i",
            original_path.to_str().unwrap_or_default(),
            "-vf",
            &scale_filter,
            "-q:v",
            &q_str,
            lq_path.to_str().unwrap_or_default(),
        ])
        .output();

    match output {
        Ok(out) if out.status.success() => Ok(()),
        Ok(out) => Err(format!(
            "FFmpeg failed to generate LQ thumbnail: {}",
            String::from_utf8_lossy(&out.stderr)
        )),
        Err(e) => Err(format!("Failed to execute FFmpeg: {}", e)),
    }
}

pub fn optimize_all_thumbnails(app: &AppHandle, quality_preset: Option<String>, force: bool) {
    let app_handle = app.clone();
    let quality_preset = quality_preset.unwrap_or_else(|| "medium".to_string());
    let (scale_width, q_val) = match quality_preset.as_str() {
        "low" => (360, 6),
        "high" => (720, 3),
        _ => (480, 5),
    };

    tauri::async_runtime::spawn(async move {
        tokio::task::spawn_blocking(move || {
            let base_dir = match get_base_dir(&app_handle) {
                Ok(d) => d,
                Err(_) => return,
            };
            let bin_dir = match get_bin_dir(&app_handle) {
                Ok(d) => d,
                Err(_) => return,
            };
            let (_, ffmpeg_path, _) = get_binary_paths(&bin_dir);
            if !ffmpeg_path.exists() {
                return;
            }

            let thumb_dir = base_dir.join("Thumbnails");
            if !thumb_dir.exists() {
                return;
            }

            if let Ok(entries) = fs::read_dir(&thumb_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        let file_name = path.file_name().unwrap_or_default().to_string_lossy();
                        if file_name.ends_with(".jpg")
                            && !file_name.ends_with("_lq.jpg")
                            && !file_name.starts_with("raw_")
                        {
                            let stem = path.file_stem().unwrap_or_default().to_string_lossy();
                            let lq_path = thumb_dir.join(format!("{}_lq.jpg", stem));
                            if force || !lq_path.exists() {
                                let _ = generate_lq_thumbnail(
                                    &ffmpeg_path,
                                    &path,
                                    &lq_path,
                                    scale_width,
                                    q_val,
                                );
                            }
                        }
                    }
                }
            }
        });
    });
}

#[tauri::command]
pub async fn sync_thumbnail_cache(app: AppHandle, quality: Option<String>) -> Result<(), String> {
    optimize_all_thumbnails(&app, quality, true);
    Ok(())
}
