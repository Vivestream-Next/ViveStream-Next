// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    {
        // Disable WebKitGTK Bubblewrap sandbox to prevent spurious WebKitWebProcess seccomp crash traps on Arch Linux / Wayland / Hyprland
        if std::env::var("WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS").is_err() {
            std::env::set_var("WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS", "1");
        }

        // Keep hardware accelerated DMA-BUF renderer enabled on Linux (Intel Arc / AMD Mesa) for zero-copy GPU video decoding and instant responsiveness.
        // Disabling DMA-BUF forces software SHM rendering on CPU which causes massive 1-second video input lag.
        // If running in a troubled environment or older NVIDIA driver, user can set VIVESTREAM_SAFE_GRAPHICS=1.
        if let Ok(safe) = std::env::var("VIVESTREAM_SAFE_GRAPHICS") {
            if safe == "1" && std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").is_err() {
                std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
            }
        }
    }

    let args: Vec<String> = std::env::args().collect();
    if let Some(pos) = args.iter().position(|a| a == "--test-pot") {
        let video_id = args.get(pos + 1).cloned();
        vivestream_next_lib::run_pot_test(video_id);
        return;
    }

    vivestream_next_lib::run()
}
