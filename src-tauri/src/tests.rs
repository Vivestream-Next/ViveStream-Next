#[cfg(test)]
mod tests {
    use crate::downloader::get_binary_paths;
    use std::path::PathBuf;

    #[test]
    fn test_get_binary_paths() {
        let bin_dir = PathBuf::from("/mock/bin/folder");
        let (ytdlp, ffmpeg, qjs) = get_binary_paths(&bin_dir);

        #[cfg(target_os = "windows")]
        {
            assert_eq!(ytdlp, bin_dir.join("yt-dlp.exe"));
            assert_eq!(ffmpeg, bin_dir.join("ffmpeg.exe"));
            assert_eq!(qjs, bin_dir.join("qjs.exe"));
        }

        #[cfg(not(target_os = "windows"))]
        {
            assert_eq!(ytdlp, bin_dir.join("yt-dlp"));
            assert_eq!(ffmpeg, bin_dir.join("ffmpeg"));
            assert_eq!(qjs, bin_dir.join("qjs"));
        }
    }
}
