import bcrypt from 'bcryptjs';
import { query } from '../lib/db.js';
import { startSession, endSession, getSession } from '../lib/auth.js';

// A real bcrypt hash of a throwaway string, so unknown rooms cost the same time as wrong passwords.
const DUMMY_HASH = '$2b$10$Faw7x9cTRmejtOjA1RMeYeBOd2sl09lSm/9ZHhBCa05dXTTW4GlSG';
const MAX_TRIES = 8;
const LOCK_MINUTES = 5;

function slugify(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function clean(s, max) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

const isUnique = (e) => e && (e.code === '23505' || /duplicate key|unique constraint/i.test(String(e.message)));

async function create(req, res, body) {
  const roomName = clean(body.room, 32);
  const slug = slugify(roomName);
  const password = String(body.password || '');
  const name = clean(body.name, 24);

  if (slug.length < 3) return res.status(400).json({ error: 'Room name needs at least 3 letters or numbers.' });
  if (password.length < 6 || password.length > 72) return res.status(400).json({ error: 'Password needs 6 to 72 characters.' });
  if (!name) return res.status(400).json({ error: 'Add your name.' });

  const hash = await bcrypt.hash(password, 10);
  let room;
  try {
    [room] = await query('insert into rooms (slug, name, pass_hash) values ($1, $2, $3) returning id', [slug, roomName, hash]);
  } catch (e) {
    if (isUnique(e)) return res.status(409).json({ error: 'That room name is taken. Try another.' });
    throw e;
  }
  const [member] = await query("insert into members (room_id, slot, name) values ($1, 'a', $2) returning id", [room.id, name]);
  const current = await getSession(req);
  const memberships = [
    ...(current?.memberships || []).map((m) => ({ rid: m.roomId, mid: m.memberId })),
    { rid: room.id, mid: member.id },
  ];
  await startSession(req, res, { roomId: room.id, memberId: member.id, memberships });
  return res.status(200).json({ ok: true });
}

async function join(req, res, body) {
  const slug = slugify(body.room);
  const password = String(body.password || '');
  const name = clean(body.name, 24);
  if (!slug || !password || !name) return res.status(400).json({ error: 'Fill in the room, password and your name.' });

  const wrong = () => res.status(401).json({ error: 'Wrong room name or password.' });

  const rows = await query(
    `select id, pass_hash, fail_count, (locked_until is not null and locked_until > now()) as locked from rooms where slug = $1`,
    [slug]
  );
  if (!rows.length) {
    await bcrypt.compare(password, DUMMY_HASH); // keep timing similar
    return wrong();
  }
  const room = rows[0];
  if (room.locked) return res.status(429).json({ error: `Too many wrong passwords. Try again in ${LOCK_MINUTES} minutes.` });

  const ok = await bcrypt.compare(password, room.pass_hash);
  if (!ok) {
    if (room.fail_count + 1 >= MAX_TRIES) {
      await query(`update rooms set fail_count = 0, locked_until = now() + interval '${LOCK_MINUTES} minutes' where id = $1`, [room.id]);
    } else {
      await query('update rooms set fail_count = fail_count + 1 where id = $1', [room.id]);
    }
    return wrong();
  }
  if (room.fail_count) await query('update rooms set fail_count = 0, locked_until = null where id = $1', [room.id]);

  const current = await getSession(req);
  const existingMemberships = (current?.memberships || []).map((m) => ({ rid: m.roomId, mid: m.memberId }));
  // Same name as someone already in the room: sign back in as them (new phone, cleared cookies).
  for (let attempt = 0; attempt < 2; attempt++) {
    const same = await query('select id from members where room_id = $1 and lower(name) = lower($2)', [room.id, name]);
    if (same.length) {
      const memberships = existingMemberships.some((m) => m.rid === room.id)
        ? existingMemberships
        : [...existingMemberships, { rid: room.id, mid: same[0].id }];
      await startSession(req, res, { roomId: room.id, memberId: same[0].id, memberships });
      return res.status(200).json({ ok: true });
    }
    const taken = await query('select slot from members where room_id = $1', [room.id]);
    if (taken.length >= 2) {
      return res.status(403).json({ error: 'This room already has two people. Use one of their names to sign back in.' });
    }
    const slot = taken.some((t) => t.slot === 'a') ? 'b' : 'a';
    try {
      const [member] = await query('insert into members (room_id, slot, name) values ($1, $2, $3) returning id', [room.id, slot, name]);
      const memberships = [...existingMemberships, { rid: room.id, mid: member.id }];
      await startSession(req, res, { roomId: room.id, memberId: member.id, memberships });
      return res.status(200).json({ ok: true });
    } catch (e) {
      if (!isUnique(e)) throw e; // someone grabbed the slot at the same moment: look again
    }

  }
  return res.status(409).json({ error: 'Could not join. Try again.' });
}

async function switchRoom(req, res, body) {
  const current = await getSession(req);
  if (!current) return res.status(401).json({ error: 'Sign in again.' });
  const room = current.memberships.find((m) => m.roomId === body.roomId);
  if (!room) return res.status(404).json({ error: 'You are not in that room.' });
  const [member] = await query('select id from members where id = $1 and room_id = $2', [room.memberId, room.roomId]);
  if (!member) return res.status(404).json({ error: 'That room is no longer available.' });
  await startSession(req, res, {
    roomId: room.roomId,
    memberId: room.memberId,
    memberships: current.memberships.map((m) => ({ rid: m.roomId, mid: m.memberId })),
  });
  return res.status(200).json({ ok: true });
}

async function rename(req, res, body) {
  const s = await getSession(req);
  if (!s) return res.status(401).json({ error: 'Sign in again.' });
  const name = clean(body.name, 24);
  if (!name) return res.status(400).json({ error: 'Add a name.' });
  try {
    await query('update members set name = $1 where id = $2', [name, s.memberId]);
  } catch (e) {
    if (isUnique(e)) return res.status(409).json({ error: 'Your person already uses that name.' });
    throw e;
  }
  return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  try {
    switch (body.action) {
      case 'create':
        return await create(req, res, body);
      case 'join':
        return await join(req, res, body);
      case 'rename':
        return await rename(req, res, body);
      case 'switch':
        return await switchRoom(req, res, body);
      case 'logout':
        endSession(req, res);
        return res.status(200).json({ ok: true });
      default:
        return res.status(400).json({ error: 'Unknown action.' });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Something went wrong on the server.' });
  }
}
