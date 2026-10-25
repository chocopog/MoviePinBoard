import { query } from '../lib/db.js';
import { getSession } from '../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET.' });
  try {
    const s = await getSession(req);
    if (!s) return res.status(401).json({ error: 'Not signed in.' });

    const [members, movies] = await Promise.all([
      query('select slot, name from members where room_id = $1 order by slot', [s.roomId]),
      query(
        `select id, title, note, for_slot, by_slot, pinned, checked, watched,
                (extract(epoch from watched_at) * 1000)::float8 as watched_at,
                (extract(epoch from created_at) * 1000)::float8 as created_at,
                (image is not null) as has_image
           from movies where room_id = $1`,
        [s.roomId]
      ),
    ]);

    return res.status(200).json({
      room: { name: s.roomName },
      me: { slot: s.slot, name: s.name },
      rooms: s.memberships.map((room) => ({
        id: room.roomId,
        name: room.roomName,
        memberName: room.name,
      })),
      members: members.map((m) => ({ slot: m.slot, name: m.name })),
      movies: movies.map((m) => ({
        id: m.id,
        title: m.title,
        note: m.note,
        forSlot: m.for_slot,
        bySlot: m.by_slot,
        pinned: m.pinned,
        checked: m.checked,
        watched: m.watched,
        watchedAt: m.watched_at == null ? null : Number(m.watched_at),
        createdAt: Number(m.created_at),
        hasImage: m.has_image,
      })),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Something went wrong on the server.' });
  }
}
