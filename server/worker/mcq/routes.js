import { Hono } from 'hono';
import { requireAuth } from '../middleware.js';
import { getOwnedDependent } from '../accounts.js';
import {
  subjectsForGrade,
  chaptersFor,
  sectionsFor,
  difficultyBreakdown,
  buildQuiz,
  gradeQuiz,
  attemptsFor,
} from './service.js';
import { getOrCreateShareToken, regenerateShareToken } from './shareLinks.js';

export const mcqApp = new Hono();
mcqApp.use('*', requireAuth());

mcqApp.get('/subjects', async (c) => {
  const { db } = c.get('ctx');
  const dependent = await getOwnedDependent(db, c.get('account'), Number(c.req.query('dependentId')));
  return c.json({ ok: true, grade: dependent.grade, subjects: await subjectsForGrade(db, dependent.grade) });
});

mcqApp.get('/chapters', async (c) => {
  const { db } = c.get('ctx');
  const dependent = await getOwnedDependent(db, c.get('account'), Number(c.req.query('dependentId')));
  const subject = String(c.req.query('subject') || '');
  return c.json({ ok: true, chapters: await chaptersFor(db, dependent.grade, subject) });
});

mcqApp.get('/sections', async (c) => {
  const { db } = c.get('ctx');
  const dependent = await getOwnedDependent(db, c.get('account'), Number(c.req.query('dependentId')));
  const subject = c.req.query('subject');
  const chapterNo = c.req.query('chapterNo');
  const chapter = c.req.query('chapter');
  return c.json({
    ok: true,
    sections: await sectionsFor(db, { grade: dependent.grade, subject: String(subject || ''), chapterNo, chapter }),
  });
});

mcqApp.get('/difficulty', async (c) => {
  const { db } = c.get('ctx');
  const dependent = await getOwnedDependent(db, c.get('account'), Number(c.req.query('dependentId')));
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

mcqApp.post('/quiz', async (c) => {
  const { db } = c.get('ctx');
  const account = c.get('account');
  const body = await c.req.json().catch(() => ({}));
  const { dependentId, subject, chapterNo, chapter, sectionNumbers, difficulty } = body || {};
  const dependent = await getOwnedDependent(db, account, Number(dependentId));
  const quiz = await buildQuiz(db, { dependent, subject, chapterNo, chapter, sectionNumbers, difficulty });
  return c.json({ ok: true, ...quiz });
});

mcqApp.post('/quiz/grade', async (c) => {
  const { db } = c.get('ctx');
  const account = c.get('account');
  const body = await c.req.json().catch(() => ({}));
  const { dependentId, subject, chapterNo, questionIds, answers } = body || {};
  const dependent = await getOwnedDependent(db, account, Number(dependentId));
  const result = await gradeQuiz(db, {
    dependent,
    accountId: account.id,
    subject,
    chapterNo,
    questionIds,
    answers,
  });
  return c.json({ ok: true, ...result });
});

mcqApp.get('/attempts', async (c) => {
  const { db } = c.get('ctx');
  const dependent = await getOwnedDependent(db, c.get('account'), Number(c.req.query('dependentId')));
  const attempts = await attemptsFor(db, dependent);
  return c.json({ ok: true, attempts });
});

// ---- shareable practice link (teacher/parent side) -----------------------

mcqApp.get('/share-link', async (c) => {
  const { db } = c.get('ctx');
  const dependent = await getOwnedDependent(db, c.get('account'), Number(c.req.query('dependentId')));
  const token = await getOrCreateShareToken(db, dependent.id);
  return c.json({ ok: true, token });
});

mcqApp.post('/share-link/regenerate', async (c) => {
  const { db } = c.get('ctx');
  const body = await c.req.json().catch(() => ({}));
  const dependent = await getOwnedDependent(db, c.get('account'), Number(body?.dependentId));
  const token = await regenerateShareToken(db, dependent.id);
  return c.json({ ok: true, token });
});
