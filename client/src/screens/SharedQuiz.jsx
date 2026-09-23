import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { Shell, Card, Notice } from '../ui.jsx';
import QuizFlow from '../QuizFlow.jsx';

/**
 * Public practice-link screen — opened directly by a student, no login. The
 * token in the URL identifies exactly one dependent (see server/worker/mcq/
 * shareLinks.js); nothing here can reach any other dependent or account data.
 */
export default function SharedQuiz() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);

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

  if (!info) {
    return (
      <Shell>
        <Card>
          <div className="center-loading">Loading…</div>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <QuizFlow
        title={`${info.dependentName} · Grade ${info.grade}`}
        backLink={null}
        calls={{
          subjects: () => api.shareSubjects(token),
          chapters: (subject) => api.shareChapters(token, subject),
          sections: (subject, chapterNo, chapter) => api.shareSections(token, subject, chapterNo, chapter),
          difficulty: (subject, chapterNo, chapter, sectionNumbers) =>
            api.shareDifficulty(token, subject, chapterNo, chapter, sectionNumbers),
          startQuiz: (subject, chapterNo, chapter, sectionNumbers, difficulty) =>
            api.shareStartQuiz(token, subject, chapterNo, chapter, sectionNumbers, difficulty),
          gradeQuiz: (subject, chapterNo, questionIds, answers) =>
            api.shareGradeQuiz(token, subject, chapterNo, questionIds, answers),
          attempts: () => api.shareAttempts(token),
        }}
      />
    </Shell>
  );
}
