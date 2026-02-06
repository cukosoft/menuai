/**
 * MenüAi Ultimate Core v2.1 - Clean Build
 * Universal Menu Wrapper System
 */

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const zlib = require('zlib');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

// Uploads directory
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Sadece PDF dosyaları kabul edilir!'));
  },
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Load overlay from external file
const SMART_OVERLAY = fs.readFileSync(path.join(__dirname, 'overlay.html'), 'utf8');

// Smart Switcher
async function analyzeTarget(targetUrl) {
  const result = { mode: 'iframe', blocked: false, isPdf: false, error: null };

  try {
    if (targetUrl.toLowerCase().endsWith('.pdf')) {
      result.mode = 'viewer';
      result.isPdf = true;
      return result;
    }

    const response = await axios.head(targetUrl, {
      timeout: 5000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      maxRedirects: 5,
      validateStatus: () => true
    });

    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('application/pdf')) {
      result.mode = 'viewer';
      result.isPdf = true;
      return result;
    }

    const xFrameOptions = response.headers['x-frame-options'] || '';
    if (xFrameOptions.toLowerCase().includes('deny') || xFrameOptions.toLowerCase().includes('sameorigin')) {
      result.blocked = true;
      result.mode = 'proxy';
    }

    const csp = response.headers['content-security-policy'] || '';
    if (csp.includes('frame-ancestors') && !csp.includes("frame-ancestors *")) {
      result.blocked = true;
      result.mode = 'proxy';
    }
  } catch (error) {
    result.mode = 'proxy';
    result.error = error.message;
  }

  console.log(`[Smart Switcher] Decision: ${result.mode.toUpperCase()}`);
  return result;
}

// IFRAME MODE
function renderIframeMode(targetUrl, res) {
  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MenüAi | Menü</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; overflow: hidden; }
    .iframe-container { position: fixed; top: 0; left: 0; right: 0; bottom: 90px; background: #0a0a0a; }
    iframe { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <div class="iframe-container">
    <iframe src="${targetUrl}" allowfullscreen></iframe>
  </div>
  ${SMART_OVERLAY}
  <script>
    document.getElementById('menuaiModeBadge').textContent = '⚡ IFRAME';
    document.getElementById('menuaiModeBadge').style.background = 'rgba(16, 185, 129, 0.15)';
    document.getElementById('menuaiModeBadge').style.color = '#10B981';
  </script>
</body>
</html>`;
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

// PROXY MODE
async function renderProxyMode(targetUrl, res) {
  try {
    const parsedUrl = new URL(targetUrl);
    const response = await axios.get(targetUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Encoding': 'gzip, deflate, br'
      },
      maxRedirects: 5,
      validateStatus: () => true
    });

    const contentType = response.headers['content-type'] || '';
    const contentEncoding = response.headers['content-encoding'] || '';

    if (!contentType.includes('text/html')) {
      res.set('Content-Type', contentType);
      return res.send(response.data);
    }

    let htmlBuffer = response.data;
    if (contentEncoding === 'gzip') htmlBuffer = zlib.gunzipSync(response.data);
    else if (contentEncoding === 'br') htmlBuffer = zlib.brotliDecompressSync(response.data);
    else if (contentEncoding === 'deflate') htmlBuffer = zlib.inflateSync(response.data);

    let html = htmlBuffer.toString('utf-8');
    const $ = cheerio.load(html);

    $('meta[http-equiv="X-Frame-Options"]').remove();
    $('meta[http-equiv="Content-Security-Policy"]').remove();

    const baseUrl = parsedUrl.origin;
    if (!$('base').length) $('head').prepend(`<base href="${baseUrl}/">`);

    $('body').append(SMART_OVERLAY);
    $('body').append(`<script>
      document.getElementById('menuaiModeBadge').textContent = '🔓 PROXY';
      document.getElementById('menuaiModeBadge').style.background = 'rgba(239, 68, 68, 0.15)';
      document.getElementById('menuaiModeBadge').style.color = '#EF4444';
    </script>`);

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send($.html());
  } catch (error) {
    res.status(500).send(`<html><body style="background:#0a0a0a;color:#fff;text-align:center;padding:50px;">
      <h1>❌ Proxy Hatası</h1><p>${error.message}</p><a href="/" style="color:#00C2FF;">Ana Sayfa</a>
    </body></html>`);
  }
}

// PDF VIEWER MODE
function renderViewerMode(pdfUrl, res) {
  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MenüAi | PDF Menü</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; background: #0a0a0a; }
    .pdf-container { position: fixed; top: 0; left: 0; right: 0; bottom: 90px; }
    embed { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <div class="pdf-container">
    <embed src="${pdfUrl}" type="application/pdf">
  </div>
  ${SMART_OVERLAY}
  <script>
    document.getElementById('menuaiModeBadge').textContent = '📄 PDF';
    document.getElementById('menuaiModeBadge').style.background = 'rgba(139, 92, 246, 0.15)';
    document.getElementById('menuaiModeBadge').style.color = '#8B5CF6';
  </script>
</body>
</html>`;
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

// Static files
app.use('/public', express.static(path.join(__dirname, 'public')));

// Landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// View endpoint
app.get('/view', async (req, res) => {
  const targetUrl = req.query.target;
  const uploadId = req.query.id;
  const forceMode = req.query.mode;

  if (uploadId) {
    const filePath = path.join(UPLOADS_DIR, uploadId);
    if (fs.existsSync(filePath)) return renderViewerMode(`/public/uploads/${uploadId}`, res);
    return res.status(404).send('Dosya bulunamadı');
  }

  if (!targetUrl) return res.redirect('/');

  try { new URL(targetUrl); } catch (e) { return res.status(400).send('Geçersiz URL'); }

  if (forceMode === 'iframe') return renderIframeMode(targetUrl, res);
  if (forceMode === 'proxy') return renderProxyMode(targetUrl, res);
  if (forceMode === 'viewer') return renderViewerMode(targetUrl, res);

  const analysis = await analyzeTarget(targetUrl);
  if (analysis.mode === 'proxy') return renderProxyMode(targetUrl, res);
  if (analysis.mode === 'viewer') return renderViewerMode(targetUrl, res);
  return renderIframeMode(targetUrl, res);
});

// Menu API
app.get('/api/menu/items', (req, res) => {
  try {
    const menuPath = path.join(__dirname, 'parsed_menu.json');
    if (!fs.existsSync(menuPath)) return res.json({ items: [] });

    const menuData = JSON.parse(fs.readFileSync(menuPath, 'utf8'));
    const items = [];
    if (menuData.categories) {
      menuData.categories.forEach(cat => {
        if (cat.items) cat.items.forEach(item => items.push({ name: item.name, price: item.price, category: cat.name }));
      });
    }
    res.json({ items });
  } catch (e) {
    res.json({ items: [] });
  }
});

// Upload
app.post('/upload', upload.single('pdf'), (req, res) => {
  if (!req.file) return res.status(400).send('Dosya yüklenemedi');
  res.redirect(`/view?id=${req.file.filename}`);
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🍽️  MenüAi v2.1 running at http://localhost:${PORT}\n`);
});
