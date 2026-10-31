import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mock = process.argv.includes('--mock');
const port = Number(process.env.PHROMMAYAN_PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.json': 'application/json; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (mock && url.pathname === '/__qa_api' && req.method === 'POST') {
    let text = '';
    for await (const part of req) text += part;
    const data = JSON.parse(text);
    let output;
    if (data.action === 'login') output = { success: true, role: data.username === 'qa-admin' ? 'admin' : 'client' };
    else if (data.action === 'saveResult') {
      await new Promise(resolve => setTimeout(resolve, 1800));
      output = { success: data.username !== 'qa-fail' };
    } else if (data.action === 'list') output = { success: true, data: [
      { time: '31/10/2026 12:00', user: 'QA_READY', pass: 'TEST123', status: 'Ready' },
      { time: '31/10/2026 11:00', user: 'QA_USED', pass: 'TEST456', status: 'Used' }
    ] };
    else output = { success: false, message: 'Local QA does not create real tokens' };
    res.writeHead(200, { 'Content-Type': types['.json'] }); res.end(JSON.stringify(output)); return;
  }
  try {
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const filename = path.resolve(root, '.' + relative);
    if (!filename.startsWith(root) || relative.includes('/.')) { res.writeHead(403); res.end(); return; }
    let bytes = await fs.readFile(filename);
    if (mock && filename.endsWith('app.js')) bytes = Buffer.from(bytes.toString().replace(/const SCRIPT_URL = '[^']+';/, "const SCRIPT_URL = '/__qa_api';"));
    res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(bytes);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}${mock ? ' (QA responses only; no Google Sheets calls)' : ''}`));
