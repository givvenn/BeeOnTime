// Thin TypeScript wrapper around the Rust-side BusyBee MCP commands.
//
// Why: keep PAT + raw MCP transport out of the renderer. Components see
// plain typed structs; the Rust side speaks HTTP, owns the Keychain entry,
// and does the JSON-RPC envelope parsing.
//
// Tauri 2 invoke arg-key convention: a Rust parameter `task_id: String`
// is called from TS with `{ taskId }`. snake_case → camelCase mapping is
// implicit, so don't pass `task_id` — it won't bind.

import { invoke } from "@tauri-apps/api/core";

export type TaskSummary = {
  id: string;
  title: string;
  priority: "p1" | "p2" | "p3" | "p4" | string;
  status: string;
  duration_minutes: number;
  due_date: string | null;
  project_id: string | null;
};

export type SubtaskSummary = {
  id: string;
  title: string;
  done: boolean;
};

export type TaskCard = {
  id: string;
  title: string;
  description: string | null;
  priority: "p1" | "p2" | "p3" | "p4" | string;
  status: string;
  duration_minutes: number;
  estimated_pomodoros: number;
  due_date: string | null;
  project_name: string | null;
  project_color: string | null;
  subtasks: SubtaskSummary[];
};

export type WhoAmI = {
  email: string;
  full_name: string | null;
};

export type ConnectionStatus = {
  configured: boolean;
  base_url: string | null;
  identity: WhoAmI | null;
};

export const busybee = {
  setConfig: (baseUrl: string, pat: string) =>
    invoke<ConnectionStatus>("bb_set_config", { baseUrl, pat }),

  clearConfig: () => invoke<void>("bb_clear_config"),

  getStatus: () => invoke<ConnectionStatus>("bb_get_status"),

  listOpenTasks: (limit?: number) =>
    invoke<TaskSummary[]>("bb_list_open_tasks", { limit: limit ?? null }),

  getTaskCard: (taskId: string) =>
    invoke<TaskCard>("bb_get_task_card", { taskId }),
};

// ─── Local helpers shared by UI ──────────────────────────────────────

export const PRIORITY_COLOURS: Record<string, string> = {
  p1: "#ef4444", // red
  p2: "#f59e0b", // amber
  p3: "#06b6d4", // cyan
  p4: "#6b7280", // grey
};

export function formatRelativeDue(iso: string | null): string {
  if (!iso) return "";
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return iso;
  const now = Date.now();
  const ms = due.getTime() - now;
  const days = Math.round(ms / (1000 * 60 * 60 * 24));
  if (days < 0) return `overdue ${Math.abs(days)}d`;
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  if (days < 7) return `due in ${days}d`;
  return `due in ${days}d`;
}
