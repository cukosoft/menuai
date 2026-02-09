/**
 * MenüAi Ultimate Core v3.0 - Overlay Panel Edition
 * Restoran menüsü iframe içinde, sipariş paneli overlay olarak
 */

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const zlib = require('zlib');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { URL } = require('url');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Static files (fallback panel js etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_ANON_KEY || ''
);

// Uploads directory
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.random().toString(36).substr(2, 9) + path.extname(file.originalname);
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
  var result = { mode: 'iframe', blocked: false, isPdf: false, error: null };

  try {
    if (targetUrl.toLowerCase().endsWith('.pdf')) {
      result.mode = 'viewer';
      result.isPdf = true;
      return result;
    }

    var response = await axios.head(targetUrl, {
      timeout: 5000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      maxRedirects: 5,
      validateStatus: function () { return true; }
    });

    var contentType = response.headers['content-type'] || '';
    if (contentType.includes('application/pdf')) {
      result.mode = 'viewer';
      result.isPdf = true;
      return result;
    }

    var xfo = response.headers['x-frame-options'] || '';
    if (xfo.toLowerCase().includes('deny') || xfo.toLowerCase().includes('sameorigin')) {
      result.blocked = true;
      result.mode = 'proxy';
    }

    var csp = response.headers['content-security-policy'] || '';
    if (csp.includes('frame-ancestors') && !csp.includes('frame-ancestors *')) {
      result.blocked = true;
      result.mode = 'proxy';
    }
  } catch (error) {
    result.mode = 'proxy';
    result.error = error.message;
  }

  console.log('[Smart Switcher] Decision: ' + result.mode.toUpperCase());
  return result;
}

// ==============================================
// CUSTOMER PAGE — iframe + overlay panel
// ==============================================
function renderCustomerPage(targetUrl, slug, tableNo, res) {
  var html = [
    '<!DOCTYPE html>',
    '<html lang="tr">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">',
    '  <title>MenüAi | Sipariş Ver</title>',
    '  <link rel="preconnect" href="https://fonts.googleapis.com">',
    '  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">',
    '  <style>',
    '    * { margin: 0; padding: 0; box-sizing: border-box; }',
    '    html, body { height: 100%; overflow: hidden; font-family: "Inter", -apple-system, sans-serif; }',
    '    .menu-iframe-wrap { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: #0a0a0a; z-index: 1; }',
    '    .menu-iframe-wrap iframe { width: 100%; height: 100%; border: none; }',
    '  </style>',
    '</head>',
    '<body>',
    '  <div class="menu-iframe-wrap">',
    '    <iframe src="' + targetUrl + '" allowfullscreen></iframe>',
    '  </div>',
    '  ' + SMART_OVERLAY,
    '  <script>',
    '    window.MENUAI_SLUG = "' + slug + '";',
    '    window.MENUAI_TABLE = "' + tableNo + '";',
    '    window.MENUAI_API = "/api/menu-items/' + slug + '";',
    '    (function() {',
    '      fetch("/api/menu-items/' + slug + '")',
    '        .then(function(r) { return r.json(); })',
    '        .then(function(data) {',
    '          if (data.success && data.categories) {',
    '            window.MENUAI_DATA = data.categories;',
    '            console.log("[MenüAi] Supabase verileri yüklendi:", data.categories.length, "kategori");',
    '            if (typeof window.menuaiLoadFromAPI === "function") {',
    '              window.menuaiLoadFromAPI(data.categories);',
    '            }',
    '            window.dispatchEvent(new CustomEvent("menuai-data-ready", { detail: data.categories }));',
    '          }',
    '        })',
    '        .catch(function(err) { console.warn("[MenüAi] API hatası:", err); });',
    '    })();',
    '  </script>',
    '</body>',
    '</html>'
  ].join('\n');

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

// IFRAME MODE (legacy /view endpoint)
function renderIframeMode(targetUrl, res) {
  var html = [
    '<!DOCTYPE html>',
    '<html lang="tr">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '  <title>MenüAi | Menü</title>',
    '  <style>',
    '    * { margin: 0; padding: 0; box-sizing: border-box; }',
    '    html, body { height: 100%; overflow: hidden; }',
    '    .iframe-container { position: fixed; top: 0; left: 0; right: 0; bottom: 90px; background: #0a0a0a; }',
    '    iframe { width: 100%; height: 100%; border: none; }',
    '  </style>',
    '</head>',
    '<body>',
    '  <div class="iframe-container">',
    '    <iframe src="' + targetUrl + '" allowfullscreen></iframe>',
    '  </div>',
    '  ' + SMART_OVERLAY,
    '</body>',
    '</html>'
  ].join('\n');

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

// PROXY MODE (legacy)
async function renderProxyMode(targetUrl, res) {
  try {
    var parsedUrl = new URL(targetUrl);
    var response = await axios.get(targetUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Encoding': 'gzip, deflate, br'
      },
      maxRedirects: 5,
      validateStatus: function () { return true; }
    });

    var contentType = response.headers['content-type'] || '';
    var contentEncoding = response.headers['content-encoding'] || '';

    if (!contentType.includes('text/html')) {
      res.set('Content-Type', contentType);
      return res.send(response.data);
    }

    var htmlBuffer = response.data;
    if (contentEncoding === 'gzip') htmlBuffer = zlib.gunzipSync(response.data);
    else if (contentEncoding === 'br') htmlBuffer = zlib.brotliDecompressSync(response.data);
    else if (contentEncoding === 'deflate') htmlBuffer = zlib.inflateSync(response.data);

    var html = htmlBuffer.toString('utf-8');
    var $ = cheerio.load(html);

    $('meta[http-equiv="X-Frame-Options"]').remove();
    $('meta[http-equiv="Content-Security-Policy"]').remove();

    var baseUrl = parsedUrl.origin;
    if (!$('base').length) $('head').prepend('<base href="' + baseUrl + '/">');

    $('body').append(SMART_OVERLAY);

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send($.html());
  } catch (error) {
    res.status(500).send('<html><body style="background:#0a0a0a;color:#fff;text-align:center;padding:50px;"><h1>Proxy Hatası</h1><p>' + error.message + '</p></body></html>');
  }
}

