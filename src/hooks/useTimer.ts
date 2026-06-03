import { useState, useEffect, useRef, useCallback } from "react";

export type Phase = "idle" | "work" | "break" | "longBreak";

export type Theme = "dark" | "light";

export interface TimerSettings {
  workMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  sessionsBeforeLongBreak: number;
  soundEnabled: boolean;
  alwaysOnTop: boolean;
  theme: Theme;
  autoMiniOnBlur: boolean;
  miniOpacity: number; // 0.3–1.0, applies only in mini mode
  showBusyBeeTask: boolean; // show the BusyBee active-task banner above the timer
}

const DEFAULTS: TimerSettings = {
  workMinutes: 25,
  breakMinutes: 5,
  longBreakMinutes: 15,
  sessionsBeforeLongBreak: 4,
  soundEnabled: true,
  alwaysOnTop: false,
  theme: "dark",
  autoMiniOnBlur: true,
  miniOpacity: 0.6,
  showBusyBeeTask: true,
};

export function playChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    // Two-note chime — pleasant, not alarming
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const start = now + i * 0.18;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.28, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.9);
      osc.start(start);
      osc.stop(start + 0.95);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch { /* audio not available */ }
}

function loadSettings(): TimerSettings {
  try {
    const s = localStorage.getItem("beeontime-settings");
    if (s) return { ...DEFAULTS, ...JSON.parse(s) };
  } catch { /* ignore */ }
  return DEFAULTS;
}

async function sendNotify(title: string, body: string) {
  try {
    const { isPermissionGranted, requestPermission, sendNotification } =
      await import("@tauri-apps/plugin-notification");
    let ok = await isPermissionGranted();
    if (!ok) ok = (await requestPermission()) === "granted";
    if (ok) sendNotification({ title, body });
  } catch { /* not in Tauri env */ }
}

function phaseDuration(p: Phase, s: TimerSettings): number {
  if (p === "break") return s.breakMinutes * 60;
  if (p === "longBreak") return s.longBreakMinutes * 60;
  return s.workMinutes * 60;
}

