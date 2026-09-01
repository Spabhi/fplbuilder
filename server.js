/**
 * server.js — Simple Node.js proxy server for FPL API
 * Bypasses browser CORS restrictions by proxying requests server-side.
 * Run: node server.js
 * Access: http://localhost:3000
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3000;
const FPL_BASE = 'https://fantasy.premierleague.com/api';

// MIME types for static file serving
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function proxyFPLRequest(apiPath, res) {
  const fplUrl = `${FPL_BASE}${apiPath}`;
  console.log(`[PROXY] → ${fplUrl}`);

  const options = {
    hostname: 'fantasy.premierleague.com',
    path: `/api${apiPath}`,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Referer': 'https://fantasy.premierleague.com/',
      'Accept-Language': 'en-US,en;q=0.9',
    }
  };

  const req = https.request(options, (fplRes) => {
    console.log(`[PROXY] ← ${fplRes.statusCode} ${fplUrl}`);
    res.writeHead(fplRes.statusCode, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'max-age=300',
    });
    fplRes.pipe(res);
  });

  req.on('error', (err) => {
    console.error('[PROXY ERROR]', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  });

  req.end();
}

function serveStaticFile(filePath, res) {
  const ext = path.extname(filePath);
  const mime = MIME[ext] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 
      'Content-Type': mime,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
    });
    res.end();
    return;
  }

  // Proxy FPL API requests
  if (pathname.startsWith('/api/')) {
    const apiPath = pathname.replace('/api', '');
    const qs = parsed.search || '';
    proxyFPLRequest(apiPath + qs, res);
    return;
  }

  // Serve static files from the app directory
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);

  // Security: prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // Check if directory — serve index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  serveStaticFile(filePath, res);
});

server.listen(PORT, () => {
  console.log(`\n🚀 FPL Team Builder running at http://localhost:${PORT}`);
  console.log(`📡 FPL API proxy at http://localhost:${PORT}/api/\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Kill the process using it and try again.`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});