// PDF VIEWER MODE
function renderViewerMode(pdfUrl, res) {
  var html = [
    '<!DOCTYPE html>',
    '<html lang="tr">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '  <title>MenüAi | PDF Menü</title>',
    '  <style>',
    '    * { margin: 0; padding: 0; box-sizing: border-box; }',
    '    html, body { height: 100%; background: #0a0a0a; }',
    '    .pdf-container { position: fixed; top: 0; left: 0; right: 0; bottom: 90px; }',
    '    embed { width: 100%; height: 100%; border: none; }',
    '  </style>',
    '</head>',
    '<body>',
    '  <div class="pdf-container">',
    '    <embed src="' + pdfUrl + '" type="application/pdf">',
    '  </div>',
    '  ' + SMART_OVERLAY,
    '</body>',
    '</html>'
  ].join('\n');

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

// ======================================
// ROUTES
// ======================================

// Static files
app.use('/public', express.static(path.join(__dirname, 'public')));

// Landing page
app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ==============================================
// CUSTOMER ROUTE — QR kod tarama sonrası
// ==============================================
app.get('/r/:slug/masa/:tableNo', async function (req, res) {
  var slug = req.params.slug;
  var tableNo = req.params.tableNo;
  try {
    var result = await supabase
      .from('restaurants')
      .select('*')
      .eq('slug', slug)
      .single();

    var restaurant = result.data;
    var error = result.error;

    if (error || !restaurant) {
      return res.status(404).send('<html><body style="background:#0a0a0a;color:#fff;text-align:center;padding:50px;font-family:Inter,sans-serif;">' +
        '<h1>🔍 Restoran Bulunamadı</h1>' +
        '<p style="color:#888;margin-top:12px;">"' + slug + '" slug\'ına sahip restoran kayıtlı değil.</p>' +
        '<a href="/" style="color:#4ade80;margin-top:20px;display:inline-block;">Ana Sayfa</a>' +
        '</body></html>');
    }

    var menuUrl = restaurant.menu_url;
    if (!menuUrl) {
      return res.status(400).send('<html><body style="background:#0a0a0a;color:#fff;text-align:center;padding:50px;font-family:Inter,sans-serif;"><h1>Menü URL Tanımsız</h1></body></html>');
    }

    // Proxy path'ine yönlendir
    var parsedMenu = new URL(menuUrl);
    var queryPart = parsedMenu.search || '';
    console.log('[Customer] ' + slug + ' / Masa ' + tableNo + ' → proxy /p/' + slug + '/' + queryPart);
    return res.redirect('/p/' + slug + '/' + queryPart);
  } catch (err) {
    console.error('[Customer Route] Error:', err.message);
    return res.status(500).send('Sunucu hatası');
  }
});

// ==============================================
// OCR Static Files — Proxy'den ÖNCE tanımla
// /ocr-positions-*.json dosyaları proxy handler'a düşmesin
// ==============================================
app.get('/ocr-positions-:slug.json', function (req, res) {
  var slug = req.params.slug;
  var filePath = path.join(__dirname, 'public', 'ocr-positions-' + slug + '.json');
  if (fs.existsSync(filePath)) {
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=60');
    return res.sendFile(filePath);
  }
  res.status(404).json({ error: 'OCR data not found for ' + slug });
});

// Editor: Save OCR positions
app.post('/api/save-ocr/:slug', express.json({ limit: '10mb' }), function (req, res) {
  var slug = req.params.slug;
  var filePath = path.join(__dirname, 'public', 'ocr-positions-' + slug + '.json');
  try {
    fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2));
    console.log('[OCR Save] ' + slug + ' kaydedildi');
    res.json({ ok: true });
  } catch (e) {
    console.error('[OCR Save] Hata:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Editor: Read OCR positions (API format)
app.get('/api/ocr-positions/:slug', function (req, res) {
  var slug = req.params.slug;
  var filePath = path.join(__dirname, 'public', 'ocr-positions-' + slug + '.json');
  if (fs.existsSync(filePath)) {
    return res.json(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
  }
  res.status(404).json({ error: 'not found' });
});

// ==============================================
// SMART MENU — Akıllı Menü Oluşturucu Sayfası
// ==============================================
app.get('/smart-menu', function (req, res) {
  res.sendFile(path.join(__dirname, 'public', 'smart-menu.html'));
});

// ==============================================
// EXTRACT MENU API — Otonom Pipeline (Streaming)
// ==============================================
app.post('/api/extract-menu', express.json(), async function (req, res) {
  var slug = req.body.slug;
  var urls = req.body.urls;

  if (!slug || !urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ type: 'error', text: 'slug ve urls zorunlu' });
  }

  // NDJSON streaming response
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');

  function send(obj) {
    try { res.write(JSON.stringify(obj) + '\n'); } catch (e) { }
  }

  try {
    // Import imageMenuExtractor functions
    var extractor = require('./imageMenuExtractor');

    // Log callback → stream to client
    extractor.setLogCallback(function (msg) {
      send({ type: 'log', text: msg });
    });

    // Build output JSON (ocr-positions format)
    var outputPath = path.join(__dirname, 'public', 'ocr-positions-' + slug + '.json');
    var output = {};

    // Load existing data if present
    if (fs.existsSync(outputPath)) {
      try { output = JSON.parse(fs.readFileSync(outputPath, 'utf-8')); } catch (e) { }
    }

    var totalItems = 0;
    var totalMatched = 0;

    var nextPageKey = 1; // Sayfa numaralama (multi-page support)

    for (var i = 0; i < urls.length; i++) {
      send({ type: 'status', text: 'URL ' + (i + 1) + '/' + urls.length + ' işleniyor...' });

      // Otomatik URL tipi algılama: görsel → doğrudan, web sayfası → screenshot
      var result = await extractor.processAuto(urls[i], String(nextPageKey));

      if (result) {
        // processFromUrl multi-page object döner: {"1": {...}, "2": {...}}
        // processImage tek sayfa döner: {image_url, items}
        if (result.items) {
          // Tek sayfa sonucu (processImage)
          output[String(nextPageKey)] = result;
          totalItems += result.items.length;
          totalMatched += result.items.filter(function (r) { return r.bbox; }).length;
          nextPageKey++;
        } else {
          // Multi-page sonucu (processFromUrl) — her sayfayı ayrı ekle
          var subKeys = Object.keys(result).sort(function (a, b) { return parseInt(a) - parseInt(b); });
          for (var j = 0; j < subKeys.length; j++) {
            var subPage = result[subKeys[j]];
            output[String(nextPageKey)] = subPage;
            totalItems += subPage.items.length;
            totalMatched += subPage.items.filter(function (r) { return r.bbox; }).length;
            nextPageKey++;
          }
        }
      }

      // Rate limit between URLs
      if (urls.length > 1 && i < urls.length - 1) {
        await new Promise(function (r) { setTimeout(r, 2000); });
      }
    }

    // Save JSON
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    send({ type: 'log', text: '💾 Kaydedildi: ' + outputPath });

    var matchRate = totalItems > 0 ? Math.round(totalMatched / totalItems * 100) : 0;
    send({
      type: 'done',
      pages: urls.length,
      products: totalItems,
      matched: totalMatched,
      matchRate: matchRate,
      slug: slug
    });

    // Cleanup log callback
    extractor.setLogCallback(null);

  } catch (err) {
    console.error('[Extract Menu API] Error:', err.message);
    send({ type: 'error', text: err.message });
  }

  res.end();
});

// ==============================================
// CATCH-ALL REVERSE PROXY — /p/:slug/*
// Tüm istekleri orijinal domain'e yönlendirir
// SPA'lar için ideal: göreceli URL'ler otomatik çalışır
// ==============================================

// Slug → restoran bilgisi cache
var slugInfoCache = {};

// Native mode restoranlar (image-based menüler)
// Supabase'e display_mode kolonu eklenince buradan yönetilebilir
var NATIVE_MODE_SLUGS = ['tucco']; // Görsel menüler → native-menu.html kullan

async function getRestaurantInfo(slug) {
  if (slugInfoCache[slug]) return slugInfoCache[slug];
  var result = await supabase.from('restaurants').select('name, menu_url').eq('slug', slug).single();
  if (result.data && result.data.menu_url) {
    var parsed = new URL(result.data.menu_url);
    var info = {
      origin: parsed.origin,
      name: result.data.name || slug,
      isNative: NATIVE_MODE_SLUGS.indexOf(slug) >= 0
    };
    slugInfoCache[slug] = info;
    return info;
  }
  return null;
}

// Eski fonksiyonu uyumluluk için koru
async function getOriginForSlug(slug) {
  var info = await getRestaurantInfo(slug);
  return info ? info.origin : null;
}

app.use('/p/:slug', async function (req, res) {
  var slug = req.params.slug;
  var info = await getRestaurantInfo(slug);
  if (!info) return res.status(404).send('Restoran bulunamadı');
  var origin = info.origin;

  // ═══ NATIVE MODE — Image-based menüler için kendi sayfamızı sun ═══
  if (info.isNative) {
    // Sadece ana sayfa isteğinde native page sun (asset istekleri proxy'ye düşsün)
    var targetPath = req.originalUrl.replace('/p/' + slug, '') || '/';
    if (targetPath === '/' || targetPath === '' || targetPath.match(/^\/?\??/)) {
      console.log('[Native Mode] ' + slug + ' → Kendi menü sayfamız');
      var nativeHtml = fs.readFileSync(path.join(__dirname, 'public', 'native-menu.html'), 'utf8');
      nativeHtml = nativeHtml
        .replace(/__RESTAURANT_NAME__/g, info.name)
        .replace(/__SLUG__/g, slug)
        .replace(/__ITEM_COUNT__/g, '...')
        .replace(/__CAT_COUNT__/g, '...');
      res.set('Content-Type', 'text/html; charset=utf-8');
      return res.send(nativeHtml);
    }
  }

  // Orijinal URL'yi oluştur
  var targetPath = req.originalUrl.replace('/p/' + slug, '') || '/';
  var targetUrl = origin + targetPath;

  try {
    var axiosConfig = {
      method: req.method.toLowerCase(),
      url: targetUrl,
      responseType: 'arraybuffer',
      decompress: false, // Önemli: Axios'un otomatik decompress'ini kapat
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': req.headers.accept || '*/*',
        'Accept-Language': 'tr-TR,tr;q=0.9',
        'Accept-Encoding': 'identity', // Sıkıştırma isteme - raw HTML al
        'Referer': origin + '/'
      },
      maxRedirects: 5,
      timeout: 15000,
      validateStatus: function () { return true; }
    };

    // POST istekleri için body'yi de aktar
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      axiosConfig.data = req.body;
    }

    var response = await axios(axiosConfig);
    var contentType = response.headers['content-type'] || '';
    var contentEncoding = response.headers['content-encoding'] || '';

    // HTML ise: iframe engellerini kaldır + enjeksiyon scripti ekle
    if (contentType.includes('text/html')) {
      var htmlBuffer = response.data;
      if (contentEncoding === 'gzip') htmlBuffer = zlib.gunzipSync(response.data);
      else if (contentEncoding === 'br') htmlBuffer = zlib.brotliDecompressSync(response.data);
      else if (contentEncoding === 'deflate') htmlBuffer = zlib.inflateSync(response.data);

      var html = htmlBuffer.toString('utf-8');

      // DEBUG: Track img count at each step
      var _dbg = function (step, h) { var c = (h.match(/<img/g) || []).length; console.log('[DEBUG-IMG] ' + step + ': ' + c + ' img tags, html len=' + h.length); return c; };
      _dbg('0-raw', html);

      // ═══ LAZY-LOADING FIX (OCR overlay için) ═══
      // Proxy altında browser native lazy-loading çalışmaz (scroll intersection tetiklenmez)
      // loading="lazy" kaldır → tüm görseller hemen yüklenir
      var ocrPositionFile = path.join(__dirname, 'public', 'ocr-positions-' + slug + '.json');
      var hasOCR = fs.existsSync(ocrPositionFile);
      if (hasOCR) {
        // loading="lazy" → kaldır (eager loading yap)
        html = html.replace(/\s+loading\s*=\s*["']lazy["']/gi, '');
        // decoding="async" → kaldır (sync render)
        html = html.replace(/\s+decoding\s*=\s*["']async["']/gi, '');
        // sizes="auto, ..." → auto prefix'ini kaldır
        html = html.replace(/sizes\s*=\s*["']auto,\s*/gi, 'sizes="');
        console.log('[OCR Lazy-Fix] ' + slug + ' için lazy-loading kaldırıldı (eager loading)');
      }
      _dbg('1-lazy-fix', html);

      // Enjeksiyon scripti — harici dosyadan oku, placeholder'ları değiştir
      var injectJsRaw = fs.readFileSync(path.join(__dirname, 'public', 'menuai-inject.js'), 'utf8');
      var injectJs = injectJsRaw
        .replace(/__MENUAI_SLUG__/g, slug)
        .replace(/__MENUAI_ORIGIN__/g, origin);
      var injectScript = '<scr' + 'ipt>' + injectJs + '</scr' + 'ipt>';

      // OCR Overlay — image-based menüler için
      if (hasOCR) {
        console.log('[OCR Overlay] ' + slug + ' için pozisyon verisi bulundu, overlay inject ediliyor');
        var ocrJsRaw = fs.readFileSync(path.join(__dirname, 'public', 'menuai-ocr-overlay.js'), 'utf8');
        var ocrJs = ocrJsRaw
          .replace(/__MENUAI_SLUG__/g, slug)
          .replace(/__MENUAI_ORIGIN__/g, '');
        injectScript += '<scr' + 'ipt>' + ocrJs + '</scr' + 'ipt>';
      }

      _dbg('2-before-path-rewrite', html);

      // HTML içindeki /xxx şeklindeki absolute path URL'leri proxy path'ine çevir
      // src="/assets/..." → src="/p/mps27/assets/..."
      // href="/dist/..." → href="/p/mps27/dist/..."
      var proxyBase = '/p/' + slug;
      html = html.replace(/(src|href|action)=(["'])\/((?!\/|p\/|api\/menu)[^"']*)\2/gi, function (match, attr, q, path) {
        return attr + '=' + q + proxyBase + '/' + path + q;
      });
      _dbg('3-after-path-rewrite', html);

      // Scripti head'in en başına ekle (SPA bundle'dan önce)
      html = html.replace(/<head([^>]*)>/i, '<head$1>' + injectScript);
      _dbg('4-after-inject', html);

      res.set('Content-Type', 'text/html; charset=utf-8');
      res.removeHeader('X-Frame-Options');
      res.removeHeader('Content-Security-Policy');
      return res.send(html);
    }

    // CSS ise: url() referanslarını proxy path'ine yaz
    if (contentType.includes('text/css')) {
      var css = response.data.toString('utf-8');
      // Tam URL'leri proxy path'ine çevir
      css = css.replace(/url\(["']?(https?:\/\/[^"')]+)["']?\)/gi, function (match, url) {
        if (url.startsWith('data:')) return match;
        try {
          var u = new URL(url);
          if (u.origin === origin) {
            return 'url("/p/' + slug + u.pathname + u.search + '")';
          }
        } catch (e) { }
        return match;
      });
      res.set('Content-Type', contentType);
      res.set('Cache-Control', 'public, max-age=3600');
      return res.send(css);
    }

    // Diğer asset'ler (JS, images, fonts vs.) — direkt aktar
    res.set('Content-Type', contentType);
    if (contentType.includes('javascript') || contentType.includes('font') || contentType.includes('image')) {
      res.set('Cache-Control', 'public, max-age=3600');
    }
    res.set('Access-Control-Allow-Origin', '*');
    res.send(response.data);

  } catch (error) {
    console.error('[Proxy] ' + req.method + ' ' + targetUrl + ' → Error:', error.message);
    res.status(502).send('Proxy error');
  }
});

// ==============================================
// MENU ITEMS API — Slug bazlı (Supabase)
// ==============================================
app.get('/api/menu-items/:slug', async function (req, res) {
  try {
    var slug = req.params.slug;
    var restResult = await supabase
      .from('restaurants')
      .select('id')
      .eq('slug', slug)
      .single();

    if (!restResult.data) return res.json({ success: false, error: 'Restaurant not found' });

    var catResult = await supabase
      .from('menu_categories')
      .select('id, name, display_order')
      .eq('restaurant_id', restResult.data.id)
      .order('display_order');

    var categories = catResult.data;
    if (!categories || categories.length === 0) {
      return res.json({ success: true, categories: [] });
    }

    var result = [];
    for (var i = 0; i < categories.length; i++) {
      var cat = categories[i];
      var itemsResult = await supabase
        .from('menu_items')
        .select('name, price, description')
        .eq('category_id', cat.id)
        .order('display_order');

      result.push({
        name: cat.name,
        items: (itemsResult.data || []).map(function (item) {
          return { name: item.name, price: item.price, description: item.description || '' };
        })
      });
    }

    res.json({ success: true, categories: result });
  } catch (error) {
    console.error('[Menu Items API] Error:', error.message);
    res.json({ success: false, error: error.message });
  }
});

// View endpoint (legacy)
app.get('/view', async function (req, res) {
  var targetUrl = req.query.target;
  var uploadId = req.query.id;
  var forceMode = req.query.mode;

  if (uploadId) {
    var filePath = path.join(UPLOADS_DIR, uploadId);
    if (fs.existsSync(filePath)) return renderViewerMode('/public/uploads/' + uploadId, res);
    return res.status(404).send('Dosya bulunamadı');
  }

  if (!targetUrl) return res.redirect('/');

  try { new URL(targetUrl); } catch (e) { return res.status(400).send('Geçersiz URL'); }

  if (forceMode === 'iframe') return renderIframeMode(targetUrl, res);
  if (forceMode === 'proxy') return renderProxyMode(targetUrl, res);
  if (forceMode === 'viewer') return renderViewerMode(targetUrl, res);

  var analysis = await analyzeTarget(targetUrl);
  if (analysis.mode === 'proxy') return renderProxyMode(targetUrl, res);
  if (analysis.mode === 'viewer') return renderViewerMode(targetUrl, res);
  return renderIframeMode(targetUrl, res);
});

// Menu API (legacy — parsed_menu.json)
app.get('/api/menu/items', function (req, res) {
  try {
    var menuPath = path.join(__dirname, 'parsed_menu.json');
    if (!fs.existsSync(menuPath)) return res.json({ items: [] });

    var menuData = JSON.parse(fs.readFileSync(menuPath, 'utf8'));
    var items = [];
    if (menuData.categories) {
      menuData.categories.forEach(function (cat) {
        if (cat.items) cat.items.forEach(function (item) {
          items.push({ name: item.name, price: item.price, category: cat.name });
        });
      });
    }
    res.json({ items });
  } catch (e) {
    res.json({ items: [] });
  }
});

// Upload
app.post('/upload', upload.single('pdf'), function (req, res) {
  if (!req.file) return res.status(400).send('Dosya yüklenemedi');
  res.redirect('/view?id=' + req.file.filename);
});

// Start server
app.listen(PORT, function () {
  console.log('\n🍽️  MenüAi v3.0 (Overlay Panel Edition) running at http://localhost:' + PORT + '\n');
});
