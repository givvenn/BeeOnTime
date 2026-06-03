// React hooks for BusyBee integration.
//
// `useBusyBeeStatus` owns the live "are we connected" state and exposes a
// refresh trigger for callers (Settings panel after Save, etc).
//
// `useActiveTaskId` persists the selected task id in localStorage so the
// Pomodoro app keeps focus across restarts. Components should subscribe
// here rather than pinning task id in their own state.
//
// `useTaskCard(id)` does the actual MCP fetch + tolerates rapid id swaps
// without flashing stale data.

import { useState, useEffect, useCallback } from "react";
import { busybee, type ConnectionStatus, type TaskCard } from "../lib/busybee";

const ACTIVE_TASK_KEY = "beeontime.busybee.activeTaskId";

export function useBusyBeeStatus() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const s = await busybee.getStatus();
      setStatus(s);
    } catch {
      setStatus({ configured: false, base_url: null, identity: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { status, loading, refresh };
}

export function useActiveTaskId(): [string | null, (id: string | null) => void] {
  const [id, setId] = useState<string | null>(() => {
    try { return localStorage.getItem(ACTIVE_TASK_KEY); }
    catch { return null; }
  });
  const set = useCallback((next: string | null) => {
    setId(next);
    try {
      if (next) localStorage.setItem(ACTIVE_TASK_KEY, next);
      else localStorage.removeItem(ACTIVE_TASK_KEY);
    } catch { /* localStorage disabled — keep in-memory only */ }
  }, []);
  return [id, set];
}

export function useTaskCard(taskId: string | null) {
  const [card, setCard] = useState<TaskCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!taskId) { setCard(null); setError(null); return; }
    setLoading(true);
    try {
      const c = await busybee.getTaskCard(taskId);
      setCard(c);
      setError(null);
    } catch (e: unknown) {
      setError(typeof e === "string" ? e : (e as Error)?.message ?? String(e));
      setCard(null);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    let cancelled = false;
    if (!taskId) { setCard(null); setError(null); return; }
    setLoading(true);
    busybee.getTaskCard(taskId)
      .then(c => { if (!cancelled) { setCard(c); setError(null); } })
      .catch(e => { if (!cancelled) setError(typeof e === "string" ? e : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [taskId]);

  return { card, error, loading, refresh };
}
