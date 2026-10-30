use crate::models::{ArtistEntry, DownloadHistoryEntry, Playlist, VideoEntry};
use crate::system::get_base_dir;
use rusqlite::Connection;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

pub fn get_db_connection(app: &AppHandle) -> Result<Connection, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    let db_path = config_dir.join("ViveStream-Next.db");
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| e.to_string())?;
    Ok(conn)
}

pub fn init_db(app: &AppHandle) -> Result<(), String> {
    let conn = get_db_connection(app)?;
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS Artists (
            name TEXT PRIMARY KEY,
            avatar_path TEXT
        );
        CREATE TABLE IF NOT EXISTS Videos (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            channel_name TEXT,
            video_path TEXT NOT NULL,
            thumbnail_path TEXT,
            is_favorite BOOLEAN DEFAULT 0,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(channel_name) REFERENCES Artists(name)
        );
        CREATE TABLE IF NOT EXISTS Playlists (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS Playlist_Videos (
            playlist_id TEXT,
            video_id TEXT,
            sort_order INTEGER,
            PRIMARY KEY (playlist_id, video_id),
            FOREIGN KEY(playlist_id) REFERENCES Playlists(id) ON DELETE CASCADE,
            FOREIGN KEY(video_id) REFERENCES Videos(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS DownloadHistory (
            id TEXT PRIMARY KEY,
            video_id TEXT NOT NULL,
            title TEXT NOT NULL,
            channel_name TEXT,
            url TEXT NOT NULL,
            status TEXT NOT NULL,
            dl_type TEXT DEFAULT 'Video',
            error_msg TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        ",
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn map_video_row(
    row: &rusqlite::Row,
    base_dir: &std::path::Path,
) -> Result<VideoEntry, rusqlite::Error> {
    let id: String = row.get(0)?;
    let channel: String = row.get(2)?;

    // [IMPROVEMENT]: Dynamically reconstruct paths based on the current OS `base_dir`
    // instead of relying on the static string stored in the database at the time of download.
    // This allows the user to safely migrate their OS drive without breaking the library.
    let stored_video_path: String = row.get(3)?;
    let ext = std::path::Path::new(&stored_video_path)
        .extension()
        .unwrap_or(std::ffi::OsStr::new("mp4"))
        .to_string_lossy();

    let video_path = base_dir
        .join("Videos")
        .join(format!("{}.{}", id, ext))
        .to_string_lossy()
        .into_owned();

    let thumbnail_path = base_dir
        .join("Thumbnails")
        .join(format!("{}.jpg", id))
        .to_string_lossy()
        .into_owned();

    let subtitle_path = base_dir
        .join("Videos")
        .join(format!("{}.vtt", id))
        .to_string_lossy()
        .into_owned();

    let avatar_path = base_dir
        .join("Avatars")
        .join(format!("{}.jpg", channel))
        .to_string_lossy()
        .into_owned();

    let desc_path = base_dir
        .join("Descriptions")
        .join(format!("{}.txt", id))
        .to_string_lossy()
        .into_owned();

    let lq_thumb = base_dir.join("Thumbnails").join(format!("{}_lq.jpg", id));
    let lq_thumbnail_path = if lq_thumb.exists() {
        Some(lq_thumb.to_string_lossy().into_owned())
    } else {
        None
    };

    let added_at: Option<String> = row.get(5).ok();

    Ok(VideoEntry {
        id,
        title: row.get(1)?,
        channel,
        video_path,
        thumbnail_path,
        avatar_path,
        subtitle_path,
        desc_path,
        added_at,
        lq_thumbnail_path,
    })
}

#[tauri::command]
pub async fn get_downloaded_videos(app: AppHandle) -> Result<Vec<VideoEntry>, String> {
    tokio::task::spawn_blocking(move || {
        let conn = get_db_connection(&app)?;
        let base_dir = get_base_dir(&app)?;
        let mut stmt = conn.prepare("SELECT id, title, channel_name, video_path, thumbnail_path, DATETIME(added_at, 'localtime') FROM Videos ORDER BY added_at DESC").map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map([], |row| map_video_row(row, &base_dir))
            .map_err(|e| e.to_string())?;
        let mut videos = Vec::new();
        for video in iter {
            videos.push(video.map_err(|e| e.to_string())?);
        }
        Ok(videos)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn check_favorite(app: AppHandle, id: String) -> Result<bool, String> {
    tokio::task::spawn_blocking(move || {
        let conn = get_db_connection(&app)?;
        let mut stmt = conn
            .prepare("SELECT is_favorite FROM Videos WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        let is_fav: i32 = stmt.query_row([&id], |row| row.get(0)).unwrap_or(0);
        Ok(is_fav == 1)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn toggle_favorite(app: AppHandle, id: String, is_favorite: bool) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let conn = get_db_connection(&app)?;
        let fav_int = if is_favorite { 1 } else { 0 };
        conn.execute(
            "UPDATE Videos SET is_favorite = ?1 WHERE id = ?2",
            rusqlite::params![fav_int, id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_favorites(app: AppHandle) -> Result<Vec<VideoEntry>, String> {
    tokio::task::spawn_blocking(move || {
        let conn = get_db_connection(&app)?;
        let base_dir = get_base_dir(&app)?;
        let mut stmt = conn.prepare("SELECT id, title, channel_name, video_path, thumbnail_path, DATETIME(added_at, 'localtime') FROM Videos WHERE is_favorite = 1 ORDER BY added_at DESC").map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map([], |row| map_video_row(row, &base_dir))
            .map_err(|e| e.to_string())?;
        let mut videos = Vec::new();
        for video in iter {
            videos.push(video.map_err(|e| e.to_string())?);
        }
        Ok(videos)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_artists(app: AppHandle) -> Result<Vec<ArtistEntry>, String> {
    tokio::task::spawn_blocking(move || {
        let conn = get_db_connection(&app)?;
        let base_dir = get_base_dir(&app)?;

        // Auto-sync Artists table from any existing Videos
        let _ = conn.execute(
            "INSERT OR IGNORE INTO Artists (name, avatar_path)
             SELECT DISTINCT TRIM(channel_name), ''
             FROM Videos
             WHERE channel_name IS NOT NULL AND TRIM(channel_name) != ''",
            [],
        );

        // Remove artists that have no videos
        let _ = conn.execute(
            "DELETE FROM Artists WHERE name NOT IN (
                SELECT DISTINCT TRIM(channel_name) FROM Videos WHERE channel_name IS NOT NULL AND TRIM(channel_name) != ''
            )",
            [],
        );

        let mut stmt = conn
            .prepare("SELECT name FROM Artists ORDER BY name COLLATE NOCASE ASC")
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map([], |row| {
                let name: String = row.get(0)?;
                let avatar_path = base_dir
                    .join("Avatars")
                    .join(format!("{}.jpg", name))
                    .to_string_lossy()
                    .into_owned();
                Ok(ArtistEntry { name, avatar_path })
            })
            .map_err(|e| e.to_string())?;
        let mut artists = Vec::new();
        for a in iter {
            artists.push(a.map_err(|e| e.to_string())?);
        }
        Ok(artists)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_videos_by_artist(app: AppHandle, name: String) -> Result<Vec<VideoEntry>, String> {
    tokio::task::spawn_blocking(move || {
        let conn = get_db_connection(&app)?;
        let base_dir = get_base_dir(&app)?;
        let trimmed_name = name.trim().to_string();
        let mut stmt = conn
            .prepare(
                "SELECT id, title, channel_name, video_path, thumbnail_path, DATETIME(added_at, 'localtime') 
             FROM Videos 
             WHERE TRIM(channel_name) = ?1 COLLATE NOCASE 
             ORDER BY added_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map(rusqlite::params![trimmed_name], |row| {
                map_video_row(row, &base_dir)
            })
            .map_err(|e| e.to_string())?;
        let mut videos = Vec::new();
        for video in iter {
            videos.push(video.map_err(|e| e.to_string())?);
        }
        Ok(videos)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn create_playlist(app: AppHandle, name: String) -> Result<Playlist, String> {
    tokio::task::spawn_blocking(move || {
        let conn = get_db_connection(&app)?;
        let id = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis()
            .to_string();
        conn.execute(
            "INSERT INTO Playlists (id, name) VALUES (?1, ?2)",
            rusqlite::params![id, name],
        )
        .map_err(|e| e.to_string())?;
        Ok(Playlist {
            id,
            name,
            created_at: "Just now".to_string(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_playlists(app: AppHandle) -> Result<Vec<Playlist>, String> {
    tokio::task::spawn_blocking(move || {
        let conn = get_db_connection(&app)?;
        let mut stmt = conn.prepare("SELECT id, name, DATETIME(created_at, 'localtime') FROM Playlists ORDER BY created_at DESC").map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map([], |row| {
                Ok(Playlist {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    created_at: row.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut lists = Vec::new();
        for list in iter {
            lists.push(list.map_err(|e| e.to_string())?);
        }
        Ok(lists)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn delete_playlist(app: AppHandle, playlist_id: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let conn = get_db_connection(&app)?;
        conn.execute(
            "DELETE FROM Playlists WHERE id = ?1",
            rusqlite::params![playlist_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn add_video_to_playlist(
    app: AppHandle,
    playlist_id: String,
    video_id: String,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let conn = get_db_connection(&app)?;
        let sort_order: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM Playlist_Videos WHERE playlist_id = ?1",
                rusqlite::params![playlist_id],
                |row| row.get(0),
            )
            .unwrap_or(1);
        conn.execute(
            "INSERT OR IGNORE INTO Playlist_Videos (playlist_id, video_id, sort_order) VALUES (?1, ?2, ?3)",
            rusqlite::params![playlist_id, video_id, sort_order],
        ).map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn remove_video_from_playlist(
    app: AppHandle,
    playlist_id: String,
    video_id: String,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let conn = get_db_connection(&app)?;
        conn.execute(
            "DELETE FROM Playlist_Videos WHERE playlist_id = ?1 AND video_id = ?2",
            rusqlite::params![playlist_id, video_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_playlist_videos(
    app: AppHandle,
    playlist_id: String,
) -> Result<Vec<VideoEntry>, String> {
    tokio::task::spawn_blocking(move || {
        let conn = get_db_connection(&app)?;
        let base_dir = get_base_dir(&app)?;
        let mut stmt = conn
            .prepare(
                "SELECT v.id, v.title, v.channel_name, v.video_path, v.thumbnail_path, DATETIME(v.added_at, 'localtime') 
                 FROM Videos v INNER JOIN Playlist_Videos pv ON v.id = pv.video_id 
                 WHERE pv.playlist_id = ?1 ORDER BY pv.sort_order ASC",
            )
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map(rusqlite::params![playlist_id], |row| {
                map_video_row(row, &base_dir)
            })
            .map_err(|e| e.to_string())?;
        let mut videos = Vec::new();
        for video in iter {
            videos.push(video.map_err(|e| e.to_string())?);
        }
        Ok(videos)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn update_video_added_at(app: AppHandle, id: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let conn = get_db_connection(&app)?;
        conn.execute(
            "UPDATE Videos SET added_at = CURRENT_TIMESTAMP WHERE id = ?1",
            rusqlite::params![id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn update_video_details(
    app: AppHandle,
    id: String,
    title: String,
    channel: String,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let mut conn = get_db_connection(&app)?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT OR IGNORE INTO Artists (name, avatar_path) VALUES (?1, ?2)",
            [&channel, &format!("{}.jpg", channel)],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "UPDATE Videos SET title = ?1, channel_name = ?2 WHERE id = ?3",
            rusqlite::params![title, channel, id],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn update_playlist_title(
    app: AppHandle,
    id: String,
    new_title: String,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let conn = get_db_connection(&app)?;
        conn.execute(
            "UPDATE Playlists SET name = ?1 WHERE id = ?2",
            rusqlite::params![new_title, id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn update_playlist_order(
    app: AppHandle,
    playlist_id: String,
    video_ids: Vec<String>,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let mut conn = get_db_connection(&app)?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for (index, video_id) in video_ids.iter().enumerate() {
            tx.execute(
                "UPDATE Playlist_Videos SET sort_order = ?1 WHERE playlist_id = ?2 AND video_id = ?3",
                rusqlite::params![index as i64, playlist_id, video_id],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn upload_artist_avatar(
    app: AppHandle,
    name: String,
    image_path: String,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let base_dir = get_base_dir(&app)?;
        let target_dir = base_dir.join("Avatars");
        std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
        let target_path = target_dir.join(format!("{}.jpg", name));
        std::fs::copy(&image_path, &target_path).map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn upload_playlist_cover(
    app: AppHandle,
    id: String,
    image_path: String,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let base_dir = get_base_dir(&app)?;
        let target_dir = base_dir.join("PlaylistCovers");
        std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
        let target_path = target_dir.join(format!("{}.jpg", id));
        std::fs::copy(&image_path, &target_path).map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn upload_playlist_banner(
    app: AppHandle,
    id: String,
    image_path: String,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let base_dir = get_base_dir(&app)?;
        let target_dir = base_dir.join("PlaylistBanners");
        std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
        let target_path = target_dir.join(format!("{}.jpg", id));
        std::fs::copy(&image_path, &target_path).map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn delete_video(app: AppHandle, video_id: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let base_dir = get_base_dir(&app)?;
        let mut conn = get_db_connection(&app)?;

        // Query channel_name prior to deletion to check if artist avatar should be cleaned
        let channel_name: Option<String> = conn
            .query_row(
                "SELECT channel_name FROM Videos WHERE id = ?1",
                [&video_id],
                |row| row.get(0),
            )
            .ok();

        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM Playlist_Videos WHERE video_id = ?1", [&video_id]).map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM Videos WHERE id = ?1", [&video_id]).map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM Artists WHERE name NOT IN (SELECT DISTINCT channel_name FROM Videos WHERE channel_name IS NOT NULL)", []).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;

        let vid_dir = base_dir.join("Videos");
        let thumb_dir = base_dir.join("Thumbnails");
        let desc_dir = base_dir.join("Descriptions");
        let lyrics_dir = base_dir.join("Lyrics");
        let av_dir = base_dir.join("Avatars");

        // 1. Media files in Videos folder
        let exts = ["mp4", "m4a", "webm", "mkv", "opus", "mp3", "ogg", "wav", "vtt", "part", "ytdl"];
        for ext in &exts {
            crate::system::safe_remove_file(&vid_dir.join(format!("{}.{}", video_id, ext)));
            crate::system::safe_remove_file(&vid_dir.join(format!("raw_{}.{}", video_id, ext)));
        }

        if let Ok(entries) = std::fs::read_dir(&vid_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.contains(&video_id) {
                    crate::system::safe_remove_file(&entry.path());
                }
            }
        }

        // 2. Thumbnails
        crate::system::safe_remove_file(&thumb_dir.join(format!("{}.jpg", video_id)));
        crate::system::safe_remove_file(&thumb_dir.join(format!("{}_lq.jpg", video_id)));
        crate::system::safe_remove_file(&thumb_dir.join(format!("raw_{}.jpg", video_id)));
        if let Ok(entries) = std::fs::read_dir(&thumb_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.contains(&video_id) {
                    crate::system::safe_remove_file(&entry.path());
                }
            }
        }

        // 3. Descriptions
        crate::system::safe_remove_file(&desc_dir.join(format!("{}.txt", video_id)));
        if let Ok(entries) = std::fs::read_dir(&desc_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.contains(&video_id) {
                    crate::system::safe_remove_file(&entry.path());
                }
            }
        }

        // 4. Lyrics and subtitles
        let lyric_exts = ["lrc", "enhanced.lrc", "srt", "vtt", "json"];
        for ext in &lyric_exts {
            crate::system::safe_remove_file(&lyrics_dir.join(format!("{}.{}", video_id, ext)));
        }
        if let Ok(entries) = std::fs::read_dir(&lyrics_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.contains(&video_id) {
                    crate::system::safe_remove_file(&entry.path());
                }
            }
        }

        // 5. Clean up artist avatar if artist was removed
        if let Some(channel) = channel_name {
            let artist_exists: bool = conn
                .query_row(
                    "SELECT COUNT(*) FROM Artists WHERE name = ?1",
                    [&channel],
                    |row| row.get::<_, i64>(0),
                )
                .map(|c| c > 0)
                .unwrap_or(false);

            if !artist_exists {
                crate::system::safe_remove_file(&av_dir.join(format!("{}.jpg", channel)));
            }
        }

        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

pub fn record_history_entry(
    conn: &rusqlite::Connection,
    video_id: &str,
    title: &str,
    channel: &str,
    url: &str,
    status: &str,
    dl_type: &str,
    error_msg: Option<&str>,
) -> Result<(), rusqlite::Error> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let history_id = format!("{}_{}", video_id, now);
    conn.execute(
        "INSERT INTO DownloadHistory (id, video_id, title, channel_name, url, status, dl_type, error_msg, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, CURRENT_TIMESTAMP)",
        rusqlite::params![history_id, video_id, title, channel, url, status, dl_type, error_msg],
    )?;
    Ok(())
}

#[tauri::command]
pub async fn get_download_history(app: AppHandle) -> Result<Vec<DownloadHistoryEntry>, String> {
    tokio::task::spawn_blocking(move || {
        let conn = get_db_connection(&app)?;
        let mut stmt = conn
            .prepare("SELECT id, video_id, title, channel_name, url, status, dl_type, error_msg, created_at FROM DownloadHistory ORDER BY created_at DESC LIMIT 100")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok(DownloadHistoryEntry {
                    id: row.get(0)?,
                    video_id: row.get(1)?,
                    title: row.get(2)?,
                    channel: row.get(3).unwrap_or_default(),
                    url: row.get(4)?,
                    status: row.get(5)?,
                    dl_type: row.get(6).unwrap_or_else(|_| "Video".to_string()),
                    error_msg: row.get(7).ok(),
                    created_at: row.get(8)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut history = Vec::new();
        for r in rows {
            if let Ok(entry) = r {
                history.push(entry);
            }
        }
        Ok(history)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn clear_download_history_db(app: AppHandle) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let conn = get_db_connection(&app)?;
        conn.execute("DELETE FROM DownloadHistory", [])
            .map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn delete_download_history_item(app: AppHandle, id: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let conn = get_db_connection(&app)?;
        conn.execute(
            "DELETE FROM DownloadHistory WHERE id = ?1",
            rusqlite::params![id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
