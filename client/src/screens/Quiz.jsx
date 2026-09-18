import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Card, Notice } from '../ui.jsx';

const COUNT_OPTIONS = [5, 10, 15, 20];

export default function Quiz() {
  const { dependentId } = useParams();
  const nav = useNavigate();
  const { account } = useAuth();
  const dependent = account?.dependents.find((d) => String(d.id) === dependentId);

  const [step, setStep] = useState('setup'); // setup | quiz | result
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [subjects, setSubjects] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [history, setHistory] = useState([]);
  const [subject, setSubject] = useState('');
  // Index into `chapters`, not the chapter number — the same number (e.g. "1")
  // can label more than one chapter within a grade+subject, so the number alone
  // doesn't identify which one was picked.
  const [chapterIdx, setChapterIdx] = useState('');
  const [count, setCount] = useState(10);
  const selectedChapter = chapterIdx === '' ? null : chapters[Number(chapterIdx)];

  const [quiz, setQuiz] = useState(null);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([api.mcqSubjects(dependentId), api.mcqAttempts(dependentId)])
      .then(([subRes, histRes]) => {
        if (cancelled) return;
        setSubjects(subRes.subjects);
        setHistory(histRes.attempts);
        if (subRes.subjects.length) setSubject(subRes.subjects[0].subject);
      })
      .catch((err) => !cancelled && setError(err.message || 'Could not load subjects.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [dependentId]);

  useEffect(() => {
    if (!subject) return;
    setChapterIdx('');
    api
      .mcqChapters(dependentId, subject)
      .then((res) => setChapters(res.chapters))
      .catch(() => setChapters([]));
  }, [dependentId, subject]);

  async function startQuiz(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.mcqStartQuiz(
        dependentId,
        subject,
        selectedChapter?.chapterNo,
        selectedChapter?.chapter,
        count,
      );
      setQuiz(res);
      setCurrent(0);
      setAnswers({});
      setResult(null);
      setStep('quiz');
    } catch (err) {
      setError(err.message || 'Could not start the quiz.');
    } finally {
      setBusy(false);
    }
  }

  function selectAnswer(questionId, letter) {
    setAnswers((a) => ({ ...a, [questionId]: letter }));
  }

  async function submitQuiz() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.mcqGradeQuiz(dependentId, quiz.subject, quiz.chapterNo, answers);
      setResult(res);
      setStep('result');
      const hist = await api.mcqAttempts(dependentId).catch(() => null);
      if (hist) setHistory(hist.attempts);
    } catch (err) {
      setError(err.message || 'Could not submit the quiz.');
    } finally {
      setBusy(false);
    }
  }

  function practiceAgain() {
    setStep('setup');
    setQuiz(null);
    setResult(null);
  }

  if (loading) {
    return (
      <Card>
        <div className="center-loading">Loading…</div>
      </Card>
    );
  }

  if (!subjects.length) {
    return (
      <Card>
        <h1>No questions yet</h1>
        <p className="sub">
          {error || "There's no question bank loaded for this grade yet."}
        </p>
        <Link className="btn-link" to="/dashboard">
          ← Back to dashboard
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      {step === 'setup' && (
        <form onSubmit={startQuiz}>
          <h1>Practice quiz</h1>
          <p className="sub">
            {dependent ? `${dependent.name} · Grade ${dependent.grade}` : 'Grade practice'}
          </p>

          {error && <Notice kind="error">{error}</Notice>}

          <label className="field">
            Subject
            <select value={subject} onChange={(e) => setSubject(e.target.value)}>
              {subjects.map((s) => (
                <option key={s.subject} value={s.subject}>
                  {s.subject} ({s.count})
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            Chapter
            <select value={chapterIdx} onChange={(e) => setChapterIdx(e.target.value)}>
              <option value="">All chapters</option>
              {chapters.map((c, i) => (
                <option key={`${c.chapterNo}-${c.chapter}`} value={i}>
                  {c.chapterNo ? `${c.chapterNo}. ` : ''}
                  {c.chapter} ({c.count})
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            Number of questions
            <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {COUNT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} questions
                </option>
              ))}
            </select>
          </label>

          <button className="btn" type="submit" disabled={busy || !subject}>
            {busy ? 'Starting…' : 'Start quiz'}
          </button>

          {history.length > 0 && (
            <>
              <div className="divider" />
              <p className="count-line" style={{ marginBottom: 8 }}>
                Recent practice
              </p>
              <ul className="quiz-history">
                {history.slice(0, 5).map((h) => (
                  <li key={h.id}>
                    <span>
                      {h.subject}
                      {h.chapterNo ? ` · ch. ${h.chapterNo}` : ''}
                    </span>
                    <span className={`quiz-score ${h.score === h.total ? 'perfect' : ''}`}>
                      {h.score}/{h.total}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="foot-links">
            <Link to="/dashboard">← Back to dashboard</Link>
          </p>
        </form>
      )}

      {step === 'quiz' && quiz && (
        <QuizRunner
          quiz={quiz}
          current={current}
          setCurrent={setCurrent}
          answers={answers}
          selectAnswer={selectAnswer}
          onSubmit={submitQuiz}
          busy={busy}
          error={error}
        />
      )}

      {step === 'result' && result && (
        <QuizResult result={result} dependentName={quiz.dependentName} onRetry={practiceAgain} nav={nav} />
      )}
    </Card>
  );
}

function QuizRunner({ quiz, current, setCurrent, answers, selectAnswer, onSubmit, busy, error }) {
  const q = quiz.questions[current];
  const total = quiz.questions.length;
  const answeredCount = Object.keys(answers).length;
  const isLast = current === total - 1;
  const selected = answers[q.id];

  return (
    <div>
      <div className="stepper" aria-hidden>
        {quiz.questions.map((qq, i) => (
          <span
            key={qq.id}
            className={i < current ? 'done' : i === current ? 'active' : answers[qq.id] ? 'done' : ''}
          />
        ))}
      </div>
      <p className="count-line">
        Question {current + 1} of {total} · {quiz.subject}
        {q.chapter ? ` · ${q.chapter}` : ''}
      </p>

      {error && <Notice kind="error">{error}</Notice>}

      <h1 className="quiz-question">{q.question}</h1>

      <div className="quiz-options">
        {Object.entries(q.options).map(([letter, text]) => (
          <button
            type="button"
            key={letter}
            className={`quiz-option ${selected === letter ? 'selected' : ''}`}
            onClick={() => selectAnswer(q.id, letter)}
          >
            <span className="quiz-option-letter">{letter}</span>
            <span>{text}</span>
          </button>
        ))}
      </div>

      <div className="row-between" style={{ marginTop: 18 }}>
        <button
          type="button"
          className="btn ghost"
          disabled={current === 0}
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
        >
          ← Previous
        </button>
        {isLast ? (
          <button
            type="button"
            className="btn"
            style={{ width: 'auto' }}
            disabled={busy || answeredCount < total}
            onClick={onSubmit}
            title={answeredCount < total ? 'Answer every question to submit' : ''}
          >
            {busy ? 'Submitting…' : `Submit (${answeredCount}/${total} answered)`}
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            style={{ width: 'auto' }}
            onClick={() => setCurrent((c) => Math.min(total - 1, c + 1))}
          >
            Next →
          </button>
        )}
      </div>
    </div>
  );
}

function QuizResult({ result, dependentName, onRetry, nav }) {
  const pct = Math.round((result.score / result.total) * 100);
  return (
    <div>
      <h1>Quiz results</h1>
      <div className="quiz-score-banner">
        <div className="quiz-score-big">
          {result.score}/{result.total}
        </div>
        <div className="muted">
          {dependentName} scored {pct}%
        </div>
      </div>

      <ul className="quiz-review">
        {result.results.map((r, i) => (
          <li key={r.id} className={r.isCorrect ? 'correct' : 'incorrect'}>
            <p className="quiz-review-q">
              {i + 1}. {r.question}
            </p>
            {Object.entries(r.options).map(([letter, text]) => {
              const isCorrectOpt = letter === r.correct;
              const isSelectedOpt = letter === r.selected;
              const cls = isCorrectOpt ? 'right' : isSelectedOpt ? 'wrong' : '';
              return (
                <p key={letter} className={`quiz-review-opt ${cls}`}>
                  <span className="quiz-option-letter">{letter}</span> {text}
                  {isCorrectOpt ? ' ✓' : isSelectedOpt ? ' ✗' : ''}
                </p>
              );
            })}
          </li>
        ))}
      </ul>

      <div className="row-between" style={{ marginTop: 8 }}>
        <button type="button" className="btn secondary" onClick={onRetry}>
          Practice again
        </button>
        <button type="button" className="btn" style={{ width: 'auto' }} onClick={() => nav('/dashboard')}>
          Back to dashboard
        </button>
      </div>
    </div>
  );
}
