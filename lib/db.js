// Database access. One function: query(text, params) -> rows.
//
// DATABASE_URL = postgres://...            -> Neon (or any Postgres reachable over Neon's HTTP driver)
// DATABASE_URL = pglite:                   -> in-memory Postgres (tests)
// DATABASE_URL = pglite:./.data            -> local Postgres in a folder (offline dev)
//
// Tables are created on first use, so there is no separate migration step.

const DDL = [
  `create table if not exists rooms (
     id uuid primary key default gen_random_uuid(),
     slug text not null unique,
     name text not null,
     pass_hash text not null,
     fail_count int not null default 0,
     locked_until timestamptz,
     created_at timestamptz not null default now()
   )`,
  `create table if not exists members (
     id uuid primary key default gen_random_uuid(),
     room_id uuid not null references rooms(id) on delete cascade,
     slot text not null check (slot in ('a','b')),
     name text not null,
     created_at timestamptz not null default now(),
     unique (room_id, slot)
   )`,
  `create unique index if not exists members_room_name on members (room_id, lower(name))`,
  `create table if not exists movies (
     id uuid primary key default gen_random_uuid(),
     room_id uuid not null references rooms(id) on delete cascade,
     title text not null,
     note text not null default '',
     for_slot text not null check (for_slot in ('a','b')),
     by_slot text not null check (by_slot in ('a','b')),
     pinned boolean not null default false,
     checked boolean not null default false,
     watched boolean not null default false,
     watched_at timestamptz,
     image text,
     image_type text,
     created_at timestamptz not null default now()
   )`,
  `create index if not exists movies_room on movies (room_id)`,
];

let runner = null;

async function open() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  if (url.startsWith('pglite:')) {
    const { PGlite } = await import('@electric-sql/pglite');
    const dir = url.slice('pglite:'.length);
    const pg = dir ? new PGlite(dir) : new PGlite();
    await pg.waitReady;
    return async (text, params = []) => (await pg.query(text, params)).rows;
  }

  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(url);
  return (text, params = []) => sql.query(text, params);
}

async function init() {
  const run = await open();
  for (const stmt of DDL) {
    try {
      await run(stmt);
    } catch (e) {
      // Two cold starts can race on "create table if not exists". Try once more.
      await run(stmt);
    }
  }
  return run;
}

export function query(text, params = []) {
  if (!runner) {
    runner = init().catch((e) => {
      runner = null;
      throw e;
    });
  }
  return runner.then((run) => run(text, params));
}
