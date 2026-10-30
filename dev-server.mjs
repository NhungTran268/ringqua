// Server chạy thử trên máy: node --experimental-sqlite dev-server.mjs  → http://localhost:8888
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
process.env.LOCAL_SQLITE ||= path.resolve('local.sqlite');
const { handle } = await import('./netlify/functions/lib/app.mjs');
const PUBLIC = path.resolve('public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const PORT = process.env.PORT || 8888;

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const r = await handle(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }));
    const headers = Object.fromEntries(r.headers);
    res.writeHead(r.status, headers);
    res.end(Buffer.from(await r.arrayBuffer()));
    return;
  }
  let p = url.pathname;
  if (p.startsWith('/play/')) p = '/play.html';
  else if (p === '/app' || p.startsWith('/app/')) p = '/app.html';
  else if (p.endsWith('/')) p += 'index.html';
  const file = path.join(PUBLIC, path.normalize(p));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Không tìm thấy');
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`RinhQuà đang chạy tại http://localhost:${PORT}`));
