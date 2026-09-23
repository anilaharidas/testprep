import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { useAppConfig } from '../useAppConfig.js';
import { Card, Stepper, Notice, Field, PhoneInput, fullNumber } from '../ui.jsx';
import OtpStep from '../OtpStep.jsx';

export default function Forgot() {
  const cfg = useAppConfig();
  const nav = useNavigate();

  const [step, setStep] = useState(0);
  const [country, setCountry] = useState('+91');
  const [local, setLocal] = useState('');
  const [sendMeta, setSendMeta] = useState(null);
  const [manualUrl, setManualUrl] = useState(null);
  const [number, setNumber] = useState(null);
  const [token, setToken] = useState(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [noAccount, setNoAccount] = useState(false);
  // Manual mode only: number checked and confirmed to have an account, waiting
  // on the user to tap through to WhatsApp (a separate click, so it's never
  // opened for a number that turns out to have no account at all).
  const [awaitingWhatsapp, setAwaitingWhatsapp] = useState(false);

  async function checkAndSend(e) {
    e.preventDefault();
    // No WhatsApp popup here — we don't yet know this number has an account.
    // Only once the server confirms that (manual mode) do we show a button
    // that opens WhatsApp, as its own click gesture.
    setBusy(true);
    setError(null);
    setNoAccount(false);
    try {
      const res = await api.sendOtp(fullNumber(country, local), 'reset');
      setSendMeta(res);
      setNumber(res.whatsappNumber);
      if (res.whatsappUrl) setManualUrl(res.whatsappUrl);
      if (cfg?.otpMode === 'manual') {
        setAwaitingWhatsapp(true);
      } else {
        setStep(1);
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'no_account') {
        setNoAccount(true);
      } else {
        setError(err.message || 'Could not send the code.');
      }
    } finally {
      setBusy(false);
    }
  }

  function openWhatsAppAndContinue() {
    const url = manualUrl || cfg?.manualWhatsappUrl;
    if (url) window.open(url, '_blank', 'noopener');
    setStep(1);
  }

  async function submitPassword(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    const password = String(form.get('password') || '');
    const confirm = String(form.get('confirm') || '');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');

    setBusy(true);
    setError(null);
    try {
      await api.resetPassword(token, password);
      nav('/login', { replace: true, state: { reset: true } });
    } catch (err) {
      setError(err.message || 'Could not reset the password.');
      if (err instanceof ApiError && err.code === 'verification_invalid') {
        setTimeout(() => setStep(0), 1500);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Stepper count={3} current={step} />

      {step === 0 && !awaitingWhatsapp && (
        <form onSubmit={checkAndSend}>
          <h1>Reset your password</h1>
          <p className="sub">
            Enter the WhatsApp number on your account.{' '}
            {cfg?.otpMode === 'manual'
              ? "We'll check it, then open WhatsApp so you can request a code from us."
              : "We'll send a one-time code to verify it's you."}
          </p>
          {noAccount && (
            <Notice kind="info">
              No account found for this number.{' '}
              <Link className="btn-link" to="/register">
                Create one
              </Link>{' '}
              instead.
            </Notice>
          )}
          {error && <Notice kind="error">{error}</Notice>}
          <Field label="WhatsApp number">
            <PhoneInput
              country={country}
              setCountry={setCountry}
              local={local}
              setLocal={setLocal}
              disabled={busy}
            />
          </Field>
          <button className="btn" type="submit" disabled={busy || local.length < 6}>
            {busy ? 'Checking…' : cfg?.otpMode === 'manual' ? 'Continue' : 'Send code'}
          </button>
          <p className="foot-links">
            <Link to="/login">Back to login</Link>
          </p>
        </form>
      )}

      {step === 0 && awaitingWhatsapp && (
        <>
          <h1>Request your code</h1>
          <p className="sub">
            Account found for <strong>{number}</strong>. Tap below to open WhatsApp and send the
            request — nothing is sent until you do.
          </p>
          <button className="btn" type="button" onClick={openWhatsAppAndContinue}>
            Request code on WhatsApp
          </button>
          <div className="row-between" style={{ marginTop: 14 }}>
            <button type="button" className="btn ghost" onClick={() => setAwaitingWhatsapp(false)}>
              ← Change number
            </button>
          </div>
        </>
      )}

      {step === 1 && (
        <OtpStep
          whatsappNumber={number}
          purpose="reset"
          otpLength={cfg?.otpLength || 6}
          sendMeta={sendMeta}
          manual={cfg?.otpMode === 'manual'}
          whatsappUrl={manualUrl}
          onVerified={(t) => {
            setToken(t);
            setError(null);
            setStep(2);
          }}
          onBack={() => setStep(0)}
        />
      )}

      {step === 2 && (
        <form onSubmit={submitPassword}>
          <h1>Choose a new password</h1>
          <p className="sub">
            Identity confirmed for <strong>{number}</strong>. Setting a new password signs out other
            devices.
          </p>
          {error && <Notice kind="error">{error}</Notice>}
          <Field label="New password" hint="at least 8 characters">
            <input name="password" type="password" autoComplete="new-password" />
          </Field>
          <Field label="Confirm password">
            <input name="confirm" type="password" autoComplete="new-password" />
          </Field>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save new password'}
          </button>
        </form>
      )}
    </Card>
  );
}
