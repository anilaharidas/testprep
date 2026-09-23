import { getCookie } from 'hono/cookie';
import { ApiError } from './util.js';
import { sessionAccount } from './accounts.js';

export const SESSION_COOKIE = 'tp_session';

/** Require a logged-in account; attaches it to the Hono context as 'account'. */
export function requireAuth() {
  return async (c, next) => {
    const { db } = c.get('ctx');
    const account = await sessionAccount(db, getCookie(c, SESSION_COOKIE));
    if (!account) throw new ApiError(401, 'unauthenticated', 'Please log in.');
    c.set('account', account);
    await next();
  };
}
