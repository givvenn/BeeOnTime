import { useState, useEffect } from "react";
import { TimerSettings, playChime } from "../hooks/useTimer";

interface Props {
  settings: TimerSettings;
  onSave: (s: TimerSettings) => void;
  onClose: () => void;
}

async function setWindowAlwaysOnTop(value: boolean) {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setAlwaysOnTop(value);
  } catch { /* not in Tauri env */ }
}

export function Settings({ settings, onSave, onClose }: Props) {
  const [local, setLocal] = useState<TimerSettings>(settings);

  // Debounced auto-save: every change persists after 250ms of inactivity.
  // The ✓ button still works for explicit save+close.
  useEffect(() => {
    const t = setTimeout(() => onSave(local), 250);
    return () => clearTimeout(t);
  }, [local, onSave]);

  const handleAlwaysOnTop = async () => {
    const next = !local.alwaysOnTop;
    setLocal(prev => ({ ...prev, alwaysOnTop: next }));
    await setWindowAlwaysOnTop(next);
  };

  const setField = (key: keyof TimerSettings) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Math.max(1, Math.min(99, parseInt(e.target.value) || 1));
    setLocal(prev => ({ ...prev, [key]: val }));
  };

  const toggleSound = () => {
    const next = !local.soundEnabled;
    setLocal(prev => ({ ...prev, soundEnabled: next }));
    if (next) playChime();
  };

  const toggleTheme = () => {
    setLocal(prev => ({ ...prev, theme: prev.theme === "dark" ? "light" : "dark" }));
  };

  const toggleAutoMini = () => {
    setLocal(prev => ({ ...prev, autoMiniOnBlur: !prev.autoMiniOnBlur }));
  };

  const handleSave = () => {
    onSave(local);
    onClose();
  };

  return (
    <div className="settings-overlay">
      <div className="settings-header">
        <span className="settings-title">Settings</span>
        <button className="btn-save" onClick={handleSave} title="Save & close">✓</button>
      </div>

      <div className="settings-body">
        <div className="setting-row">
          <span className="setting-label">Work</span>
          <div className="input-group">
            <input
              className="setting-input"
              type="number"
              min="1"
              max="99"
              value={local.workMinutes}
              onChange={setField("workMinutes")}
            />
            <span className="setting-unit">min</span>
          </div>
        </div>

        <div className="setting-row">
          <span className="setting-label">Short break</span>
          <div className="input-group">
            <input
              className="setting-input"
              type="number"
              min="1"
              max="99"
              value={local.breakMinutes}
              onChange={setField("breakMinutes")}
            />
            <span className="setting-unit">min</span>
          </div>
        </div>

        <div className="setting-row">
          <span className="setting-label">Long break</span>
          <div className="input-group">
            <input
              className="setting-input"
              type="number"
              min="1"
              max="99"
              value={local.longBreakMinutes}
              onChange={setField("longBreakMinutes")}
            />
            <span className="setting-unit">min</span>
          </div>
        </div>

        <div className="setting-row">
          <span className="setting-label">Sessions before long break</span>
          <div className="input-group">
            <input
              className="setting-input"
              type="number"
              min="1"
              max="10"
              value={local.sessionsBeforeLongBreak}
              onChange={setField("sessionsBeforeLongBreak")}
            />
          </div>
        </div>

        <div className="setting-row">
          <span className="setting-label">Theme</span>
          <div className="toggle-wrap">
            <button
              className="theme-pill"
              onClick={toggleTheme}
              title={`Switch to ${local.theme === "dark" ? "light" : "dark"} mode`}
            >
              {local.theme === "dark" ? "Dark" : "Light"}
            </button>
          </div>
        </div>

        <div className="setting-row">
          <span className="setting-label">Mini transparency</span>
          <div className="input-group">
            <input
              type="range"
              min="30"
              max="100"
              step="5"
              value={Math.round(local.miniOpacity * 100)}
              onChange={(e) =>
                setLocal(prev => ({ ...prev, miniOpacity: parseInt(e.target.value) / 100 }))
              }
              className="setting-slider"
            />
            <span className="setting-unit">{Math.round(local.miniOpacity * 100)}%</span>
          </div>
        </div>

        <div className="setting-row">
          <span className="setting-label">Auto-mini on blur</span>
          <div className="toggle-wrap">
            <button
              className="toggle"
              role="switch"
              aria-checked={local.autoMiniOnBlur}
              onClick={toggleAutoMini}
              title="Shrink to mini when window loses focus during a focus session"
            >
              <div className="toggle-thumb" />
            </button>
          </div>
        </div>

        <div className="setting-row">
          <span className="setting-label">Sound</span>
          <div className="toggle-wrap">
            <button
              className="toggle"
              role="switch"
              aria-checked={local.soundEnabled}
              onClick={toggleSound}
              title={local.soundEnabled ? "Sound on" : "Sound off"}
            >
              <div className="toggle-thumb" />
            </button>
          </div>
        </div>

        <div className="setting-row">
          <span className="setting-label">Always on top</span>
          <div className="toggle-wrap">
            <button
              className="toggle"
              role="switch"
              aria-checked={local.alwaysOnTop}
              onClick={handleAlwaysOnTop}
            >
              <div className="toggle-thumb" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
