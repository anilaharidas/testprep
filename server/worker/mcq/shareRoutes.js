import { Hono } from 'hono';
import {
  subjectsForGrade,
  chaptersFor,
  sectionsFor,
  difficultyBreakdown,
  buildQuiz,
  gradeQuiz,
  attemptsFor,
} from './service.js';
import { resolveShareToken } from './shareLinks.js';

// Public — no requireAuth(). A valid token IS the authorization, scoped to
// exactly one dependent; nothing here can reach any other dependent or the
// owning account's details.
export const shareApp = new Hono();

shareApp.use('*', async (c, next) => {
  const { db } = c.get('ctx');
  const { dependent, accountId } = await resolveShareToken(db, c.req.param('token'));
  c.set('dependent', dependent);
  c.set('accountId', accountId);
  await next();
});

shareApp.get('/', (c) => {
  const dependent = c.get('dependent');
  return c.json({ ok: true, dependentName: dependent.name, grade: dependent.grade });
});

shareApp.get('/subjects', async (c) => {
  const { db } = c.get('ctx');
  const dependent = c.get('dependent');
  return c.json({ ok: true, grade: dependent.grade, subjects: await subjectsForGrade(db, dependent.grade) });
});

shareApp.get('/chapters', async (c) => {
  const { db } = c.get('ctx');
  const dependent = c.get('dependent');
  const subject = String(c.req.query('subject') || '');
  return c.json({ ok: true, chapters: await chaptersFor(db, dependent.grade, subject) });
});

shareApp.get('/sections', async (c) => {
  const { db } = c.get('ctx');
  const dependent = c.get('dependent');
  const subject = c.req.query('subject');
  const chapterNo = c.req.query('chapterNo');
  const chapter = c.req.query('chapter');
  return c.json({
    ok: true,
    sections: await sectionsFor(db, { grade: dependent.grade, subject: String(subject || ''), chapterNo, chapter }),
  });
});

shareApp.get('/difficulty', async (c) => {
  const { db } = c.get('ctx');
  const dependent = c.get('dependent');
  const subject = c.req.query('subject');
  const chapterNo = c.req.query('chapterNo');
  const chapter = c.req.query('chapter');
  const sectionNumbersRaw = c.req.query('sectionNumbers');
  const sectionNumbers = sectionNumbersRaw ? sectionNumbersRaw.split(',').filter(Boolean) : [];
  return c.json({
    ok: true,
    levels: await difficultyBreakdown(db, {
      grade: dependent.grade,
      subject: String(subject || ''),
      chapterNo,
      chapter,
      sectionNumbers,
    }),
  });
});

shareApp.post('/quiz', async (c) => {
  const { db } = c.get('ctx');
  const dependent = c.get('dependent');
  const body = await c.req.json().catch(() => ({}));
  const { subject, chapterNo, chapter, sectionNumbers, difficulty } = body || {};
  const quiz = await buildQuiz(db, { dependent, subject, chapterNo, chapter, sectionNumbers, difficulty });
  return c.json({ ok: true, ...quiz });
});

shareApp.post('/quiz/grade', async (c) => {
  const { db } = c.get('ctx');
  const dependent = c.get('dependent');
  const accountId = c.get('accountId');
  const body = await c.req.json().catch(() => ({}));
  const { subject, chapterNo, questionIds, answers } = body || {};
  const result = await gradeQuiz(db, { dependent, accountId, subject, chapterNo, questionIds, answers });
  return c.json({ ok: true, ...result });
});

shareApp.get('/attempts', async (c) => {
  const { db } = c.get('ctx');
  const attempts = await attemptsFor(db, c.get('dependent'));
  return c.json({ ok: true, attempts });
});
