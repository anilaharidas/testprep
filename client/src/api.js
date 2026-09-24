export class ApiError extends Error {
  constructor(payload, status) {
    super(payload?.message || 'Request failed');
    this.code = payload?.code || 'error';
    this.status = status;
    this.data = payload || {};
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    /* no body */
  }

  if (!res.ok || payload?.ok === false) {
    throw new ApiError(payload, res.status);
  }
  return payload;
}

export const api = {
  config: () => request('/config'),
  me: () => request('/me'),

  checkNumber: (whatsappNumber, purpose) =>
    request('/check-number', { method: 'POST', body: { whatsappNumber, purpose } }),
  sendOtp: (whatsappNumber, purpose) =>
    request('/otp/send', { method: 'POST', body: { whatsappNumber, purpose } }),
  verifyOtp: (whatsappNumber, code, purpose) =>
    request('/otp/verify', { method: 'POST', body: { whatsappNumber, code, purpose } }),

  register: (payload) => request('/register', { method: 'POST', body: payload }),
  registerUnverified: (payload) => request('/register-unverified', { method: 'POST', body: payload }),
  login: (whatsappNumber, password) =>
    request('/login', { method: 'POST', body: { whatsappNumber, password } }),
  resetPassword: (verificationToken, password) =>
    request('/password-reset', { method: 'POST', body: { verificationToken, password } }),
  logout: () => request('/logout', { method: 'POST' }),

  // Deferred phone verification ("Verify later" accounts)
  verifyPhoneSend: () => request('/verify-phone/send', { method: 'POST' }),
  verifyPhoneConfirm: (code) => request('/verify-phone/confirm', { method: 'POST', body: { code } }),

  // operator panel
  adminLogin: (slug, password) =>
    request('/admin/login', { method: 'POST', body: { slug, password } }),
  adminLogout: () => request('/admin/logout', { method: 'POST' }),
  adminSession: () => request('/admin/session'),
  adminRequests: () => request('/admin/requests'),

  // MCQ practice (self, authenticated) — grade is picked fresh each session,
  // not tied to any stored profile.
  mcqSubjects: (grade) => request(`/mcq/subjects?grade=${encodeURIComponent(grade)}`),
  mcqChapters: (grade, subject) =>
    request(`/mcq/chapters?grade=${encodeURIComponent(grade)}&subject=${encodeURIComponent(subject)}`),
  mcqSections: (grade, subject, chapterNo, chapter) =>
    request(
      `/mcq/sections?grade=${encodeURIComponent(grade)}&subject=${encodeURIComponent(subject)}` +
        `&chapterNo=${encodeURIComponent(chapterNo)}&chapter=${encodeURIComponent(chapter)}`,
    ),
  mcqDifficulty: (grade, subject, chapterNo, chapter, sectionNumbers) =>
    request(
      `/mcq/difficulty?grade=${encodeURIComponent(grade)}&subject=${encodeURIComponent(subject)}` +
        `&chapterNo=${encodeURIComponent(chapterNo)}&chapter=${encodeURIComponent(chapter)}` +
        `&sectionNumbers=${encodeURIComponent((sectionNumbers || []).join(','))}`,
    ),
  mcqStartQuiz: (grade, subject, chapterNo, chapter, sectionNumbers, difficulty) =>
    request('/mcq/quiz', {
      method: 'POST',
      body: { grade, subject, chapterNo, chapter, sectionNumbers, difficulty },
    }),
  mcqGradeQuiz: (grade, subject, chapterNo, questionIds, answers) =>
    request('/mcq/quiz/grade', {
      method: 'POST',
      body: { grade, subject, chapterNo, questionIds, answers },
    }),
  mcqAttempts: () => request('/mcq/attempts'),

  // Shareable practice link (teacher/parent side) — always mints a fresh
  // token, good for up to 4 completed tests.
  mcqShareLink: () => request('/mcq/share-link', { method: 'POST' }),
  mcqShareResults: () => request('/mcq/share-results'),
  mcqShareResultDetail: (id) => request(`/mcq/share-results/${id}`),

  // Public practice link (no login) — same shapes as the mcqXxx methods
  // above, minus grade coming from a profile: the taker picks it themselves,
  // and names themselves when grading.
  shareInfo: (token) => request(`/share/${token}`),
  shareSubjects: (token, grade) => request(`/share/${token}/subjects?grade=${encodeURIComponent(grade)}`),
  shareChapters: (token, grade, subject) =>
    request(`/share/${token}/chapters?grade=${encodeURIComponent(grade)}&subject=${encodeURIComponent(subject)}`),
  shareSections: (token, grade, subject, chapterNo, chapter) =>
    request(
      `/share/${token}/sections?grade=${encodeURIComponent(grade)}&subject=${encodeURIComponent(subject)}` +
        `&chapterNo=${encodeURIComponent(chapterNo)}&chapter=${encodeURIComponent(chapter)}`,
    ),
  shareDifficulty: (token, grade, subject, chapterNo, chapter, sectionNumbers) =>
    request(
      `/share/${token}/difficulty?grade=${encodeURIComponent(grade)}&subject=${encodeURIComponent(subject)}` +
        `&chapterNo=${encodeURIComponent(chapterNo)}&chapter=${encodeURIComponent(chapter)}` +
        `&sectionNumbers=${encodeURIComponent((sectionNumbers || []).join(','))}`,
    ),
  shareStartQuiz: (token, grade, subject, chapterNo, chapter, sectionNumbers, difficulty) =>
    request(`/share/${token}/quiz`, {
      method: 'POST',
      body: { grade, subject, chapterNo, chapter, sectionNumbers, difficulty },
    }),
  shareGradeQuiz: (token, takerName, grade, subject, chapterNo, questionIds, answers) =>
    request(`/share/${token}/quiz/grade`, {
      method: 'POST',
      body: { takerName, grade, subject, chapterNo, questionIds, answers },
    }),
};
