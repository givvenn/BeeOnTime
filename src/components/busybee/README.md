# BusyBee integration

Read-only V1: lets BeeOnTime show "what task am I focusing on" pulled from
a BusyBee instance via MCP + PAT. PAT lives in the OS keychain (macOS
Keychain, Windows Credential Manager, Linux Secret Service), the base URL
lives in the app data dir.

## Where things live

- `src-tauri/src/busybee.rs` — Rust MCP client + Tauri commands.
- `src-tauri/src/lib.rs` — registers commands + `BusyBeeState`.
- `src-tauri/Cargo.toml` — extra deps: `reqwest`, `keyring`, `thiserror`.
- `src/lib/busybee.ts` — TS wrapper around the Tauri commands + small
  formatting helpers (`PRIORITY_COLOURS`, `formatRelativeDue`).
- `src/hooks/useBusyBee.ts` — `useBusyBeeStatus`, `useActiveTaskId`,
  `useTaskCard` hooks.
- `src/components/busybee/` — `BusyBeeSettings`, `BusyBeeTaskPicker`,
  `BusyBeeActiveTask` + scoped CSS.

## Wiring it into BeeOnTime

Two small additions in your existing UI — neither file is touched yet, so
do whichever order suits you.

### 1. Connect screen — inside Settings overlay

`src/components/Settings.tsx`, somewhere in the settings body:

```tsx
import { BusyBeeSettings } from "./busybee";

// ...
<BusyBeeSettings />
```

### 2. Active task banner — above the timer

`src/App.tsx`, just above `<TimerDisplay />`:

```tsx
import { BusyBeeActiveTask } from "./components/busybee";

// ...
<BusyBeeActiveTask />
<TimerDisplay … />
```

The banner hides itself entirely when BusyBee isn't configured, so it has
zero visual cost until you connect.

## First-time use

1. Run `cargo build` in `src-tauri/` (downloads the new deps once).
2. Start BeeOnTime as usual (`npm run tauri dev`).
3. Open Settings, paste your BusyBee URL + a PAT (mint at BusyBee Settings
   → API, scope `mcp:read`).
4. Click Connect; you should see *"Connected as Your Name"* + the URL.
5. Click the placeholder banner above the timer → pick a task. The chosen
   id is persisted in `localStorage`, so it survives app restarts.

## What you get on the card

`get_task` + `get_project` on the BusyBee side, mapped to:

- `title`, `description`
- `priority` (with colour chip)
- `status`
- `duration_minutes` + `estimated_pomodoros` (= `ceil(duration / 25)`)
- `due_date` rendered relatively (`overdue 3d`, `due today`, `due in 5d`)
- `project_name` + `project_color`
- `subtasks` (id / title / done)

## V2 — write-back focus sessions (not done yet)

When BusyBee gets `start_focus_session` / `end_focus_session` /
`get_active_focus_session` MCP tools (designed in
`busybee_react/docs/mcp-team-visibility-2026-06-01.md` and the staged
Pomodoro plan), add three Tauri commands here that wrap them, then:

- Call `bb_start_focus_session(taskId, plannedSeconds)` from the timer
  `start` action.
- Call `bb_end_focus_session(sessionId, completed)` from `complete` and
  `cancel`.
- Optionally drive `BusyBeeActiveTask` from `bb_get_active_focus_session`
  rather than the `localStorage` pointer so two BeeOnTime windows on
  different machines stay in sync.

That's the only path that doesn't already work today.
