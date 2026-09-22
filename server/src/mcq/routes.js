import express from 'express';
import { requireAuth, wrap } from '../middleware.js';
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

export const mcqRouter = express.Router();
mcqRouter.use(requireAuth);

mcqRouter.get(
  '/subjects',
  wrap((req, res) => {
    const dependent = getOwnedDependent(req.account, Number(req.query.dependentId));
    res.json({ ok: true, grade: dependent.grade, subjects: subjectsForGrade(dependent.grade) });
  }),
);

mcqRouter.get(
  '/chapters',
  wrap((req, res) => {
    const dependent = getOwnedDependent(req.account, Number(req.query.dependentId));
    const subject = String(req.query.subject || '');
    res.json({ ok: true, chapters: chaptersFor(dependent.grade, subject) });
  }),
);

mcqRouter.get(
  '/sections',
  wrap((req, res) => {
    const dependent = getOwnedDependent(req.account, Number(req.query.dependentId));
    const { subject, chapterNo, chapter } = req.query;
    res.json({
      ok: true,
      sections: sectionsFor({ grade: dependent.grade, subject: String(subject || ''), chapterNo, chapter }),
    });
  }),
);

mcqRouter.get(
  '/difficulty',
  wrap((req, res) => {
    const dependent = getOwnedDependent(req.account, Number(req.query.dependentId));
    const { subject, chapterNo, chapter } = req.query;
    const sectionNumbers = req.query.sectionNumbers
      ? String(req.query.sectionNumbers).split(',').filter(Boolean)
      : [];
    res.json({
      ok: true,
      levels: difficultyBreakdown({
        grade: dependent.grade,
        subject: String(subject || ''),
        chapterNo,
        chapter,
        sectionNumbers,
      }),
    });
  }),
);

mcqRouter.post(
  '/quiz',
  wrap((req, res) => {
    const { dependentId, subject, chapterNo, chapter, sectionNumbers, difficulty } = req.body || {};
    const quiz = buildQuiz({
      account: req.account,
      dependentId: Number(dependentId),
      subject,
      chapterNo,
      chapter,
      sectionNumbers,
      difficulty,
    });
    res.json({ ok: true, ...quiz });
  }),
);

mcqRouter.post(
  '/quiz/grade',
  wrap((req, res) => {
    const { dependentId, subject, chapterNo, questionIds, answers } = req.body || {};
    const result = gradeQuiz({
      account: req.account,
      dependentId: Number(dependentId),
      subject,
      chapterNo,
      questionIds,
      answers,
    });
    res.json({ ok: true, ...result });
  }),
);

mcqRouter.get(
  '/attempts',
  wrap((req, res) => {
    const attempts = attemptsFor(req.account, Number(req.query.dependentId));
    res.json({ ok: true, attempts });
  }),
);
