// Tiny static server for Solmar City: serves game/ on http://localhost:8080.
// Node 22, standard library only. Usage: node serve.ts [--port 8080]
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const gameDir = resolve(join(here, 'game'));

let port = 8080;
const portFlag = process.argv.indexOf('--port');
if (portFlag !== -1 && process.argv[portFlag + 1]) port = Number(process.argv[portFlag + 1]) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer((req, res) => {
  const rawPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = normalize(rawPath === '/' ? 'index.html' : rawPath.replace(/^\/+/, ''));
  const file = resolve(join(gameDir, rel));
  if (!file.startsWith(gameDir + '/') && file !== gameDir) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('forbidden');
    return;
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

server.listen(port, () => {
  console.log(`Solmar City serving game/ at http://localhost:${port}`);
});
