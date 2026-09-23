import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useAppConfig } from '../useAppConfig.js';
import {
  Card,
  Stepper,
  Notice,
  Field,
  PhoneInput,
  fullNumber,
} from '../ui.jsx';
import OtpStep from '../OtpStep.jsx';
import DependentForm from '../DependentForm.jsx';

const STEPS = 5;

export default function Register() {
  const cfg = useAppConfig();
  const { refresh } = useAuth();
  const nav = useNavigate();

  const [step, setStep] = useState(0);
  const [role, setRole] = useState(null);
  const [country, setCountry] = useState('+91');
  const [local, setLocal] = useState('');
  const [sendMeta, setSendMeta] = useState(null);
  const [manualUrl, setManualUrl] = useState(null);
  const [verifiedNumber, setVerifiedNumber] = useState(null);
  const [verificationToken, setVerificationToken] = useState(null);
  const [account, setLocalAccount] = useState(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [numberTaken, setNumberTaken] = useState(false);
  // Manual mode only: number checked and confirmed available, waiting on the
  // user to tap through to WhatsApp (a separate click, so it's never opened
  // for a number that turns out to already have an account).
  const [awaitingWhatsapp, setAwaitingWhatsapp] = useState(false);

  if (!cfg) {
    return (
      <Card>
        <div className="center-loading">Loading…</div>
      </Card>
    );
  }

  const roleMeta = cfg.roles.find((r) => r.role === role);
  const number = fullNumber(country, local);

  async function checkAndSend(e) {
    e.preventDefault();
    // No WhatsApp popup here — we don't yet know the number is free. Only once
    // the server confirms that (manual mode) do we show a button that opens
    // WhatsApp, as its own click gesture.
    setBusy(true);
    setError(null);
    setNumberTaken(false);
    try {
      const res = await api.sendOtp(number, 'register');
      setSendMeta(res);
      setVerifiedNumber(res.whatsappNumber);
      if (res.whatsappUrl) setManualUrl(res.whatsappUrl);
      if (cfg.otpMode === 'manual') {
        setAwaitingWhatsapp(true);
      } else {
        setStep(2);
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'number_taken') {
        setNumberTaken(true);
      } else {
        setError(err.message || 'Could not send the code.');
      }
    } finally {
      setBusy(false);
    }
  }

  function openWhatsAppAndContinue() {
    const url = manualUrl || cfg.manualWhatsappUrl;
    if (url) window.open(url, '_blank', 'noopener');
    setStep(2);
  }

  async function submitProfile(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    const name = String(form.get('name') || '').trim();
    const password = String(form.get('password') || '');
    const confirm = String(form.get('confirm') || '');

    if (name.length < 2) return setError('Enter your name.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');

    setBusy(true);
    setError(null);
    try {
      const res = await api.register({ verificationToken, role, name, password });
      setLocalAccount(res.account);
      setStep(4);
    } catch (err) {
      setError(err.message || 'Could not create the account.');
      if (err instanceof ApiError && (err.code === 'number_taken' || err.code === 'verification_invalid')) {
        // Verification consumed / number now taken — send them to login.
        setTimeout(() => nav('/login'), 1500);
      }
    } finally {
      setBusy(false);
    }
  }

  async function addDependent(name, grade) {
    const res = await api.addDependent(name, grade);
    setLocalAccount(res.account);
  }

  async function finish() {
    await refresh();
    nav('/dashboard', { replace: true });
  }

  return (
    <Card>
      <Stepper count={STEPS} current={step} />

      {/* Step 0 — role */}
      {step === 0 && (
        <>
          <h1>Who is this account for?</h1>
          <p className="sub">
            This is permanent — there's no role switch later. Pick the one that matches how you'll
            use the app.
          </p>
          <div className="choice-grid">
            {cfg.roles.map((r) => (
              <button
                key={r.role}
                type="button"
                className={`choice ${role === r.role ? 'selected' : ''}`}
                onClick={() => setRole(r.role)}
              >
                <div className="choice-title">{r.role === 'parent' ? 'Parent' : 'Teacher'}</div>
                <div className="choice-desc">
                  Add up to {r.cap} {r.dependentLabelPlural} as profiles under your account.
                </div>
              </button>
            ))}
          </div>
          <div style={{ height: 8 }} />
          <button className="btn" disabled={!role} onClick={() => setStep(1)}>
            Continue
          </button>
          <p className="foot-links">
            Already registered? <Link to="/login">Log in</Link>
          </p>
        </>
      )}

      {/* Step 1 — phone */}
      {step === 1 && !awaitingWhatsapp && (
        <form onSubmit={checkAndSend}>
          <h1>Your WhatsApp number</h1>
          <p className="sub">
            This is your permanent login ID.{' '}
            {cfg.otpMode === 'manual'
              ? "We'll check it's available, then open WhatsApp so you can request a code from us."
              : "We'll send a one-time code to confirm it's yours."}
          </p>

          {numberTaken && (
            <Notice kind="info">
              This number already has an account.{' '}
              <Link className="btn-link" to="/login">
                Log in
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
            {busy ? 'Checking…' : cfg.otpMode === 'manual' ? 'Continue' : 'Send code'}
          </button>
          <div className="row-between" style={{ marginTop: 14 }}>
            <button type="button" className="btn ghost" onClick={() => setStep(0)}>
              ← Back
            </button>
          </div>
        </form>
      )}

      {/* Step 1b — manual mode only: number confirmed free, ready to open WhatsApp */}
      {step === 1 && awaitingWhatsapp && (
        <>
          <h1>Request your code</h1>
          <p className="sub">
            <strong>{verifiedNumber}</strong> is available. Tap below to open WhatsApp and send the
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

      {/* Step 2 — OTP */}
      {step === 2 && (
        <OtpStep
          whatsappNumber={verifiedNumber}
          purpose="register"
          otpLength={cfg.otpLength}
          sendMeta={sendMeta}
          manual={cfg.otpMode === 'manual'}
          whatsappUrl={manualUrl}
          onVerified={(token) => {
            setVerificationToken(token);
            setError(null);
            setStep(3);
          }}
          onBack={() => setStep(1)}
        />
      )}

      {/* Step 3 — name + password */}
      {step === 3 && (
        <form onSubmit={submitProfile}>
          <h1>Set up your login</h1>
          <p className="sub">
            Number verified: <strong>{verifiedNumber}</strong>. Your password is what you'll use for
            everyday sign-in.
          </p>
          {error && <Notice kind="error">{error}</Notice>}
          <Field label="Your name">
            <input name="name" autoComplete="name" placeholder="First and last name" />
          </Field>
          <Field label="Password" hint="at least 8 characters">
            <input name="password" type="password" autoComplete="new-password" />
          </Field>
          <Field label="Confirm password">
            <input name="confirm" type="password" autoComplete="new-password" />
          </Field>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </form>
      )}

      {/* Step 4 — dependents add-loop */}
      {step === 4 && account && (
        <>
          <h1>
            Add {account.dependentLabelPlural}
            <span style={{ marginLeft: 8 }} className="pill">
              {account.dependents.length} / {account.cap}
            </span>
          </h1>
          <p className="sub">
            Each one needs just a name and grade. You can also skip this and add them later from your
            dashboard.
          </p>

          {account.dependents.length > 0 && (
            <ul className="dep-list">
              {account.dependents.map((d) => (
                <li key={d.id}>
                  <span className="dep-name">{d.name}</span>
                  <span className="dep-grade">Grade {d.grade}</span>
                </li>
              ))}
            </ul>
          )}

          {account.canAddDependent ? (
            <DependentForm
              grades={cfg.grades}
              label={cap(account.dependentLabel)}
              onAdd={addDependent}
              submitText={`Add ${account.dependentLabel}`}
            />
          ) : (
            <Notice kind="info">
              Free plan supports up to {account.cap} {account.dependentLabelPlural}. You've added them
              all — existing profiles stay fully usable.
            </Notice>
          )}

          <div className="divider" />
          <button className="btn" onClick={finish}>
            Go to dashboard
          </button>
        </>
      )}
    </Card>
  );
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
