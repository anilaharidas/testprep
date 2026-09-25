import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { useAppConfig } from '../useAppConfig.js';
import { Shell, Card, Notice, Field } from '../ui.jsx';
import QuizFlow from '../QuizFlow.jsx';

/**
 * Public practice-link screen — opened directly, no login. The token is good
 * for a capped number of completed tests (see server/worker/mcq/shareLinks.js).
 * Whoever opens it identifies themselves by typing a name, then starts the
 * exact grade/chapter/section/difficulty the link was created for (no picking
 * anything) — or, for a link minted before selections were stored, picks
 * their own, same as the account-holder's own practice flow.
 */
export default function SharedQuiz() {
  const { token } = useParams();
  const cfg = useAppConfig();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [takerName, setTakerName] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .shareInfo(token)
      .then((res) => !cancelled && setInfo(res))
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError && err.status === 404
            ? 'This practice link is no longer valid. Ask for a new one.'
            : err.message || 'Could not load this link.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (error) {
    return (
      <Shell>
        <Card>
          <h1>Link unavailable</h1>
          <Notice kind="error">{error}</Notice>
        </Card>
      </Shell>
    );
  }

  if (!info || !cfg) {
    return (
      <Shell>
        <Card>
          <div className="center-loading">Loading…</div>
        </Card>
      </Shell>
    );
  }

  if (info.attemptsLeft <= 0) {
    return (
      <Shell>
        <Card>
          <h1>No attempts left</h1>
          <p className="sub">This practice link has already been used its maximum number of times. Ask for a new link.</p>
        </Card>
      </Shell>
    );
  }

  if (!takerName) {
    return (
      <Shell>
        <Card>
          <h1>Enter your name</h1>
          <p className="sub">This is shown to whoever shared this link, alongside your score.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) setTakerName(name.trim());
            }}
          >
            <Field label="Your name">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
              />
            </Field>
            <button className="btn" type="submit" disabled={!name.trim()}>
              Continue
            </button>
          </form>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <QuizFlow
        title={takerName}
        backLink={null}
        grades={cfg.grades}
        fixedSelection={info.selection}
        calls={{
          subjects: (grade) => api.shareSubjects(token, grade),
          chapters: (grade, subject) => api.shareChapters(token, grade, subject),
          sections: (grade, subject, chapterNo, chapter) =>
            api.shareSections(token, grade, subject, chapterNo, chapter),
          difficulty: (grade, subject, chapterNo, chapter, sectionNumbers) =>
            api.shareDifficulty(token, grade, subject, chapterNo, chapter, sectionNumbers),
          startQuiz: (grade, subject, chapterNo, chapter, sectionNumbers, difficulty) =>
            api.shareStartQuiz(token, grade, subject, chapterNo, chapter, sectionNumbers, difficulty),
          gradeQuiz: (grade, subject, chapterNo, questionIds, answers) =>
            api.shareGradeQuiz(token, takerName, grade, subject, chapterNo, questionIds, answers),
        }}
      />
    </Shell>
  );
}
