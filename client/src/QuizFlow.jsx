import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Notice } from './ui.jsx';

// Keep in sync with QUIZ_LEN in server/worker/mcq/service.js — a practice
// test is at most this many questions, so the preview shouldn't promise more
// than buildQuiz will actually serve.
const QUIZ_LEN = 10;

/**
 * The whole grade -> subject -> chapter -> section -> difficulty -> preview ->
 * quiz -> result -> review flow, shared by the authenticated dashboard
 * (screens/Dashboard.jsx, embedded directly — it IS the practice flow, with an
 * account header shown only on the landing step) and the public shared-link
 * screen (screens/SharedQuiz.jsx). Those two only differ in *where the API
 * calls go* — a logged-in session vs. a share token — so this component takes
 * that as props instead of knowing about either. There's no stored profile to
 * read a grade from, so picking one is always the first step (unless
 * `fixedSelection` skips straight to the quiz).
 *
 * @param {string} title - breadcrumb header (e.g. account name, or the typed taker name)
 * @param {string|null} backLink - route to link "← Back to dashboard" to, or null
 *   to hide that link (the public flow has no dashboard to go back to)
 * @param {string[]} grades - selectable grades for the first step
 * @param {object} calls - { subjects, chapters, sections, difficulty, startQuiz,
 *   gradeQuiz, attempts?, shareLink? }, each (bar attempts/shareLink) taking
 *   `grade` as its first argument. `attempts` is optional — omit it to hide the
 *   recent-practice list (the public share flow has no self-history to show).
 *   `shareLink(selection)` is optional — omit it to hide the "Share test link"
 *   button at the preview step (the public share flow can't mint its own links).
 * @param {React.ReactNode} [headerSlot] - rendered above "Choose a grade" on the
 *   landing step only (e.g. account name/logout/verification, used when this
 *   flow doubles as the dashboard).
 * @param {object} [fixedSelection] - { grade, subject, chapterNo, chapter,
 *   sectionNumbers, difficulty }. When set, all selection steps are skipped —
 *   the quiz starts immediately with this exact selection (a pre-configured
 *   share link, where the taker doesn't pick anything).
 */
