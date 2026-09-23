// Thin async wrapper around a D1 binding shaped like better-sqlite3's
// db.prepare(sql).get/all/run() API, so the ported business logic stays close to
// the original code — just with `await` added and D1's result shapes normalized
// (.run() returns {changes, lastInsertRowid} instead of D1's {meta:{changes,last_row_id}}).
export function makeDb(env) {
  const d1 = env.DB;
  return {
    prepare(sql) {
      const stmt = d1.prepare(sql);
      return {
        get: async (...params) => (await stmt.bind(...params).first()) ?? null,
        all: async (...params) => (await stmt.bind(...params).all()).results,
        run: async (...params) => {
          const res = await stmt.bind(...params).run();
          return { changes: res.meta.changes, lastInsertRowid: res.meta.last_row_id };
        },
      };
    },
  };
}
