import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useAppConfig } from '../useAppConfig.js';
import { Card, Notice } from '../ui.jsx';
import OtpStep from '../OtpStep.jsx';
import QuizFlow from '../QuizFlow.jsx';

export default function Dashboard() {
  const { account, setAccount, logout } = useAuth();
  const cfg = useAppConfig();
  const [error, setError] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verifySendMeta, setVerifySendMeta] = useState(null);

  if (!account) return null;

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

  if (!cfg) {
    return (
      <Card>
        <div className="center-loading">Loading…</div>
      </Card>
    );
  }

  const headerSlot = (
    <>
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
      <div className="row-between">
        <Link className="btn-link" to="/history">
          Practice history →
        </Link>
        <Link className="btn-link" to="/results">
          Shared test results →
        </Link>
      </div>
      <div className="divider" />
    </>
  );

  return (
    <QuizFlow
      title={account.name}
      backLink={null}
      grades={cfg.grades}
      headerSlot={headerSlot}
      calls={{
        subjects: (grade) => api.mcqSubjects(grade),
        chapters: (grade, subject) => api.mcqChapters(grade, subject),
        sections: (grade, subject, chapterNo, chapter) => api.mcqSections(grade, subject, chapterNo, chapter),
        difficulty: (grade, subject, chapterNo, chapter, sectionNumbers) =>
          api.mcqDifficulty(grade, subject, chapterNo, chapter, sectionNumbers),
        startQuiz: (grade, subject, chapterNo, chapter, sectionNumbers, difficulty) =>
          api.mcqStartQuiz(grade, subject, chapterNo, chapter, sectionNumbers, difficulty),
        gradeQuiz: (grade, subject, chapterNo, questionIds, answers) =>
          api.mcqGradeQuiz(grade, subject, chapterNo, questionIds, answers),
        attempts: () => api.mcqAttempts(),
        shareLink: (selection) => api.mcqShareLink(selection),
      }}
    />
  );
}
