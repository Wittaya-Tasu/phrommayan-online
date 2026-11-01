import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mock = process.argv.includes('--mock');
const port = Number(process.env.PHROMMAYAN_PORT || 4173);
let qaAccount = { username: 'qa-owner', password: 'local-test-only' };
let qaToken = '';
const qaResults = new Set();
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.json': 'application/json; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (mock && url.pathname === '/__qa_api' && req.method === 'POST') {
    let text = '';
    for await (const part of req) text += part;
    const data = JSON.parse(text);
    let output;
    if (data.action === 'login') {
      const valid = data.username === qaAccount.username && data.password === qaAccount.password;
      if (valid) qaToken = 'qa-session-' + Date.now();
      output = valid ? { success: true, role: 'owner', username: qaAccount.username, sessionToken: qaToken } : { success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
    } else if (!qaToken || data.sessionToken !== qaToken) output = { success: false, code: 'SESSION_EXPIRED', message: 'กรุณาเข้าสู่ระบบอีกครั้ง' };
    else if (data.action === 'saveResult') {
      await new Promise(resolve => setTimeout(resolve, 1800));
      output = { success: true, duplicate: qaResults.has(data.requestId) };
      qaResults.add(data.requestId);
    } else if (data.action === 'updateAccount') {
      if (data.currentPassword !== qaAccount.password) output = { success: false, message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' };
      else {
        qaAccount = { username: data.username, password: data.newPassword || qaAccount.password };
        qaToken = 'qa-session-' + Date.now();
        output = { success: true, role: 'owner', username: qaAccount.username, sessionToken: qaToken };
      }
    } else if (data.action === 'logout') { qaToken = ''; output = { success: true }; }
    else output = { success: false, message: 'ไม่มีสิทธิ์ใช้งาน' };
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
