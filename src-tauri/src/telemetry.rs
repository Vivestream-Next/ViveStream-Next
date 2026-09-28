//! Full Hardware Telemetry & GPU Detection Engine for ViveStream.
//! Supports Intel Arc / Iris / UHD, NVIDIA GeForce / RTX, AMD Radeon, Apple Silicon, and multi-core CPUs.

use serde::{Deserialize, Serialize};
use std::process::Command;
use sysinfo::System;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuInfo {
    pub id: String,
    pub name: String,
    pub vendor: String,
    pub device_type: String,
    pub vram_total_mb: u64,
    pub vram_used_mb: u64,
    pub driver_version: String,
    pub compute_capability: String,
    pub is_recommended: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputeDeviceOption {
    pub id: String,
    pub label: String,
    pub device_type: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FullSystemTelemetry {
    pub os_name: String,
    pub os_version: String,
    pub cpu_brand: String,
    pub cpu_physical_cores: usize,
    pub cpu_logical_threads: usize,
    pub cpu_frequency_mhz: u64,
    pub cpu_features: Vec<String>,
    pub total_ram_mb: u64,
    pub available_ram_mb: u64,
    pub used_ram_mb: u64,
    pub ram_usage_percent: f64,
    pub gpus: Vec<GpuInfo>,
    pub primary_gpu: Option<GpuInfo>,
    pub recommended_device_id: String,
    pub compute_devices: Vec<ComputeDeviceOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveGpuUsage {
    pub id: String,
    pub name: String,
    pub vram_total_mb: u64,
    pub vram_used_mb: u64,
    pub vram_usage_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveHardwareUsage {
    pub timestamp_ms: u64,
    pub total_ram_mb: u64,
    pub used_ram_mb: u64,
    pub available_ram_mb: u64,
    pub ram_usage_percent: f64,
    pub cpu_usage_percent: f32,
    pub gpus: Vec<LiveGpuUsage>,
}

/// Detect all GPUs on the host system
pub fn detect_gpus() -> Vec<GpuInfo> {
    let mut gpus = Vec::new();

    #[cfg(target_os = "windows")]
    {
        // Enumerate Windows display adapters from registry
        let class_key = r"HKLM\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";
        let mut cmd = Command::new("reg");
        cmd.args(["query", class_key, "/s", "/v", "DriverDesc"]);
        cmd.creation_flags(CREATE_NO_WINDOW);

        if let Ok(output) = cmd.output() {
            let text = String::from_utf8_lossy(&output.stdout);
            let mut subkeys = Vec::new();

            for line in text.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with(r"HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\") {
                    let parts: Vec<&str> = trimmed.split('\\').collect();
                    if let Some(last) = parts.last() {
                        if last.len() == 4 && last.chars().all(|c| c.is_ascii_digit()) {
                            subkeys.push(trimmed.to_string());
                        }
                    }
                }
            }

            subkeys.sort();
            subkeys.dedup();

            for (idx, subkey) in subkeys.iter().enumerate() {
                if let Some(gpu) = inspect_windows_adapter(subkey, idx) {
                    gpus.push(gpu);
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Linux DRM / sysfs detection
        if let Ok(entries) = std::fs::read_dir("/sys/class/drm") {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("card") && !name.contains('-') {
                    let vram_path = entry.path().join("device").join("mem_info_vram_total");
                    let total_bytes = std::fs::read_to_string(vram_path)
                        .ok()
                        .and_then(|s| s.trim().parse::<u64>().ok())
                        .unwrap_or(0);
                    let vram_mb = total_bytes / (1024 * 1024);

                    gpus.push(GpuInfo {
                        id: format!("gpu-{}", gpus.len()),
                        name: format!("GPU Adapter ({})", name),
                        vendor: "linux-drm".to_string(),
                        device_type: if vram_mb > 2048 { "discrete_gpu".to_string() } else { "integrated_gpu".to_string() },
                        vram_total_mb: vram_mb,
                        vram_used_mb: 0,
                        driver_version: "Mesa / DRM".to_string(),
                        compute_capability: "OpenCL / Vulkan / Candle".to_string(),
                        is_recommended: false,
                    });
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        // macOS Apple Silicon Unified Memory
        gpus.push(GpuInfo {
            id: "gpu-metal".to_string(),
            name: "Apple Silicon Metal Accelerator".to_string(),
            vendor: "apple".to_string(),
            device_type: "integrated_gpu".to_string(),
            vram_total_mb: 0, // Unified
            vram_used_mb: 0,
            driver_version: "Metal 3".to_string(),
            compute_capability: "Metal Native Candle Acceleration".to_string(),
            is_recommended: true,
        });
    }

    // Determine the recommended device: Best discrete GPU > integrated GPU > CPU
    let mut best_idx = None;
    let mut max_vram = 0;

    for (idx, gpu) in gpus.iter().enumerate() {
        if gpu.device_type == "discrete_gpu" && gpu.vram_total_mb >= max_vram {
            max_vram = gpu.vram_total_mb;
            best_idx = Some(idx);
        }
    }

    if best_idx.is_none() && !gpus.is_empty() {
        best_idx = Some(0);
    }

    if let Some(idx) = best_idx {
        if let Some(gpu) = gpus.get_mut(idx) {
            gpu.is_recommended = true;
        }
    }

    gpus
}

#[cfg(target_os = "windows")]
fn inspect_windows_adapter(subkey: &str, idx: usize) -> Option<GpuInfo> {
    let mut cmd = Command::new("reg");
    cmd.args(["query", subkey]);
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output().ok()?;
    let text = String::from_utf8_lossy(&output.stdout);

    let mut name = String::new();
    let mut provider = String::new();
    let mut driver_version = String::new();
    let mut qw_memory_size: u64 = 0;
    let mut dw_memory_size: u64 = 0;

    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("DriverDesc") {
            let parts: Vec<&str> = trimmed.split("REG_SZ").collect();
            if parts.len() > 1 {
                name = parts[1].trim().to_string();
            }
        } else if trimmed.starts_with("ProviderName") {
            let parts: Vec<&str> = trimmed.split("REG_SZ").collect();
            if parts.len() > 1 {
                provider = parts[1].trim().to_string();
            }
        } else if trimmed.starts_with("DriverVersion") {
            let parts: Vec<&str> = trimmed.split("REG_SZ").collect();
            if parts.len() > 1 {
                driver_version = parts[1].trim().to_string();
            }
        } else if trimmed.starts_with("HardwareInformation.qwMemorySize") {
            let parts: Vec<&str> = trimmed.split("REG_QWORD").collect();
            if parts.len() > 1 {
                let hex_str = parts[1].trim().trim_start_matches("0x");
                if let Ok(val) = u64::from_str_radix(hex_str, 16) {
                    qw_memory_size = val;
                }
            }
        } else if trimmed.starts_with("HardwareInformation.MemorySize") {
            if trimmed.contains("REG_DWORD") {
                let parts: Vec<&str> = trimmed.split("REG_DWORD").collect();
                if parts.len() > 1 {
                    let hex_str = parts[1].trim().trim_start_matches("0x");
                    if let Ok(val) = u64::from_str_radix(hex_str, 16) {
                        dw_memory_size = val;
                    }
                }
            }
        }
    }

    if name.is_empty() {
        return None;
    }

    let lower_name = name.to_lowercase();

    // Filter out virtual display drivers
    if lower_name.contains("remote desktop")
        || lower_name.contains("rdpdd")
        || lower_name.contains("citrix")
        || lower_name.contains("miracast")
        || lower_name.contains("basic display")
        || lower_name.contains("virtual")
    {
        return None;
    }

    let vram_bytes = if qw_memory_size > 0 {
        qw_memory_size
    } else {
        dw_memory_size
    };
    let vram_mb = vram_bytes / (1024 * 1024);

    let vendor = if lower_name.contains("intel") || provider.to_lowercase().contains("intel") {
        "intel"
    } else if lower_name.contains("nvidia") || provider.to_lowercase().contains("nvidia") {
        "nvidia"
    } else if lower_name.contains("amd") || lower_name.contains("radeon") || provider.to_lowercase().contains("advanced micro") {
        "amd"
    } else {
        "other"
    };

    let device_type = if lower_name.contains("arc")
        || lower_name.contains("rtx")
        || lower_name.contains("geforce")
        || lower_name.contains("gtx")
        || lower_name.contains("radeon rx")
        || lower_name.contains("quadro")
        || lower_name.contains("tesla")
        || vram_mb >= 2048
    {
        "discrete_gpu"
    } else if lower_name.contains("iris")
        || lower_name.contains("uhd")
        || lower_name.contains("hd graphics")
        || lower_name.contains("radeon(tm) graphics")
        || lower_name.contains("vega")
    {
        "integrated_gpu"
    } else if vram_mb > 1024 {
        "discrete_gpu"
    } else {
        "integrated_gpu"
    };

    let compute_capability = match vendor {
        "intel" => "Intel oneAPI / OpenVINO / DirectML Accelerated".to_string(),
        "nvidia" => "NVIDIA CUDA / Tensor Core / DirectML Accelerated".to_string(),
        "amd" => "AMD ROCm / DirectML / Vulkan Accelerated".to_string(),
        _ => "DirectML / Candle Accelerated".to_string(),
    };

    Some(GpuInfo {
        id: format!("gpu-{}", idx),
        name,
        vendor: vendor.to_string(),
        device_type: device_type.to_string(),
        vram_total_mb: vram_mb,
        vram_used_mb: 0,
        driver_version,
        compute_capability,
        is_recommended: false,
    })
}

/// Retrieve complete hardware scan including CPU, memory, and all GPUs
pub fn scan_full_system() -> FullSystemTelemetry {
    let mut sys = System::new_all();
    sys.refresh_all();

    let total_ram_mb = sys.total_memory() / (1024 * 1024);
    let available_ram_mb = sys.available_memory() / (1024 * 1024);
    let used_ram_mb = total_ram_mb.saturating_sub(available_ram_mb);
    let ram_usage_percent = if total_ram_mb > 0 {
        ((used_ram_mb as f64 / total_ram_mb as f64) * 1000.0).round() / 10.0
    } else {
        0.0
    };

    let cpu_brand = sys
        .cpus()
        .first()
        .map(|c| c.brand().trim().to_string())
        .unwrap_or_else(|| "Multi-Core CPU".to_string());

    let cpu_physical_cores = sys.physical_core_count().unwrap_or(sys.cpus().len());
    let cpu_logical_threads = sys.cpus().len();
    let cpu_frequency_mhz = sys.cpus().first().map(|c| c.frequency()).unwrap_or(0);

    let mut cpu_features = Vec::new();
    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    {
        if is_x86_feature_detected!("avx2") {
            cpu_features.push("AVX2".to_string());
        }
        if is_x86_feature_detected!("fma") {
            cpu_features.push("FMA".to_string());
        }
        if is_x86_feature_detected!("avx512f") {
            cpu_features.push("AVX-512".to_string());
        }
    }
    if cpu_features.is_empty() {
        cpu_features.push("NEON / AVX".to_string());
    }

    let gpus = detect_gpus();
    let primary_gpu = gpus.iter().find(|g| g.is_recommended).cloned().or_else(|| gpus.first().cloned());

    let recommended_device_id = if let Some(ref gpu) = primary_gpu {
        gpu.id.clone()
    } else {
        "cpu".to_string()
    };

    // Generate compute device options
    let mut compute_devices = Vec::new();

    // Auto option
    compute_devices.push(ComputeDeviceOption {
        id: "auto".to_string(),
        label: if let Some(ref gpu) = primary_gpu {
            format!("Auto (Best: {})", gpu.name)
        } else {
            "Auto (CPU Multi-Threaded)".to_string()
        },
        device_type: if primary_gpu.is_some() { "gpu".to_string() } else { "cpu".to_string() },
        description: "Automatically selects the highest-performance acceleration hardware on your system.".to_string(),
    });

    // GPUs options
    for gpu in &gpus {
        let vram_label = if gpu.vram_total_mb > 0 {
            format!("{:.1} GB VRAM", gpu.vram_total_mb as f64 / 1024.0)
        } else {
            "Unified Memory".to_string()
        };

        compute_devices.push(ComputeDeviceOption {
            id: gpu.id.clone(),
            label: format!("{} ({})", gpu.name, vram_label),
            device_type: "gpu".to_string(),
            description: format!(
                "{} [{}] — {}",
                if gpu.device_type == "discrete_gpu" { "Dedicated GPU" } else { "Integrated GPU" },
                gpu.driver_version,
                gpu.compute_capability
            ),
        });
    }

    // CPU option
    compute_devices.push(ComputeDeviceOption {
        id: "cpu".to_string(),
        label: format!("CPU ({} Physical / {} Logical Threads)", cpu_physical_cores, cpu_logical_threads),
        device_type: "cpu".to_string(),
        description: format!("Candle pure-Rust multi-threaded execution ({})", cpu_features.join(", ")),
    });

    FullSystemTelemetry {
        os_name: System::name().unwrap_or_else(|| std::env::consts::OS.to_string()),
        os_version: System::os_version().unwrap_or_else(|| "Unknown".to_string()),
        cpu_brand,
        cpu_physical_cores,
        cpu_logical_threads,
        cpu_frequency_mhz,
        cpu_features,
        total_ram_mb,
        available_ram_mb,
        used_ram_mb,
        ram_usage_percent,
        gpus,
        primary_gpu,
        recommended_device_id,
        compute_devices,
    }
}

/// Retrieve live usage metrics (RAM and VRAM)
pub fn query_live_hardware_usage() -> LiveHardwareUsage {
    let mut sys = System::new();
    sys.refresh_memory();
    sys.refresh_cpu_usage();

    let total_ram_mb = sys.total_memory() / (1024 * 1024);
    let available_ram_mb = sys.available_memory() / (1024 * 1024);
    let used_ram_mb = total_ram_mb.saturating_sub(available_ram_mb);
    let ram_usage_percent = if total_ram_mb > 0 {
        ((used_ram_mb as f64 / total_ram_mb as f64) * 1000.0).round() / 10.0
    } else {
        0.0
    };

    let cpu_usage_percent = sys.global_cpu_usage();

    let mut live_gpus = Vec::new();
    let detected = detect_gpus();

    #[cfg(target_os = "windows")]
    {
        // Query live dedicated VRAM using Windows typeperf counter
        let mut cmd = Command::new("typeperf");
        cmd.args([r"\GPU Adapter Memory(*)\Dedicated Usage", "-sc", "1"]);
        cmd.creation_flags(CREATE_NO_WINDOW);

        if let Ok(output) = cmd.output() {
            let text = String::from_utf8_lossy(&output.stdout);
            let lines: Vec<&str> = text.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();

            // Line 2 has values e.g. "09/28/2026 23:39:35.804","1079001088.000000","0.000000"
            if lines.len() >= 2 {
                for line in &lines {
                    if line.starts_with('"') && !line.contains("(PDH-CSV") {
                        let parts: Vec<&str> = line.split(',').collect();
                        // Ignore date string at parts[0]
                        let mut max_used_bytes: u64 = 0;
                        for val_str in parts.iter().skip(1) {
                            let clean = val_str.trim().trim_matches('"');
                            if let Ok(f) = clean.parse::<f64>() {
                                let b = f as u64;
                                if b > max_used_bytes {
                                    max_used_bytes = b;
                                }
                            }
                        }

                        let used_mb = max_used_bytes / (1024 * 1024);

                        for gpu in &detected {
                            let total = gpu.vram_total_mb;
                            let pct = if total > 0 {
                                ((used_mb as f64 / total as f64) * 1000.0).round() / 10.0
                            } else {
                                0.0
                            };

                            live_gpus.push(LiveGpuUsage {
                                id: gpu.id.clone(),
                                name: gpu.name.clone(),
                                vram_total_mb: total,
                                vram_used_mb: used_mb,
                                vram_usage_percent: pct.min(100.0),
                            });
                        }
                        break;
                    }
                }
            }
        }
    }

    if live_gpus.is_empty() {
        for gpu in &detected {
            live_gpus.push(LiveGpuUsage {
                id: gpu.id.clone(),
                name: gpu.name.clone(),
                vram_total_mb: gpu.vram_total_mb,
                vram_used_mb: 0,
                vram_usage_percent: 0.0,
            });
        }
    }

    let timestamp_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    LiveHardwareUsage {
        timestamp_ms,
        total_ram_mb,
        used_ram_mb,
        available_ram_mb,
        ram_usage_percent,
        cpu_usage_percent,
        gpus: live_gpus,
    }
}

/// Tauri IPC command to retrieve static and detected full system telemetry
#[tauri::command]
pub async fn get_system_telemetry() -> Result<FullSystemTelemetry, String> {
    Ok(scan_full_system())
}

/// Tauri IPC command to retrieve dynamic live hardware usage (RAM, CPU, and VRAM)
#[tauri::command]
pub async fn get_live_hardware_usage() -> Result<LiveHardwareUsage, String> {
    Ok(query_live_hardware_usage())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_system_telemetry() {
        let telem = scan_full_system();
        assert!(!telem.cpu_brand.is_empty());
        assert!(telem.total_ram_mb > 0);
        assert!(!telem.compute_devices.is_empty());
        println!("Detected OS: {} {}", telem.os_name, telem.os_version);
        println!("Detected CPU: {} ({} cores)", telem.cpu_brand, telem.cpu_physical_cores);
        println!("Detected RAM: {} MB", telem.total_ram_mb);
        println!("Detected GPUs: {}", telem.gpus.len());
        for g in &telem.gpus {
            println!("  - GPU: {} (Vendor: {}, VRAM: {} MB, Driver: {})", g.name, g.vendor, g.vram_total_mb, g.driver_version);
        }
        println!("Recommended Device: {}", telem.recommended_device_id);
    }

    #[test]
    fn test_live_usage() {
        let usage = query_live_hardware_usage();
        assert!(usage.total_ram_mb > 0);
        println!("Live RAM: {} / {} MB ({}%)", usage.used_ram_mb, usage.total_ram_mb, usage.ram_usage_percent);
        for g in &usage.gpus {
            println!("Live GPU VRAM: {} -> {} / {} MB ({}%)", g.name, g.vram_used_mb, g.vram_total_mb, g.vram_usage_percent);
        }
    }
}

