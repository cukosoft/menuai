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
// CATCH-ALL REVERSE PROXY — /p/:slug/*
// Tüm istekleri orijinal domain'e yönlendirir
// SPA'lar için ideal: göreceli URL'ler otomatik çalışır
// ==============================================

// Slug → origin mapping cache
var slugOriginCache = {};

async function getOriginForSlug(slug) {
  if (slugOriginCache[slug]) return slugOriginCache[slug];
  var result = await supabase.from('restaurants').select('menu_url').eq('slug', slug).single();
  if (result.data && result.data.menu_url) {
    var parsed = new URL(result.data.menu_url);
    slugOriginCache[slug] = parsed.origin;
    return parsed.origin;
  }
  return null;
}

app.use('/p/:slug', async function (req, res) {
  var slug = req.params.slug;
  var origin = await getOriginForSlug(slug);
  if (!origin) return res.status(404).send('Restoran bulunamadı');

  // Orijinal URL'yi oluştur
  var targetPath = req.originalUrl.replace('/p/' + slug, '') || '/';
  var targetUrl = origin + targetPath;

  try {
    var axiosConfig = {
      method: req.method.toLowerCase(),
      url: targetUrl,
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': req.headers.accept || '*/*',
        'Accept-Language': 'tr-TR,tr;q=0.9',
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



      // Enjeksiyon scripti — Network interceptor + Menü butonları + Sepet sistemi
      // Ayrı dosyadan okuyarak daha okunabilir yap
      var injectScript = '<scr' + 'ipt>' +
        '(function(){' +
        'var SLUG="' + slug + '";' +
        'var PROXY_PREFIX="/p/"+SLUG;' +
        'var ORIGIN="' + origin + '";' +

        // ═══════════════════════════════════════════════
        // 1. NETWORK INTERCEPTOR
        // ═══════════════════════════════════════════════
        'var oFetch=window.fetch;' +
        'window.fetch=function(u,o){' +
        '  if(typeof u==="string"){' +
        '    if(u.startsWith("/")&&!u.startsWith("/api/")&&!u.startsWith(PROXY_PREFIX)){u=PROXY_PREFIX+u;}' +
        '    else if(u.startsWith(ORIGIN)){u=PROXY_PREFIX+u.substring(ORIGIN.length);}' +
        '  }' +
        '  return oFetch.call(this,u,o);' +
        '};' +
        'var oXHR=XMLHttpRequest.prototype.open;' +
        'XMLHttpRequest.prototype.open=function(m,u){' +
        '  if(typeof u==="string"){' +
        '    if(u.startsWith("/")&&!u.startsWith("/api/")&&!u.startsWith(PROXY_PREFIX)){u=PROXY_PREFIX+u;}' +
        '    else if(u.startsWith(ORIGIN)){u=PROXY_PREFIX+u.substring(ORIGIN.length);}' +
        '  }' +
        '  return oXHR.apply(this,[m,u].concat([].slice.call(arguments,2)));' +
        '};' +

        // ═══════════════════════════════════════════════
        // 2. SEPET SİSTEMİ (Global State)
        // ═══════════════════════════════════════════════
        'var cart=window.__menuaiCart||(window.__menuaiCart=[]);' +

        // ─── Toast bildirimi ───
        'function showCartToast(msg){' +
        '  var t=document.getElementById("menuai-toast");' +
        '  if(!t){t=document.createElement("div");t.id="menuai-toast";document.body.appendChild(t);}' +
        '  t.textContent=msg;t.className="menuai-toast show";' +
        '  setTimeout(function(){t.className="menuai-toast";},2000);' +
        '}' +

        // ─── Sepete ekle ───
        'function addToCart(name,price){' +
        '  var found=false;' +
        '  for(var i=0;i<cart.length;i++){' +
        '    if(cart[i].name===name){cart[i].qty++;found=true;break;}' +
        '  }' +
        '  if(!found)cart.push({name:name,price:price,qty:1});' +
        '  updateCartFAB();' +
        '  showCartToast("✓ "+name+" sepete eklendi");' +
        '}' +
        'window.menuaiAddToCart=addToCart;' +

        // ─── Sepetten çıkar ───
        'function removeFromCart(idx){' +
        '  cart.splice(idx,1);' +
        '  updateCartFAB();' +
        '  renderCartSheet();' +
        '}' +
        'window.menuaiRemoveFromCart=removeFromCart;' +

        // ─── Adet değiştir ───
        'function changeQty(idx,delta){' +
        '  cart[idx].qty+=delta;' +
        '  if(cart[idx].qty<=0)cart.splice(idx,1);' +
        '  updateCartFAB();' +
        '  renderCartSheet();' +
        '}' +
        'window.menuaiChangeQty=changeQty;' +

        // ─── FAB güncelle ───
        'function updateCartFAB(){' +
        '  var fab=document.getElementById("menuai-cart-fab");' +
        '  var badge=document.getElementById("menuai-cart-badge");' +
        '  var total=0;for(var i=0;i<cart.length;i++)total+=cart[i].qty;' +
        '  if(fab)fab.style.display=total>0?"flex":"none";' +
        '  if(badge)badge.textContent=total;' +
        '}' +

        // ─── Sepet sheet aç/kapa ───
        'function toggleCartSheet(){' +
        '  var sheet=document.getElementById("menuai-cart-sheet");' +
        '  var overlay=document.getElementById("menuai-cart-overlay");' +
        '  if(!sheet)return;' +
        '  var isOpen=sheet.classList.contains("open");' +
        '  if(isOpen){sheet.classList.remove("open");overlay.classList.remove("open");}' +
        '  else{renderCartSheet();sheet.classList.add("open");overlay.classList.add("open");}' +
        '}' +
        'window.menuaiToggleCart=toggleCartSheet;' +

        // ─── Sepet sheet render ───
        'function renderCartSheet(){' +
        '  var list=document.getElementById("menuai-cart-list");' +
        '  var totalEl=document.getElementById("menuai-cart-total");' +
        '  if(!list)return;' +
        '  if(cart.length===0){' +
        '    list.innerHTML=\'<div class="menuai-empty">Sepetiniz boş</div>\';' +
        '    if(totalEl)totalEl.textContent="₺0";' +
        '    return;' +
        '  }' +
        '  var html="";var grand=0;' +
        '  for(var i=0;i<cart.length;i++){' +
        '    var c=cart[i];var sub=c.price*c.qty;grand+=sub;' +
        '    html+=\'<div class="menuai-cart-item">\'+' +
        '      \'<div class="menuai-ci-info">\'+' +
        '        \'<span class="menuai-ci-name">\'+c.name+\'</span>\'+' +
        '        \'<span class="menuai-ci-price">₺\'+c.price+\'</span>\'+' +
        '      \'</div>\'+' +
        '      \'<div class="menuai-ci-actions">\'+' +
        '        \'<button class="menuai-qty-btn" onclick="menuaiChangeQty(\'+i+\',-1)">−</button>\'+' +
        '        \'<span class="menuai-ci-qty">\'+c.qty+\'</span>\'+' +
        '        \'<button class="menuai-qty-btn" onclick="menuaiChangeQty(\'+i+\',1)">+</button>\'+' +
        '        \'<button class="menuai-del-btn" onclick="menuaiRemoveFromCart(\'+i+\')">🗑</button>\'+' +
        '      \'</div>\'+' +
        '    \'</div>\';' +
        '  }' +
        '  list.innerHTML=html;' +
        '  if(totalEl)totalEl.textContent="₺"+grand.toFixed(0);' +
        '}' +

        // ─── Sipariş gönder ───
        'function submitCartOrder(){' +
        '  if(cart.length===0){showCartToast("Sepetiniz boş!");return;}' +
        '  var total=0;for(var i=0;i<cart.length;i++)total+=cart[i].price*cart[i].qty;' +
        '  showCartToast("✅ Siparişiniz gönderildi! Toplam: ₺"+total.toFixed(0));' +
        '  cart.length=0;' +
        '  updateCartFAB();' +
        '  toggleCartSheet();' +
        '}' +
        'window.menuaiSubmitOrder=submitCartOrder;' +

        // ═══════════════════════════════════════════════
        // 3. UI ENJEKSİYONU (DOM)
        // ═══════════════════════════════════════════════
        'function injectCartUI(){' +
        '  if(document.getElementById("menuai-cart-fab"))return;' +

        // ── FAB (Floating Action Button) ──
        '  var fab=document.createElement("div");fab.id="menuai-cart-fab";' +
        '  fab.innerHTML=\'<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" width="24" height="24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg><span id="menuai-cart-badge">0</span>\';' +
        '  fab.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();toggleCartSheet();});' +
        '  document.body.appendChild(fab);' +

        // ── Overlay ──
        '  var ov=document.createElement("div");ov.id="menuai-cart-overlay";' +
        '  ov.addEventListener("click",function(){toggleCartSheet();});' +
        '  document.body.appendChild(ov);' +

        // ── Bottom Sheet ──
        '  var sheet=document.createElement("div");sheet.id="menuai-cart-sheet";' +
        '  sheet.innerHTML=\'<div class="menuai-sheet-header">\'+' +
        '    \'<div class="menuai-sheet-handle"></div>\'+' +
        '    \'<h3>🛒 Sepetim</h3>\'+' +
        '    \'<button class="menuai-close" onclick="menuaiToggleCart()">✕</button>\'+' +
        '  \'</div>\'+' +
        '  \'<div class="menuai-cart-list" id="menuai-cart-list"><div class="menuai-empty">Sepetiniz boş</div></div>\'+' +
        '  \'<div class="menuai-sheet-footer">\'+' +
        '    \'<div class="menuai-total-row"><span>Toplam</span><span id="menuai-cart-total" class="menuai-total-amount">₺0</span></div>\'+' +
        '    \'<button class="menuai-order-btn" onclick="menuaiSubmitOrder()">Siparişi Gönder</button>\'+' +
        '  \'</div>\';' +
        '  document.body.appendChild(sheet);' +

        // ── Toast ──
        '  var toast=document.createElement("div");toast.id="menuai-toast";toast.className="menuai-toast";' +
        '  document.body.appendChild(toast);' +

        '  updateCartFAB();' +
        '}' +

        // ═══════════════════════════════════════════════
        // 4. CSS ENJEKSİYONU
        // ═══════════════════════════════════════════════
        'function injectStyles(){' +
        '  if(document.getElementById("menuai-styles"))return;' +
        '  var st=document.createElement("style");st.id="menuai-styles";' +
        '  st.textContent=' +
        '    "' +
        // + Butonu
        '.menuai-plus{width:36px;height:36px;border-radius:50%;border:none;' +
        'background:linear-gradient(135deg,#e85d3a,#f0784a);color:#fff;font-size:20px;font-weight:700;' +
        'display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:9999;' +
        'box-shadow:0 2px 12px rgba(232,93,58,.4);transition:all .2s;pointer-events:auto!important;' +
        'flex-shrink:0;line-height:1;padding:0}' +
        '.menuai-plus:active{transform:translateY(-50%) scale(.85)!important}' +

        // FAB
        '#menuai-cart-fab{position:fixed;bottom:20px;right:20px;width:60px;height:60px;border-radius:50%;' +
        'background:linear-gradient(135deg,#e85d3a,#d44b2a);display:none;align-items:center;justify-content:center;' +
        'cursor:pointer;z-index:99999;box-shadow:0 4px 20px rgba(232,93,58,.5);' +
        'transition:transform .2s,box-shadow .2s;pointer-events:auto}' +
        '#menuai-cart-fab:active{transform:scale(.9)}' +
        '#menuai-cart-badge{position:absolute;top:-4px;right:-4px;background:#22c55e;color:#fff;' +
        'font-size:13px;font-weight:700;width:24px;height:24px;border-radius:50%;' +
        'display:flex;align-items:center;justify-content:center;border:2px solid #1a1a1a;' +
        'font-family:Inter,sans-serif}' +

        // Overlay
        '#menuai-cart-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99998;' +
        'opacity:0;pointer-events:none;transition:opacity .3s}' +
        '#menuai-cart-overlay.open{opacity:1;pointer-events:auto}' +

        // Bottom Sheet
        '#menuai-cart-sheet{position:fixed;bottom:0;left:0;right:0;' +
        'background:#1a1a1a;border-radius:20px 20px 0 0;z-index:100000;' +
        'transform:translateY(100%);transition:transform .35s cubic-bezier(.32,.72,0,1);' +
        'max-height:75vh;display:flex;flex-direction:column;font-family:Inter,sans-serif}' +
        '#menuai-cart-sheet.open{transform:translateY(0)}' +

        // Sheet Header
        '.menuai-sheet-header{padding:12px 20px 8px;display:flex;align-items:center;justify-content:space-between;' +
        'border-bottom:1px solid #2a2a2a;position:relative}' +
        '.menuai-sheet-handle{position:absolute;top:8px;left:50%;transform:translateX(-50%);' +
        'width:40px;height:4px;border-radius:2px;background:#444}' +
        '.menuai-sheet-header h3{color:#fff;margin:0;font-size:18px;font-weight:600}' +
        '.menuai-close{background:none;border:none;color:#888;font-size:20px;cursor:pointer;padding:4px 8px}' +

        // Cart List
        '.menuai-cart-list{flex:1;overflow-y:auto;padding:8px 20px;max-height:45vh}' +
        '.menuai-empty{color:#666;text-align:center;padding:40px 0;font-size:15px}' +
        '.menuai-cart-item{display:flex;align-items:center;justify-content:space-between;' +
        'padding:14px 0;border-bottom:1px solid #222}' +
        '.menuai-ci-info{display:flex;flex-direction:column;flex:1;min-width:0}' +
        '.menuai-ci-name{color:#fff;font-size:15px;font-weight:500;white-space:nowrap;' +
        'overflow:hidden;text-overflow:ellipsis}' +
        '.menuai-ci-price{color:#f0784a;font-size:14px;font-weight:600;margin-top:2px}' +
        '.menuai-ci-actions{display:flex;align-items:center;gap:6px;margin-left:12px}' +
        '.menuai-qty-btn{width:30px;height:30px;border-radius:8px;border:1px solid #444;' +
        'background:#2a2a2a;color:#fff;font-size:16px;font-weight:600;cursor:pointer;' +
        'display:flex;align-items:center;justify-content:center;transition:background .15s}' +
        '.menuai-qty-btn:active{background:#444}' +
        '.menuai-ci-qty{color:#fff;font-size:15px;font-weight:600;min-width:20px;text-align:center}' +
        '.menuai-del-btn{background:none;border:none;font-size:16px;cursor:pointer;padding:4px;' +
        'opacity:.5;transition:opacity .15s}' +
        '.menuai-del-btn:hover{opacity:1}' +

        // Footer
        '.menuai-sheet-footer{padding:16px 20px;border-top:1px solid #2a2a2a}' +
        '.menuai-total-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}' +
        '.menuai-total-row span{color:#aaa;font-size:16px}' +
        '.menuai-total-amount{color:#fff;font-size:22px;font-weight:700}' +
        '.menuai-order-btn{width:100%;padding:16px;border:none;border-radius:14px;' +
        'background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;font-size:16px;' +
        'font-weight:700;cursor:pointer;transition:transform .15s,box-shadow .15s;' +
        'box-shadow:0 4px 16px rgba(34,197,94,.35)}' +
        '.menuai-order-btn:active{transform:scale(.97)}' +

        // Toast
        '.menuai-toast{position:fixed;top:20px;left:50%;transform:translateX(-50%) translateY(-100px);' +
        'background:#1a1a1a;color:#fff;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:500;' +
        'z-index:200000;box-shadow:0 4px 20px rgba(0,0,0,.5);border:1px solid #333;' +
        'transition:transform .35s cubic-bezier(.32,.72,0,1);font-family:Inter,sans-serif;' +
        'pointer-events:none;white-space:nowrap}' +
        '.menuai-toast.show{transform:translateX(-50%) translateY(0)}' +
        '";' +
        '  document.head.appendChild(st);' +
        '}' +

        // ═══════════════════════════════════════════════
        // 5. MENÜ ÖĞE EŞLEŞTİRME + BUTON ENJEKSİYONU
        // ═══════════════════════════════════════════════
        'var items=[];' +
        'function fetchMenu(){' +
        '  var x=new XMLHttpRequest();' +
        '  x.open("GET","/api/menu-items/"+SLUG);' +
        '  x.onload=function(){' +
        '    try{' +
        '      var d=JSON.parse(x.responseText);' +
        '      if(d.success&&d.categories){' +
        '        d.categories.forEach(function(c){c.items.forEach(function(i){items.push({name:i.name,price:i.price});});});' +
        '        console.log("[MenüAi] "+items.length+" ürün yüklendi");' +
        '        tryInject();' +
        '      }' +
        '    }catch(e){console.warn("[MenüAi] Parse hatası",e);}' +
        '  };' +
        '  x.send();' +
        '}' +
        'function tryInject(){' +
        '  if(!items.length)return;' +
        '  var els=document.querySelectorAll("h1,h2,h3,h4,h5,h6,p,span,div,a,li,td,label");' +
        '  var m=0;' +
        '  items.forEach(function(item){' +
        '    var n=item.name.trim().toUpperCase();' +
        '    if(n.length<2)return;' +
        '    for(var i=0;i<els.length;i++){' +
        '      var el=els[i];' +
        '      if(el.dataset.menuaiDone)continue;' +
        '      var t=(el.textContent||"").trim().toUpperCase();' +
        '      if(t===n||(el.childElementCount===0&&t.includes(n)&&t.length<n.length*2)){' +
        '        var ch=el.querySelectorAll("h1,h2,h3,h4,h5,h6,p,span");' +
        '        var skip=false;' +
        '        for(var j=0;j<ch.length;j++){if((ch[j].textContent||"").trim().toUpperCase()===n){skip=true;break;}}' +
        '        if(skip)continue;' +
        '        el.dataset.menuaiDone="1";' +
        '        var b=document.createElement("button");' +
        '        b.className="menuai-plus";b.textContent="+";' +
        '        b.setAttribute("data-n",item.name);b.setAttribute("data-p",item.price);' +
        '        b.addEventListener("click",function(e){' +
        '          e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();' +
        '          var nm=this.getAttribute("data-n");' +
        '          var pr=parseFloat(this.getAttribute("data-p"));' +
        '          addToCart(nm,pr);' +
        '          this.textContent="✓";this.style.background="linear-gradient(135deg,#22c55e,#16a34a)";' +
        '          var s=this;setTimeout(function(){s.textContent="+";s.style.background="";},800);' +
        '          return false;' +
        '        },true);' +
        '        var row=el.closest("a")||el.closest("li")||el.closest("[class*=flex]")||el.parentElement;' +
        '        if(row&&!row.querySelector(".menuai-plus")){' +
        '          row.style.position="relative";' +
        '          b.style.cssText="position:absolute;right:8px;top:50%;transform:translateY(-50%);z-index:9999;";' +
        '          row.appendChild(b);m++;' +
        '        }' +
        '        break;' +
        '      }' +
        '    }' +
        '  });' +
        '  if(m>0)console.log("[MenüAi] "+m+" ürüne + butonu eklendi");' +
        '}' +

        // ═══════════════════════════════════════════════
        // 6. BAŞLAT
        // ═══════════════════════════════════════════════
        'function boot(){' +
        '  injectStyles();injectCartUI();fetchMenu();' +
        '  var obs=new MutationObserver(function(){if(items.length>0)tryInject();});' +
        '  if(document.body)obs.observe(document.body,{childList:true,subtree:true});' +
        '}' +
        'if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",boot);}' +
        'else{boot();}' +
        '})();' +
        '</scr' + 'ipt>';

      // HTML içindeki /xxx şeklindeki absolute path URL'leri proxy path'ine çevir
      // src="/assets/..." → src="/p/mps27/assets/..."
      // href="/dist/..." → href="/p/mps27/dist/..."
      var proxyBase = '/p/' + slug;
      html = html.replace(/(src|href|action)=(["'])\/((?!\/|p\/|api\/menu)[^"']*)\2/gi, function (match, attr, q, path) {
        return attr + '=' + q + proxyBase + '/' + path + q;
      });

      // Scripti head'in en başına ekle (SPA bundle'dan önce)
      html = html.replace(/<head([^>]*)>/i, '<head$1>' + injectScript);

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
        category: cat.name,
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
