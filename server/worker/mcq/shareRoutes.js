import { Hono } from 'hono';
import { ApiError } from '../util.js';
import {
  subjectsForGrade,
  chaptersFor,
  sectionsFor,
  difficultyBreakdown,
  buildQuiz,
  gradeQuiz,
} from './service.js';
import { resolveShareLink, consumeShareLinkAttempt } from './shareLinks.js';

// Public — no requireAuth(). A valid token IS the authorization; it isn't tied to
// any profile, just a capped number of completed attempts (see mcq_share_link).
export const shareApp = new Hono();

shareApp.use('*', async (c, next) => {
  const { db } = c.get('ctx');
  const link = await resolveShareLink(db, c.req.param('token'));
  c.set('link', link);
  await next();
});

shareApp.get('/', (c) => {
  const link = c.get('link');
  return c.json({ ok: true, attemptsLeft: Math.max(0, link.max_attempts - link.used_attempts) });
});

shareApp.get('/subjects', async (c) => {
  const { db } = c.get('ctx');
  const grade = String(c.req.query('grade') || '');
  return c.json({ ok: true, subjects: await subjectsForGrade(db, grade) });
});

shareApp.get('/chapters', async (c) => {
  const { db } = c.get('ctx');
  const grade = String(c.req.query('grade') || '');
  const subject = String(c.req.query('subject') || '');
  return c.json({ ok: true, chapters: await chaptersFor(db, grade, subject) });
});

shareApp.get('/sections', async (c) => {
  const { db } = c.get('ctx');
  const grade = c.req.query('grade');
  const subject = c.req.query('subject');
  const chapterNo = c.req.query('chapterNo');
  const chapter = c.req.query('chapter');
  return c.json({
    ok: true,
    sections: await sectionsFor(db, { grade: String(grade || ''), subject: String(subject || ''), chapterNo, chapter }),
  });
});

shareApp.get('/difficulty', async (c) => {
  const { db } = c.get('ctx');
  const grade = c.req.query('grade');
  const subject = c.req.query('subject');
  const chapterNo = c.req.query('chapterNo');
  const chapter = c.req.query('chapter');
  const sectionNumbersRaw = c.req.query('sectionNumbers');
  const sectionNumbers = sectionNumbersRaw ? sectionNumbersRaw.split(',').filter(Boolean) : [];
  return c.json({
    ok: true,
    levels: await difficultyBreakdown(db, {
      grade: String(grade || ''),
      subject: String(subject || ''),
      chapterNo,
      chapter,
      sectionNumbers,
    }),
  });
});

shareApp.post('/quiz', async (c) => {
  const { db } = c.get('ctx');
  const link = c.get('link');
  if (link.used_attempts >= link.max_attempts) {
    throw new ApiError(409, 'no_attempts_left', 'No attempts left on this link.');
  }
  const body = await c.req.json().catch(() => ({}));
  const { grade, subject, chapterNo, chapter, sectionNumbers, difficulty } = body || {};
  const quiz = await buildQuiz(db, { grade, subject, chapterNo, chapter, sectionNumbers, difficulty });
  return c.json({ ok: true, ...quiz });
});

shareApp.post('/quiz/grade', async (c) => {
  const { db } = c.get('ctx');
  const link = c.get('link');
  const body = await c.req.json().catch(() => ({}));
  const { takerName, grade, subject, chapterNo, questionIds, answers } = body || {};
  const cleanName = String(takerName || '').trim();
  if (cleanName.length < 1) throw new ApiError(400, 'bad_name', 'Enter your name.');

  const claimed = await consumeShareLinkAttempt(db, link.token);
  if (!claimed) throw new ApiError(409, 'no_attempts_left', 'No attempts left on this link.');

  const result = await gradeQuiz(db, {
    accountId: link.account_id,
    shareLinkToken: link.token,
    takerName: cleanName,
    grade,
    subject,
    chapterNo,
    questionIds,
    answers,
  });
  return c.json({ ok: true, ...result });
});
