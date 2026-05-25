import { useState, useCallback, useEffect, useRef } from "react";
import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";
import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { useTimer } from "./hooks/useTimer";
import { TimerDisplay } from "./components/TimerDisplay";
import { ControlBar } from "./components/ControlBar";
import { Settings } from "./components/Settings";
import { SessionDots } from "./components/SessionDots";

const FULL_W = 280;
const FULL_H = 380;
const MINI_W = 205;
const MINI_H = 46;

async function winClose() {
  try { await getCurrentWindow().close(); }
  catch (e) { console.warn("[BeeOnTime] close failed:", e); }
}

async function winStartDrag() {
  try { await getCurrentWindow().startDragging(); }
  catch (e) { console.warn("[BeeOnTime] drag failed:", e); }
}

async function winShrinkToMini() {
  try {
    const win = getCurrentWindow();
    await win.setResizable(false);
    await win.setSize(new LogicalSize(MINI_W, MINI_H));
  } catch (e) {
    console.warn("[BeeOnTime] shrink failed:", e);
  }
}

async function winExpandToFull() {
  const win = getCurrentWindow();

  // CRITICAL: resize the window first. Don't let monitor/position queries
  // block this — even if they fail, the resize must complete.
  try {
    await win.setResizable(true);
    await win.setSize(new LogicalSize(FULL_W, FULL_H));
  } catch (e) {
    console.warn("[BeeOnTime] resize failed:", e);
    return;
  }

  // OPTIONAL: nudge window into the visible work area if it overflows.
  // Wrapped in its own try/catch so a permission/query failure doesn't
  // leave the user with a stuck mini window.
  try {
    const monitor = await currentMonitor();
    const pos = await win.outerPosition();
    if (!monitor) return;

    const scale = monitor.scaleFactor;
    const widthPhys = FULL_W * scale;
    const heightPhys = FULL_H * scale;
    const margin = Math.round(12 * scale);
    const monLeft = monitor.position.x;
    const monTop = monitor.position.y;
    const monRight = monLeft + monitor.size.width;
    const monBottom = monTop + monitor.size.height;

    let x = pos.x;
    let y = pos.y;
    let moved = false;
    if (x + widthPhys > monRight - margin) { x = monRight - widthPhys - margin; moved = true; }
    if (y + heightPhys > monBottom - margin) { y = monBottom - heightPhys - margin; moved = true; }
    if (x < monLeft + margin) { x = monLeft + margin; moved = true; }
    if (y < monTop + margin) { y = monTop + margin; moved = true; }
    if (moved) await win.setPosition(new PhysicalPosition(x, y));
  } catch (e) {
    console.warn("[BeeOnTime] position adjustment skipped:", e);
  }
}

// ── Inline SVG icons ────────────────────────────────────────────────────────

function IconClose() {
  return (
    <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <line x1="1" y1="1" x2="13" y2="13" />
      <line x1="13" y1="1" x2="1" y2="13" />
    </svg>
  );
}

function IconMinimize() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="10" y1="14" x2="3" y2="21" />
      <line x1="21" y1="3" x2="14" y2="10" />
    </svg>
  );
}

function IconExpand() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}

