// Compact "currently focusing on" banner. Render this above the timer.
//
// Self-contained: owns the picker state, persists the chosen task id via
// useActiveTaskId, and renders a friendly placeholder when nothing is
// selected. The host App passes the current Pomodoro work-minutes so we can
// compute "how many pomodoros for this task" and the live progress counter,
// so the banner reads "1/3 🍅" instead of just an estimate.

import { useState, useEffect, useRef } from "react";
import { PRIORITY_COLOURS, formatRelativeDue } from "../../lib/busybee";
import { useActiveTaskId, useTaskCard, useBusyBeeStatus } from "../../hooks/useBusyBee";
import { BusyBeeTaskPicker } from "./BusyBeeTaskPicker";

type Props = {
  /** Current Pomodoro work-phase length (minutes), used to compute target. */
  workMinutes: number;
  /** Where the work-phase length comes from: "app" = fixed workMinutes (task
   * spans multiple pomodoros); "task" = the task's own duration is the work
   * block (one block per task). */
  workTimeSource: "app" | "task";
  /** Push the recomputed target up to useTimer; null clears it. */
  onTargetChange: (target: number | null) => void;
  /** Override the timer's work-phase length with the task duration (task mode),
   * or null to use the app's Work setting. */
  onWorkMinutesOverride: (minutes: number | null) => void;
  /** Reset the per-task pomodoro counter — called only when the selected
   * task itself changes, not on workMinutes recalcs. */
  onResetProgress: () => void;
  /** Completed pomodoros for the active task so far this session. */
  progress: number;
  /** Total pomodoros expected for the active task (null = no task). */
  target: number | null;
};

export function BusyBeeActiveTask({ workMinutes, workTimeSource, onTargetChange, onWorkMinutesOverride, onResetProgress, progress, target }: Props) {
  const { status } = useBusyBeeStatus();
  const [activeId, setActiveId] = useActiveTaskId();
  const { card, error, loading } = useTaskCard(activeId);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Track the last task we reported so we can distinguish "user picked a new
  // task" (→ reset progress) from "workMinutes changed, target shifted"
  // (→ keep progress; the user shouldn't lose credit for completed pomodoros).
  const lastTaskIdRef = useRef<string | null>(null);

  useEffect(() => {
    const currentId = card?.id ?? null;
    if (currentId !== lastTaskIdRef.current) {
      onResetProgress();
      lastTaskIdRef.current = currentId;
    }
    if (!card || !card.duration_minutes || workMinutes <= 0) {
      onTargetChange(null);
      onWorkMinutesOverride(null);
      return;
    }
    if (workTimeSource === "task") {
      // Work time follows the task: the whole task is one work block, so the
      // work phase runs for the task's duration and the target is a single 🍅.
      onWorkMinutesOverride(card.duration_minutes);
      onTargetChange(1);
    } else {
      // App setting: fixed-length pomodoros; the task spans as many as needed.
      onWorkMinutesOverride(null);
      onTargetChange(Math.max(1, Math.ceil(card.duration_minutes / workMinutes)));
    }
  }, [card, workMinutes, workTimeSource, onTargetChange, onWorkMinutesOverride, onResetProgress]);

  // Clear the work-minutes override when this banner unmounts (e.g. the user
  // turns off "Show BusyBee task") so a stale task duration can't linger.
  useEffect(() => () => onWorkMinutesOverride(null), [onWorkMinutesOverride]);

  // Hide the banner entirely when BusyBee isn't connected — the Settings
  // panel is where you onboard, no need to nag from the main screen.
  if (!status?.configured) return null;

  const open = () => setPickerOpen(true);

  if (!activeId) {
    return (
      <>
        <button type="button" className="bb-active bb-active--empty" onClick={open}>
          🍅 Pick a BusyBee task…
        </button>
        <BusyBeeTaskPicker
          open={pickerOpen}
          selectedId={null}
          onPick={setActiveId}
          onClose={() => setPickerOpen(false)}
        />
      </>
    );
  }

  if (loading && !card) {
    return <div className="bb-active bb-active--loading">Loading task…</div>;
  }

  if (error) {
    return (
      <button type="button" className="bb-active bb-active--error" onClick={open}>
        ⚠ {error} (click to pick another)
      </button>
    );
  }

  if (!card) return null;

  const colour = PRIORITY_COLOURS[card.priority] ?? PRIORITY_COLOURS.p4;
  const due = formatRelativeDue(card.due_date);

  return (
    <>
      <button type="button" className="bb-active" onClick={open} title="Click to change task">
        <span className="bb-active__row">
          <span className="bb-active__chip" style={{ backgroundColor: colour }}>
            {card.priority.toUpperCase()}
          </span>
          <span className="bb-active__title">{card.title}</span>
        </span>
        <span className="bb-active__meta">
          {card.project_name && (
            <span className="bb-active__project" style={{ color: card.project_color ?? undefined }}>
              {card.project_name}
            </span>
          )}
          {card.duration_minutes > 0 && (
            <span>
              · {card.duration_minutes}m{" "}
              {target != null
                ? `· ${progress}/${target}🍅`
                : `≈ ${card.estimated_pomodoros}🍅`}
            </span>
          )}
          {due && <span>· {due}</span>}
        </span>
      </button>
      <BusyBeeTaskPicker
        open={pickerOpen}
        selectedId={activeId}
        onPick={setActiveId}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}