export function useTimer() {
  const [settings, setSettings] = useState<TimerSettings>(loadSettings);
  const [phase, setPhase] = useState<Phase>("idle");
  const [running, setRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(() => loadSettings().workMinutes * 60);
  const [sessions, setSessions] = useState(0);

  // Task-aware auto-chain. When an external caller (BusyBeeActiveTask) sets a
  // target, the timer counts completed work-phases against it and auto-resumes
  // through break + next work until the target is reached. Null target means
  // standard manual chaining — user clicks Start between phases.
  const [taskTarget, setTaskTargetState] = useState<number | null>(null);
  const [taskProgress, setTaskProgress] = useState(0);

  const phaseRef = useRef(phase);
  const sessionsRef = useRef(sessions);
  const settingsRef = useRef(settings);
  const taskTargetRef = useRef(taskTarget);
  const taskProgressRef = useRef(taskProgress);
  phaseRef.current = phase;
  sessionsRef.current = sessions;
  settingsRef.current = settings;
  taskTargetRef.current = taskTarget;
  taskProgressRef.current = taskProgress;

  const totalSeconds = phaseDuration(phase === "idle" ? "work" : phase, settings);
  const progress = totalSeconds > 0 ? secondsLeft / totalSeconds : 1;

  const transitionPhase = useCallback(() => {
    const cur = phaseRef.current;
    const curSessions = sessionsRef.current;
    const s = settingsRef.current;
    const target = taskTargetRef.current;

    if (cur === "work" || cur === "idle") {
      const next = curSessions + 1;
      setSessions(next);
      const isLong = next % s.sessionsBeforeLongBreak === 0;
      const nextPhase: Phase = isLong ? "longBreak" : "break";
      setPhase(nextPhase);
      setSecondsLeft(phaseDuration(nextPhase, s));

      // Task-aware auto-chain: bump the per-task pomodoro counter and decide
      // whether to keep running automatically or stop and prompt the user.
      let reachedTarget = false;
      if (target != null) {
        const nextProgress = taskProgressRef.current + 1;
        setTaskProgress(nextProgress);
        taskProgressRef.current = nextProgress;
        reachedTarget = nextProgress >= target;
      }

      if (target != null && reachedTarget) {
        sendNotify(
          "Task pomodoros done",
          `${target}/${target} complete — mark the task done in BusyBee?`
        );
        // Stay idle; user decides whether to keep going or move on.
      } else {
        sendNotify("Break time!", isLong ? "Long break — well deserved!" : "Take a short break.");
        if (target != null) {
          // Auto-flow into the break; the next work transition will also
          // auto-resume (see else branch below). Small delay so the running=false
          // → running=true flip is observed by the timer ticker effect.
          setTimeout(() => setRunning(true), 100);
        }
      }
    } else {
      setPhase("work");
      setSecondsLeft(phaseDuration("work", s));
      sendNotify("Work time!", "Start your focus session.");
      if (target != null && taskProgressRef.current < target) {
        setTimeout(() => setRunning(true), 100);
      }
    }
    if (s.soundEnabled) playChime();
  }, []);

  // Wall-clock based countdown: we capture the start time and start seconds
  // once, then compute the remaining value from Date.now() on each tick.
  // This means the UI catches up correctly after the window has been hidden
  // (and JS timers throttled). Also fires immediately on visibilitychange so
  // showing the window after a long hide instantly refreshes the digits.
  const secondsLeftRef = useRef(secondsLeft);
  secondsLeftRef.current = secondsLeft;

  useEffect(() => {
    if (!running) return;
    const startWall = Date.now();
    const startSeconds = secondsLeftRef.current;

    const tick = () => {
      const elapsed = Math.floor((Date.now() - startWall) / 1000);
      const next = startSeconds - elapsed;
      if (next <= 0) {
        setSecondsLeft(0);
        setRunning(false);
        setTimeout(transitionPhase, 0);
      } else {
        setSecondsLeft(next);
      }
    };

    const id = setInterval(tick, 1000);
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [running, transitionPhase]);

  const start = useCallback(() => {
    if (phaseRef.current === "idle") {
      const s = settingsRef.current;
      setPhase("work");
      setSecondsLeft(s.workMinutes * 60);
    }
    setRunning(true);
  }, []);

  const pause = useCallback(() => setRunning(false), []);

  // Skip current phase: stop ticking and immediately transition.
  // Useful for the mini context menu — "I'm done early, give me the break".
  const skipPhase = useCallback(() => {
    setRunning(false);
    setTimeout(() => transitionPhase(), 0);
  }, [transitionPhase]);

  const reset = useCallback(() => {
    setRunning(false);
    setPhase("idle");
    setSessions(0);
    setSecondsLeft(settingsRef.current.workMinutes * 60);
    // Reset per-task counter but keep the target — same task, fresh attempt.
    setTaskProgress(0);
    taskProgressRef.current = 0;
  }, []);

  // Public setter that callers (BusyBeeActiveTask) use to attach / detach
  // the task target. Re-applying the same value is a no-op, so it's safe to
  // call from an effect that depends on card data.
  const setTaskTarget = useCallback((n: number | null) => {
    setTaskTargetState(prev => {
      if (prev === n) return prev;
      // Target changed (or cleared) → progress resets so the new task starts
      // counting from zero.
      setTaskProgress(0);
      taskProgressRef.current = 0;
      return n;
    });
  }, []);

  const saveSettings = useCallback((s: TimerSettings) => {
    setSettings(s);
    localStorage.setItem("beeontime-settings", JSON.stringify(s));
    // Only update the displayed countdown if idle — never interrupt a running session.
    // New durations apply to the NEXT phase.
    if (phaseRef.current === "idle") {
      setSecondsLeft(s.workMinutes * 60);
    }
  }, []);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return {
    phase,
    running,
    secondsLeft,
    totalSeconds,
    progress,
    sessions,
    settings,
    minutes,
    seconds,
    start,
    pause,
    skipPhase,
    reset,
    saveSettings,
    taskTarget,
    taskProgress,
    setTaskTarget,
  };
}
