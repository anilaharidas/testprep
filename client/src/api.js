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

  sendOtp: (whatsappNumber, purpose) =>
    request('/otp/send', { method: 'POST', body: { whatsappNumber, purpose } }),
  verifyOtp: (whatsappNumber, code, purpose) =>
    request('/otp/verify', { method: 'POST', body: { whatsappNumber, code, purpose } }),

  register: (payload) => request('/register', { method: 'POST', body: payload }),
  login: (whatsappNumber, password) =>
    request('/login', { method: 'POST', body: { whatsappNumber, password } }),
  resetPassword: (verificationToken, password) =>
    request('/password-reset', { method: 'POST', body: { verificationToken, password } }),
  logout: () => request('/logout', { method: 'POST' }),

  addDependent: (name, grade) =>
    request('/dependents', { method: 'POST', body: { name, grade } }),
  removeDependent: (id) => request(`/dependents/${id}`, { method: 'DELETE' }),

  // operator panel
  adminLogin: (slug, password) =>
    request('/admin/login', { method: 'POST', body: { slug, password } }),
  adminLogout: () => request('/admin/logout', { method: 'POST' }),
  adminSession: () => request('/admin/session'),
  adminRequests: () => request('/admin/requests'),

  // MCQ practice
  mcqSubjects: (dependentId) => request(`/mcq/subjects?dependentId=${dependentId}`),
  mcqChapters: (dependentId, subject) =>
    request(`/mcq/chapters?dependentId=${dependentId}&subject=${encodeURIComponent(subject)}`),
  mcqSections: (dependentId, subject, chapterNo, chapter) =>
    request(
      `/mcq/sections?dependentId=${dependentId}&subject=${encodeURIComponent(subject)}` +
        `&chapterNo=${encodeURIComponent(chapterNo)}&chapter=${encodeURIComponent(chapter)}`,
    ),
  mcqDifficulty: (dependentId, subject, chapterNo, chapter, sectionNumbers) =>
    request(
      `/mcq/difficulty?dependentId=${dependentId}&subject=${encodeURIComponent(subject)}` +
        `&chapterNo=${encodeURIComponent(chapterNo)}&chapter=${encodeURIComponent(chapter)}` +
        `&sectionNumbers=${encodeURIComponent((sectionNumbers || []).join(','))}`,
    ),
  mcqStartQuiz: (dependentId, subject, chapterNo, chapter, sectionNumbers, difficulty) =>
    request('/mcq/quiz', {
      method: 'POST',
      body: { dependentId, subject, chapterNo, chapter, sectionNumbers, difficulty },
    }),
  mcqGradeQuiz: (dependentId, subject, chapterNo, questionIds, answers) =>
    request('/mcq/quiz/grade', {
      method: 'POST',
      body: { dependentId, subject, chapterNo, questionIds, answers },
    }),
  mcqAttempts: (dependentId) => request(`/mcq/attempts?dependentId=${dependentId}`),

  // Shareable practice link (teacher/parent side)
  mcqShareLink: (dependentId) => request(`/mcq/share-link?dependentId=${dependentId}`),
  mcqShareLinkRegenerate: (dependentId) =>
    request('/mcq/share-link/regenerate', { method: 'POST', body: { dependentId } }),

  // Public practice link (student side, no login) — same shapes as the mcqXxx
  // methods above, minus dependentId (the token in the URL identifies the
  // dependent instead).
  shareInfo: (token) => request(`/share/${token}`),
  shareSubjects: (token) => request(`/share/${token}/subjects`),
  shareChapters: (token, subject) =>
    request(`/share/${token}/chapters?subject=${encodeURIComponent(subject)}`),
  shareSections: (token, subject, chapterNo, chapter) =>
    request(
      `/share/${token}/sections?subject=${encodeURIComponent(subject)}` +
        `&chapterNo=${encodeURIComponent(chapterNo)}&chapter=${encodeURIComponent(chapter)}`,
    ),
  shareDifficulty: (token, subject, chapterNo, chapter, sectionNumbers) =>
    request(
      `/share/${token}/difficulty?subject=${encodeURIComponent(subject)}` +
        `&chapterNo=${encodeURIComponent(chapterNo)}&chapter=${encodeURIComponent(chapter)}` +
        `&sectionNumbers=${encodeURIComponent((sectionNumbers || []).join(','))}`,
    ),
  shareStartQuiz: (token, subject, chapterNo, chapter, sectionNumbers, difficulty) =>
    request(`/share/${token}/quiz`, {
      method: 'POST',
      body: { subject, chapterNo, chapter, sectionNumbers, difficulty },
    }),
  shareGradeQuiz: (token, subject, chapterNo, questionIds, answers) =>
    request(`/share/${token}/quiz/grade`, {
      method: 'POST',
      body: { subject, chapterNo, questionIds, answers },
    }),
  shareAttempts: (token) => request(`/share/${token}/attempts`),
};
