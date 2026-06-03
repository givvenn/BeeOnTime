//! BusyBee MCP integration for BeeOnTime.
//!
//! Reads the BusyBee task you're currently focusing on via the streamable-
//! HTTP MCP transport. The Personal Access Token lives in the OS keychain
//! (Keychain on macOS, Credential Manager on Windows, Secret Service on
//! Linux); the base URL lives in a tiny JSON file under the app's data dir
//! so it survives restarts without dragging URL strings through Keychain.
//!
//! All network calls happen in this module — the React side never sees the
//! PAT and never speaks HTTP directly. Tauri commands return plain Serde
//! structs that map cleanly to TypeScript types in `src/lib/busybee.ts`.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

const KEYRING_SERVICE: &str = "BeeOnTime-BusyBee";
const KEYRING_USER: &str = "pat";
const CONFIG_FILENAME: &str = "busybee.json";

// ─── error type ───────────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum BusyBeeError {
    #[error("BusyBee is not connected — open Settings to set the URL and token")]
    NotConfigured,
    #[error("HTTP error: {0}")]
    Http(String),
    #[error("BusyBee returned an error: {0}")]
    Tool(String),
    #[error("could not decode BusyBee response: {0}")]
    Decode(String),
    #[error("keychain error: {0}")]
    Keyring(String),
    #[error("filesystem error: {0}")]
    Io(String),
}

impl From<reqwest::Error> for BusyBeeError {
    fn from(e: reqwest::Error) -> Self { Self::Http(e.to_string()) }
}
impl From<serde_json::Error> for BusyBeeError {
    fn from(e: serde_json::Error) -> Self { Self::Decode(e.to_string()) }
}
impl From<keyring::Error> for BusyBeeError {
    fn from(e: keyring::Error) -> Self { Self::Keyring(e.to_string()) }
}
impl From<std::io::Error> for BusyBeeError {
    fn from(e: std::io::Error) -> Self { Self::Io(e.to_string()) }
}
impl From<tauri::Error> for BusyBeeError {
    fn from(e: tauri::Error) -> Self { Self::Io(e.to_string()) }
}

// Tauri commands must serialise their error; render it as the plain message.
impl serde::Serialize for BusyBeeError {
    fn serialize<S: serde::Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        ser.serialize_str(&self.to_string())
    }
}

// ─── DTOs returned to React ───────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct TaskSummary {
    pub id: String,
    pub title: String,
    pub priority: String,         // "p1".."p4"
    pub status: String,
    pub duration_minutes: i64,
    pub due_date: Option<String>,
    pub project_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SubtaskSummary {
    pub id: String,
    pub title: String,
    pub done: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct TaskCard {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub priority: String,
    pub status: String,
    pub duration_minutes: i64,
    pub estimated_pomodoros: i64,
    pub due_date: Option<String>,
    pub project_name: Option<String>,
    pub project_color: Option<String>,
    pub subtasks: Vec<SubtaskSummary>,
}

#[derive(Debug, Clone, Serialize)]
pub struct WhoAmI {
    pub email: String,
    pub full_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ConnectionStatus {
    pub configured: bool,
    pub base_url: Option<String>,
    pub identity: Option<WhoAmI>,
}

// ─── persistent config & secret store ─────────────────────────────────

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
struct StoredConfig {
    base_url: Option<String>,
}

#[derive(Debug, Default)]
pub struct BusyBeeState {
    cached_pat: Mutex<Option<String>>,
}

fn config_path(app: &AppHandle) -> Result<std::path::PathBuf, BusyBeeError> {
    let dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join(CONFIG_FILENAME))
}

fn load_config(app: &AppHandle) -> Result<StoredConfig, BusyBeeError> {
    let path = config_path(app)?;
    if !path.exists() { return Ok(StoredConfig::default()); }
    let bytes = std::fs::read(&path)?;
    Ok(serde_json::from_slice(&bytes)?)
}

fn save_config(app: &AppHandle, cfg: &StoredConfig) -> Result<(), BusyBeeError> {
    let path = config_path(app)?;
    std::fs::write(path, serde_json::to_vec_pretty(cfg)?)?;
    Ok(())
}

fn load_pat() -> Result<Option<String>, BusyBeeError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)?;
    match entry.get_password() {
        Ok(p) => Ok(Some(p)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

fn save_pat(pat: &str) -> Result<(), BusyBeeError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)?;
    entry.set_password(pat)?;
    Ok(())
}

fn delete_pat() -> Result<(), BusyBeeError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.into()),
    }
}

