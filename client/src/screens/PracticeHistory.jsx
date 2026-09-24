import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Card, Notice } from '../ui.jsx';
import { MistakeReview } from '../QuizFlow.jsx';

export default function PracticeHistory() {
  const [attempts, setAttempts] = useState(null);
  const [error, setError] = useState(null);
  const [reviewing, setReviewing] = useState(null); // attempt id
  const [detail, setDetail] = useState(null);
  const [mistakeIdx, setMistakeIdx] = useState(0);
  const [detailBusy, setDetailBusy] = useState(false);

  useEffect(() => {
    api
      .mcqAttempts()
      .then((res) => setAttempts(res.attempts))
      .catch((err) => setError(err.message || 'Could not load your practice history.'));
  }, []);

  async function review(id) {
    setError(null);
    setDetailBusy(true);
    setReviewing(id);
    try {
      const res = await api.mcqAttemptDetail(id);
      setDetail(res);
      setMistakeIdx(0);
    } catch (err) {
      setError(err.message || 'Could not load that attempt.');
      setReviewing(null);
    } finally {
      setDetailBusy(false);
    }
  }

  if (reviewing && detail) {
    return (
      <Card>
        <p className="quiz-breadcrumb">
          Grade {detail.grade} · {detail.subject}
        </p>
        <MistakeReview
          result={detail}
          mistakeIdx={mistakeIdx}
          setMistakeIdx={setMistakeIdx}
          onBack={() => {
            setReviewing(null);
            setDetail(null);
          }}
        />
      </Card>
    );
  }

  return (
    <Card>
      <h1>Practice history</h1>
      <p className="sub">Tests you've taken yourself with Practice now.</p>

      {error && <Notice kind="error">{error}</Notice>}

      {!attempts ? (
        <div className="center-loading">Loading…</div>
      ) : attempts.length === 0 ? (
        <p className="muted">No practice tests yet — take one from Practice now.</p>
      ) : (
        <ul className="dep-list">
          {attempts.map((a) => {
            const pct = a.total ? Math.round((a.score / a.total) * 100) : 0;
            return (
              <li key={a.id}>
                <span>
                  <span className="dep-name">
                    Grade {a.grade} · {a.subject}
                  </span>{' '}
                  <span className="dep-grade">
                    {a.chapterNo ? `ch.${a.chapterNo}` : ''}
                  </span>
                </span>
                <span className="dep-actions">
                  <span className={`quiz-score ${a.score === a.total ? 'perfect' : ''}`}>
                    {a.score}/{a.total} ({pct}%)
                  </span>
                  <button
                    type="button"
                    className="btn-link"
                    disabled={detailBusy && reviewing === a.id}
                    onClick={() => review(a.id)}
                  >
                    Review
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="divider" />
      <Link className="btn-link" to="/dashboard">
        ← Back to dashboard
      </Link>
    </Card>
  );
}
