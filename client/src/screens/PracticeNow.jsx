import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useAppConfig } from '../useAppConfig.js';
import { Card } from '../ui.jsx';
import QuizFlow from '../QuizFlow.jsx';

export default function PracticeNow() {
  const { account } = useAuth();
  const cfg = useAppConfig();

  if (!cfg) {
    return (
      <Card>
        <div className="center-loading">Loading…</div>
      </Card>
    );
  }

  return (
    <QuizFlow
      title={account?.name || 'You'}
      backLink="/dashboard"
      grades={cfg.grades}
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
      }}
    />
  );
}
