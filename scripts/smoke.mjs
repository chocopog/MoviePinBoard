// End-to-end check of the API against an in-memory Postgres. Run: npm test
process.env.DATABASE_URL = 'pglite:';
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret';

import assert from 'node:assert/strict';
import auth from '../api/auth.js';
import state from '../api/state.js';
import movies from '../api/movies.js';
import img from '../api/img.js';

function call(handler, method, { body, query = {}, cookie = '' } = {}) {
  const req = { method, body, query, headers: { cookie, 'x-forwarded-proto': 'https' } };
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(k, v) { this.headers[k] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
    send(b) { this.body = b; return this; },
    end() { return this; },
  };
  return handler(req, res).then(() => res);
}
const cookieOf = (res) => (res.headers['Set-Cookie'] || '').split(';')[0];
const post = (body, cookie) => call(auth, 'POST', { body, cookie });

let n = 0;
const ok = (label) => console.log(`  ok ${++n}  ${label}`);

// rooms
let r = await post({ action: 'create', room: 'Popcorn Pair', password: 'secret1', name: 'Maya' });
assert.equal(r.statusCode, 200); const A = cookieOf(r); assert.match(A, /^pinboard_session=/);
assert.match(r.headers['Set-Cookie'], /HttpOnly/); assert.match(r.headers['Set-Cookie'], /Secure/);
ok('create room, session cookie is HttpOnly + Secure');

r = await post({ action: 'create', room: 'popcorn  pair!', password: 'another1', name: 'X' });
assert.equal(r.statusCode, 409); ok('same room name (after cleanup) is refused');

r = await post({ action: 'create', room: 'ab', password: 'secret1', name: 'X' });
assert.equal(r.statusCode, 400);
r = await post({ action: 'create', room: 'Short Pass', password: '123', name: 'X' });
assert.equal(r.statusCode, 400); ok('short room name / short password refused');

r = await post({ action: 'join', room: 'popcorn pair', password: 'nope-nope', name: 'Sam' });
assert.equal(r.statusCode, 401); assert.ok(!r.headers['Set-Cookie']);
r = await post({ action: 'join', room: 'no such room', password: 'secret1', name: 'Sam' });
assert.equal(r.statusCode, 401); assert.equal(r.body.error, 'Wrong room name or password.'); ok('wrong password / unknown room give the same 401');

r = await post({ action: 'join', room: 'Popcorn Pair', password: 'secret1', name: 'Sam' });
assert.equal(r.statusCode, 200); const B = cookieOf(r); ok('second person joins');

r = await post({ action: 'join', room: 'Popcorn Pair', password: 'secret1', name: 'Zed' });
assert.equal(r.statusCode, 403); ok('third person is refused');

r = await post({ action: 'join', room: 'Popcorn Pair', password: 'secret1', name: 'maya' });
assert.equal(r.statusCode, 200); ok('existing name signs back in (new device)');

// state
r = await call(state, 'GET', { cookie: A });
assert.equal(r.statusCode, 200);
assert.equal(r.body.me.slot, 'a'); assert.equal(r.body.me.name, 'Maya');
assert.deepEqual(r.body.members.map((m) => m.name), ['Maya', 'Sam']); assert.equal(r.body.movies.length, 0);
r = await call(state, 'GET', { cookie: B }); assert.equal(r.body.me.slot, 'b');
r = await call(state, 'GET', {}); assert.equal(r.statusCode, 401);
r = await call(state, 'GET', { cookie: 'pinboard_session=garbage' }); assert.equal(r.statusCode, 401);
ok('state per person; no or bad cookie is 401');

// movies
const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
r = await call(movies, 'POST', { cookie: A, body: { title: 'Past Lives', note: 'Trailer looked lovely', forSlot: 'b', pinned: true, image: jpeg } });
assert.equal(r.statusCode, 200); const id1 = r.body.id;
r = await call(movies, 'POST', { cookie: B, body: { title: 'Spirited Away', forSlot: 'a' } });
assert.equal(r.statusCode, 200); const id2 = r.body.id;
r = await call(movies, 'POST', { cookie: A, body: { title: '', forSlot: 'a' } }); assert.equal(r.statusCode, 400);
r = await call(movies, 'POST', { cookie: A, body: { title: 'Bad', forSlot: 'z' } }); assert.equal(r.statusCode, 400);
r = await call(movies, 'POST', { cookie: A, body: { title: 'Bad image', forSlot: 'a', image: 'data:text/html;base64,PGI+' } }); assert.equal(r.statusCode, 400);
ok('add movies; empty title, bad board and non-image refused');

