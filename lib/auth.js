import { SignJWT, jwtVerify } from 'jose';
import { query } from './db.js';

const COOKIE = 'pinboard_session';
const MAX_AGE = 90 * 24 * 60 * 60;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('SESSION_SECRET is not set (use at least 16 random characters)');
  return new TextEncoder().encode(s);
}

function secureFlag(req) {
  return String(req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '';
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export async function startSession(req, res, { roomId, memberId, memberships }) {
  memberships = memberships || [{ rid: roomId, mid: memberId }];
  const token = await new SignJWT({ rid: roomId, mid: memberId, rooms: memberships })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secureFlag(req)}`);
}

export function endSession(req, res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secureFlag(req)}`);
}

// Returns { roomId, roomName, memberId, slot, name } or null.
export async function getSession(req) {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  let payload;
  try {
    ({ payload } = await jwtVerify(token, secret()));
  } catch {
    return null;
  }
  if (typeof payload.rid !== 'string' || typeof payload.mid !== 'string') return null;
  const rows = await query(
    `select m.id as member_id, m.slot, m.name, r.id as room_id, r.name as room_name
       from members m join rooms r on r.id = m.room_id
      where m.id = $1 and r.id = $2`,
    [payload.mid, payload.rid]
  );
  if (!rows.length) return null;
  const r = rows[0];
  const memberships = Array.isArray(payload.rooms)
    ? payload.rooms.filter((m) => m && typeof m.rid === 'string' && typeof m.mid === 'string')
    : [{ rid: r.room_id, mid: r.member_id }];
  const ids = memberships.map((m) => m.mid);
  const rooms = await query(
    `select m.id as member_id, m.room_id, m.name, r.name as room_name
       from members m join rooms r on r.id = m.room_id
      where m.id = any($1::uuid[]) order by r.created_at`,
    [ids]
  );
  return {
    roomId: r.room_id, roomName: r.room_name, memberId: r.member_id, slot: r.slot, name: r.name,
    memberships: rooms.map((room) => ({ roomId: room.room_id, memberId: room.member_id, name: room.name, roomName: room.room_name })),
  };
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
