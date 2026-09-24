import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Card, Notice } from '../ui.jsx';
import { MistakeReview } from '../QuizFlow.jsx';

export default function ShareResults() {
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [reviewing, setReviewing] = useState(null); // attempt id
  const [detail, setDetail] = useState(null);
  const [mistakeIdx, setMistakeIdx] = useState(0);
  const [detailBusy, setDetailBusy] = useState(false);

  useEffect(() => {
    api
      .mcqShareResults()
      .then((res) => setResults(res.results))
      .catch((err) => setError(err.message || 'Could not load results.'));
  }, []);

  async function review(id) {
    setError(null);
    setDetailBusy(true);
    setReviewing(id);
    try {
      const res = await api.mcqShareResultDetail(id);
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
          {detail.takerName} · Grade {detail.grade} · {detail.subject}
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
      <h1>Shared test results</h1>
      <p className="sub">Everyone who has taken a test through one of your shared links.</p>

      {error && <Notice kind="error">{error}</Notice>}

      {!results ? (
        <div className="center-loading">Loading…</div>
      ) : results.length === 0 ? (
        <p className="muted">No one has taken a shared test yet.</p>
      ) : (
        <ul className="dep-list">
          {results.map((r) => {
            const pct = r.total ? Math.round((r.score / r.total) * 100) : 0;
            return (
              <li key={r.id}>
                <span>
                  <span className="dep-name">{r.takerName}</span>{' '}
                  <span className="dep-grade">
                    · Grade {r.grade} · {r.subject}
                    {r.chapterNo ? ` ch.${r.chapterNo}` : ''}
                  </span>
                </span>
                <span className="dep-actions">
                  <span className={`quiz-score ${r.score === r.total ? 'perfect' : ''}`}>
                    {r.score}/{r.total} ({pct}%)
                  </span>
                  <button
                    type="button"
                    className="btn-link"
                    disabled={detailBusy && reviewing === r.id}
                    onClick={() => review(r.id)}
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
