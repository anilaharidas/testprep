import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import QuizFlow from '../QuizFlow.jsx';

export default function Quiz() {
  const { dependentId } = useParams();
  const { account } = useAuth();
  const dependent = account?.dependents.find((d) => String(d.id) === dependentId);

  return (
    <QuizFlow
      title={dependent ? `${dependent.name} · Grade ${dependent.grade}` : 'Practice'}
      backLink="/dashboard"
      calls={{
        subjects: () => api.mcqSubjects(dependentId),
        chapters: (subject) => api.mcqChapters(dependentId, subject),
        sections: (subject, chapterNo, chapter) => api.mcqSections(dependentId, subject, chapterNo, chapter),
        difficulty: (subject, chapterNo, chapter, sectionNumbers) =>
          api.mcqDifficulty(dependentId, subject, chapterNo, chapter, sectionNumbers),
        startQuiz: (subject, chapterNo, chapter, sectionNumbers, difficulty) =>
          api.mcqStartQuiz(dependentId, subject, chapterNo, chapter, sectionNumbers, difficulty),
        gradeQuiz: (subject, chapterNo, questionIds, answers) =>
          api.mcqGradeQuiz(dependentId, subject, chapterNo, questionIds, answers),
        attempts: () => api.mcqAttempts(dependentId),
      }}
    />
  );
}