export default function QuizFlow({ title, backLink, grades, calls, headerSlot, fixedSelection }) {
  // step: grade -> subject -> chapter -> section (skippable) -> difficulty ->
  //       preview -> quiz -> result -> review (fixedSelection skips straight
  //       from 'loading' to 'quiz')
  const [step, setStep] = useState(fixedSelection ? 'loading' : 'grade');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const [grade, setGrade] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [history, setHistory] = useState([]);
  const [subject, setSubject] = useState('');

  const [chapters, setChapters] = useState([]);
  const [chapterFilter, setChapterFilter] = useState('');
  const [chapterIdx, setChapterIdx] = useState(''); // index into `chapters`
  const chosenChapter = chapterIdx === '' ? null : chapters[Number(chapterIdx)];

  const [sections, setSections] = useState([]);
  const [sectionNumbers, setSectionNumbers] = useState([]); // selected, [] = all

  const [levels, setLevels] = useState([]);
  const [difficulty, setDifficulty] = useState(null);

  const [quiz, setQuiz] = useState(null);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  const [result, setResult] = useState(null);
  const [mistakeIdx, setMistakeIdx] = useState(0);

  // ---- initial load: recent history, if this caller has any -------------

  useEffect(() => {
    if (!calls.attempts) return;
    let cancelled = false;
    calls
      .attempts()
      .then((res) => !cancelled && setHistory(res.attempts))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- fixed-selection auto-start (pre-configured share link) -----------

  useEffect(() => {
    if (!fixedSelection) return;
    const { grade: g, subject: s, chapterNo, chapter, sectionNumbers: secs = [], difficulty: d } = fixedSelection;
    setGrade(g);
    setSubject(s);
    setChapters([{ chapterNo, chapter }]);
    setChapterIdx('0');
    setSectionNumbers(secs);
    setDifficulty(d);
    setBusy(true);
    setError(null);
    calls
      .startQuiz(g, s, chapterNo, chapter, secs, d)
      .then((res) => {
        setQuiz(res);
        setCurrent(0);
        setAnswers({});
        setResult(null);
        setStep('quiz');
      })
      .catch((err) => setError(err.message || 'Could not start the test.'))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- step transitions --------------------------------------------------

  function pickGrade(g) {
    setBusy(true);
    setError(null);
    calls
      .subjects(g)
      .then((res) => {
        setGrade(g);
        setSubjects(res.subjects);
        setStep('subject');
      })
      .catch((err) => setError(err.message || 'Could not load subjects.'))
      .finally(() => setBusy(false));
  }

  function pickSubject(s) {
    setSubject(s);
    setChapterFilter('');
    setChapterIdx('');
    setBusy(true);
    setError(null);
    calls
      .chapters(grade, s)
      .then((res) => {
        setChapters(res.chapters);
        setStep('chapter');
      })
      .catch((err) => setError(err.message || 'Could not load chapters.'))
      .finally(() => setBusy(false));
  }

  function pickChapter(idx) {
    setChapterIdx(idx);
    const ch = chapters[Number(idx)];
    setBusy(true);
    setError(null);
    calls
      .sections(grade, subject, ch.chapterNo, ch.chapter)
      .then((res) => {
        if (res.sections.length <= 1) {
          // Nothing meaningful to choose — go straight to difficulty.
          setSections(res.sections);
          setSectionNumbers([]);
          loadDifficulty(ch, []);
        } else {
          setSections(res.sections);
          setSectionNumbers([]);
          setStep('section');
        }
      })
      .catch((err) => setError(err.message || 'Could not load sections.'))
      .finally(() => setBusy(false));
  }

  function toggleSection(num) {
    setSectionNumbers((prev) => (prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num]));
  }

  function continueFromSections() {
    loadDifficulty(chosenChapter, sectionNumbers);
  }

  function loadDifficulty(ch, secs) {
    setBusy(true);
    setError(null);
    setDifficulty(null);
    calls
      .difficulty(grade, subject, ch.chapterNo, ch.chapter, secs)
      .then((res) => {
        setLevels(res.levels);
        setStep('difficulty');
      })
      .catch((err) => setError(err.message || 'Could not load difficulty levels.'))
      .finally(() => setBusy(false));
  }

  function goPreview() {
    setStep('preview');
  }

  async function beginTest() {
    setBusy(true);
    setError(null);
    try {
      const res = await calls.startQuiz(
        grade,
        subject,
        chosenChapter.chapterNo,
        chosenChapter.chapter,
        sectionNumbers,
        difficulty,
      );
      setQuiz(res);
      setCurrent(0);
      setAnswers({});
      setResult(null);
      setStep('quiz');
    } catch (err) {
      setError(err.message || 'Could not start the test.');
    } finally {
      setBusy(false);
    }
  }

  function selectAnswer(questionId, letter) {
    setAnswers((a) => ({ ...a, [questionId]: letter }));
  }

  async function doSubmit() {
    setConfirmSubmit(false);
    setBusy(true);
    setError(null);
    try {
      const res = await calls.gradeQuiz(
        grade,
        quiz.subject,
        quiz.chapterNo,
        quiz.questions.map((q) => q.id),
        answers,
      );
      setResult(res);
      setMistakeIdx(0);
      setStep('result');
      if (calls.attempts) {
        const hist = await calls.attempts().catch(() => null);
        if (hist) setHistory(hist.attempts);
      }
    } catch (err) {
      setError(err.message || 'Could not submit the test.');
    } finally {
      setBusy(false);
    }
  }

  function requestSubmit() {
    const unanswered = quiz.questions.length - Object.keys(answers).length;
    if (unanswered > 0) setConfirmSubmit(true);
    else doSubmit();
  }

  async function practiceAgain() {
    setBusy(true);
    setError(null);
    try {
      const res = await calls.startQuiz(
        grade,
        subject,
        chosenChapter.chapterNo,
        chosenChapter.chapter,
        sectionNumbers,
        difficulty,
      );
      setQuiz(res);
      setCurrent(0);
      setAnswers({});
      setResult(null);
      setStep('quiz');
    } catch (err) {
      setError(err.message || 'Could not start a new test.');
    } finally {
      setBusy(false);
    }
  }

  async function shareLink() {
    if (!calls.shareLink || !chosenChapter) return;
    setError(null);
    setSharing(true);
    try {
      const { token } = await calls.shareLink({
        grade,
        subject,
        chapterNo: chosenChapter.chapterNo,
        chapter: chosenChapter.chapter,
        sectionNumbers,
        difficulty,
      });
      const url = `${window.location.origin}/share/${token}`;
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1500);
    } catch (err) {
      setError(err.message || 'Could not create the link.');
    } finally {
      setSharing(false);
    }
  }

  function chooseAnotherSection() {
    if (sections.length > 1) {
      setSectionNumbers([]);
      setStep('section');
    } else {
      setStep('difficulty');
    }
  }

  function changeSelection() {
    setSubject('');
    setChapterIdx('');
    setChapterFilter('');
    setSections([]);
    setSectionNumbers([]);
    setLevels([]);
    setDifficulty(null);
    setStep('subject');
  }

  // ---- render -------------------------------------------------------------

  const filteredChapters = chapters
    .map((c, i) => ({ ...c, idx: i }))
    .filter((c) => c.chapter.toLowerCase().includes(chapterFilter.toLowerCase()));

  return (
    <Card>
      {headerSlot && step === 'grade' && headerSlot}

      {step !== 'quiz' && step !== 'review' && step !== 'grade' && step !== 'loading' && (
        <p className="quiz-breadcrumb">
          {title}
          {grade ? ` · Grade ${grade}` : ''}
          {subject ? ` · ${subject}` : ''}
          {chosenChapter ? ` · ${chosenChapter.chapterNo ? `${chosenChapter.chapterNo}. ` : ''}${chosenChapter.chapter}` : ''}
        </p>
      )}

      {error && <Notice kind="error">{error}</Notice>}

      {step === 'loading' && <div className="center-loading">Preparing your test…</div>}

      {step === 'grade' && (
        <>
          <h1>Choose a grade</h1>
          <div className="choice-grid">
            {grades.map((g) => (
              <button key={g} type="button" className="choice" disabled={busy} onClick={() => pickGrade(g)}>
                <div className="choice-title">Grade {g}</div>
              </button>
            ))}
          </div>
          {backLink && (
            <p className="foot-links">
              <Link to={backLink}>← Back to dashboard</Link>
            </p>
          )}
        </>
      )}

      {step === 'subject' && (
        <>
          <h1>Choose a subject</h1>
          {subjects.length === 0 && <p className="muted">No questions available for this grade yet.</p>}
          <div className="choice-grid">
            {subjects.map((s) => (
              <button
                key={s.subject}
                type="button"
                className="choice"
                disabled={busy}
                onClick={() => pickSubject(s.subject)}
              >
                <div className="choice-title">{s.subject}</div>
              </button>
            ))}
          </div>

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
            <button type="button" className="btn-link" onClick={() => setStep('grade')}>
              ← Change grade
            </button>
          </p>
        </>
      )}

      {step === 'chapter' && (
        <>
          <h1>Choose a chapter</h1>
          <input
            className="quiz-search"
            placeholder="Search chapters…"
            value={chapterFilter}
            onChange={(e) => setChapterFilter(e.target.value)}
          />
          <div className="quiz-radio-list">
            {filteredChapters.map((c) => (
              <label key={`${c.chapterNo}-${c.chapter}`} className="quiz-radio-row">
                <input
                  type="radio"
                  name="chapter"
                  checked={chapterIdx === String(c.idx)}
                  disabled={busy}
                  onChange={() => pickChapter(String(c.idx))}
                />
                <span className="quiz-radio-label">
                  {c.chapterNo ? `${c.chapterNo}. ` : ''}
                  {c.chapter}
                </span>
              </label>
            ))}
            {filteredChapters.length === 0 && <p className="muted">No chapters match "{chapterFilter}".</p>}
          </div>
          <button type="button" className="btn ghost" onClick={() => setStep('subject')} disabled={busy}>
            ← Back
          </button>
        </>
      )}

      {step === 'section' && (
        <>
          <h1>Choose sections</h1>
          <p className="sub">Select one or more, or go back to use the whole chapter.</p>
          <div className="quiz-radio-list">
            {sections.map((s) => (
              <label key={s.sectionNumber} className="quiz-radio-row">
                <input
                  type="checkbox"
                  checked={sectionNumbers.includes(s.sectionNumber)}
                  onChange={() => toggleSection(s.sectionNumber)}
                />
                <span className="quiz-radio-label">
                  {s.sectionNumber ? `${s.sectionNumber} ` : ''}
                  {s.section}
                </span>
              </label>
            ))}
          </div>
          <button
            type="button"
            className="btn"
            disabled={busy || sectionNumbers.length === 0}
            onClick={continueFromSections}
          >
            Continue
          </button>
          <div style={{ height: 8 }} />
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={() => loadDifficulty(chosenChapter, [])}
          >
            Use whole chapter instead
          </button>
          <div style={{ height: 8 }} />
          <button type="button" className="btn ghost" onClick={() => setStep('chapter')} disabled={busy}>
            ← Back
          </button>
        </>
      )}

      {step === 'difficulty' && (
        <>
          <h1>Choose a difficulty</h1>
          <div className="quiz-level-row">
            {levels.map((l) => (
              <button
                key={l.level}
                type="button"
                className={`quiz-level ${difficulty === l.level ? 'selected' : ''}`}
                disabled={l.count === 0}
                onClick={() => setDifficulty(l.level)}
              >
                Level {l.level}
              </button>
            ))}
          </div>
          <div className="row-between quiz-level-captions">
            <span>Easier</span>
            <span>More challenging</span>
          </div>
          {difficulty != null && (
            <p className="count-line">
              {levels.find((l) => l.level === difficulty)?.count || 0} questions at Level {difficulty}.
            </p>
          )}
          <button type="button" className="btn" disabled={difficulty == null} onClick={goPreview}>
            Continue
          </button>
          <div style={{ height: 8 }} />
          <button
            type="button"
            className="btn ghost"
            onClick={() => (sections.length > 1 ? setStep('section') : setStep('chapter'))}
          >
            ← Back
          </button>
        </>
      )}

      {step === 'preview' && (
        <TestPreview
          chapter={chosenChapter}
          sectionNumbers={sectionNumbers}
          sections={sections}
          difficulty={difficulty}
          count={Math.min(levels.find((l) => l.level === difficulty)?.count || 0, QUIZ_LEN)}
          busy={busy}
          onBegin={beginTest}
          onChangeSelection={changeSelection}
          onShareLink={calls.shareLink ? shareLink : null}
          sharing={sharing}
          shareCopied={shareCopied}
        />
      )}

      {step === 'quiz' && quiz && (
        <QuizRunner
          quiz={quiz}
          current={current}
          setCurrent={setCurrent}
          answers={answers}
          selectAnswer={selectAnswer}
          onRequestSubmit={requestSubmit}
          busy={busy}
          error={error}
        />
      )}

      {step === 'result' && result && (
        <QuizResult
          result={result}
          title={title}
          backLink={backLink}
          onReview={() => {
            setMistakeIdx(0);
            setStep('review');
          }}
          onRetry={practiceAgain}
          onChooseAnotherSection={chooseAnotherSection}
          busy={busy}
        />
      )}

      {step === 'review' && result && (
        <MistakeReview
          result={result}
          mistakeIdx={mistakeIdx}
          setMistakeIdx={setMistakeIdx}
          onBack={() => setStep('result')}
        />
      )}

      {confirmSubmit && (
        <SubmitConfirm
          answered={Object.keys(answers).length}
          total={quiz.questions.length}
          busy={busy}
          onConfirm={doSubmit}
          onCancel={() => setConfirmSubmit(false)}
        />
      )}
    </Card>
  );
}

function TestPreview({
  chapter,
  sectionNumbers,
  sections,
  difficulty,
  count,
  busy,
  onBegin,
  onChangeSelection,
  onShareLink,
  sharing,
  shareCopied,
}) {
  const sectionLabel =
    sectionNumbers.length === 0
      ? 'whole chapter'
      : sections
          .filter((s) => sectionNumbers.includes(s.sectionNumber))
          .map((s) => s.sectionNumber)
          .join(', ');
  return (
    <>
      <h1>Test preview</h1>
      <p className="sub">
        {chapter?.chapterNo ? `${chapter.chapterNo}. ` : ''}
        {chapter?.chapter} · {sectionLabel} · Level {difficulty}
      </p>
      <div className="quiz-preview-count">
        <div className="quiz-preview-number">{count}</div>
        <div className="muted">questions in this practice test</div>
      </div>
      <p className="count-line" style={{ textAlign: 'center' }}>
        Picked at random from all matching questions, and stay in that order once you begin.
      </p>
      <button className="btn" type="button" disabled={busy || count === 0} onClick={onBegin}>
        {busy ? 'Starting…' : 'Practice now'}
      </button>
      {onShareLink && (
        <>
          <div style={{ height: 8 }} />
          <button
            className="btn secondary"
            type="button"
            disabled={busy || sharing || count === 0}
            onClick={onShareLink}
          >
            {shareCopied ? 'Copied!' : sharing ? 'Creating link…' : 'Share test link'}
          </button>
          <p className="count-line" style={{ marginTop: 6, textAlign: 'center' }}>
            Good for up to 10 completed tests. Share it however you like — WhatsApp, SMS, email.
          </p>
        </>
      )}
      <div style={{ height: 8 }} />
      <button className="btn ghost" type="button" onClick={onChangeSelection} disabled={busy}>
        Change Selection
      </button>
    </>
  );
}

function QuizRunner({ quiz, current, setCurrent, answers, selectAnswer, onRequestSubmit, busy, error }) {
  const q = quiz.questions[current];
  const total = quiz.questions.length;
  const answeredCount = Object.keys(answers).length;
  const selected = answers[q.id];

  return (
    <div>
      <div className="row-between">
        <span className="count-line">
          Question {current + 1} of {total}
        </span>
        <span className="count-line">
          {quiz.subject} · Level {quiz.difficulty}
        </span>
      </div>

      <div className="quiz-palette">
        {quiz.questions.map((qq, i) => (
          <button
            type="button"
            key={qq.id}
            className={`quiz-palette-btn ${i === current ? 'current' : ''} ${answers[qq.id] ? 'answered' : ''}`}
            onClick={() => setCurrent(i)}
          >
            {i + 1}
          </button>
        ))}
      </div>

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
            <span className="quiz-option-text">{text}</span>
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
        <button
          type="button"
          className="btn ghost"
          disabled={current === total - 1}
          onClick={() => setCurrent((c) => Math.min(total - 1, c + 1))}
        >
          Next →
        </button>
      </div>
      <div style={{ height: 10 }} />
      <button type="button" className="btn secondary" disabled={busy} onClick={onRequestSubmit}>
        Submit Test{answeredCount < total ? ` (${answeredCount}/${total} answered)` : ''}
      </button>
    </div>
  );
}

function SubmitConfirm({ answered, total, busy, onConfirm, onCancel }) {
  const unanswered = total - answered;
  return (
    <div className="quiz-modal-overlay">
      <div className="quiz-modal">
        <h1>Submit this practice test?</h1>
        <div className="quiz-modal-counts">
          <div>
            <div className="quiz-modal-number">{answered}</div>
            <div className="muted">of {total} answered</div>
          </div>
          <div>
            <div className="quiz-modal-number">{unanswered}</div>
            <div className="muted">unanswered</div>
          </div>
        </div>
        <p className="sub">Unanswered questions score zero. You can go back and answer them first.</p>
        <button type="button" className="btn" disabled={busy} onClick={onConfirm}>
          {busy ? 'Submitting…' : 'Submit Test'}
        </button>
        <div style={{ height: 8 }} />
        <button type="button" className="btn secondary" onClick={onCancel} disabled={busy}>
          Return to Questions
        </button>
      </div>
    </div>
  );
}

function QuizResult({ result, title, backLink, onReview, onRetry, onChooseAnotherSection, busy }) {
  const pct = result.total ? Math.round((result.score / result.total) * 100) : 0;
  const mistakeCount = result.results.filter((r) => r.status !== 'correct').length;
  return (
    <div>
      <h1>Test results</h1>
      <div className="quiz-score-banner">
        <div className="quiz-score-big">
          {result.score}/{result.total}
        </div>
        <div className="muted">
          {title} scored {pct}% — {result.score} mark{result.score === 1 ? '' : 's'}, 1 per
          correct answer, no negative marking.
        </div>
      </div>

      {mistakeCount > 0 && (
        <button type="button" className="btn" onClick={onReview}>
          Review Mistakes ({mistakeCount})
        </button>
      )}
      <div style={{ height: 8 }} />
      <button type="button" className="btn secondary" disabled={busy} onClick={onRetry}>
        {busy ? 'Starting…' : 'Practice Again'}
      </button>
      <div style={{ height: 8 }} />
      <button type="button" className="btn ghost" onClick={onChooseAnotherSection}>
        Choose Another Section
      </button>
      {backLink && (
        <p className="foot-links">
          <Link to={backLink}>← Back to dashboard</Link>
        </p>
      )}
    </div>
  );
}

/**
 * Question-by-question review, mistakes/unanswered only by default. Exported
 * so screens/ShareResults.jsx can reuse the exact same UI for reviewing a past
 * attempt (fed from stored `results_json` instead of fresh in-memory state).
 */
export function MistakeReview({ result, mistakeIdx, setMistakeIdx, onBack }) {
  const mistakes = result.results.filter((r) => r.status !== 'correct');
  const r = mistakes[mistakeIdx];
  if (!r) {
    return (
      <div>
        <p className="sub">No mistakes to review.</p>
        <button type="button" className="btn secondary" onClick={onBack}>
          Back to Results
        </button>
      </div>
    );
  }
  return (
    <div>
      <h1>Question review</h1>
      <p className="count-line">
        Mistake {mistakeIdx + 1} of {mistakes.length}
        {r.status === 'unanswered' ? ' · not answered' : ''}
      </p>
      <p className="quiz-question">{r.question}</p>
      <div className="quiz-options">
        {Object.entries(r.options).map(([letter, text]) => {
          const isCorrectOpt = letter === r.correct;
          const isSelectedOpt = letter === r.selected;
          const cls = isCorrectOpt ? 'correct-answer' : isSelectedOpt ? 'wrong-answer' : '';
          return (
            <div key={letter} className={`quiz-option static ${cls}`}>
              <span className="quiz-option-letter">{letter}</span>
              <span className="quiz-option-text">{text}</span>
              {isCorrectOpt && <span className="quiz-tag right">Correct answer</span>}
              {isSelectedOpt && !isCorrectOpt && <span className="quiz-tag wrong">Your answer</span>}
            </div>
          );
        })}
      </div>
      <div className="row-between" style={{ marginTop: 18 }}>
        <button
          type="button"
          className="btn ghost"
          disabled={mistakeIdx === 0}
          onClick={() => setMistakeIdx((i) => Math.max(0, i - 1))}
        >
          ← Previous Mistake
        </button>
        <button
          type="button"
          className="btn ghost"
          disabled={mistakeIdx === mistakes.length - 1}
          onClick={() => setMistakeIdx((i) => Math.min(mistakes.length - 1, i + 1))}
        >
          Next Mistake →
        </button>
      </div>
      <div style={{ height: 10 }} />
      <button type="button" className="btn secondary" onClick={onBack}>
        Back to Results
      </button>
    </div>
  );
}
