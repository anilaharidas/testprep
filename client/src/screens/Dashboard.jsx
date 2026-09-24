import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useAppConfig } from '../useAppConfig.js';
import { Card, Notice } from '../ui.jsx';
import OtpStep from '../OtpStep.jsx';

export default function Dashboard() {
  const { account, setAccount, logout } = useAuth();
  const cfg = useAppConfig();
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifySendMeta, setVerifySendMeta] = useState(null);

  if (!account) return null;

  async function shareLink() {
    setError(null);
    setSharing(true);
    try {
      const { token } = await api.mcqShareLink();
      const url = `${window.location.origin}/share/${token}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      setError(err.message || 'Could not create the link.');
    } finally {
      setSharing(false);
    }
  }

  async function startVerify() {
    setError(null);
    try {
      // Open WhatsApp synchronously, inside the click — no ambiguity to check
      // first here (unlike registration), this account is already known to
      // need verifying.
      if (cfg?.otpMode === 'manual' && cfg.manualWhatsappUrl) {
        window.open(cfg.manualWhatsappUrl, '_blank', 'noopener');
      }
      const res = await api.verifyPhoneSend();
      setVerifySendMeta(res);
      setVerifying(true);
    } catch (err) {
      setError(err.message || 'Could not send the code.');
    }
  }

  if (verifying) {
    return (
      <Card>
        <OtpStep
          whatsappNumber={account.whatsappNumber}
          otpLength={cfg?.otpLength || 6}
          sendMeta={verifySendMeta}
          manual={cfg?.otpMode === 'manual'}
          whatsappUrl={verifySendMeta?.whatsappUrl}
          onSend={() => api.verifyPhoneSend()}
          onVerify={(code) => api.verifyPhoneConfirm(code)}
          onVerified={(res) => {
            setAccount(res.account);
            setVerifying(false);
          }}
          onBack={() => setVerifying(false)}
        />
      </Card>
    );
  }

  return (
    <Card>
      <div className="dashboard-head">
        <div>
          <h1 style={{ marginBottom: 2 }}>{account.name}</h1>
        </div>
        <button className="btn ghost" onClick={logout}>
          Log out
        </button>
      </div>
      <p className="sub" style={{ marginTop: 12 }}>
        {account.whatsappNumber} · joined {new Date(account.createdAt + 'Z').toLocaleDateString()}
      </p>

      {!account.phoneVerified && (
        <Notice kind="warn">
          Verification pending.{' '}
          <button type="button" className="btn-link" onClick={startVerify}>
            Verify now
          </button>
        </Notice>
      )}

      {error && <Notice kind="error">{error}</Notice>}

      <div className="divider" />

      <Link className="btn" to="/practice">
        Practice now
      </Link>
      <div style={{ height: 8 }} />
      <button className="btn secondary" type="button" onClick={shareLink} disabled={sharing}>
        {copied ? 'Copied!' : sharing ? 'Creating link…' : 'Share test link'}
      </button>
      <p className="count-line" style={{ marginTop: 6 }}>
        Good for up to 4 completed tests. Share it however you like — WhatsApp, SMS, email.
      </p>

      <div className="divider" />
      <Link className="btn-link" to="/results">
        Shared test results →
      </Link>
    </Card>
  );
}
