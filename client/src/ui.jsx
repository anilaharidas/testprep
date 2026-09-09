import { useEffect, useRef, useState } from 'react';

export function Shell({ children }) {
  return (
    <div className="app-shell">
      <div className="brand-row">
        <span className="brand-mark">TP</span>
        <span>Test Prep</span>
      </div>
      {children}
    </div>
  );
}

export function Card({ children }) {
  return <div className="card">{children}</div>;
}

export function Stepper({ count, current }) {
  return (
    <div className="stepper" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className={i < current ? 'done' : i === current ? 'active' : ''} />
      ))}
    </div>
  );
}

export function Notice({ kind = 'info', children }) {
  if (!children) return null;
  return <div className={`notice ${kind}`}>{children}</div>;
}

export function DevCodeNotice({ code }) {
  if (!code) return null;
  return (
    <div className="notice dev">
      <span>Dev mode — WhatsApp code:</span>
      <b>{code}</b>
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      {label} {hint && <span className="hint">· {hint}</span>}
      {children}
    </label>
  );
}

const COUNTRY_CODES = [
  { code: '+91', label: '🇮🇳 +91' },
  { code: '+1', label: '🇺🇸 +1' },
  { code: '+44', label: '🇬🇧 +44' },
  { code: '+61', label: '🇦🇺 +61' },
  { code: '+971', label: '🇦🇪 +971' },
  { code: '+65', label: '🇸🇬 +65' },
];

export function PhoneInput({ country, setCountry, local, setLocal, disabled }) {
  return (
    <div className="phone-input">
      <select value={country} onChange={(e) => setCountry(e.target.value)} disabled={disabled}>
        {COUNTRY_CODES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.label}
          </option>
        ))}
      </select>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder="WhatsApp number"
        value={local}
        disabled={disabled}
        onChange={(e) => setLocal(e.target.value.replace(/[^\d]/g, ''))}
      />
    </div>
  );
}

export const fullNumber = (country, local) => `${country}${local}`;

export function OtpField({ value, onChange, length = 6, disabled }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <input
      ref={ref}
      className="otp-input"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={length}
      placeholder={'0'.repeat(length)}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, '').slice(0, length))}
    />
  );
}

/** Live countdown; calls onDone once when it hits zero. Returns seconds left. */
export function useCountdown(targetIso) {
  const [left, setLeft] = useState(() => secondsUntil(targetIso));
  useEffect(() => {
    setLeft(secondsUntil(targetIso));
    if (!targetIso) return undefined;
    const t = setInterval(() => {
      const s = secondsUntil(targetIso);
      setLeft(s);
      if (s <= 0) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [targetIso]);
  return Math.max(0, left);
}

function secondsUntil(iso) {
  if (!iso) return 0;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 1000);
}

export function friendlyLockTime(iso) {
  const mins = Math.ceil((new Date(iso).getTime() - Date.now()) / 60000);
  if (mins <= 1) return 'about a minute';
  if (mins < 60) return `${mins} minutes`;
  return `${Math.ceil(mins / 60)} hour(s)`;
}
