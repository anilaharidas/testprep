import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { useAuth } from '../auth.jsx';
import {
  Card,
  Notice,
  Field,
  PhoneInput,
  fullNumber,
  useCountdown,
  friendlyLockTime,
} from '../ui.jsx';

export default function Login() {
  const { setAccount } = useAuth();
  const nav = useNavigate();
  const justReset = useLocation().state?.reset;

  const [country, setCountry] = useState('+91');
  const [local, setLocal] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showForgot, setShowForgot] = useState(false);
  const [noAccount, setNoAccount] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState(null);
  const [lockedUntil, setLockedUntil] = useState(null);

  const lockLeft = useCountdown(lockedUntil);
  const locked = lockLeft > 0;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNoAccount(false);
    setAttemptsLeft(null);
    try {
      const res = await api.login(fullNumber(country, local), password);
      setAccount(res.account);
      nav('/dashboard', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setShowForgot(Boolean(err.data.forgotPassword));
        setNoAccount(Boolean(err.data.register));
        if (typeof err.data.attemptsLeft === 'number') setAttemptsLeft(err.data.attemptsLeft);
        if (err.data.lockedUntil) setLockedUntil(err.data.lockedUntil);
      } else {
        setError('Network error. Try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h1>Log in</h1>
      <p className="sub">
        Use your WhatsApp number and the password you set at sign-up. No code needed for everyday
        login.
      </p>

      {justReset && !error && (
        <Notice kind="info">Password updated. Log in with your new password.</Notice>
      )}

      {locked ? (
        <Notice kind="warn">
          Too many attempts. Try again in {friendlyLockTime(lockedUntil)}, or{' '}
          <Link to="/forgot">reset your password</Link>.
        </Notice>
      ) : (
        error && (
          <Notice kind="error">
            {error}
            {noAccount && (
              <>
                {' '}
                <Link to="/register">Create an account</Link>.
              </>
            )}
            {showForgot && (
              <>
                {' '}
                <Link to="/forgot">Forgot password?</Link>
              </>
            )}
          </Notice>
        )
      )}

      {attemptsLeft != null && !locked && (
        <Notice kind="warn">
          {attemptsLeft} attempt{attemptsLeft === 1 ? '' : 's'} left before a temporary lock.
        </Notice>
      )}

      <form onSubmit={submit}>
        <Field label="WhatsApp number">
          <PhoneInput
            country={country}
            setCountry={setCountry}
            local={local}
            setLocal={setLocal}
            disabled={busy}
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
        </Field>
        <button className="btn" type="submit" disabled={busy || local.length < 6 || !password}>
          {busy ? 'Signing in…' : 'Log in'}
        </button>
      </form>

      <p className="foot-links">
        <Link to="/forgot">Forgot password?</Link> · New here?{' '}
        <Link to="/register">Create an account</Link>
      </p>
    </Card>
  );
}
