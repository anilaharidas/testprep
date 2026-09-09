import { useState } from 'react';
import { api, ApiError } from './api.js';
import { useAppConfig } from './useAppConfig.js';
import {
  Notice,
  DevCodeNotice,
  OtpField,
  useCountdown,
  friendlyLockTime,
} from './ui.jsx';

/**
 * Shared OTP entry step for registration and password reset.
 *
 * Props:
 *   whatsappNumber  - normalized number the code was sent to
 *   purpose         - 'register' | 'reset'
 *   otpLength       - digits expected
 *   sendMeta        - result of the initial /otp/send call
 *   manual          - true when the operator relays the code by hand
 *   whatsappUrl     - wa.me link from /otp/send (manual mode); a static fallback
 *                     also comes from /config
 *   onVerified(token)
 *   onBack()
 */
export default function OtpStep({
  whatsappNumber,
  purpose,
  otpLength,
  sendMeta,
  manual = false,
  whatsappUrl = null,
  onVerified,
  onBack,
}) {
  const cfg = useAppConfig();
  const [meta, setMeta] = useState(sendMeta);
  const [waUrl, setWaUrl] = useState(whatsappUrl);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [attemptsLeft, setAttemptsLeft] = useState(null);
  const [lockedUntil, setLockedUntil] = useState(null);

  const resendIn = useCountdown(meta?.resendAvailableAt);
  const expiresIn = useCountdown(meta?.expiresAt);
  const lockLeft = useCountdown(lockedUntil);
  const locked = lockLeft > 0;

  const openWhatsApp = () => {
    const url = waUrl || cfg?.manualWhatsappUrl;
    if (url) window.open(url, '_blank', 'noopener');
  };

  async function verify(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.verifyOtp(whatsappNumber, code, purpose);
      onVerified(res.verificationToken);
    } catch (err) {
      handle(err);
    } finally {
      setBusy(false);
    }
  }

  // Ask the server for a genuinely new code (cooldown-gated). Not the same as
  // just re-opening WhatsApp.
  async function requestNewCode() {
    if (manual) openWhatsApp(); // sync, before the await
    setBusy(true);
    setError(null);
    setAttemptsLeft(null);
    try {
      const res = await api.sendOtp(whatsappNumber, purpose);
      setMeta(res);
      setCode('');
      setLockedUntil(null);
      if (res.whatsappUrl) setWaUrl(res.whatsappUrl);
      if (!manual && res.whatsappUrl) window.open(res.whatsappUrl, '_blank', 'noopener');
    } catch (err) {
      handle(err);
    } finally {
      setBusy(false);
    }
  }

  function handle(err) {
    if (err instanceof ApiError) {
      setError(err.message);
      if (typeof err.data.attemptsLeft === 'number') setAttemptsLeft(err.data.attemptsLeft);
      if (err.data.lockedUntil) setLockedUntil(err.data.lockedUntil);
      if (err.data.retryAt) setMeta((m) => ({ ...m, resendAvailableAt: err.data.retryAt }));
    } else {
      setError('Network error. Try again.');
    }
  }

  return (
    <form onSubmit={verify}>
      <h1>Enter the code</h1>
      {manual ? (
        <p className="sub">
          Send us the WhatsApp message we opened for you — we'll reply to{' '}
          <strong>{whatsappNumber}</strong> with a {otpLength}-digit code. Enter it below.
        </p>
      ) : (
        <p className="sub">
          We sent a {otpLength}-digit code over WhatsApp to <strong>{whatsappNumber}</strong>.
        </p>
      )}

      <DevCodeNotice code={meta?.devCode} />

      {manual && (
        <Notice kind="info">
          WhatsApp didn't open, or you closed it?{' '}
          <button type="button" className="btn-link" onClick={openWhatsApp}>
            Open the chat again
          </button>{' '}
          and send the message — nothing is sent until you do.
        </Notice>
      )}

      {locked && (
        <Notice kind="warn">
          This code is locked after too many wrong attempts. Wait {friendlyLockTime(lockedUntil)}, or
          get a fresh code below{resendIn > 0 ? ` (in ${resendIn}s)` : ''}.
        </Notice>
      )}

      {error && <Notice kind="error">{error}</Notice>}

      {attemptsLeft != null && !locked && (
        <Notice kind="warn">
          {attemptsLeft} attempt{attemptsLeft === 1 ? '' : 's'} left before this code is locked.
        </Notice>
      )}

      <OtpField value={code} onChange={setCode} length={otpLength} disabled={busy || locked} />

      <p className="count-line">
        {expiresIn > 0
          ? `Code expires in ${formatMMSS(expiresIn)}.`
          : 'Code expired — get a new one below.'}
      </p>

      {locked ? (
        <button
          type="button"
          className="btn"
          onClick={requestNewCode}
          disabled={busy || resendIn > 0}
        >
          {busy ? 'Working…' : resendIn > 0 ? `Get a new code in ${resendIn}s` : 'Get a new code'}
        </button>
      ) : (
        <button className="btn" type="submit" disabled={busy || code.length !== otpLength}>
          {busy ? 'Checking…' : 'Verify'}
        </button>
      )}

      {manual && !locked && (
        <button
          type="button"
          className="btn secondary"
          style={{ marginTop: 10 }}
          onClick={openWhatsApp}
          disabled={busy}
        >
          Open WhatsApp again
        </button>
      )}

      <div className="row-between" style={{ marginTop: 14 }}>
        <button type="button" className="btn ghost" onClick={onBack} disabled={busy}>
          ← Change number
        </button>
        {!locked && (
          <button
            type="button"
            className="btn-link"
            onClick={requestNewCode}
            disabled={busy || resendIn > 0}
          >
            {resendIn > 0
              ? `New code in ${resendIn}s`
              : manual
                ? 'Code not working? Get a new one'
                : 'Resend code'}
          </button>
        )}
      </div>
    </form>
  );
}

function formatMMSS(total) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
