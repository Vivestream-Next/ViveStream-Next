use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseData {
    pub license_key: String,
    pub instance_id: Option<String>,
    pub is_active: bool,
    pub status: String,
    pub plan: String,
    pub customer_name: Option<String>,
    pub customer_email: Option<String>,
    pub activated_at: Option<String>,
    pub expires_at: Option<String>,
}

fn get_license_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    Ok(app_dir.join("license.json"))
}

fn get_machine_name() -> String {
    #[cfg(target_os = "windows")]
    {
        if let Ok(name) = std::env::var("COMPUTERNAME") {
            let trimmed = name.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(name) = std::env::var("HOSTNAME") {
            let trimmed = name.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }
    "Desktop".to_string()
}

pub fn is_license_expired(expires_at: Option<&str>) -> bool {
    if let Some(exp_str) = expires_at {
        if let Ok(exp_dt) = chrono::DateTime::parse_from_rfc3339(exp_str) {
            return chrono::Utc::now() > exp_dt.with_timezone(&chrono::Utc);
        }
    }
    false
}

/// Checks whether an active and valid license is present on the machine.
pub fn check_license_active(app: &AppHandle) -> bool {
    let path = match get_license_file_path(app) {
        Ok(p) => p,
        Err(_) => return false,
    };

    if !path.is_file() {
        return false;
    }

    match fs::read_to_string(&path) {
        Ok(content) => match serde_json::from_str::<LicenseData>(&content) {
            Ok(data) => {
                if !data.is_active {
                    return false;
                }
                if is_license_expired(data.expires_at.as_deref()) {
                    return false;
                }
                true
            }
            Err(_) => false,
        },
        Err(_) => false,
    }
}

/// Retrieves stored license data if present.
#[tauri::command]
pub fn get_license_status(app: AppHandle) -> Result<Option<LicenseData>, String> {
    let path = get_license_file_path(&app)?;
    if !path.is_file() {
        return Ok(None);
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut data: LicenseData = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    if data.is_active && is_license_expired(data.expires_at.as_deref()) {
        data.is_active = false;
        data.status = "expired".to_string();
        let _ = save_license_file(&app, &data);
    }

    Ok(Some(data))
}

/// Activates a license key with Lemon Squeezy API or developer preview key.
#[tauri::command]
pub async fn activate_lemon_license(
    app: AppHandle,
    license_key: String,
) -> Result<LicenseData, String> {
    let key = license_key.trim();
    if key.is_empty() {
        return Err("Please enter a valid Lemon Squeezy license key.".to_string());
    }

    // 1. Support developer preview key for local dev and CI testing
    if key.eq_ignore_ascii_case("VIVESTREAM-PRO-PREVIEW") {
        let license_data = LicenseData {
            license_key: key.to_string(),
            instance_id: Some("dev-preview-instance".to_string()),
            is_active: true,
            status: "preview".to_string(),
            plan: "ViveStream AI Studio Pro (Developer Preview)".to_string(),
            customer_name: Some("Developer".to_string()),
            customer_email: Some("dev@vivestream.app".to_string()),
            activated_at: Some(chrono::Utc::now().to_rfc3339()),
            expires_at: Some("2030-01-01T00:00:00Z".to_string()),
        };

        save_license_file(&app, &license_data)?;
        return Ok(license_data);
    }

    // 2. Query Lemon Squeezy License Activation API
    let instance_name = format!("ViveStream Desktop ({})", get_machine_name());
    let client = reqwest::Client::builder()
        .user_agent("ViveStream-Next/2.8.0")
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|e| format!("Failed to initialize HTTP client: {}", e))?;

    let params = serde_json::json!({
        "license_key": key,
        "instance_name": instance_name
    });

    let res = client
        .post("https://api.lemonsqueezy.com/v1/licenses/activate")
        .header("Accept", "application/json")
        .json(&params)
        .send()
        .await
        .map_err(|e| format!("Could not reach Lemon Squeezy license server: {}. Please check your network connection.", e))?;

    let json: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("Invalid response from Lemon Squeezy: {}", e))?;

    let activated = json["activated"].as_bool().unwrap_or(false);
    if activated {
        let instance_id = json["instance"]["id"].as_str().map(String::from);
        let cust_email = json["meta"]["customer_email"]
            .as_str()
            .or_else(|| json["meta"]["user_email"].as_str())
            .map(String::from);
        let cust_name = json["meta"]["customer_name"]
            .as_str()
            .or_else(|| json["meta"]["user_name"].as_str())
            .map(String::from);
        let expires_at = json["license_key"]["expires_at"].as_str().map(String::from);
        let created_at = json["license_key"]["created_at"]
            .as_str()
            .map(String::from)
            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

        let license_data = LicenseData {
            license_key: key.to_string(),
            instance_id,
            is_active: true,
            status: "active".to_string(),
            plan: "ViveStream AI Studio Pro (Semi-Annual)".to_string(),
            customer_name: cust_name,
            customer_email: cust_email,
            activated_at: Some(created_at),
            expires_at,
        };

        save_license_file(&app, &license_data)?;
        return Ok(license_data);
    }

    let err_msg = json["error"]
        .as_str()
        .unwrap_or("Invalid or expired Lemon Squeezy license key.");
    Err(err_msg.to_string())
}

/// Validates the current license with Lemon Squeezy.
#[tauri::command]
pub async fn validate_lemon_license(app: AppHandle) -> Result<Option<LicenseData>, String> {
    let path = get_license_file_path(&app)?;
    if !path.is_file() {
        return Ok(None);
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut data: LicenseData = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    if data.license_key.eq_ignore_ascii_case("VIVESTREAM-PRO-PREVIEW") {
        return Ok(Some(data));
    }

    if let Some(ref inst_id) = data.instance_id {
        let client = reqwest::Client::builder()
            .user_agent("ViveStream-Next/2.8.0")
            .timeout(std::time::Duration::from_secs(8))
            .build()
            .map_err(|e| e.to_string())?;

        let params = serde_json::json!({
            "license_key": data.license_key,
            "instance_id": inst_id
        });

        if let Ok(res) = client
            .post("https://api.lemonsqueezy.com/v1/licenses/validate")
            .header("Accept", "application/json")
            .json(&params)
            .send()
            .await
        {
            if let Ok(json) = res.json::<serde_json::Value>().await {
                let valid = json["valid"].as_bool().unwrap_or(false);
                let lk_status = json["license_key"]["status"].as_str().unwrap_or("unknown");
                let expires_at = json["license_key"]["expires_at"].as_str().map(String::from);

                data.expires_at = expires_at;
                if valid && lk_status == "active" {
                    data.is_active = true;
                    data.status = "active".to_string();
                } else {
                    data.is_active = false;
                    data.status = lk_status.to_string();
                }
                let _ = save_license_file(&app, &data);
                return Ok(Some(data));
            }
        }
    }

    // Graceful offline fallback: verify expiration timestamp locally
    if is_license_expired(data.expires_at.as_deref()) {
        data.is_active = false;
        data.status = "expired".to_string();
        let _ = save_license_file(&app, &data);
    }

    Ok(Some(data))
}

/// Deactivates and removes the stored license, notifying Lemon Squeezy API.
#[tauri::command]
pub async fn deactivate_lemon_license(app: AppHandle) -> Result<(), String> {
    let path = get_license_file_path(&app)?;
    if path.is_file() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(data) = serde_json::from_str::<LicenseData>(&content) {
                if !data.license_key.eq_ignore_ascii_case("VIVESTREAM-PRO-PREVIEW") {
                    if let Some(ref inst_id) = data.instance_id {
                        let client = reqwest::Client::builder()
                            .user_agent("ViveStream-Next/2.8.0")
                            .timeout(std::time::Duration::from_secs(6))
                            .build()
                            .ok();
                        if let Some(c) = client {
                            let params = serde_json::json!({
                                "license_key": data.license_key,
                                "instance_id": inst_id
                            });
                            let _ = c
                                .post("https://api.lemonsqueezy.com/v1/licenses/deactivate")
                                .header("Accept", "application/json")
                                .json(&params)
                                .send()
                                .await;
                        }
                    }
                }
            }
        }
        let _ = fs::remove_file(path);
    }
    Ok(())
}

/// Returns the Lemon Squeezy checkout URL for ViveStream AI Studio Pro Pass.
#[tauri::command]
pub fn get_lemon_checkout_url() -> String {
    std::env::var("VIVESTREAM_LEMON_CHECKOUT_URL")
        .unwrap_or_else(|_| "https://vivestream.lemonsqueezy.com/buy/pro".to_string())
}

fn save_license_file(app: &AppHandle, data: &LicenseData) -> Result<(), String> {
    let path = get_license_file_path(app)?;
    let content = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())?;
    Ok(())
}
