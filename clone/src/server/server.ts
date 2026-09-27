// The HTTP API over the workbook engine, plus static hosting of the client.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { parseArea, parseCell, type CellAddr } from '../engine/address.ts';
import { Workbook } from '../engine/workbook.ts';

const workbook = new Workbook();
let version = 0;

const stateBody = () => ({
  version,
  revision: workbook.revision,
  cells: workbook.view(),
});

const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const readBody = (req: IncomingMessage): Promise<Record<string, unknown>> =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(data ? (JSON.parse(data) as Record<string, unknown>) : {});
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    req.on('error', reject);
  });

const cellsOf = (body: Record<string, unknown>, field: string): CellAddr[] => {
  const list = Array.isArray(body[field]) ? (body[field] as unknown[]) : [];
  return list
    .map((a) => (typeof a === 'string' ? parseCell(a) : null))
    .filter((a): a is CellAddr => a !== null);
};

const handleApi = async (
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
): Promise<void> => {
  if (req.method === 'GET' && path === '/api/health') {
    sendJson(res, 200, { ok: true });
    return;
  }
  if (req.method === 'GET' && path === '/api/state') {
    sendJson(res, 200, stateBody());
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }
  const body = await readBody(req);
  switch (path) {
    case '/api/reset': {
      workbook.reset();
      version += 1;
      break;
    }
    case '/api/entry': {
      const addr = typeof body.addr === 'string' ? parseCell(body.addr) : null;
      if (addr && typeof body.text === 'string') workbook.enter(addr, body.text);
      break;
    }
    case '/api/entry-many': {
      const addrs = cellsOf(body, 'addrs');
      if (addrs.length > 0 && typeof body.text === 'string') workbook.enterMany(addrs, body.text);
      break;
    }
    case '/api/clear':
      workbook.clear(cellsOf(body, 'addrs'));
      break;
    case '/api/fill-down': {
      const area = typeof body.area === 'string' ? parseArea(body.area) : null;
      if (area) workbook.fillDown(area);
      break;
    }
    case '/api/copy': {
      const area = typeof body.area === 'string' ? parseArea(body.area) : null;
      if (area) workbook.copy(area);
      break;
    }
    case '/api/paste': {
      const at = typeof body.at === 'string' ? parseCell(body.at) : null;
      if (at) workbook.paste(at);
      break;
    }
    case '/api/undo':
      workbook.undo();
      break;
    case '/api/redo':
      workbook.redo();
      break;
    default:
      sendJson(res, 404, { error: 'not found' });
      return;
  }
  sendJson(res, 200, stateBody());
};

const PORT = Number(process.env.PORT ?? 4321);

const main = async (): Promise<void> => {
  const { createServer: createVite } = await import('vite');
  const vite = await createVite({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0] ?? '/';
    if (path.startsWith('/api/')) {
      handleApi(req, res, path).catch((error: unknown) => {
        sendJson(res, 500, { error: error instanceof Error ? error.message : 'error' });
      });
      return;
    }
    if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
      readFile('index.html', 'utf8')
        .then((html) => vite.transformIndexHtml('/', html))
        .then((html) => {
          res.writeHead(200, { 'content-type': 'text/html' });
          res.end(html);
        })
        .catch(() => {
          res.writeHead(500);
          res.end();
        });
      return;
    }
    vite.middlewares(req, res);
  });
  server.listen(PORT, () => {
    console.log(`serving on http://localhost:${PORT}`);
  });
};

void main();
