import { ApiError } from './util.js';
import { sessionAccount } from './accounts.js';

export const SESSION_COOKIE = 'tp_session';

/** Require a logged-in account; attaches it as req.account. */
export function requireAuth(req, res, next) {
  const account = sessionAccount(req.cookies[SESSION_COOKIE]);
  if (!account) return next(new ApiError(401, 'unauthenticated', 'Please log in.'));
  req.account = account;
  return next();
}

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
