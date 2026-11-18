import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createGzip } from 'node:zlib';
import type { IncomingMessage, ServerResponse } from 'node:http';

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.bin': 'application/octet-stream',
};
const applicationPaths = new Set([
  '/',
  '/trace',
  '/login',
]);

function byteRange(value: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const first = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const last = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first > last) return null;
  return { start: first, end: last };
}

export function staticHandler(dist: string, assets: string) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    try {
      const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
      const applicationPath = path.replace(/\/+$/, '') || '/';
      if (path === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"status":"ok"}');
        return;
      }
      const generated = path.startsWith('/assets/');
      const root = await realpath(generated ? assets : dist);
      const relative = generated ? path.slice(8) : applicationPaths.has(applicationPath) ? 'index.html' : path.slice(1);
      const file = await realpath(resolve(root, relative));
      const extension = extname(file);
      if (!file.startsWith(root + sep) || !Object.hasOwn(types, extension)) {
        res.writeHead(404).end();
        return;
      }
      const info = await stat(file);
      if (!info.isFile()) {
        res.writeHead(404).end();
        return;
      }
      const range = req.headers.range ? byteRange(req.headers.range, info.size) : null;
      if (req.headers.range && !range) {
        res.writeHead(416, { 'Content-Range': 'bytes */' + info.size }).end();
        return;
      }
      const compress =
        !range &&
        info.size > 2048 &&
        ['.js', '.json', '.css'].includes(extension) &&
        /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
      const headers: Record<string, string | number> = {
        'Content-Type': types[extension],
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-cache',
        Vary: 'Accept-Encoding',
        'Accept-Ranges': 'bytes',
      };
      if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${info.size}`;
      if (compress) headers['Content-Encoding'] = 'gzip';
      else headers['Content-Length'] = range ? range.end - range.start + 1 : info.size;
      res.writeHead(range ? 206 : 200, headers);
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      const stream = createReadStream(file, range ?? undefined);
      res.once('close', () => stream.destroy());
      stream.on('error', () => res.destroy());
      if (compress)
        stream
          .pipe(createGzip({ level: 3 }))
          .on('error', () => res.destroy())
          .pipe(res);
      else stream.pipe(res);
    } catch {
      if (!res.headersSent) res.writeHead(404);
      res.end();
    }
  };
}
