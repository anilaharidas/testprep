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

const STEPS = 3;

export default function Register() {
  const cfg = useAppConfig();
  const { refresh } = useAuth();
  const nav = useNavigate();

  const [step, setStep] = useState(0);
  const [country, setCountry] = useState('+91');
  const [local, setLocal] = useState('');
  const [sendMeta, setSendMeta] = useState(null);
  const [manualUrl, setManualUrl] = useState(null);
  const [verifiedNumber, setVerifiedNumber] = useState(null);
  const [verificationToken, setVerificationToken] = useState(null);
  const [deferVerification, setDeferVerification] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [numberTaken, setNumberTaken] = useState(false);
  // Number checked and confirmed available — waiting on the user to choose
  // Verify now / Verify later.
  const [choosingVerify, setChoosingVerify] = useState(false);
  // Verify now, manual mode only: OTP already sent, waiting on the user to
  // tap through to WhatsApp (its own click, so the popup is never blocked and
  // never opened before we know it's actually wanted).
  const [awaitingWhatsapp, setAwaitingWhatsapp] = useState(false);

  if (!cfg) {
    return (
      <Card>
        <div className="center-loading">Loading…</div>
      </Card>
    );
  }

  const number = fullNumber(country, local);

  // Step 0: availability check only — no OTP challenge created yet, so
  // choosing "Verify later" next generates no OTP activity at all.
  async function checkNumber(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNumberTaken(false);
    try {
      const res = await api.checkNumber(number, 'register');
      setVerifiedNumber(res.whatsappNumber);
      setChoosingVerify(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'number_taken') {
        setNumberTaken(true);
      } else {
        setError(err.message || 'Could not check that number.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function chooseVerifyNow() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.sendOtp(verifiedNumber, 'register');
      setSendMeta(res);
      if (res.whatsappUrl) setManualUrl(res.whatsappUrl);
      setChoosingVerify(false);
      if (cfg.otpMode === 'manual') {
        setAwaitingWhatsapp(true);
      } else {
        setStep(1);
      }
    } catch (err) {
      setError(err.message || 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  }

  function chooseVerifyLater() {
    setDeferVerification(true);
    setChoosingVerify(false);
    setStep(2);
  }

  function openWhatsAppAndContinue() {
    const url = manualUrl || cfg.manualWhatsappUrl;
    if (url) window.open(url, '_blank', 'noopener');
    setStep(1);
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
      if (deferVerification) {
        await api.registerUnverified({ name, password, whatsappNumber: verifiedNumber });
      } else {
        await api.register({ verificationToken, name, password });
      }
      await refresh();
      nav('/dashboard', { replace: true });
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

  return (
    <Card>
      <Stepper count={STEPS} current={step} />

      {/* Step 0 — phone */}
      {step === 0 && !choosingVerify && !awaitingWhatsapp && (
        <form onSubmit={checkNumber}>
          <h1>Your WhatsApp number</h1>
          <p className="sub">
            This is your permanent login ID. We'll check it's available, then you can choose when to
            verify it.
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
            {busy ? 'Checking…' : 'Continue'}
          </button>
          <p className="foot-links">
            Already registered? <Link to="/login">Log in</Link>
          </p>
        </form>
      )}

      {/* Step 0b — number confirmed free: choose when to verify */}
      {step === 0 && choosingVerify && (
        <>
          <h1>When would you like to verify?</h1>
          <p className="sub">
            <strong>{verifiedNumber}</strong> is available.
          </p>
          {error && <Notice kind="error">{error}</Notice>}

          <button className="btn" type="button" disabled={busy} onClick={chooseVerifyNow}>
            {busy ? 'Sending…' : 'Verify now'}
          </button>
          <p className="count-line" style={{ marginTop: 6, marginBottom: 16 }}>
            Request a code on WhatsApp and verify right away.
          </p>

          <button className="btn secondary" type="button" disabled={busy} onClick={chooseVerifyLater}>
            Verify later
          </button>
          <p className="count-line" style={{ marginTop: 6 }}>
            Set your password now and start using the app — verify your number anytime from the
            dashboard.
          </p>

          <div className="row-between" style={{ marginTop: 14 }}>
            <button type="button" className="btn ghost" onClick={() => setChoosingVerify(false)} disabled={busy}>
              ← Change number
            </button>
          </div>
        </>
      )}

      {/* Step 0c — Verify now, manual mode: code already sent, ready to open WhatsApp */}
      {step === 0 && awaitingWhatsapp && (
        <>
          <h1>Request your code</h1>
          <p className="sub">
            Tap below to open WhatsApp and send the request — nothing is sent until you do.
          </p>
          <button className="btn" type="button" onClick={openWhatsAppAndContinue}>
            Request code on WhatsApp
          </button>
          <div className="row-between" style={{ marginTop: 14 }}>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setAwaitingWhatsapp(false);
                setChoosingVerify(true);
              }}
            >
              ← Back
            </button>
          </div>
        </>
      )}

      {/* Step 1 — OTP */}
      {step === 1 && (
        <OtpStep
          whatsappNumber={verifiedNumber}
          otpLength={cfg.otpLength}
          sendMeta={sendMeta}
          manual={cfg.otpMode === 'manual'}
          whatsappUrl={manualUrl}
          onSend={() => api.sendOtp(verifiedNumber, 'register')}
          onVerify={(code) => api.verifyOtp(verifiedNumber, code, 'register')}
          onVerified={(res) => {
            setVerificationToken(res.verificationToken);
            setError(null);
            setStep(2);
          }}
          onBack={() => setStep(0)}
        />
      )}

      {/* Step 2 — name + password */}
      {step === 2 && (
        <form onSubmit={submitProfile}>
          <h1>Set up your login</h1>
          <p className="sub">
            {deferVerification ? (
              <>
                Number: <strong>{verifiedNumber}</strong>. You can verify it anytime from the
                dashboard.
              </>
            ) : (
              <>
                Number verified: <strong>{verifiedNumber}</strong>.
              </>
            )}{' '}
            Your password is what you'll use for everyday sign-in.
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
    </Card>
  );
}