function IconPause() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function IconReset() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 .49-4.51" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// ── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [isMini, setIsMini] = useState(false);
  const timer = useTimer();
  const isBreak = timer.phase === "break" || timer.phase === "longBreak";

  // Apply persisted always-on-top to the window once on mount.
  // The settings already loaded from localStorage in useTimer, so we just push
  // the value to the OS window.
  useEffect(() => {
    getCurrentWindow()
      .setAlwaysOnTop(timer.settings.alwaysOnTop)
      .catch((e) => console.warn("[BeeOnTime] setAlwaysOnTop failed:", e));
    // run only once with the initially loaded value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync the theme to <html data-theme="..."> so the CSS palette swaps.
  useEffect(() => {
    document.documentElement.dataset.theme = timer.settings.theme;
  }, [timer.settings.theme]);

  // Sync the mini transparency as a CSS variable read by .app-mini's background.
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--mini-opacity",
      String(timer.settings.miniOpacity)
    );
  }, [timer.settings.miniOpacity]);

  // Auto-mini on blur. Latest state lives in a ref so the focus listener
  // (attached once) always reads the current values without re-binding.
  const autoMiniStateRef = useRef({
    running: timer.running,
    phase: timer.phase,
    isMini,
    autoMiniOnBlur: timer.settings.autoMiniOnBlur,
  });
  autoMiniStateRef.current = {
    running: timer.running,
    phase: timer.phase,
    isMini,
    autoMiniOnBlur: timer.settings.autoMiniOnBlur,
  };

  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | null = null;
    let unlisten: (() => void) | null = null;

    getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused) {
          if (pending) { clearTimeout(pending); pending = null; }
          return;
        }
        const s = autoMiniStateRef.current;
        if (!s.autoMiniOnBlur || !s.running || s.phase !== "work" || s.isMini) return;
        pending = setTimeout(async () => {
          // Re-check at fire time — state may have changed during the 3s wait.
          const cur = autoMiniStateRef.current;
          if (!cur.isMini && cur.running && cur.phase === "work") {
            setIsMini(true);
            await winShrinkToMini();
          }
        }, 3000);
      })
      .then((fn) => { unlisten = fn; })
      .catch((e) => console.warn("[BeeOnTime] focus listener failed:", e));

    return () => {
      if (pending) clearTimeout(pending);
      unlisten?.();
    };
  }, []);

  const toggleMini = useCallback(async () => {
    setShowSettings(false);
    if (isMini) {
      // Going to FULL: resize the window FIRST, then swap UI.
      // Otherwise the full layout briefly renders inside the tiny mini
      // window and the SVG ring overflows.
      await winExpandToFull();
      setIsMini(false);
    } else {
      // Going to MINI: swap UI first (mini bar is short), then shrink.
      // This avoids clipping the full layout during the resize.
      setIsMini(true);
      await winShrinkToMini();
    }
  }, [isMini]);

  // Track when settings was opened from mini, so closing it returns to mini.
  const settingsOpenedFromMiniRef = useRef(false);

  const openSettingsFromMini = useCallback(async () => {
    settingsOpenedFromMiniRef.current = true;
    await toggleMini();
    setShowSettings(true);
  }, [toggleMini]);

  const closeSettings = useCallback(async () => {
    setShowSettings(false);
    if (settingsOpenedFromMiniRef.current) {
      settingsOpenedFromMiniRef.current = false;
      await toggleMini(); // shrink back
    }
  }, [toggleMini]);

  // Native context menu for the mini bar. Right-click → Pause/Skip/Reset/Settings/Expand
  // without ever expanding the window (except via the explicit "Expand"/"Settings" items).
  const showMiniContextMenu = useCallback(async () => {
    try {
      const wasRunning = timer.running;
      const phase = timer.phase;
      const playLabel = wasRunning ? "Pause" : phase === "idle" ? "Start" : "Resume";

      const items = await Promise.all([
        MenuItem.new({
          id: "playpause",
          text: playLabel,
          action: () => (wasRunning ? timer.pause() : timer.start()),
        }),
        MenuItem.new({
          id: "skip",
          text: "Skip phase",
          action: () => timer.skipPhase(),
        }),
        MenuItem.new({
          id: "reset",
          text: "Reset",
          action: () => timer.reset(),
        }),
        PredefinedMenuItem.new({ item: "Separator" }),
        MenuItem.new({
          id: "settings",
          text: "Settings…",
          action: () => { void openSettingsFromMini(); },
        }),
        MenuItem.new({
          id: "expand",
          text: "Expand",
          action: () => { void toggleMini(); },
        }),
      ]);

      const menu = await Menu.new({ items });
      await menu.popup();
    } catch (e) {
      console.warn("[BeeOnTime] mini menu failed:", e);
    }
  }, [timer, toggleMini, openSettingsFromMini]);

  // ── Mini mode ─────────────────────────────────────────────────────────────
  if (isMini) {
    return (
      <div
        className={`app app-mini${isBreak ? " app-break" : ""}`}
        data-tauri-drag-region
        onMouseDown={(e) => {
          if (!(e.target as HTMLElement).closest("button")) winStartDrag();
        }}
        onContextMenu={(e) => { e.preventDefault(); void showMiniContextMenu(); }}
      >
        <button className="btn-mini btn-mini-expand" onClick={toggleMini} title="Expand to full view">
          <IconExpand />
        </button>

        <div className="mini-info" data-tauri-drag-region>
          <span className="mini-phase-dot" />
          <span className="mini-digits">
            {String(timer.minutes).padStart(2, "0")}:{String(timer.seconds).padStart(2, "0")}
          </span>
        </div>

        <button className="btn-mini" onClick={openSettingsFromMini} title="Settings">
          <IconSettings />
        </button>

        <button className="btn-mini" onClick={timer.reset} title="Reset">
          <IconReset />
        </button>

        <button
          className={`btn-mini btn-mini-play${isBreak ? " btn-mini-break" : ""}`}
          onClick={timer.running ? timer.pause : timer.start}
          title={timer.running ? "Pause" : "Start"}
        >
          {timer.running ? <IconPause /> : <IconPlay />}
        </button>

        <button className="btn-mini btn-mini-close" onClick={winClose} title="Close BeeOnTime">
          <IconClose />
        </button>
      </div>
    );
  }

  // ── Full mode ─────────────────────────────────────────────────────────────
  return (
    <div className={`app${isBreak ? " app-break" : ""}`}>
      <div
        className="titlebar"
        data-tauri-drag-region
        onMouseDown={(e) => {
          if (!(e.target as HTMLElement).closest("button")) winStartDrag();
        }}
      >
        <button className="titlebar-btn" onClick={toggleMini} title="Mini mode">
          <IconMinimize />
        </button>
        <span className="app-title" data-tauri-drag-region>BeeOnTime</span>
        <button className="titlebar-btn titlebar-btn-close" onClick={winClose} title="Close">
          <IconClose />
        </button>
      </div>

      <div className="main-content">
        <TimerDisplay
          phase={timer.phase}
          progress={timer.progress}
          minutes={timer.minutes}
          seconds={timer.seconds}
        />
        <SessionDots
          sessions={timer.sessions}
          target={timer.settings.sessionsBeforeLongBreak}
        />
        <ControlBar
          running={timer.running}
          onStart={timer.start}
          onPause={timer.pause}
          onReset={timer.reset}
          onSettings={() => setShowSettings(true)}
        />
      </div>

      {showSettings && (
        <Settings
          settings={timer.settings}
          onSave={timer.saveSettings}
          onClose={closeSettings}
        />
      )}
    </div>
  );
}
