// Modal-style picker: lists open BusyBee tasks (in_progress + todo) and
// lets the user pick one to focus on. Caller passes the current `value`
// so the picker can show a "Clear selection" affordance.

import { useEffect, useState } from "react";
import { busybee, type TaskSummary, PRIORITY_COLOURS, formatRelativeDue } from "../../lib/busybee";

type Props = {
  open: boolean;
  selectedId: string | null;
  onPick: (id: string | null) => void;
  onClose: () => void;
};

export function BusyBeeTaskPicker({ open, selectedId, onPick, onClose }: Props) {
  const [tasks, setTasks] = useState<TaskSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setTasks(null);
    busybee.listOpenTasks(30)
      .then(list => { if (!cancelled) setTasks(list); })
      .catch(e => { if (!cancelled) setError(typeof e === "string" ? e : String(e)); });
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="bb-picker__overlay" onMouseDown={onClose}>
      <div className="bb-picker" onMouseDown={e => e.stopPropagation()}>
        <header className="bb-picker__header">
          <span>Choose a task</span>
          <button type="button" className="bb-picker__close" onClick={onClose} aria-label="Close">×</button>
        </header>

        {error && <div className="bb-picker__error">{error}</div>}
        {tasks === null && !error && <div className="bb-picker__loading">Loading…</div>}
        {tasks?.length === 0 && (
          <div className="bb-picker__empty">No open tasks in BusyBee right now.</div>
        )}

        <ul className="bb-picker__list">
          {selectedId && (
            <li className="bb-picker__item bb-picker__item--clear">
              <button type="button" onClick={() => { onPick(null); onClose(); }}>
                Clear current selection
              </button>
            </li>
          )}
          {tasks?.map(t => {
            const colour = PRIORITY_COLOURS[t.priority] ?? PRIORITY_COLOURS.p4;
            const due = formatRelativeDue(t.due_date);
            const isSelected = t.id === selectedId;
            return (
              <li key={t.id} className={`bb-picker__item${isSelected ? " is-selected" : ""}`}>
                <button type="button" onClick={() => { onPick(t.id); onClose(); }}>
                  <span className="bb-picker__chip" style={{ backgroundColor: colour }}>
                    {t.priority.toUpperCase()}
                  </span>
                  <span className="bb-picker__title">{t.title || "(untitled)"}</span>
                  <span className="bb-picker__meta">
                    {t.duration_minutes ? `${t.duration_minutes}m` : ""}
                    {due ? ` · ${due}` : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
