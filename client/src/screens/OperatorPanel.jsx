import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../api.js';

const POLL_MS = 4000;

export default function OperatorPanel() {
  const { slug } = useParams();
  const [authed, setAuthed] = useState(null); // null = checking
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [requests, setRequests] = useState([]);
  const [lastSync, setLastSync] = useState(null);
  const [muted, setMuted] = useState(false);
  const timer = useRef(null);
  const seenPending = useRef(null); // Set of pending ids; null until first load
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const load = useCallback(async () => {
    try {
      const res = await api.adminRequests();
      const pendingIds = res.requests.filter((r) => r.status === 'pending').map((r) => r.id);

      if (seenPending.current) {
        const fresh = pendingIds.filter((id) => !seenPending.current.has(id));
        if (fresh.length && !mutedRef.current) chime(fresh.length);
      }
      seenPending.current = new Set(pendingIds);

      document.title = pendingIds.length ? `(${pendingIds.length}) OTP queue` : 'OTP relay queue';
      setRequests(res.requests);
      setLastSync(new Date());
      setAuthed(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuthed(false);
        clearInterval(timer.current);
      }
    }
  }, []);

  useEffect(() => {
    api
      .adminSession()
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    if (authed !== true) return undefined;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [authed, load]);

  async function signIn(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.adminLogin(slug, password);
      setPassword('');
      setAuthed(true);
    } catch (err) {
      setError(err.message || 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await api.adminLogout().catch(() => {});
    setAuthed(false);
    setRequests([]);
  }

  if (authed === null) {
    return <div className="ops-wrap"><div className="ops-card">Loading…</div></div>;
  }

  if (!authed) {
    return (
      <div className="ops-wrap">
        <form className="ops-card" onSubmit={signIn}>
          <h1>Operator panel</h1>
          <p className="ops-muted">Enter the panel password to view incoming OTP requests.</p>
          {error && <div className="ops-error">{error}</div>}
          <input
            type="password"
            autoFocus
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="ops-btn" type="submit" disabled={busy || !password}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
        </form>
      </div>
    );
  }

  const pending = requests.filter((r) => r.status === 'pending');

  return (
    <div className="ops-wrap">
      <div className="ops-card ops-wide">
        <div className="ops-head">
          <div>
            <h1>OTP relay queue</h1>
            <p className="ops-muted">
              {pending.length} waiting ·{' '}
              {lastSync ? `synced ${lastSync.toLocaleTimeString()}` : 'syncing…'} · auto-refresh 4s
            </p>
          </div>
          <div className="ops-head-actions">
            <button
              className="ops-btn ghost"
              onClick={() => {
                setMuted((m) => !m);
                if (muted) chime(1); // was muted, now unmuting → confirm sound
              }}
              title={muted ? 'Sound off' : 'Sound on'}
            >
              {muted ? '🔇' : '🔔'}
            </button>
            <button className="ops-btn ghost" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>

        {requests.length === 0 ? (
          <p className="ops-muted">No requests in the last 3 hours.</p>
        ) : (
          <ul className="ops-list">
            {requests.map((r) => (
              <Row key={r.id} r={r} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Row({ r }) {
  const digits = r.number.replace(/\D/g, '');
  const replyText = `Your Test Prep verification code is ${r.code}. It expires in 5 minutes. Do not share it.`;
  const replyUrl = `https://wa.me/${digits}?text=${encodeURIComponent(replyText)}`;
  const expiresInMin = Math.max(0, Math.round((new Date(r.expiresAt) - Date.now()) / 60000));

  return (
    <li className={`ops-row ${r.status}`}>
      <div className="ops-row-main">
        <span className="ops-num">{r.number}</span>
        <span className={`ops-badge ${r.purpose}`}>{r.purpose}</span>
        <span className={`ops-status ${r.status}`}>{r.status}</span>
      </div>
      <div className="ops-row-side">
        {r.code ? <span className="ops-code">{r.code}</span> : <span className="ops-muted">auto-sent</span>}
        <span className="ops-muted">
          {r.status === 'pending' ? `expires in ${expiresInMin}m` : timeAgo(r.requestedAt)}
          {r.attempts > 0 ? ` · ${r.attempts} wrong` : ''}
        </span>
        {r.code && r.status === 'pending' && (
          <a className="ops-btn sm" href={replyUrl} target="_blank" rel="noreferrer">
            Reply on WhatsApp
          </a>
        )}
      </div>
    </li>
  );
}

function timeAgo(iso) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

let audioCtx;
function chime(times = 1) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < Math.min(times, 3); i += 1) {
      const t0 = audioCtx.currentTime + i * 0.22;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, t0);
      osc.frequency.setValueAtTime(1175, t0 + 0.09);
      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.2);
    }
  } catch {
    /* audio unavailable */
  }
}
