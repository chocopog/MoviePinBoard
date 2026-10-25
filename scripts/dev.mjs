// Local server without the Vercel CLI. Serves public/ and runs the api/ routes.
//   npm run dev:local                      -> data kept in ./.data (an embedded Postgres)
//   DATABASE_URL=postgres://... npm run dev:local   -> use a real database instead
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
process.env.DATABASE_URL ||= 'pglite:./.data';
process.env.SESSION_SECRET ||= 'local-dev-secret-change-me-please';
const port = Number(process.env.PORT || 3000);

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const routes = {
  '/api/auth': () => import('../api/auth.js'),
  '/api/state': () => import('../api/state.js'),
  '/api/movies': () => import('../api/movies.js'),
  '/api/img': () => import('../api/img.js'),
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const route = routes[url.pathname];
    if (route) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString('utf8');
      try { req.body = raw ? JSON.parse(raw) : undefined; } catch { req.body = undefined; }
      req.query = Object.fromEntries(url.searchParams);
      res.status = (c) => { res.statusCode = c; return res; };
      res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
      res.send = (b) => { res.end(b); return res; };
      const mod = await route();
      return mod.default(req, res);
    }
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = join(root, 'public', normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    try {
      const body = await readFile(file);
      res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end('Not found');
    }
  })
  .listen(port, () => console.log(`http://localhost:${port}`));
