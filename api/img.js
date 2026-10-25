import { query } from '../lib/db.js';
import { getSession, UUID } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const s = await getSession(req);
    if (!s) return res.status(401).end();
    const id = String((req.query && req.query.id) || '');
    if (!UUID.test(id)) return res.status(400).end();

    const rows = await query('select image, image_type from movies where id = $1 and room_id = $2 and image is not null', [id, s.roomId]);
    if (!rows.length) return res.status(404).end();

    res.setHeader('Content-Type', rows[0].image_type || 'image/jpeg');
    // A movie's poster never changes, so the browser can keep it. "private" keeps it out of shared caches.
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    return res.status(200).send(Buffer.from(rows[0].image, 'base64'));
  } catch (e) {
    console.error(e);
    return res.status(500).end();
  }
}
