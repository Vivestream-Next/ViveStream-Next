fn main() {
    // Tauri CLI automatically passes STATIC_VCRUNTIME which triggers a deprecation warning in tauri-build.
    // We already configure static_vc_runtime explicitly via WindowsAttributes below, so remove the env var.
    std::env::remove_var("STATIC_VCRUNTIME");

    let mut windows = tauri_build::WindowsAttributes::new();
    windows = windows.static_vc_runtime(true);
    let attrs = tauri_build::Attributes::new().windows_attributes(windows);
    tauri_build::try_build(attrs).expect("failed to run tauri-build");
}
