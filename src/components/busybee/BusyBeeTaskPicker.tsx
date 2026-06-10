// Modal-style picker: lists open BusyBee tasks (in_progress + todo) and
// lets the user pick one to focus on. Caller passes the current `value`
// so the picker can show a "Clear selection" affordance.
//
// Refresh behavior: every picker open triggers a fresh fetch. The user can
// also re-fetch explicitly via the ↻ button in the header, and the picker
// auto-refetches when the BeeOnTime window regains focus while it's open
// (covers the "switch to BusyBee web, create task, switch back" flow).

import { useCallback, useEffect, useMemo, useState } from "react";
import { busybee, type TaskSummary, PRIORITY_COLOURS, formatRelativeDue } from "../../lib/busybee";

// Diacritics- and case-insensitive normalisation so "spisat" matches
// "Spísať nápady". NFD splits combining marks off the base letters, then
// the regex strips the marks themselves.
function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

type Props = {
  open: boolean;
  selectedId: string | null;
  onPick: (id: string | null) => void;
  onClose: () => void;
};

export function BusyBeeTaskPicker({ open, selectedId, onPick, onClose }: Props) {
  const [tasks, setTasks] = useState<TaskSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  // Reset the search box every time the picker closes so reopening always
  // starts from a clean slate.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Client-side filter — runs against whatever the last fetch returned, so
  // it's instant. If the typed-for task isn't in `tasks` at all, the user
  // sees the "no matches" state and knows to hit refresh / check status.
  const filtered = useMemo(() => {
    if (!tasks) return null;
    const q = normalize(query.trim());
    if (!q) return tasks;
    return tasks.filter(t => normalize(t.title || "").includes(q));
  }, [tasks, query]);

  // Single fetch path shared by the on-open effect, the refresh button, and
  // the focus listener. `resetView` controls whether we clear the visible
  // list (initial open → yes, so "Loading…" shows; refresh → no, so the
  // existing list stays put under the spinner).
  const fetchTasks = useCallback(async (resetView: boolean) => {
    if (resetView) setTasks(null);
    setError(null);
    setRefreshing(true);
    try {
      const list = await busybee.listOpenTasks(50);
      setTasks(list);
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Initial fetch when the picker opens.
  useEffect(() => {
    if (!open) return;
    void fetchTasks(true);
  }, [open, fetchTasks]);

  // Auto-refresh when the window regains focus while the picker is open —
  // most common scenario: user switched to BusyBee web, created a task,
  // switched back to BeeOnTime, expects to see it without clicking refresh.
  useEffect(() => {
    if (!open) return;
    const onFocus = () => { void fetchTasks(false); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [open, fetchTasks]);

  if (!open) return null;

  return (
    <div className="bb-picker__overlay" onMouseDown={onClose}>
      <div className="bb-picker" onMouseDown={e => e.stopPropagation()}>
        <header className="bb-picker__header">
          <span>Choose a task</span>
          <div className="bb-picker__header-actions">
            <button
              type="button"
              className="bb-picker__refresh"
              onClick={() => void fetchTasks(false)}
              disabled={refreshing}
              aria-label="Refresh"
              title="Refresh list"
            >
              <span className={refreshing ? "bb-picker__refresh-icon is-spinning" : "bb-picker__refresh-icon"}>↻</span>
            </button>
            <button type="button" className="bb-picker__close" onClick={onClose} aria-label="Close">×</button>
          </div>
        </header>

        <div className="bb-picker__search">
          <input
            type="text"
            placeholder="Search by title…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        {error && <div className="bb-picker__error">{error}</div>}
        {tasks === null && !error && <div className="bb-picker__loading">Loading…</div>}
        {tasks && tasks.length === 0 && (
          <div className="bb-picker__empty">No open tasks in BusyBee right now.</div>
        )}
        {tasks && tasks.length > 0 && filtered && filtered.length === 0 && (
          <div className="bb-picker__empty">No matches for &ldquo;{query.trim()}&rdquo;.</div>
        )}

        <ul className="bb-picker__list">
          {selectedId && (
            <li className="bb-picker__item bb-picker__item--clear">
              <button type="button" onClick={() => { onPick(null); onClose(); }}>
                Clear current selection
              </button>
            </li>
          )}
          {filtered?.map(t => {
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
