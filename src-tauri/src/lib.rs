mod busybee;

use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, State,
};

// Tray timer state — independent of the React state.
// The frontend syncs (running, seconds_left) on every relevant change; the
// Rust ticker then runs the countdown locally so the menu bar stays accurate
// even when the window is hidden and JS is throttled.
struct TrayState {
    running: bool,
    end_time: Option<Instant>,
    last_rendered: i64,
}

fn ceil_remaining(end: Instant, now: Instant) -> i64 {
    if end <= now {
        return 0;
    }
    let dur = end - now;
    let secs = dur.as_secs() as i64;
    if dur.subsec_nanos() > 0 { secs + 1 } else { secs }
}

fn format_mmss(secs: i64) -> String {
    let s = secs.max(0);
    format!("{:02}:{:02}", s / 60, s % 60)
}

fn set_tray_title(app: &AppHandle, title: String) {
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_title(Some(title));
    }
}

// Called by the frontend whenever timer state changes (start/pause/phase/reset).
// Sets end_time when running, clears it when paused; also pushes the immediate
// title so paused/idle values show right away.
#[tauri::command]
fn tray_sync_state(
    app: AppHandle,
    state: State<'_, Mutex<TrayState>>,
    running: bool,
    seconds_left: i64,
) -> Result<(), String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;
    s.running = running;
    if running {
        s.end_time = Some(Instant::now() + Duration::from_secs(seconds_left.max(0) as u64));
    } else {
        s.end_time = None;
    }
    if seconds_left != s.last_rendered {
        s.last_rendered = seconds_left;
        set_tray_title(&app, format_mmss(seconds_left));
    }
    Ok(())
}

pub fn run() {
    let tray_state = Mutex::new(TrayState {
        running: false,
        end_time: None,
        last_rendered: i64::MIN,
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .manage(tray_state)
        .manage(busybee::BusyBeeState::default())
        .invoke_handler(tauri::generate_handler![
            tray_sync_state,
            busybee::bb_set_config,
            busybee::bb_clear_config,
            busybee::bb_get_status,
            busybee::bb_list_open_tasks,
            busybee::bb_get_task_card,
        ])
        .setup(|app| {
            let show_hide = MenuItem::with_id(app, "show_hide", "Show / Hide", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit BeeOnTime", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_hide, &quit])?;

            let icon = app
                .default_window_icon()
                .cloned()
                .expect("No app icon found");

            TrayIconBuilder::with_id("main")
                .icon(icon)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show_hide" => {
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            // Background ticker — keeps the tray title updated every 250ms
            // independently of the webview. This is the whole point: when the
            // window is hidden, JS may be heavily throttled, but Rust keeps
            // ticking and the user sees the menu bar count down smoothly.
            let app_handle = app.handle().clone();
            thread::spawn(move || loop {
                thread::sleep(Duration::from_millis(250));
                let (should_update, secs) = {
                    let state = app_handle.state::<Mutex<TrayState>>();
                    let mut s = match state.lock() {
                        Ok(s) => s,
                        Err(_) => continue,
                    };
                    if !s.running {
                        (false, 0)
                    } else if let Some(end) = s.end_time {
                        let remaining = ceil_remaining(end, Instant::now());
                        let need = remaining != s.last_rendered;
                        if need {
                            s.last_rendered = remaining;
                        }
                        (need, remaining)
                    } else {
                        (false, 0)
                    }
                };
                if should_update {
                    set_tray_title(&app_handle, format_mmss(secs));
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running BeeOnTime");
}
