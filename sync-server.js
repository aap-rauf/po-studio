'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const QRCode = require('qrcode');

const ROOT = __dirname;
const APP_FILE = path.join(ROOT, 'outputs', 'po-studio.html');
const MOBILE_FILE = path.join(ROOT, 'mobile-scan.html');
const SCANNER_FILE = path.join(ROOT, 'node_modules', 'html5-qrcode', 'dist', 'html5-qrcode.min.js');
const PORT = Number(process.env.PORT || 8080);
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const PAIR_WINDOW_MS = 5 * 60 * 1000;
const MAX_EVENTS_PER_SESSION = 2000;
const sessions = new Map();
const sessionsByPhoneToken = new Map();
const accessSessions = new Map();

function cookieValue(req, name) {
  const cookieHeader = String(req.headers.cookie || '');
  for (const part of cookieHeader.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return '';
}

function hasDesktopAccess(req) {
  const token = cookieValue(req, '__Host-po-studio-session');
  const expiresAt = accessSessions.get(token);
  if (!expiresAt || expiresAt < Date.now()) {
    accessSessions.delete(token);
    return false;
  }
  return true;
}

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  res.end(body);
}

function readJson(req, maxBytes = 4096) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) {
        reject(new Error('Request is too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function publicBaseUrl(req) {
  const configured = process.env.PUBLIC_BASE_URL;
  if (configured) return new URL(configured);
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const protocol = forwardedProto || (req.socket.encrypted ? 'https' : 'http');
  if (!forwardedHost) throw new Error('Set PUBLIC_BASE_URL to the public HTTPS URL for this service.');
  return new URL(`${protocol}://${forwardedHost}`);
}

function activeSession(session) {
  const now = Date.now();
  const expiry = session.phoneConnectedAt ? session.expiresAt : session.pairingExpiresAt;
  if (now > expiry) {
    removeSession(session);
    return false;
  }
  return true;
}

function removeSession(session) {
  if (session.desktopResponse && !session.desktopResponse.writableEnded) session.desktopResponse.end();
  sessions.delete(session.id);
  sessionsByPhoneToken.delete(session.phoneToken);
}

function emit(session, eventName, data) {
  const entry = { id: ++session.nextEventId, eventName, data };
  session.events.push(entry);
  if (session.events.length > MAX_EVENTS_PER_SESSION) session.events.shift();
  if (session.desktopResponse && !session.desktopResponse.writableEnded) {
    session.desktopResponse.write(`id: ${entry.id}\nevent: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
  }
  return entry;
}

function serveFile(res, filename, type) {
  fs.readFile(filename, (error, data) => {
    if (error) return json(res, 404, { error: 'File not found' });
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': data.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    });
    res.end(data);
  });
}

const loginPage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#173b31"><title>PO Studio sign in</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:#f3f6f3;color:#28382f;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}.card{width:min(100%,380px);background:#fff;border:1px solid #dfe6e0;border-radius:16px;padding:24px;box-shadow:0 8px 30px #26362d0b}.brand{display:flex;align-items:center;gap:10px;margin-bottom:22px}.mark{width:40px;height:40px;border-radius:12px;background:#f0c881;color:#234135;display:grid;place-items:center;font-weight:850}.brand strong{display:block;color:#173b31;font-size:16px}.brand span{color:#78867d;font-size:12px}label{display:block;margin:0 0 6px;color:#5f6f65;font-size:12px;font-weight:700}input{width:100%;height:46px;padding:0 12px;border:1px solid #d7e0d9;border-radius:9px;font:inherit}button{width:100%;height:46px;margin-top:14px;border:0;border-radius:9px;background:#173b31;color:#fff;font:inherit;font-weight:750}p{color:#78867d;font-size:12px}.error{min-height:18px;color:#b43535}</style></head><body><main class="card"><div class="brand"><div class="mark">PO</div><div><strong>PO Studio</strong><span>Sign in to continue</span></div></div><form id="login"><label for="password">Access password</label><input id="password" type="password" autocomplete="current-password" required><button>Continue</button><p class="error" id="error" aria-live="polite"></p></form></main><script>document.getElementById('login').addEventListener('submit',async e=>{e.preventDefault();const button=e.currentTarget.querySelector('button');button.disabled=true;document.getElementById('error').textContent='';try{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:document.getElementById('password').value})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Sign in failed');location.replace('/')}catch(error){document.getElementById('error').textContent=error.message}finally{button.disabled=false}})</script></body></html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  if (req.method === 'GET' && pathname === '/health') return json(res, 200, { ok: true });
  if (req.method === 'GET' && pathname === '/login') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    return res.end(loginPage);
  }
  if (req.method === 'POST' && pathname === '/api/login') {
    const expected = process.env.APP_PASSWORD || '';
    if (expected.length < 16) return json(res, 503, { error: 'The service owner must configure APP_PASSWORD with at least 16 characters.' });
    let body;
    try { body = await readJson(req); }
    catch (error) { return json(res, 400, { error: error.message }); }
    const supplied = Buffer.from(String(body.password || ''));
    const configured = Buffer.from(expected);
    const matches = supplied.length === configured.length && crypto.timingSafeEqual(supplied, configured);
    if (!matches) return json(res, 401, { error: 'Incorrect password.' });
    const token = crypto.randomBytes(32).toString('hex');
    accessSessions.set(token, Date.now() + SESSION_TTL_MS);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength('{"ok":true}'), 'Cache-Control': 'no-store', 'Set-Cookie': `__Host-po-studio-session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}` });
    return res.end('{"ok":true}');
  }
  if (pathname.startsWith('/api/pairs/') || pathname === '/api/pairs') {
    if (!hasDesktopAccess(req)) return json(res, 401, { error: 'Sign in to PO Studio first.' });
  }
  if (req.method === 'GET' && (pathname === '/' || pathname === '/po-studio.html')) {
    if (!hasDesktopAccess(req)) { res.writeHead(302, { Location: '/login', 'Cache-Control': 'no-store' }); return res.end(); }
    return serveFile(res, APP_FILE, 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && /^\/scan\/[a-f0-9]{48}$/.test(pathname)) {
    return serveFile(res, MOBILE_FILE, 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && pathname === '/vendor/html5-qrcode.min.js') {
    return serveFile(res, SCANNER_FILE, 'text/javascript; charset=utf-8');
  }

  if (req.method === 'POST' && pathname === '/api/pairs') {
    let base;
    try { base = publicBaseUrl(req); }
    catch (error) { return json(res, 503, { error: error.message }); }
    if (base.protocol !== 'https:') {
      return json(res, 503, { error: 'Phone camera pairing needs a public HTTPS address. Configure PUBLIC_BASE_URL.' });
    }
    const now = Date.now();
    const session = {
      id: crypto.randomBytes(12).toString('hex'),
      desktopKey: crypto.randomBytes(32).toString('hex'),
      phoneToken: crypto.randomBytes(24).toString('hex'),
      createdAt: now,
      pairingExpiresAt: now + PAIR_WINDOW_MS,
      expiresAt: now + SESSION_TTL_MS,
      phoneConnectedAt: 0,
      desktopResponse: null,
      nextEventId: 0,
      events: []
    };
    sessions.set(session.id, session);
    sessionsByPhoneToken.set(session.phoneToken, session);
    const mobileUrl = new URL(`/scan/${session.phoneToken}`, base).toString();
    session.mobileUrl = mobileUrl;
    return json(res, 201, {
      pairId: session.id,
      desktopKey: session.desktopKey,
      mobileUrl,
      expiresAt: session.pairingExpiresAt
    });
  }

  const qrMatch = pathname.match(/^\/api\/pairs\/([a-f0-9]{24})\/qr$/);
  if (req.method === 'GET' && qrMatch) {
    const session = sessions.get(qrMatch[1]);
    if (!session || !activeSession(session) || url.searchParams.get('key') !== session.desktopKey) {
      return json(res, 404, { error: 'Pairing session expired or invalid' });
    }
    try {
      const svg = await QRCode.toString(session.mobileUrl, {
        type: 'svg',
        width: 210,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#173b31', light: '#ffffff' }
      });
      res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Content-Length': Buffer.byteLength(svg), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
      return res.end(svg);
    } catch { return json(res, 500, { error: 'Could not generate the pairing QR code.' }); }
  }

  const eventMatch = pathname.match(/^\/api\/pairs\/([a-f0-9]{24})\/events$/);
  if (req.method === 'GET' && eventMatch) {
    const session = sessions.get(eventMatch[1]);
    if (!session || !activeSession(session) || url.searchParams.get('key') !== session.desktopKey) {
      return json(res, 404, { error: 'Pairing session expired or invalid' });
    }
    if (session.desktopResponse && !session.desktopResponse.writableEnded) session.desktopResponse.end();
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    });
    session.desktopResponse = res;
    res.write('retry: 2000\n\n');
    const lastId = Number(req.headers['last-event-id'] || url.searchParams.get('after') || 0);
    for (const entry of session.events) {
      if (entry.id > lastId) res.write(`id: ${entry.id}\nevent: ${entry.eventName}\ndata: ${JSON.stringify(entry.data)}\n\n`);
    }
    res.write(`event: status\ndata: ${JSON.stringify({ phoneConnected: Boolean(session.phoneConnectedAt) })}\n\n`);
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': keepalive\n\n');
    }, 20000);
    res.on('close', () => {
      clearInterval(heartbeat);
      if (session.desktopResponse === res) session.desktopResponse = null;
    });
    return;
  }

  const closeMatch = pathname.match(/^\/api\/pairs\/([a-f0-9]{24})\/close$/);
  if (req.method === 'POST' && closeMatch) {
    const session = sessions.get(closeMatch[1]);
    if (!session || url.searchParams.get('key') !== session.desktopKey) {
      return json(res, 404, { error: 'Pairing session expired or invalid' });
    }
    emit(session, 'closed', {});
    removeSession(session);
    return json(res, 200, { closed: true });
  }

  const phoneMatch = pathname.match(/^\/api\/phone\/([a-f0-9]{48})\/(connect|scans)$/);
  if (req.method === 'POST' && phoneMatch) {
    const session = sessionsByPhoneToken.get(phoneMatch[1]);
    if (!session || !activeSession(session)) return json(res, 410, { error: 'This pairing link expired. Ask PO Studio for a new QR code.' });
    if (phoneMatch[2] === 'connect') {
      if (!session.phoneConnectedAt) emit(session, 'phone-connected', { connected: true });
      session.phoneConnectedAt = Date.now();
      session.expiresAt = Date.now() + SESSION_TTL_MS;
      return json(res, 200, { connected: true });
    }
    if (!session.phoneConnectedAt) return json(res, 409, { error: 'Open this pairing link again to connect.' });
    let body;
    try { body = await readJson(req); }
    catch (error) { return json(res, 400, { error: error.message }); }
    const barcode = String(body.barcode || '').trim();
    const quantity = Number(body.quantity);
    if (!barcode || barcode.length > 80 || /[\u0000-\u001f]/.test(barcode)) return json(res, 400, { error: 'Enter a valid barcode.' });
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100000) return json(res, 400, { error: 'Quantity must be a whole number from 1 to 100000.' });
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    const entry = emit(session, 'scan', { barcode, quantity, sentAt: new Date().toISOString() });
    return json(res, 202, { accepted: true, eventId: entry.id });
  }

  return json(res, 404, { error: 'Not found' });
});

setInterval(() => {
  for (const session of sessions.values()) activeSession(session);
  for (const [token, expiry] of accessSessions) if (expiry < Date.now()) accessSessions.delete(token);
}, 60000).unref();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`PO Studio sync service listening on port ${PORT}`);
});
