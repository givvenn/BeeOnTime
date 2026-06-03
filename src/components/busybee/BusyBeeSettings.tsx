// Settings panel: paste BusyBee URL + PAT, hit Connect, see identity.
// Render this inside the existing Settings overlay; it owns its own state
// and tells the caller-supplied `onConnected` callback after a successful
// connect so the parent can collapse / dismiss.

import { useState } from "react";
import { busybee } from "../../lib/busybee";
import { useBusyBeeStatus } from "../../hooks/useBusyBee";

type Props = {
  onConnected?: () => void;
};

export function BusyBeeSettings({ onConnected }: Props) {
  const { status, loading, refresh } = useBusyBeeStatus();
  const [url, setUrl] = useState("http://localhost:8000");
  const [pat, setPat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConnected = !!status?.identity;

  async function handleConnect() {
    setBusy(true); setError(null);
    try {
      const next = await busybee.setConfig(url, pat);
      if (!next.identity) {
        setError("Connected, but identity check failed — token may be revoked or expired.");
      } else {
        setPat("");
        onConnected?.();
      }
      await refresh();
    } catch (e: unknown) {
      setError(typeof e === "string" ? e : (e as Error)?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true); setError(null);
    try {
      await busybee.clearConfig();
      await refresh();
    } catch (e: unknown) {
      setError(typeof e === "string" ? e : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bb-settings">
      <div className="bb-settings__header">BusyBee</div>
      {loading ? (
        <div className="bb-settings__hint">Checking connection…</div>
      ) : isConnected ? (
        <>
          <div className="bb-settings__connected">
            <span className="bb-settings__dot" /> Connected as{" "}
            <strong>{status?.identity?.full_name || status?.identity?.email}</strong>
          </div>
          <div className="bb-settings__url">{status?.base_url}</div>
          <button
            type="button"
            className="bb-settings__btn bb-settings__btn--ghost"
            onClick={handleDisconnect}
            disabled={busy}
          >
            Disconnect
          </button>
        </>
      ) : (
        <>
          <label className="bb-settings__label">
            BusyBee URL
            <input
              className="bb-settings__input"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="http://localhost:8000"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
          </label>
          <label className="bb-settings__label">
            Personal Access Token
            <input
              className="bb-settings__input bb-settings__input--mono"
              type="password"
              value={pat}
              onChange={e => setPat(e.target.value)}
              placeholder="bb_mcp_…"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
          </label>
          <button
            type="button"
            className="bb-settings__btn"
            onClick={handleConnect}
            disabled={busy || !url.trim() || !pat.trim()}
          >
            {busy ? "Connecting…" : "Connect"}
          </button>
          <p className="bb-settings__help">
            Mint a token in BusyBee → Settings → API (scope&nbsp;<code>mcp:read</code>).
          </p>
        </>
      )}
      {error && <div className="bb-settings__error">{error}</div>}
    </div>
  );
}
