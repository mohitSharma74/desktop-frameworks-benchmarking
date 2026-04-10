use serde_json::Value;
use std::{
    fs,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::PathBuf,
    sync::Mutex,
    thread,
};
use tauri::{path::BaseDirectory, AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, FilePath};

struct AppState {
    mock_api_base_url: Mutex<String>,
}

#[derive(serde::Serialize)]
struct BenchmarkAutomationConfig {
    mode: String,
    #[serde(rename = "delayMs")]
    delay_ms: u64,
}

fn round_duration(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

fn resource_path(app: &AppHandle, file_name: &str) -> tauri::Result<PathBuf> {
    app.path()
        .resolve(format!("dataset/{file_name}"), BaseDirectory::Resource)
}

fn persistence_file_path(app: &AppHandle) -> tauri::Result<PathBuf> {
    let app_data_dir = app.path().app_data_dir()?;
    Ok(app_data_dir.join("benchmark-app-state.json"))
}

fn benchmark_output_file() -> Option<PathBuf> {
    std::env::var("BENCH_OUTPUT_FILE").ok().map(PathBuf::from)
}

fn benchmark_config() -> Option<BenchmarkAutomationConfig> {
    let mode = std::env::var("BENCH_AUTOMATION_MODE").ok()?;
    if mode != "startup" && mode != "heavy-task" {
        return None;
    }

    let delay_ms = std::env::var("BENCH_AUTOMATION_DELAY_MS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(250);

    Some(BenchmarkAutomationConfig { mode, delay_ms })
}

fn append_benchmark_log(payload: Value, started_at: &std::time::Instant) -> tauri::Result<()> {
    let mut record = serde_json::Map::new();
    record.insert("timestamp".into(), Value::String(chrono_like_now()));
    record.insert(
        "relativeMs".into(),
        serde_json::json!(round_duration(started_at.elapsed().as_secs_f64() * 1000.0)),
    );

    if let Value::Object(map) = payload {
        for (key, value) in map {
            record.insert(key, value);
        }
    }

    let line = format!("{}\n", Value::Object(record));

    if let Some(path) = benchmark_output_file() {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)?;
        file.write_all(line.as_bytes())?;
    }

    println!("[benchmark] {}", line.trim_end());
    Ok(())
}

fn chrono_like_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let datetime =
        time::OffsetDateTime::from_unix_timestamp(now).unwrap_or(time::OffsetDateTime::UNIX_EPOCH);
    datetime
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".into())
}

fn handle_request(stream: &mut TcpStream, dashboard_payload: &str) {
    let mut buffer = [0_u8; 2048];
    let bytes_read = stream.read(&mut buffer).unwrap_or(0);
    let request = String::from_utf8_lossy(&buffer[..bytes_read]);

    let (status_line, body) = if request.starts_with("GET /health ") {
        ("HTTP/1.1 200 OK", "{\"ok\":true}".to_string())
    } else if request.starts_with("GET /api/dashboard ") {
        ("HTTP/1.1 200 OK", dashboard_payload.to_string())
    } else {
        (
            "HTTP/1.1 404 Not Found",
            "{\"error\":\"not_found\"}".to_string(),
        )
    };

    let response = format!(
    "{status_line}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
    body.len()
  );

    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

fn start_mock_api_server(app: &AppHandle, state: &AppState) -> tauri::Result<()> {
    let payload_path = resource_path(app, "mock-api-response.json")?;
    let payload = fs::read_to_string(payload_path)?;
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let address = listener.local_addr()?;

    {
        let mut base_url = state.mock_api_base_url.lock().unwrap();
        *base_url = format!("http://127.0.0.1:{}", address.port());
    }

    thread::spawn(move || {
        for stream in listener.incoming() {
            if let Ok(mut stream) = stream {
                handle_request(&mut stream, &payload);
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn get_benchmark_config() -> Option<BenchmarkAutomationConfig> {
    benchmark_config()
}

#[tauri::command]
fn get_mock_api_base_url(state: State<AppState>) -> Result<String, String> {
    Ok(state.mock_api_base_url.lock().unwrap().clone())
}

#[tauri::command]
fn load_dataset_text(app: AppHandle) -> Result<String, String> {
    let path = resource_path(&app, "benchmark-dataset.json").map_err(|error| error.to_string())?;
    fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn read_persisted_state(app: AppHandle) -> Result<Option<Value>, String> {
    let path = persistence_file_path(&app).map_err(|error| error.to_string())?;

    match fs::read_to_string(path) {
        Ok(value) => serde_json::from_str(&value)
            .map(Some)
            .map_err(|error| error.to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn write_persisted_state(app: AppHandle, state: Value) -> Result<(), String> {
    let path = persistence_file_path(&app).map_err(|error| error.to_string())?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let json = serde_json::to_string_pretty(&state).map_err(|error| error.to_string())?;
    fs::write(path, json).map_err(|error| error.to_string())
}

#[tauri::command]
async fn open_native_file_picker(app: AppHandle) -> Result<Vec<String>, String> {
    Ok(app
        .dialog()
        .file()
        .blocking_pick_files()
        .unwrap_or_default()
        .into_iter()
        .map(|path| match path {
            FilePath::Path(path) => path.to_string_lossy().to_string(),
            FilePath::Url(url) => url.to_string(),
        })
        .collect::<Vec<_>>())
}

#[tauri::command]
fn open_secondary_window(app: AppHandle) -> Result<(), String> {
    if app.get_webview_window("secondary").is_some() {
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, "secondary", WebviewUrl::App("secondary.html".into()))
        .title("Benchmark Secondary Window")
        .inner_size(520.0, 320.0)
        .resizable(false)
        .build()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn emit_benchmark_event(
    app: AppHandle,
    event_name: String,
    payload: Option<Value>,
    state: State<StartedAtState>,
) -> Result<(), String> {
    let mut record = serde_json::Map::new();
    record.insert("source".into(), Value::String("renderer".into()));
    record.insert("eventName".into(), Value::String(event_name));
    record.insert("payload".into(), payload.unwrap_or(Value::Null));
    append_benchmark_log(Value::Object(record), &state.0).map_err(|error| error.to_string())?;
    let _ = app;
    Ok(())
}

struct StartedAtState(std::time::Instant);

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            mock_api_base_url: Mutex::new(String::new()),
        })
        .manage(StartedAtState(std::time::Instant::now()))
        .setup(|app| {
            let started_at = &app.state::<StartedAtState>().0;
            append_benchmark_log(
                serde_json::json!({
                  "stage": "main_started"
                }),
                started_at,
            )?;

            let app_handle = app.handle().clone();
            start_mock_api_server(&app_handle, app.state::<AppState>().inner())?;

            if app.get_webview_window("main").is_some() {
                append_benchmark_log(
                    serde_json::json!({
                      "stage": "window_created"
                    }),
                    started_at,
                )?;
            }

            Ok(())
        })
        .on_page_load(|webview, _payload| {
            let started_at = &webview.state::<StartedAtState>().0;
            let _ = append_benchmark_log(
                serde_json::json!({
                  "stage": "renderer_loaded"
                }),
                started_at,
            );
        })
        .invoke_handler(tauri::generate_handler![
            get_benchmark_config,
            get_mock_api_base_url,
            load_dataset_text,
            read_persisted_state,
            write_persisted_state,
            open_native_file_picker,
            open_secondary_window,
            emit_benchmark_event
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
