use device_query::{DeviceQuery, DeviceState, Keycode};
use serde::Serialize;
use std::cell::RefCell;
use std::collections::HashSet;
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;
use image::{ImageBuffer, ImageEncoder};
use scrap::Capturer;
use std::io::{Cursor, ErrorKind};
use image::codecs::png::{CompressionType, FilterType as PngFilterType, PngEncoder};
use std::path::Path;
use std::ptr::null_mut;

#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::{CloseHandle, HWND};
#[cfg(target_os = "windows")]
use windows_sys::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
};
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

const KEYRING_SERVICE: &str = "teamlens.desktop.agent";
const KEYRING_ACCOUNT: &str = "auth_token";

#[derive(Default)]
struct InputCounter {
    mouse_moves: u64,
    key_presses: u64,
}

#[derive(Serialize)]
struct InputCounts {
    mouse_moves: u64,
    key_presses: u64,
}

#[derive(Serialize)]
struct ActiveWindowInfo {
    app_name: String,
    window_title: String,
    process_path: String,
}

static INPUT_COUNTER: OnceLock<Arc<Mutex<InputCounter>>> = OnceLock::new();
static SCREEN_CAPTURE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

thread_local! {
    static SCREEN_CAPTURER: RefCell<Option<ScreenCapturerState>> = RefCell::new(None);
}

struct ScreenCapturerState {
    capturer: Capturer,
    width: usize,
    height: usize,
}

fn create_screen_capturer_state() -> Result<ScreenCapturerState, String> {
    let display = scrap::Display::all()
        .map_err(|e| format!("Failed to get displays: {}", e))?
        .into_iter()
        .next()
        .ok_or("No displays found".to_string())?;

    let width = display.width();
    let height = display.height();
    let capturer = Capturer::new(display).map_err(|e| format!("Failed to create capturer: {}", e))?;

    Ok(ScreenCapturerState {
        capturer,
        width,
        height,
    })
}

fn capture_screen_frame() -> Result<(Vec<u8>, usize, usize), String> {
    let _capture_guard = SCREEN_CAPTURE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|err| format!("Failed to lock screen capture: {}", err))?;

    let mut frame_data: Option<(Vec<u8>, usize, usize)> = None;

    for _ in 0..40 {
        let captured = SCREEN_CAPTURER.with(|capturer_cell| -> Result<Option<(Vec<u8>, usize, usize)>, String> {
            let mut state = capturer_cell.borrow_mut();

            if state.is_none() {
                *state = Some(create_screen_capturer_state()?);
            }

            let active = state
                .as_mut()
                .ok_or_else(|| "Screen capturer state missing".to_string())?;

            match active.capturer.frame() {
                Ok(frame) => Ok(Some((frame.to_vec(), active.width, active.height))),
                Err(error) if error.kind() == ErrorKind::WouldBlock => Ok(None),
                Err(error) => {
                    eprintln!("[ScreenCapture] Capturer became invalid, recreating: {}", error);
                    *state = None;
                    Ok(None)
                }
            }
        })?;

        if let Some(captured_frame) = captured {
            frame_data = Some(captured_frame);
            break;
        }

        thread::sleep(Duration::from_millis(8));
    }

    frame_data.ok_or_else(|| {
        "Failed to capture frame: timeout waiting for first available frame".to_string()
    })
}

fn capture_frame_png(compression: CompressionType, filter: PngFilterType) -> Result<Vec<u8>, String> {
    let (frame, width, height) = capture_screen_frame()?;

    let stride = frame.len() / height;
    let mut image_data = Vec::with_capacity(width * height * 4);

    for y in 0..height {
        let row_start = y * stride;
        for x in 0..width {
            let offset = row_start + x * 4;
            if offset + 2 >= frame.len() {
                return Err("Captured frame ended unexpectedly".to_string());
            }

            image_data.push(frame[offset + 2]);
            image_data.push(frame[offset + 1]);
            image_data.push(frame[offset]);
            image_data.push(255);
        }
    }

    let width_u32 = width as u32;
    let height_u32 = height as u32;
    let image = ImageBuffer::<image::Rgba<u8>, Vec<u8>>::from_raw(width_u32, height_u32, image_data)
        .ok_or("Failed to create image buffer")?;

    let mut png_data = Vec::new();
    {
        let cursor = Cursor::new(&mut png_data);
        PngEncoder::new_with_quality(cursor, compression, filter)
            .write_image(&image, width_u32, height_u32, image::ColorType::Rgba8)
            .map_err(|e| format!("Failed to encode PNG: {}", e))?;
    }

    Ok(png_data)
}

