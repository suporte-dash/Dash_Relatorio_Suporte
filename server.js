const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = 8085;
const ROOT_DIR = __dirname;
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(ROOT_DIR, 'storage');
const UPLOAD_DIR = path.join(STORAGE_DIR, 'uploads');
const STATE_FILE = path.join(STORAGE_DIR, 'state.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Suporte@2026';
const SESSION_COOKIE = 'dashboard_admin_session';
const sessions = new Set();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sanitizeFileName(name) {
  return String(name || 'upload.xlsx')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim() || 'upload.xlsx';
}

function send(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    ...headers,
  });
  res.end(body);
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(data));
}

function parseCookies(cookieHeader) {
  const cookies = {};
  String(cookieHeader || '').split(';').forEach((pair) => {
    const index = pair.indexOf('=');
    if (index === -1) return;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

function isAuthenticated(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  return Boolean(token && sessions.has(token));
}

function requireAuth(req, res) {
  if (!isAuthenticated(req)) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return false;
  }
  return true;
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  ensureDir(path.dirname(filePath));
  const tempFile = `${filePath}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
  fs.renameSync(tempFile, filePath);
}

function emptyState() {
  return { currentData: null, history: [] };
}

function readState() {
  const state = readJsonFile(STATE_FILE, emptyState());
  if (!state || typeof state !== 'object') return emptyState();
  if (!Array.isArray(state.history)) state.history = [];
  if (!('currentData' in state)) state.currentData = null;
  return state;
}

function saveState(state) {
  writeJsonFile(STATE_FILE, state);
}

function buildHistoryEntry(data, meta = {}) {
  return {
    id: Date.now(),
    periodo: meta.periodo || data?.periodo || '—',
    savedAt: new Date().toLocaleString('pt-BR'),
    sourceFileName: meta.sourceFileName || null,
    savedFileName: meta.savedFileName || null,
    data,
  };
}

function serveStatic(req, res, pathname) {
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.normalize(path.join(ROOT_DIR, relativePath));

  if (!filePath.startsWith(ROOT_DIR)) {
    send(res, 403, 'Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const fallback = path.join(ROOT_DIR, 'index.html');
      fs.readFile(fallback, (fallbackErr, content) => {
        if (fallbackErr) {
          send(res, 500, 'Could not load index.html');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(content);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        send(res, 500, 'Could not read file');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
}

function handlePublicHistoryGet(res) {
  const state = readState();
  const publicHistory = state.history.map(({ id, periodo, savedAt, sourceFileName, savedFileName, data }) => ({
    id,
    periodo,
    savedAt,
    sourceFileName,
    savedFileName,
    hasFile: Boolean(savedFileName && fs.existsSync(path.join(UPLOAD_DIR, savedFileName))),
    resumo: data?.atendentes ? {
      total_registrados: data.atendentes.reduce((s, a) => s + a.registrados, 0),
      total_concluidas: data.atendentes.reduce((s, a) => s + a.concluidas, 0),
      atendentes: data.atendentes.length,
    } : null,
  }));
  sendJson(res, 200, { history: publicHistory });
}

function serveUploadFile(res, rawName) {
  const fileName = sanitizeFileName(rawName);
  const filePath = path.join(UPLOAD_DIR, fileName);

  if (!filePath.startsWith(UPLOAD_DIR)) {
    send(res, 403, 'Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      send(res, 404, 'File not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      'Content-Length': stats.size,
    });
    fs.createReadStream(filePath).pipe(res);
  });
}


  ensureDir(UPLOAD_DIR);
  fs.readdir(UPLOAD_DIR, (err, files) => {
    if (err) {
      sendJson(res, 500, { error: 'Could not list uploads' });
      return;
    }

    const items = files.map((fileName) => {
      const fullPath = path.join(UPLOAD_DIR, fileName);
      const stat = fs.statSync(fullPath);
      return {
        name: fileName,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      };
    }).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

    sendJson(res, 200, { uploads: items });
  });
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function saveUpload(req, res, url) {
  ensureDir(UPLOAD_DIR);

  const originalName = sanitizeFileName(url.searchParams.get('name'));
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${timestamp}-${originalName}`;
  const filePath = path.join(UPLOAD_DIR, fileName);

  const chunks = [];
  let written = 0;

  req.on('data', (chunk) => {
    chunks.push(chunk);
    written += chunk.length;
  });

  req.on('aborted', () => {
    fs.rm(filePath, { force: true }, () => {});
  });

  req.on('end', () => {
    try {
      fs.writeFileSync(filePath, Buffer.concat(chunks));
      sendJson(res, 201, {
        ok: true,
        fileName,
        bytes: written,
      });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: `Could not store upload: ${error.message}`,
      });
    }
  });
}

