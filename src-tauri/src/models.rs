use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct VideoEntry {
    pub id: String,
    pub title: String,
    pub channel: String,
    pub video_path: String,
    pub thumbnail_path: String,
    pub avatar_path: String,
    pub subtitle_path: String,
    pub desc_path: String,
    #[serde(default)]
    pub added_at: Option<String>,
    #[serde(default)]
    pub lq_thumbnail_path: Option<String>,
}

#[derive(Serialize)]
pub struct VideoMetadataResponse {
    pub playlist_title: Option<String>,
    pub entries: Vec<VideoEntry>,
}

#[derive(Serialize)]
pub struct ArtistEntry {
    pub name: String,
    pub avatar_path: String,
}

#[derive(Serialize)]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct BinaryCheckStatus {
    pub ytdlp_exists: bool,
    pub ffmpeg_exists: bool,
    pub bin_folder: std::path::PathBuf,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct DownloadHistoryEntry {
    pub id: String,
    pub video_id: String,
    pub title: String,
    pub channel: String,
    pub url: String,
    pub status: String,
    pub dl_type: String,
    pub error_msg: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EngineVersionsInfo {
    pub ytdlp_version: String,
    pub ffmpeg_version: String,
    pub quickjs_version: String,
    #[serde(default)]
    pub deno_version: String,
    pub whisper_version: String,
    pub whisper_installed: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EngineUpdateInfo {
    pub update_available: bool,
    pub ytdlp_update: bool,
    pub current_ytdlp_version: String,
    pub latest_ytdlp_version: String,
    pub ffmpeg_installed: bool,
    pub quickjs_installed: bool,
    #[serde(default)]
    pub deno_installed: bool,
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppUpdateInfo {
    pub update_available: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_notes: String,
    pub release_url: String,
    pub download_url: Option<String>,
    pub asset_name: Option<String>,
    pub asset_size_mb: Option<f64>,
    pub published_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UpdateProgressEvent {
    pub target: String,
    pub percentage: f64,
    pub downloaded_mb: f64,
    pub total_mb: f64,
    pub message: String,
    pub status: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LyricWord {
    pub word: String,
    pub start: f64,
    pub end: f64,
    #[serde(default)]
    pub probability: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LyricLine {
    pub id: usize,
    pub start: f64,
    pub end: f64,
    pub text: String,
    #[serde(default)]
    pub translation: Option<String>,
    #[serde(default)]
    pub words: Vec<LyricWord>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TrackLyricsPayload {
    pub track_id: String,
    pub title: String,
    pub has_lyrics: bool,
    pub format: String,
    pub language: String,
    pub duration: f64,
    pub lines: Vec<LyricLine>,
    #[serde(default)]
    pub raw_lrc: Option<String>,
    #[serde(default)]
    pub raw_enhanced_lrc: Option<String>,
    #[serde(default)]
    pub raw_srt: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BatchProgressEvent {
    pub current_index: usize,
    pub total_tracks: usize,
    pub track_id: String,
    pub title: String,
    pub stage: String,
    pub percent: f64,
    pub status: String,
}
