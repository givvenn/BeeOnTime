// Compact "currently focusing on" banner. Render this above the timer.
//
// Self-contained: owns the picker state, persists the chosen task id via
// useActiveTaskId, and renders a friendly placeholder when nothing is
// selected. The host App passes the current Pomodoro work-minutes so we can
// compute "how many pomodoros for this task" and the live progress counter,
// so the banner reads "1/3 🍅" instead of just an estimate.

import { useState, useEffect } from "react";
import { PRIORITY_COLOURS, formatRelativeDue } from "../../lib/busybee";
import { useActiveTaskId, useTaskCard, useBusyBeeStatus } from "../../hooks/useBusyBee";
import { BusyBeeTaskPicker } from "./BusyBeeTaskPicker";

type Props = {
  /** Current Pomodoro work-phase length (minutes), used to compute target. */
  workMinutes: number;
  /** Push the recomputed target up to useTimer; null clears it. */
  onTargetChange: (target: number | null) => void;
  /** Completed pomodoros for the active task so far this session. */
  progress: number;
  /** Total pomodoros expected for the active task (null = no task). */
  target: number | null;
};

export function BusyBeeActiveTask({ workMinutes, onTargetChange, progress, target }: Props) {
  const { status } = useBusyBeeStatus();
  const [activeId, setActiveId] = useActiveTaskId();
  const { card, error, loading } = useTaskCard(activeId);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Recompute the target whenever the active card or workMinutes changes.
  // A null card (no selection / pre-fetch) clears the target so the timer
  // falls back to standard manual chaining.
  useEffect(() => {
    if (!card || !card.duration_minutes || workMinutes <= 0) {
      onTargetChange(null);
      return;
    }
    onTargetChange(Math.max(1, Math.ceil(card.duration_minutes / workMinutes)));
  }, [card, workMinutes, onTargetChange]);

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
