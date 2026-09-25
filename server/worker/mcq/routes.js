import { Hono } from 'hono';
import { ApiError } from '../util.js';
import { requireAuth } from '../middleware.js';
import {
  subjectsForGrade,
  chaptersFor,
  sectionsFor,
  difficultyBreakdown,
  buildQuiz,
  gradeQuiz,
  selfAttempts,
  shareResultsFor,
  attemptDetail,
} from './service.js';
import { createShareLink } from './shareLinks.js';

export const mcqApp = new Hono();
mcqApp.use('*', requireAuth());

mcqApp.get('/subjects', async (c) => {
  const { db } = c.get('ctx');
  const grade = String(c.req.query('grade') || '');
  return c.json({ ok: true, subjects: await subjectsForGrade(db, grade) });
});

mcqApp.get('/chapters', async (c) => {
  const { db } = c.get('ctx');
  const grade = String(c.req.query('grade') || '');
  const subject = String(c.req.query('subject') || '');
  return c.json({ ok: true, chapters: await chaptersFor(db, grade, subject) });
});

mcqApp.get('/sections', async (c) => {
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

mcqApp.get('/difficulty', async (c) => {
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

mcqApp.post('/quiz', async (c) => {
  const { db } = c.get('ctx');
  const body = await c.req.json().catch(() => ({}));
  const { grade, subject, chapterNo, chapter, sectionNumbers, difficulty } = body || {};
  const quiz = await buildQuiz(db, { grade, subject, chapterNo, chapter, sectionNumbers, difficulty });
  return c.json({ ok: true, ...quiz });
});

mcqApp.post('/quiz/grade', async (c) => {
  const { db } = c.get('ctx');
  const account = c.get('account');
  const body = await c.req.json().catch(() => ({}));
  const { grade, subject, chapterNo, questionIds, answers } = body || {};
  const result = await gradeQuiz(db, {
    accountId: account.id,
    grade,
    subject,
    chapterNo,
    questionIds,
    answers,
  });
  return c.json({ ok: true, ...result });
});

mcqApp.get('/attempts', async (c) => {
  const { db } = c.get('ctx');
  const attempts = await selfAttempts(db, c.get('account').id);
  return c.json({ ok: true, attempts });
});

mcqApp.get('/attempts/:id', async (c) => {
  const { db } = c.get('ctx');
  const detail = await attemptDetail(db, c.get('account').id, Number(c.req.param('id')));
  return c.json({ ok: true, ...detail });
});

// ---- share links + their results (teacher/parent side) -------------------

mcqApp.post('/share-link', async (c) => {
  const { db } = c.get('ctx');
  const body = await c.req.json().catch(() => ({}));
  const { grade, subject, chapterNo, chapter, sectionNumbers, difficulty } = body || {};
  if (!grade || !subject || !chapterNo || !chapter || !difficulty) {
    throw new ApiError(400, 'bad_selection', 'Choose a chapter and difficulty before sharing a link.');
  }
  const token = await createShareLink(db, c.get('account').id, {
    grade,
    subject,
    chapterNo,
    chapter,
    sectionNumbers,
    difficulty,
  });
  return c.json({ ok: true, token });
});

mcqApp.get('/share-results', async (c) => {
  const { db } = c.get('ctx');
  const results = await shareResultsFor(db, c.get('account').id);
  return c.json({ ok: true, results });
});

mcqApp.get('/share-results/:id', async (c) => {
  const { db } = c.get('ctx');
  const detail = await attemptDetail(db, c.get('account').id, Number(c.req.param('id')));
  return c.json({ ok: true, ...detail });
});
