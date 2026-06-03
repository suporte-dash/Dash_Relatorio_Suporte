const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = 8085;
const ROOT_DIR = __dirname;
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(ROOT_DIR, 'uploads');

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

function serveStatic(req, res, pathname) {
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let filePath = path.join(ROOT_DIR, relativePath);
  const normalized = path.normalize(filePath);

  if (!normalized.startsWith(ROOT_DIR)) {
    send(res, 403, 'Forbidden');
    return;
  }

  fs.stat(normalized, (err, stats) => {
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

    const ext = path.extname(normalized).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    fs.readFile(normalized, (readErr, content) => {
      if (readErr) {
        send(res, 500, 'Could not read file');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
}

function listUploads(res) {
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

function saveUpload(req, res, url) {
  ensureDir(UPLOAD_DIR);

  const originalName = sanitizeFileName(url.searchParams.get('name'));
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${timestamp}-${originalName}`;
  const filePath = path.join(UPLOAD_DIR, fileName);

  const target = fs.createWriteStream(filePath);
  let written = 0;

  req.on('data', (chunk) => {
    written += chunk.length;
  });

  req.on('aborted', () => {
    target.destroy();
    fs.rm(filePath, { force: true }, () => {});
  });

  req.pipe(target);

  target.on('finish', () => {
    sendJson(res, 201, {
      ok: true,
      fileName,
      bytes: written,
    });
  });

  target.on('error', () => {
    sendJson(res, 500, { ok: false, error: 'Could not store upload' });
  });
}

ensureDir(UPLOAD_DIR);

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/api/uploads') {
    listUploads(res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/uploads') {
    saveUpload(req, res, url);
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
  console.log(`Uploads stored in ${UPLOAD_DIR}`);
});