r = await call(state, 'GET', { cookie: B });
const m1 = r.body.movies.find((m) => m.id === id1);
assert.equal(m1.title, 'Past Lives'); assert.equal(m1.forSlot, 'b'); assert.equal(m1.bySlot, 'a');
assert.equal(m1.pinned, true); assert.equal(m1.hasImage, true);
assert.equal(r.body.movies.find((m) => m.id === id2).hasImage, false);
assert.ok(!('image' in m1)); ok('state lists movies without image bytes');

r = await call(img, 'GET', { cookie: B, query: { id: id1 } });
assert.equal(r.statusCode, 200); assert.equal(r.headers['Content-Type'], 'image/jpeg');
assert.ok(Buffer.isBuffer(r.body) && r.body[0] === 0xff && r.body[1] === 0xd8); assert.match(r.headers['Cache-Control'], /immutable/);
r = await call(img, 'GET', { query: { id: id1 } }); assert.equal(r.statusCode, 401);
r = await call(img, 'GET', { cookie: B, query: { id: id2 } }); assert.equal(r.statusCode, 404);
ok('poster served to room members only');

r = await call(movies, 'PATCH', { cookie: B, query: { id: id1 }, body: { checked: true } }); assert.equal(r.statusCode, 200);
r = await call(movies, 'PATCH', { cookie: B, query: { id: id1 }, body: { watched: true, pinned: false } }); assert.equal(r.statusCode, 200);
r = await call(state, 'GET', { cookie: A });
let w = r.body.movies.find((m) => m.id === id1);
assert.equal(w.checked, true); assert.equal(w.watched, true); assert.equal(w.pinned, false);
assert.ok(typeof w.watchedAt === 'number' && Math.abs(w.watchedAt - Date.now()) < 60_000);
r = await call(movies, 'PATCH', { cookie: A, query: { id: id1 }, body: { watched: false, checked: false } });
r = await call(state, 'GET', { cookie: A }); w = r.body.movies.find((m) => m.id === id1);
assert.equal(w.watched, false); assert.equal(w.watchedAt, null); assert.equal(w.title, 'Past Lives');
ok('check, move to Watched, put back');

r = await call(movies, 'PATCH', { cookie: A, query: { id: 'not-a-uuid' }, body: { pinned: true } }); assert.equal(r.statusCode, 400);

// rooms are isolated
r = await post({ action: 'create', room: 'Other Couple', password: 'secret2', name: 'Ira' });
const C = cookieOf(r);
r = await call(state, 'GET', { cookie: C }); assert.equal(r.body.movies.length, 0);
r = await call(movies, 'PATCH', { cookie: C, query: { id: id1 }, body: { pinned: true } }); assert.equal(r.statusCode, 404);
r = await call(movies, 'DELETE', { cookie: C, query: { id: id1 } });
r = await call(img, 'GET', { cookie: C, query: { id: id1 } }); assert.equal(r.statusCode, 404);
r = await call(state, 'GET', { cookie: A }); assert.equal(r.body.movies.length, 2);
ok('another couple cannot read, change or delete these movies');

// rename, delete
r = await post({ action: 'rename', name: 'Sam' }, A); assert.equal(r.statusCode, 409);
r = await post({ action: 'rename', name: 'Maya R' }, A); assert.equal(r.statusCode, 200);
r = await call(state, 'GET', { cookie: B }); assert.deepEqual(r.body.members.map((m) => m.name), ['Maya R', 'Sam']);
ok('rename works, duplicate name refused');

r = await call(movies, 'DELETE', { cookie: B, query: { id: id2 } }); assert.equal(r.statusCode, 200);
r = await call(state, 'GET', { cookie: A }); assert.equal(r.body.movies.length, 1);
ok('delete');

r = await post({ action: 'logout' }, A); assert.match(r.headers['Set-Cookie'], /Max-Age=0/); ok('logout clears cookie');

// lockout
for (let i = 0; i < 8; i++) r = await post({ action: 'join', room: 'Other Couple', password: 'wrong-wrong', name: 'Raj' });
assert.equal(r.statusCode, 401);
r = await post({ action: 'join', room: 'Other Couple', password: 'secret2', name: 'Raj' });
assert.equal(r.statusCode, 429); ok('8 wrong passwords lock the room for a few minutes');

console.log(`\nall ${n} checks passed`);
process.exit(0);