async function handleImport(req, res) {
  if (!requireAuth(req, res)) return;
  try {
    const payload = await readRequestBody(req);
    const data = payload.data;

    if (!data || typeof data !== 'object') {
      sendJson(res, 400, { error: 'Import payload missing data' });
      return;
    }

    const state = readState();
    const entry = buildHistoryEntry(data, {
      periodo: payload.periodo,
      sourceFileName: payload.sourceFileName,
      savedFileName: payload.savedFileName,
    });

    state.currentData = data;
    state.history.unshift(entry);
    if (state.history.length > 24) state.history.splice(24);

    saveState(state);
    sendJson(res, 200, { ok: true, state, entry });
  } catch (error) {
    sendJson(res, 400, { error: error.message || 'Could not import data' });
  }
}

function handleStateGet(res) {
  sendJson(res, 200, readState());
}

function handleHistoryGet(res) {
  const state = readState();
  sendJson(res, 200, { history: state.history });
}

function handleHistoryById(res, id) {
  const state = readState();
  const entry = state.history.find((item) => String(item.id) === String(id));
  if (!entry) {
    sendJson(res, 404, { error: 'History entry not found' });
    return;
  }
  sendJson(res, 200, entry);
}

function handleHistoryDelete(req, res, id) {
  if (!requireAuth(req, res)) return;
  const state = readState();
  const index = state.history.findIndex((item) => String(item.id) === String(id));
  if (index === -1) {
    sendJson(res, 404, { error: 'History entry not found' });
    return;
  }

  const [removed] = state.history.splice(index, 1);
  if (removed?.savedFileName) {
    fs.rm(path.join(UPLOAD_DIR, removed.savedFileName), { force: true }, () => {});
  }

  if (index === 0) {
    state.currentData = state.history[0]?.data || null;
  }

  saveState(state);
  sendJson(res, 200, { ok: true, state, removed });
}

async function handleLogin(req, res) {
  try {
    const payload = await readRequestBody(req);
    const password = String(payload.password || '');

    if (password !== ADMIN_PASSWORD) {
      sendJson(res, 401, { ok: false, error: 'Senha inválida' });
      return;
    }

    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    sessions.add(token);

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax`,
    });
    res.end(JSON.stringify({ ok: true }));
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error.message || 'Could not login' });
  }
}

function handleLogout(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  if (token) sessions.delete(token);

  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Set-Cookie': `${SESSION_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`,
  });
  res.end(JSON.stringify({ ok: true }));
}

function handleAuth(req, res) {
  sendJson(res, 200, { authenticated: isAuthenticated(req) });
}

ensureDir(UPLOAD_DIR);
ensureDir(STORAGE_DIR);
if (!fs.existsSync(STATE_FILE)) {
  saveState(emptyState());
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/api/state') {
    handleStateGet(res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/auth') {
    handleAuth(req, res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/login') {
    handleLogin(req, res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/logout') {
    handleLogout(req, res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/public/history') {
    handlePublicHistoryGet(res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/history') {
    if (!requireAuth(req, res)) return;
    handleHistoryGet(res);
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/history/')) {
    const id = url.pathname.split('/').pop();
    handleHistoryById(res, id);
    return;
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/history/')) {
    const id = url.pathname.split('/').pop();
    handleHistoryDelete(req, res, id);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/import') {
    handleImport(req, res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/uploads') {
    if (!requireAuth(req, res)) return;
    listUploads(res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/uploads') {
    if (!requireAuth(req, res)) return;
    saveUpload(req, res, url);
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/uploads/')) {
    const fileName = url.pathname.split('/api/uploads/')[1];
    serveUploadFile(res, fileName);
    return;
  }

  if (req.method === 'GET') {
    serveStatic(req, res, url.pathname);
    return;
  }

  send(res, 405, 'Method Not Allowed');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Dashboard running on http://localhost:${PORT}`);
  console.log(`Storage directory: ${STORAGE_DIR}`);
});