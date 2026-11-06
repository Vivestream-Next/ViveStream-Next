# API & Integration Reference

This document outlines the internal communication interfaces used in ViveStream-Next. Communication between the SolidJS frontend and the Rust backend occurs exclusively through Tauri's Inter-Process Communication (IPC) system using `invoke` for commands and `listen`/`emit` for real-time events.

---

## 1. Tauri Commands (Frontend to Backend)

These commands are exported from `src-tauri/src/lib.rs` and can be called from the frontend using `@tauri-apps/api/core` `invoke()`.

### Binary & Environment Management

- `check_binaries()`: Verifies the existence of required external dependencies (`yt-dlp`, `ffmpeg`, `deno`) in the app's internal bin directory.
- `download_binaries()`: Initiates the downloading of the necessary dependencies from remote repositories.
- `update_binaries()`: Updates the downloaded binaries.
- `wipe_dependencies()`: Safely deletes the downloaded binaries.
- `clean_database_and_media()`: Truncates non-essential tables and removes temporary media.
- `nuclear_wipe()`: Dangerously deletes all stored videos, database tables, config files, and binaries.
- `reindex_library(player_client: String)`: Scans the local filesystem to rebuild the SQLite database based on existing video files and metadata.

### Download & Extraction Management

- `get_video_metadata(url: String, player_client: String)`: Extracts metadata (title, thumbnails, channel, duration) without downloading the media. Resolves PO Tokens natively if required.
- `download_video(url: String, metadata: VideoEntry, quality: String, dl_type: String, cookies: String, speed_limit: String, concurrent_fragments: u8, auto_subs: bool, dl_subs: bool, sponsorblock: bool, live_from_start: bool, player_client: String)`: Initiates a concurrent download job. Progress is emitted asynchronously via Tauri events.

### Media Library: Videos & Playlists

- `get_downloaded_videos()`: Retrieves all downloaded `VideoEntry` objects from the SQLite database.
- `update_video_details(id: String, title: String, channel: String)`: Updates specific metadata for a video entry.
- `update_video_added_at(id: String)`: Refreshes the insertion timestamp for sorting purposes.
- `delete_video(video_id: String)`: Removes a video from the database and optionally from the local filesystem.
- `get_favorites()`: Returns a list of video objects marked as favorites.
- `check_favorite(id: String)` -> `bool`: Checks if a specific video is marked as a favorite.
- `toggle_favorite(id: String, is_favorite: bool)`: Flips the favorite status of a video.
- `create_playlist(name: String)`: Instantiates a new playlist object in the database or returns existing one if identical name exists.
- `get_or_create_playlist(name: String)`: Reuses an existing playlist matching the given name (case-insensitive) or creates a new one.
- `get_playlists()`: Retrieves a list of all playlists.
- `delete_playlist(id: String)`: Removes a playlist entirely (cascades to junction tables).
- `add_video_to_playlist(playlist_id: String, video_id: String)`: Maps a video to a playlist.
- `remove_video_from_playlist(playlist_id: String, video_id: String)`: Deletes the mapping.
- `get_playlist_videos(playlist_id: String)`: Retrieves ordered `VideoEntry` items for a specific playlist.
- `update_playlist_title(id: String, new_title: String)`: Renames a playlist.
- `update_playlist_order(playlist_id: String, video_ids: Vec<String>)`: Persists custom drag-and-drop sorting order.
- `upload_playlist_cover(id: String, image_path: String)`: Manages custom cover image associations for playlists.
- `upload_playlist_banner(id: String, image_path: String)`: Manages custom banner image associations for playlists.
- `sync_thumbnail_cache(quality: Option<String>)`: Synchronizes the local thumbnail cache.

### Media Library: Artists & History

- `get_artists()`: Returns a list of all unique channel names and their avatar paths.
- `get_videos_by_artist(name: String)`: Retrieves videos associated with a specific channel/artist.
- `upload_artist_avatar(name: String, image_path: String)`: Manages custom avatars for channels.
- `get_download_history()`: Retrieves the persistent log of past download attempts and their statuses.
- `clear_download_history_db()`: Flushes the history table.
- `delete_download_history_item(id: String)`: Removes a single line item from the history.

### OS Media Controls Integration (`souvlaki`)

- `update_media_metadata(title: String, artist: String)`: Updates the OS-level media banner (e.g., Windows 10/11 popup or Linux MPRIS).
- `update_playback_status(playing: bool)`: Updates the system-level Play/Pause state.

### System & Utilities

- `get_clipboard_text()`: Reads text from the system clipboard asynchronously.
- `set_clipboard_text(text: String)`: Writes text to the system clipboard asynchronously.
- `extract_video_dominant_colors(video_id: String, timestamp: f64)`: Extracts a dominant color and palette from a specific video frame using FFmpeg for dynamic UI tinting.

---

## 2. Tauri Events (Backend to Frontend)

The Rust backend uses `Emitter` to push real-time events to the frontend. SolidJS listens to these via `@tauri-apps/api/event` `listen()`.

- `setup-progress`: Emitted during the initial download and setup of external dependencies (`yt-dlp`, `ffmpeg`). Payload is a `String` containing the setup status message.
- `download-progress`: Emitted continuously during a download job. Payload includes `id`, `percentage`, `speed`, and `eta`.
- `download-status`: Emitted when a download state changes (e.g., "Extracting", "Downloading", "Merging", "Completed", "Error").
- `media-play`: Emitted when the user presses the system-level Play button (via keyboard hardware or OS menu).
- `media-pause`: Emitted when the user presses the system-level Pause button.
- `media-next`: Emitted when the user presses the system-level Next button.
- `media-prev`: Emitted when the user presses the system-level Previous button.

---

## 3. Streaming Interface (`warp` server)

Because local video playback via file protocols (`file://` or `asset://`) inside Tauri's secure webview causes severe memory issues and breaks HTTP Range requests (seeking), a local server is employed.

- **Port**: `1422` (Hardcoded bound loopback address: `127.0.0.1:1422`)
- **Protocol**: HTTP/1.1 (Supports `Range: bytes=X-Y` requests).
- **CORS**: Completely open (`allow_any_origin`) but only accepts `GET`, `OPTIONS`, `HEAD`.
- **Path Resolution**: The server maps the root `/` to the application's base directory (derived securely via Rust's path logic).
  - Example: To play `C:\Users\Name\AppData\Local\ViveStream-Next\Videos\video.mp4`, the frontend requests `http://localhost:1422/Videos/video.mp4`.
