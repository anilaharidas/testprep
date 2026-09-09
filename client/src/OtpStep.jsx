import { useState } from 'react';
import { api, ApiError } from './api.js';
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
 *   whatsappUrl     - wa.me link to (re)open the operator chat (manual mode)
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

  async function resend() {
    setBusy(true);
    setError(null);
    setAttemptsLeft(null);
    try {
      const res = await api.sendOtp(whatsappNumber, purpose);
      setMeta(res);
      setCode('');
      setLockedUntil(null);
      if (res.whatsappUrl) {
        setWaUrl(res.whatsappUrl);
        window.open(res.whatsappUrl, '_blank', 'noopener');
      }
    } catch (err) {
      handle(err);
    } finally {
      setBusy(false);
    }
  }

  function openWhatsApp() {
    if (waUrl) window.open(waUrl, '_blank', 'noopener');
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

  const resendLabel = manual ? 'Open WhatsApp again' : 'Resend code';

  return (
    <form onSubmit={verify}>
      <h1>Enter the code</h1>
      {manual ? (
        <p className="sub">
          We've opened WhatsApp so you can message us from <strong>{whatsappNumber}</strong>. Send
          that message — we'll reply with a {otpLength}-digit code. Enter it below.
        </p>
      ) : (
        <p className="sub">
          We sent a {otpLength}-digit code over WhatsApp to <strong>{whatsappNumber}</strong>.
        </p>
      )}

      <DevCodeNotice code={meta?.devCode} />

      {manual && (
        <Notice kind="info">
          Didn't see WhatsApp open?{' '}
          <button type="button" className="btn-link" onClick={openWhatsApp}>
            Open the chat
          </button>{' '}
          and send us the message.
        </Notice>
      )}

      {locked && (
        <Notice kind="warn">
          This code is locked after too many wrong attempts. Wait {friendlyLockTime(lockedUntil)}, or
          {manual ? ' message us again' : ' get a fresh code'} with the button below
          {resendIn > 0 ? ` (available in ${resendIn}s)` : ''}.
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
          : `Code expired — ${manual ? 'message us again' : 'resend'} to get a new one.`}
      </p>

      {locked ? (
        <button type="button" className="btn" onClick={resend} disabled={busy || resendIn > 0}>
          {busy
            ? 'Working…'
            : resendIn > 0
              ? `Try again in ${resendIn}s`
              : manual
                ? 'Message us again'
                : 'Resend a new code'}
        </button>
      ) : (
        <button className="btn" type="submit" disabled={busy || code.length !== otpLength}>
          {busy ? 'Checking…' : 'Verify'}
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
            onClick={resend}
            disabled={busy || resendIn > 0}
          >
            {resendIn > 0 ? `${manual ? 'Wait' : 'Resend in'} ${resendIn}s` : resendLabel}
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