// ─── MCP transport ────────────────────────────────────────────────────

async fn mcp_call(
    base_url: &str,
    pat: &str,
    tool: &str,
    args: serde_json::Value,
) -> Result<serde_json::Value, BusyBeeError> {
    let url = format!("{}/mcp/", base_url.trim_end_matches('/'));
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": { "name": tool, "arguments": args },
    });
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()?;
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", pat))
        .header("Content-Type", "application/json")
        .header("Accept", "application/json, text/event-stream")
        .json(&body)
        .send()
        .await?;
    if !resp.status().is_success() {
        let code = resp.status().as_u16();
        let text = resp.text().await.unwrap_or_default();
        return Err(BusyBeeError::Http(format!("HTTP {}: {}", code, text)));
    }
    let envelope: serde_json::Value = resp.json().await?;
    if let Some(err) = envelope.get("error") {
        return Err(BusyBeeError::Tool(err.to_string()));
    }
    let result = envelope
        .get("result")
        .ok_or_else(|| BusyBeeError::Tool("MCP envelope missing `result`".into()))?
        .clone();
    if result.get("isError").and_then(|v| v.as_bool()).unwrap_or(false) {
        let msg = result
            .pointer("/content/0/text")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown tool error");
        return Err(BusyBeeError::Tool(msg.to_string()));
    }
    Ok(result)
}

