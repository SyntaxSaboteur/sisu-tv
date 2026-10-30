#!/usr/bin/env node
/*
 * Sisu TV - static preview server.
 *
 * The TV loads the app from a local web server, so serving the same directory
 * over HTTP is the closest desktop approximation. Open the printed URL, or
 * append ?mock=1 to force the fake TV data (it is used automatically outside
 * webOS anyway).
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'app');
const PORT = Number(process.env.PORT || process.argv[2] || 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
};

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';

  const target = normalize(join(APP, pathname));
  if (!target.startsWith(APP) || !existsSync(target) || !statSync(target).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 - not found');
    return;
  }

  res.writeHead(200, {
    'content-type': TYPES[extname(target)] || 'application/octet-stream',
    'cache-control': 'no-store'
  });
  createReadStream(target).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Sisu TV preview  ->  http://localhost:${PORT}/`);
  console.log('Fake TV data     ->  http://localhost:' + PORT + '/?mock=1');
});
