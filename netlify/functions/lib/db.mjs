// Lớp truy cập database.
// - Trên Netlify: Postgres (Netlify Database) qua @netlify/database.
// - Chạy thử local: SQLite có sẵn trong Node 22 (node:sqlite), khi đặt LOCAL_SQLITE=đường_dẫn.
// Mọi câu SQL viết theo kiểu Postgres ($1, $2...) và chỉ dùng cú pháp chung cho cả hai.

let impl = null;

async function getImpl() {
  if (impl) return impl;
  if (process.env.LOCAL_SQLITE) {
    impl = await makeSqlite(process.env.LOCAL_SQLITE);
  } else {
    const { getDatabase } = await import('@netlify/database');
    const pool = getDatabase().pool;
    impl = {
      query: (text, params = []) => pool.query(text, params),
      async tx(fn) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await fn({ query: (t, p = []) => client.query(t, p) });
          await client.query('COMMIT');
          return result;
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          throw e;
        } finally {
          client.release();
        }
      },
    };
  }
  return impl;
}

async function makeSqlite(file) {
  const { DatabaseSync } = await import('node:sqlite');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)');
  const dir = path.resolve(process.cwd(), 'netlify/database/migrations');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    const done = db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(f);
    if (!done) {
      db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(f);
    }
  }
  const run = (text, params = []) => {
    const sql = text.replace(/\$(\d+)/g, '?$1').replace(/\s+FOR UPDATE/gi, '');
    const stmt = db.prepare(sql);
    const args = params.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v));
    if (/^\s*(SELECT|WITH)/i.test(sql) || /RETURNING/i.test(sql)) {
      const rows = stmt.all(...args);
      return { rows, rowCount: rows.length };
    }
    const info = stmt.run(...args);
    return { rows: [], rowCount: Number(info.changes) };
  };
  return {
    query: async (t, p) => run(t, p),
    async tx(fn) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const r = await fn({ query: async (t, p) => run(t, p) });
        db.exec('COMMIT');
        return r;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

export async function query(text, params) {
  return (await getImpl()).query(text, params);
}
export async function tx(fn) {
  return (await getImpl()).tx(fn);
}