/// FastMCP returns list-typed tool output two ways: as `structuredContent.result`
/// (array) or as `content[*].text` containing JSON strings. Handle both.
fn extract_list(result: &serde_json::Value) -> Vec<serde_json::Value> {
    if let Some(list) = result.pointer("/structuredContent/result").and_then(|v| v.as_array()) {
        return list.clone();
    }
    result
        .get("content")
        .and_then(|c| c.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|c| {
                    if c.get("type")?.as_str()? != "text" { return None; }
                    serde_json::from_str::<serde_json::Value>(c.get("text")?.as_str()?).ok()
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Dict-typed tools (whoami, get_task, get_project) come back as `content[0].text`
/// JSON-string — `structuredContent` is not used for dict returns.
fn extract_dict(result: &serde_json::Value) -> Option<serde_json::Value> {
    if let Some(sc) = result.get("structuredContent") {
        // For tools that DO populate it as an object (some MCP servers do this).
        if sc.is_object() && sc.get("result").is_none() {
            return Some(sc.clone());
        }
    }
    let first = result.get("content")?.as_array()?.first()?;
    if first.get("type")?.as_str()? != "text" { return None; }
    serde_json::from_str(first.get("text")?.as_str()?).ok()
}

// ─── lookup helpers ──────────────────────────────────────────────────

async fn fetch_creds(
    app: &AppHandle,
    state: &State<'_, BusyBeeState>,
) -> Result<(String, String), BusyBeeError> {
    let cfg = load_config(app)?;
    let base_url = cfg.base_url.ok_or(BusyBeeError::NotConfigured)?;
    let mut cached = state.cached_pat.lock().expect("cached_pat poisoned");
    if cached.is_none() {
        *cached = load_pat()?;
    }
    let pat = cached.clone().ok_or(BusyBeeError::NotConfigured)?;
    Ok((base_url, pat))
}

fn map_summary(item: &serde_json::Value) -> TaskSummary {
    TaskSummary {
        id: item.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        title: item.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        priority: item.get("priority").and_then(|v| v.as_str()).unwrap_or("p4").to_string(),
        status: item.get("status").and_then(|v| v.as_str()).unwrap_or("?").to_string(),
        duration_minutes: item.get("duration").and_then(|v| v.as_i64()).unwrap_or(0),
        due_date: item.get("due_date").and_then(|v| v.as_str()).map(String::from),
        project_id: item.get("project_id").and_then(|v| v.as_str()).map(String::from),
    }
}

// ─── Tauri commands ──────────────────────────────────────────────────

#[tauri::command]
pub async fn bb_set_config(
    app: AppHandle,
    state: State<'_, BusyBeeState>,
    base_url: String,
    pat: String,
) -> Result<ConnectionStatus, BusyBeeError> {
    let url = base_url.trim().trim_end_matches('/').to_string();
    let pat = pat.trim().to_string();
    if url.is_empty() || pat.is_empty() {
        return Err(BusyBeeError::NotConfigured);
    }
    save_pat(&pat)?;
    save_config(&app, &StoredConfig { base_url: Some(url) })?;
    *state.cached_pat.lock().expect("cached_pat poisoned") = Some(pat);
    bb_get_status(app, state).await
}

#[tauri::command]
pub async fn bb_clear_config(
    app: AppHandle,
    state: State<'_, BusyBeeState>,
) -> Result<(), BusyBeeError> {
    delete_pat()?;
    save_config(&app, &StoredConfig::default())?;
    *state.cached_pat.lock().expect("cached_pat poisoned") = None;
    Ok(())
}

#[tauri::command]
pub async fn bb_get_status(
    app: AppHandle,
    state: State<'_, BusyBeeState>,
) -> Result<ConnectionStatus, BusyBeeError> {
    let cfg = load_config(&app)?;
    let base_url = cfg.base_url.clone();
    if base_url.is_none() {
        return Ok(ConnectionStatus { configured: false, base_url: None, identity: None });
    }
    // If creds are present, verify the connection by calling whoami.
    let (url, pat) = match fetch_creds(&app, &state).await {
        Ok(v) => v,
        Err(_) => return Ok(ConnectionStatus { configured: false, base_url, identity: None }),
    };
    match mcp_call(&url, &pat, "whoami", serde_json::json!({})).await {
        Ok(res) => {
            let dict = extract_dict(&res).unwrap_or_default();
            let identity = WhoAmI {
                email: dict.get("email").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                full_name: dict.get("full_name").and_then(|v| v.as_str()).map(String::from),
            };
            Ok(ConnectionStatus { configured: true, base_url: Some(url), identity: Some(identity) })
        }
        Err(_) => Ok(ConnectionStatus { configured: true, base_url: Some(url), identity: None }),
    }
}

#[tauri::command]
pub async fn bb_list_open_tasks(
    app: AppHandle,
    state: State<'_, BusyBeeState>,
    limit: Option<i64>,
) -> Result<Vec<TaskSummary>, BusyBeeError> {
    let (url, pat) = fetch_creds(&app, &state).await?;
    let take = limit.unwrap_or(20).clamp(1, 50);
    let mut out: Vec<TaskSummary> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    for status in ["in_progress", "todo"] {
        let res = mcp_call(
            &url, &pat,
            "list_tasks",
            serde_json::json!({"status": status, "limit": take}),
        ).await?;
        for item in extract_list(&res) {
            let summary = map_summary(&item);
            if !summary.id.is_empty() && seen.insert(summary.id.clone()) {
                out.push(summary);
            }
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn bb_get_task_card(
    app: AppHandle,
    state: State<'_, BusyBeeState>,
    task_id: String,
) -> Result<TaskCard, BusyBeeError> {
    let (url, pat) = fetch_creds(&app, &state).await?;
    let res = mcp_call(&url, &pat, "get_task", serde_json::json!({"task_id": task_id})).await?;
    let task = extract_dict(&res)
        .ok_or_else(|| BusyBeeError::Decode("get_task returned no dict payload".into()))?;

    let duration_minutes = task.get("duration").and_then(|v| v.as_i64()).unwrap_or(0);
    // Round up to whole pomodoros, at least 1.
    let estimated_pomodoros = ((duration_minutes + 24) / 25).max(1);

    // Fetch project for name + color — failure is non-fatal.
    let (mut project_name, mut project_color) = (None, None);
    if let Some(project_id) = task.get("project_id").and_then(|v| v.as_str()) {
        if let Ok(p_res) = mcp_call(&url, &pat, "get_project", serde_json::json!({"project_id": project_id})).await {
            if let Some(p) = extract_dict(&p_res) {
                project_name = p.get("name").and_then(|v| v.as_str()).map(String::from);
                project_color = p.get("color").and_then(|v| v.as_str()).map(String::from);
            }
        }
    }

    let subtasks = task
        .get("subtasks")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|s| {
                    Some(SubtaskSummary {
                        id: s.get("id")?.as_str()?.to_string(),
                        title: s.get("title")?.as_str()?.to_string(),
                        done: matches!(
                            s.get("status").and_then(|v| v.as_str()),
                            Some("completed") | Some("done")
                        ),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(TaskCard {
        id: task.get("id").and_then(|v| v.as_str()).unwrap_or(&task_id).to_string(),
        title: task.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        description: task.get("description").and_then(|v| v.as_str()).map(String::from),
        priority: task.get("priority").and_then(|v| v.as_str()).unwrap_or("p4").to_string(),
        status: task.get("status").and_then(|v| v.as_str()).unwrap_or("?").to_string(),
        duration_minutes,
        estimated_pomodoros,
        due_date: task.get("due_date").and_then(|v| v.as_str()).map(String::from),
        project_name,
        project_color,
        subtasks,
    })
}