fn start_global_input_tracker() {
    let counter = INPUT_COUNTER
        .get_or_init(|| Arc::new(Mutex::new(InputCounter::default())))
        .clone();

    thread::spawn(move || {
        let device_state = DeviceState::new();
        let mut last_mouse = device_state.get_mouse().coords;
        let mut last_keys: HashSet<Keycode> = device_state.get_keys().into_iter().collect();

        loop {
            let mouse = device_state.get_mouse().coords;
            let keys_now_vec = device_state.get_keys();
            let keys_now: HashSet<Keycode> = keys_now_vec.into_iter().collect();

            if let Ok(mut locked) = counter.lock() {
                if mouse != last_mouse {
                    locked.mouse_moves += 1;
                }

                for key in &keys_now {
                    if !last_keys.contains(key) {
                        locked.key_presses += 1;
                    }
                }
            }

            last_mouse = mouse;
            last_keys = keys_now;

            thread::sleep(Duration::from_millis(100));
        }
    });
}

#[tauri::command]
fn get_and_reset_input_counts() -> Result<InputCounts, String> {
    let counter = INPUT_COUNTER
        .get_or_init(|| Arc::new(Mutex::new(InputCounter::default())))
        .clone();

    let mut locked = counter.lock().map_err(|err| err.to_string())?;
    let out = InputCounts {
        mouse_moves: locked.mouse_moves,
        key_presses: locked.key_presses,
    };

    eprintln!(
        "[InputTracker] Retrieved counts: mouse={}, keys={}",
        out.mouse_moves, out.key_presses
    );

    locked.mouse_moves = 0;
    locked.key_presses = 0;

    Ok(out)
}

#[tauri::command]
fn set_auth_token(token: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|err| err.to_string())?;
    entry.set_password(&token).map_err(|err| err.to_string())
}

#[tauri::command]
fn get_auth_token() -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|err| err.to_string())?;

    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

#[tauri::command]
fn clear_auth_token() -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|err| err.to_string())?;

    match entry.delete_password() {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}

#[cfg(target_os = "windows")]
fn read_window_title(hwnd: HWND) -> String {
    unsafe {
        let len = GetWindowTextLengthW(hwnd);
        if len <= 0 {
            return String::new();
        }

        let mut buffer = vec![0u16; (len + 1) as usize];
        let copied = GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32);
        String::from_utf16_lossy(&buffer[..copied as usize])
    }
}

#[cfg(target_os = "windows")]
fn read_process_path(hwnd: HWND) -> String {
    unsafe {
        let mut process_id = 0u32;
        GetWindowThreadProcessId(hwnd, &mut process_id);
        if process_id == 0 {
            return String::new();
        }

        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id);
        if handle == null_mut() {
            return String::new();
        }

        let mut buffer = vec![0u16; 2048];
        let mut size = buffer.len() as u32;
        let ok = QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut size);
        CloseHandle(handle);

        if ok == 0 || size == 0 {
            return String::new();
        }

        String::from_utf16_lossy(&buffer[..size as usize])
    }
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn get_active_window_info() -> Result<ActiveWindowInfo, String> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd == null_mut() {
            return Ok(ActiveWindowInfo {
                app_name: "Unknown".to_string(),
                window_title: String::new(),
                process_path: String::new(),
            });
        }

        let window_title = read_window_title(hwnd);
        let process_path = read_process_path(hwnd);
        let app_name = Path::new(&process_path)
            .file_stem()
            .and_then(|name| name.to_str())
            .unwrap_or("Unknown")
            .to_string();

        Ok(ActiveWindowInfo {
            app_name,
            window_title,
            process_path,
        })
    }
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn get_active_window_info() -> Result<ActiveWindowInfo, String> {
    Ok(ActiveWindowInfo {
        app_name: "Unknown".to_string(),
        window_title: String::new(),
        process_path: String::new(),
    })
}

#[tauri::command]
fn capture_screenshot() -> Result<Vec<u8>, String> {
    capture_frame_png(CompressionType::Default, PngFilterType::Adaptive)
}

#[tauri::command]
fn capture_live_frame() -> Result<Vec<u8>, String> {
    capture_frame_png(CompressionType::Fast, PngFilterType::NoFilter)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    start_global_input_tracker();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            greet,
            set_auth_token,
            get_auth_token,
            clear_auth_token,
            get_and_reset_input_counts,
            get_active_window_info,
            capture_screenshot,
            capture_live_frame
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
