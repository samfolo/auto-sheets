/**
 * The dev server: one Node process serving the HTTP API and, through Vite's middleware, the
 * React screen, so `npm start` is everything a person needs.
 */
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { createServer as createViteServer } from 'vite';
import { handleApi } from './api.js';
import { Session } from '../engine/session.js';

const PORT = Number(process.env.PORT ?? 4321);

const readBody = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
};

const sendJson = (response: ServerResponse, status: number, json: unknown): void => {
  const payload = JSON.stringify(json);
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  });
  response.end(payload);
};

const main = async (): Promise<void> => {
  const session = new Session();
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'spa',
    root: process.cwd(),
  });

  const server = createHttpServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://localhost:${PORT}`);
    void (async () => {
      const result = await handleApi(
        session,
        request.method ?? 'GET',
        url.pathname,
        request.method === 'POST' ? await readBody(request) : {},
      );
      if (result) {
        sendJson(response, result.status, result.json);
        return;
      }
      vite.middlewares(request, response, () => {
        response.writeHead(404);
        response.end('not found');
      });
    })().catch((error: unknown) => {
      sendJson(response, 500, { error: error instanceof Error ? error.message : 'error' });
    });
  });

  server.listen(PORT, () => {
    process.stdout.write(`replica listening on http://localhost:${PORT}\n`);
  });
};

void main();
