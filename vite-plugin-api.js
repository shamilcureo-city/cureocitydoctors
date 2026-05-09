// Dev-only middleware that lets us run files under /api/ during `vite dev`
// the same way Vercel does in production. Maps /api/foo/bar → ./api/foo/bar.js
// and bridges Connect-style req/res ↔ standard Request/Response so a single
// Edge-style export default handler(req) works in both environments.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function apiDevPlugin() {
  return {
    name: 'cureocity-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next();

        const pathname = req.url.split('?')[0];
        const modulePath = path.resolve(__dirname, '.' + pathname + '.js');

        let handler;
        try {
          const mod = await server.ssrLoadModule(modulePath);
          handler = mod.default;
        } catch (err) {
          if (err?.code === 'ERR_LOAD_URL' || /Cannot find module/.test(String(err?.message))) {
            res.statusCode = 404;
            res.end('Not found');
            return;
          }
          console.error(`[api-dev] failed to load ${modulePath}`, err);
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: err?.message || 'Module load error' }));
          return;
        }

        if (typeof handler !== 'function') {
          res.statusCode = 500;
          res.end(`API file ${pathname} has no default export`);
          return;
        }

        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks);

        const url = `http://${req.headers.host || 'localhost'}${req.url}`;
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) {
          if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
          else if (v != null) headers.set(k, v);
        }

        const stdReq = new Request(url, {
          method: req.method,
          headers,
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
        });

        let stdRes;
        try {
          stdRes = await handler(stdReq);
        } catch (err) {
          console.error(`[api-dev] handler ${pathname} threw`, err);
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: err?.message || 'Handler error' }));
          return;
        }

        if (!(stdRes instanceof Response)) {
          res.statusCode = 500;
          res.end('Handler did not return a Response');
          return;
        }

        res.statusCode = stdRes.status;
        stdRes.headers.forEach((v, k) => res.setHeader(k, v));

        // If the handler returned a streaming body (SSE, chunked transfer),
        // pipe each chunk through immediately. Buffering would defeat the
        // purpose for /api/ai/reason and similar endpoints.
        if (stdRes.body && typeof stdRes.body.getReader === 'function') {
          const reader = stdRes.body.getReader();
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value) res.write(Buffer.from(value));
            }
          } catch (err) {
            console.error(`[api-dev] stream piping error for ${pathname}`, err);
          } finally {
            res.end();
          }
          return;
        }

        const buf = Buffer.from(await stdRes.arrayBuffer());
        res.end(buf);
      });
    },
  };
}
