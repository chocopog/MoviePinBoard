import { query } from '../lib/db.js';
import { getSession, UUID } from '../lib/auth.js';

const MAX_MOVIES_PER_ROOM = 500;
const MAX_IMAGE_CHARS = 400_000; // base64 text, about 300 KB
const IMAGE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

const text = (v, max) => String(v == null ? '' : v).replace(/\r\n/g, '\n').trim().slice(0, max);
const bool = (v) => (typeof v === 'boolean' ? v : null);
const slot = (v) => (v === 'a' || v === 'b' ? v : null);

async function add(s, body, res) {
  const title = text(body.title, 120).replace(/\s+/g, ' ');
  const note = text(body.note, 300);
  const forSlot = slot(body.forSlot);
  if (!title) return res.status(400).json({ error: 'Add a title.' });
  if (!forSlot) return res.status(400).json({ error: 'Pick a board.' });

  let image = null;
  let imageType = null;
  if (body.image) {
    const m = IMAGE.exec(String(body.image));
    if (!m || m[2].length > MAX_IMAGE_CHARS) return res.status(400).json({ error: 'That poster is too large or not an image.' });
    imageType = m[1];
    image = m[2];
  }

  const [{ n }] = await query('select count(*)::int as n from movies where room_id = $1', [s.roomId]);
  if (n >= MAX_MOVIES_PER_ROOM) return res.status(409).json({ error: 'This room is full. Delete a few movies first.' });

  const [row] = await query(
    `insert into movies (room_id, title, note, for_slot, by_slot, pinned, image, image_type)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [s.roomId, title, note, forSlot, s.slot, body.pinned === true, image, imageType]
  );
  return res.status(200).json({ ok: true, id: row.id });
}

async function change(s, id, body, res) {
  const pinned = bool(body.pinned);
  const checked = bool(body.checked);
  const watched = bool(body.watched);
  const rows = await query(
    `update movies set
        pinned = coalesce($3::boolean, pinned),
        checked = coalesce($4::boolean, checked),
        watched = coalesce($5::boolean, watched),
        watched_at = case when $5::boolean is true then now()
                          when $5::boolean is false then null
                          else watched_at end
      where id = $1 and room_id = $2 returning id`,
    [id, s.roomId, pinned, checked, watched]
  );
  if (!rows.length) return res.status(404).json({ error: 'That movie is gone.' });
  return res.status(200).json({ ok: true });
}

async function remove(s, id, res) {
  await query('delete from movies where id = $1 and room_id = $2', [id, s.roomId]);
  return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const s = await getSession(req);
    if (!s) return res.status(401).json({ error: 'Not signed in.' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const id = req.query && req.query.id;

    if (req.method === 'POST') return await add(s, body, res);
    if (req.method === 'PATCH' || req.method === 'DELETE') {
      if (!UUID.test(String(id || ''))) return res.status(400).json({ error: 'Bad movie id.' });
      return req.method === 'PATCH' ? await change(s, id, body, res) : await remove(s, id, res);
    }
    return res.status(405).json({ error: 'Use POST, PATCH or DELETE.' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Something went wrong on the server.' });
  }
}
