/**
 * imageMenuExtractor.js — Otonom Görsel Menü Pipeline
 * 
 * İşletmeci sadece menü görsellerini verir, bu script:
 *   Faz 1: Gemini Vision ile ürün adı + fiyat çıkarır
 *   Faz 2: Cloud Vision ile hassas bbox pozisyonu tespit eder
 * 
 * Kullanım:
 *   node imageMenuExtractor.js <resim_url_1> [resim_url_2] ...
 *   node imageMenuExtractor.js --from-json public/ocr-positions-tucco.json
 *   node imageMenuExtractor.js --from-json public/ocr-positions-tucco.json --page 6
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { matchProducts, downloadImage, detectText } = require('./cloudVisionBatch');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

// ═══════════════════════════════════════════
// LOGGING
// ═══════════════════════════════════════════
const LOG_FILE = 'imageMenuExtractor.log';
let _logCallback = null;

function setLogCallback(cb) { _logCallback = cb; }

function log(msg) {
    console.log(msg);
    if (_logCallback) _logCallback(msg);
    try { fs.appendFileSync(LOG_FILE, msg + '\n'); } catch (e) { }
}

// ═══════════════════════════════════════════
// FAZ 1: Gemini Vision ile Ürün Çıkarma (Eski — sadece isim+fiyat)
// ═══════════════════════════════════════════
async function extractProductsWithGemini(imageBase64, mimeType) {
    mimeType = mimeType || 'image/webp';
    const prompt = `Bu bir restoran menü görseli. Menüdeki TÜM ürünleri çıkar.

HER ÜRÜN İÇİN:
- "name": Ürün adı (menüde nasıl yazıyorsa AYNEN öyle, Türkçe karakterlere dikkat)
- "price": Fiyat (sadece sayı, TL/₺ işareti koyma). Fiyat yoksa 0

KURALLAR:
1. Sadece SATIŞ ÜRÜNLERİ (yiyecek, içecek, servis)
2. Kategori başlıklarını, dekoratif yazıları, slogan/açıklamaları ÜRÜN OLARAK EKLEME
3. "₺345" → 345, "250 TL" → 250, "1.290" → 1290
4. Ürün açıklamalarını (içerik listesi vb.) EKLEME, sadece ürün adını yaz
5. Büyük/küçük harf fark etmez, menüde nasıl yazıyorsa öyle bırak

JSON FORMAT (sadece array döndür):
[{"name": "Ürün Adı", "price": 250}]

Hiç ürün yoksa: []`;

    const result = await model.generateContent([
        { text: prompt },
        {
            inlineData: {
                mimeType: mimeType,
                data: imageBase64
            }
        }
    ]);

    const text = result.response.text();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
        try {
            return JSON.parse(jsonMatch[0]);
        } catch (e) {
            log('  ⚠️ Gemini JSON parse hatası: ' + e.message);
            return [];
        }
    }
    log('  ⚠️ Gemini JSON döndürmedi');
    return [];
}

// ═══════════════════════════════════════════
// TEK GEÇİŞ: Gemini Vision ile Ürün + Bbox Çıkarma
// Cloud Vision'a gerek yok — Gemini hem ürünü hem konumunu verir
// ═══════════════════════════════════════════
async function extractProductsWithBbox(imageBase64, mimeType) {
    mimeType = mimeType || 'image/webp';
    const prompt = `Bu bir restoran menü görseli. Menüdeki TÜM ürünleri ve onların görsel üzerindeki konumlarını çıkar.

HER ÜRÜN İÇİN:
- "name": Ürün adı (menüde nasıl yazıyorsa AYNEN öyle yaz)
- "price": Fiyat (sadece sayı). Fiyat yoksa 0
- "bbox": Ürün ADININ görseldeki konumu [ymin, xmin, ymax, xmax] formatında (0-1000 arası normalize)
  - ymin: Ürün adı metninin üst kenarı (0 = görselin en üstü, 1000 = en altı)
  - xmin: Ürün adı metninin sol kenarı (0 = görselin en solu, 1000 = en sağı)
  - ymax: Ürün adı metninin alt kenarı
  - xmax: Ürün adı metninin sağ kenarı

ÖNEMLİ KURALLAR:
1. Sadece SATIŞ ÜRÜNLERİ (yiyecek, içecek). Kategori başlıkları DEĞİL
2. bbox sadece ÜRÜN ADI METNİNİ kapsamalı — açıklama/içerik satırını DAHİL ETME
3. bbox fotoğrafları/logoları değil, YAZILI METNİ hedeflemeli
4. Fiyat: "₺345" → 345, "250 TL" → 250
5. Ürün açıklamalarını EKLEME
6. Koordinatlar 0-1000 arası normalize edilmeli

JSON FORMAT (sadece array döndür):
[{"name": "Ürün Adı", "price": 250, "bbox": [120, 50, 140, 300]}]

Hiç ürün yoksa: []`;

    const result = await model.generateContent([
        { text: prompt },
        {
            inlineData: {
                mimeType: mimeType,
                data: imageBase64
            }
        }
    ]);

    const text = result.response.text();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
        try {
            const items = JSON.parse(jsonMatch[0]);
            // Bbox doğrulama — her item'da bbox olmalı ve 4 elemanlı olmalı
            return items.map(item => {
                if (!item.bbox || !Array.isArray(item.bbox) || item.bbox.length !== 4) {
                    log('  ⚠️ Bbox eksik/hatalı: ' + item.name);
                    return { name: item.name, price: item.price || 0, bbox: null };
                }
                // 0-1000 aralığına clamp
                const bbox = item.bbox.map(v => Math.max(0, Math.min(1000, Math.round(v))));
                return { name: item.name, price: item.price || 0, bbox: bbox };
            });
        } catch (e) {
            log('  ⚠️ Gemini JSON parse hatası: ' + e.message);
            return [];
        }
    }
    log('  ⚠️ Gemini JSON döndürmedi');
    return [];
}

// ═══════════════════════════════════════════
// SELF-VERIFICATION: Gemini kendi bbox sonuçlarını doğrular
// Yanlış bbox'ları düzeltir veya kaldırır
// ═══════════════════════════════════════════
async function verifyBboxWithGemini(imageBase64, mimeType, products) {
    mimeType = mimeType || 'image/webp';

    const itemList = products.map((p, i) =>
        `${i + 1}. "${p.name}" fiyat:${p.price}₺ bbox:[${p.bbox ? p.bbox.join(',') : 'YOK'}]`
    ).join('\n');

    const prompt = `Bu bir restoran menü görseli. Aşağıda bu görselden çıkarılmış ürünler ve bbox koordinatları var.

HER ÜRÜNİ KONTROL ET:
- bbox [ymin, xmin, ymax, xmax] formatında, 0-1000 arası normalize
- bbox gerçekten o ürün adının METİN konumunu gösteriyor mu?
- bbox bir fotoğrafın/logonun üzerine mi düşüyor? (YANLIŞ!)
- bbox açıklama/içerik satırını da kapsıyor mu? (YANLIŞ!)

MEVCUT ÜRÜNLER:
${itemList}

GÖREV: Her ürün için bbox'ı doğrula. Hatalı olanları DÜZELT.
- Doğru olanları aynen bırak
- Hatalı olanların bbox'ını düzelt (doğru koordinatları ver)
- Ürün listesinden eksik varsa ekle
- Fazladan ürün varsa (kategori başlığı vb.) SİL

JSON FORMAT (sadece array döndür):
[{"name": "Ürün Adı", "price": 250, "bbox": [120, 50, 140, 300], "verified": true}]

Hiç ürün yoksa: []`;

    try {
        const result = await model.generateContent([
            { text: prompt },
            {
                inlineData: {
                    mimeType: mimeType,
                    data: imageBase64
                }
            }
        ]);

        const text = result.response.text();
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            const items = JSON.parse(jsonMatch[0]);
            return items.map(item => {
                if (!item.bbox || !Array.isArray(item.bbox) || item.bbox.length !== 4) {
                    return { name: item.name, price: item.price || 0, bbox: null };
                }
                const bbox = item.bbox.map(v => Math.max(0, Math.min(1000, Math.round(v))));
                return { name: item.name, price: item.price || 0, bbox: bbox };
            });
        }
    } catch (e) {
        log('  ⚠️ Verification hatası: ' + e.message);
    }

    // Verification başarısız → orijinal sonuçları döndür
    return products;
}

// ═══════════════════════════════════════════
// URL TİPİ ALGILAMA
// ═══════════════════════════════════════════
function isImageUrl(url) {
    // Bilinen görsel uzantıları
    if (/\.(jpe?g|png|webp|gif|bmp|tiff?|svg)(\?.*)?$/i.test(url)) return true;
    // Bilinen görsel CDN pattern'leri
    if (/wp-content\/uploads\/.+\.(jpe?g|png|webp)/i.test(url)) return true;
    return false;
}

// ═══════════════════════════════════════════
// WEB SAYFASI → SmartScroll → Screenshot → Gemini+CloudVision
// Her viewport screenshot'ı bağımsız sayfa olarak işler (bbox dahil)
// ═══════════════════════════════════════════
async function processFromUrl(webUrl, pageKey) {
    log('\n══════════════════════════════════════');
    log('SAYFA ' + pageKey + ' — Web URL İşleme');
    log('  🌐 URL: ' + webUrl);
    log('  📸 SmartScroll + Gemini + CloudVision pipeline');

    const SmartScroll = require('./smartScroll');
    const smartScroll = new SmartScroll({ verbose: true, maxScrolls: 50, scrollDelay: 600 });
    // SmartScroll log'larını bizim callback'e yönlendir
    smartScroll.log = function (...args) { log('  🔄 ' + args.join(' ')); };

    let browser;
    try {
        // 1. Puppeteer aç (kullanıcının Chrome'u, universalExtractor ile aynı ayarlar)
        log('  🚀 Tarayıcı açılıyor...');
        browser = await puppeteer.launch({
            headless: false,
            executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            args: ['--no-sandbox', '--window-size=430,932']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 430, height: 932, isMobile: true });
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15');

        // 2. Sayfayı yükle
        log('  🌐 Sayfa yükleniyor...');
        try {
            await page.goto(webUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        } catch (e) {
            await page.goto(webUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        }
        await new Promise(r => setTimeout(r, 3000));

        // Cookie/popup kapat (DOM tabanlı — universalExtractor'dan)
        await page.evaluate(() => {
            ['cookie', 'consent', 'gdpr'].forEach(kw => {
                document.querySelectorAll(`[class*="${kw}"], [id*="${kw}"]`).forEach(el => {
                    const style = window.getComputedStyle(el);
                    if (style.position === 'fixed' || style.position === 'absolute') el.remove();
                });
            });
        });
        await new Promise(r => setTimeout(r, 500));

        // "Menüyü Gör" butonlarını tıkla
        const menuBtn = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, a'));
            const m = btns.find(b => {
                const t = (b.textContent || '').toLowerCase().trim();
                return (t.includes('menü') || t.includes('menu')) && t.length < 30 &&
                    !t.includes('seçiniz') && !t.includes('select');
            });
            if (m) { m.click(); return m.textContent.trim(); }
            return null;
        });
        if (menuBtn) {
            log('  🖱️ "' + menuBtn + '" tıklandı');
            await new Promise(r => setTimeout(r, 3000));
        }

        // 3. SmartScroll ile viewport screenshot'ları al
        log('\n  ═══ SMARTSCROLL BAŞLIYOR ═══');
        const ssDir = path.join(__dirname, 'screenshots');
        if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });

        const screenshots = await smartScroll.scrollAndCapture(page, ssDir, 'smart_' + pageKey);
        log('  📸 ' + screenshots.length + ' viewport screenshot alındı');

        await browser.close();
        browser = null;

        if (screenshots.length === 0) {
            log('  ❌ Hiç screenshot alınamadı!');
            return null;
        }

        // 4. Her screenshot'ı Gemini + Cloud Vision ile işle
        log('\n  ═══ HER SCREENSHOT İÇİN ÜRÜN + BBOX ÇIKARMA ═══');
        const multiPageResult = {};
        let totalItems = 0;
        let totalMatched = 0;

        for (let i = 0; i < screenshots.length; i++) {
            const ssPath = screenshots[i];
            const subPageKey = String(i + 1);
            log('\n  ── Screenshot ' + subPageKey + '/' + screenshots.length + ' ──');

            const ssBuffer = fs.readFileSync(ssPath);
            const ssBase64 = ssBuffer.toString('base64');

            // Screenshot boyut bilgisi
            // PNG header'dan boyut oku (basit yaklaşım: sharp yoksa sabit viewport)
            const imgWidth = 430;
            const imgHeight = 932;

            // Gemini Vision — Ürün Keşfi
            let products;
            try {
                products = await extractProductsWithGemini(ssBase64, 'image/png');
            } catch (e) {
                log('    ⚠️ Gemini hata: ' + e.message);
                // Rate limit ise bekle
                if (e.message && (e.message.includes('429') || e.message.includes('Resource exhausted'))) {
                    const waitMatch = e.message.match(/(\d+\.?\d*)s/);
                    const waitMs = waitMatch ? Math.ceil(parseFloat(waitMatch[1]) * 1000) + 2000 : 30000;
                    log('    ⏳ Rate limit — ' + Math.ceil(waitMs / 1000) + 's bekleniyor...');
                    await new Promise(r => setTimeout(r, waitMs));
                    try { products = await extractProductsWithGemini(ssBase64, 'image/png'); } catch (e2) { products = []; }
                } else { products = []; }
            }

            if (!products || products.length === 0) {
                log('    ⚠️ Bu screenshot\'ta ürün bulunamadı, atlanıyor');
                continue;
            }
            log('    Gemini: ' + products.length + ' ürün');

            // Cloud Vision — Hassas Bbox
            let annotations;
            try {
                annotations = await detectText(ssBase64);
            } catch (e) {
                log('    ⚠️ Cloud Vision hata: ' + e.message);
                annotations = null;
            }

            let items;
            if (annotations && annotations.length > 1) {
                items = matchProducts(annotations, products, imgWidth, imgHeight);
                const matched = items.filter(r => r.bbox);
                log('    Cloud Vision: ' + (annotations.length - 1) + ' kelime, ' + matched.length + '/' + items.length + ' eşleşme');
                totalMatched += matched.length;
            } else {
                // Cloud Vision yoksa bbox'sız ekle
                items = products.map(p => ({
                    name: p.name,
                    price: p.price || 0,
                    category: p.category || 'Menü',
                    description: p.description || '',
                    bbox: null
                }));
                log('    ⚠️ Cloud Vision başarısız, bbox yok');
            }

            totalItems += items.length;

            // Screenshot'ı public'e kopyala (zone-demo görüntülesin)
            const publicSsName = 'menu_screenshot_' + pageKey + '_' + subPageKey + '.png';
            const publicSsPath = path.join(__dirname, 'public', publicSsName);
            fs.copyFileSync(ssPath, publicSsPath);

            multiPageResult[subPageKey] = {
                image_url: '/public/' + publicSsName,
                source_url: webUrl,
                items: items,
                source_type: 'web_screenshot'
            };

            // Rate limit — screenshots arası bekleme
            if (i < screenshots.length - 1) {
                await new Promise(r => setTimeout(r, 1500));
            }
        }

        log('\n  ═══ TOPLAM SONUÇ (ham) ═══');
        log('  Sayfalar: ' + Object.keys(multiPageResult).length + '/' + screenshots.length);
        log('  Toplam ürün: ' + totalItems);
        log('  Eşleşen bbox: ' + totalMatched + ' (' + (totalItems > 0 ? Math.round(totalMatched / totalItems * 100) : 0) + '%)');

        // ═══ SCROLL OVERLAP DEDUP ═══
        // Ardışık screenshot'larda tekrar eden ürünleri temizle (genel çerçeve)
        const pageKeys = Object.keys(multiPageResult).sort((a, b) => parseInt(a) - parseInt(b));
        let dedupCount = 0;
        for (let pi = 1; pi < pageKeys.length; pi++) {
            const prevItems = multiPageResult[pageKeys[pi - 1]].items;
            const currItems = multiPageResult[pageKeys[pi]].items;
            const prevNames = new Set(prevItems.map(it => it.name.toUpperCase().trim()));

            // Önceki sayfada aynı isim+fiyatla bulunan ürünleri bu sayfadan çıkar
            const filtered = currItems.filter(it => {
                const isDup = prevNames.has(it.name.toUpperCase().trim());
                if (isDup) dedupCount++;
                return !isDup;
            });
            multiPageResult[pageKeys[pi]].items = filtered;
        }
        if (dedupCount > 0) {
            log('  🔄 Scroll overlap dedup: ' + dedupCount + ' tekrar silindi');
        }

        // Güncel toplam
        let finalTotal = 0, finalMatched = 0;
        pageKeys.forEach(k => {
            const items = multiPageResult[k].items;
            finalTotal += items.length;
            finalMatched += items.filter(it => it.bbox).length;
        });
        log('  ═══ FINAL SONUÇ ═══');
        log('  Toplam ürün: ' + finalTotal + ' (dedup sonrası)');
        log('  Eşleşen bbox: ' + finalMatched + ' (' + (finalTotal > 0 ? Math.round(finalMatched / finalTotal * 100) : 0) + '%)');

        return multiPageResult;

    } catch (error) {
        if (browser) await browser.close();
        log('  ❌ HATA Web URL işleme: ' + error.message);
        if (error.stack) log('  ' + error.stack.split('\n')[1]);
        return null;
    }
}

// ═══════════════════════════════════════════
// OTOMATİK: URL tipini algıla → doğru pipeline'ı çağır
// ═══════════════════════════════════════════
async function processAuto(url, pageKey) {
    if (isImageUrl(url)) {
        log('  🖼️ Görsel URL algılandı → doğrudan işleme');
        return await processImage(url, pageKey);
    } else {
        log('  🌐 Web sayfası URL algılandı → screenshot modu');
        return await processFromUrl(url, pageKey);
    }
}

// ═══════════════════════════════════════════
// TEK SAYFAYI İŞLE — Gemini tek geçişte ürün + bbox
// ═══════════════════════════════════════════
async function processImage(imageUrl, pageKey) {
    log('\n══════════════════════════════════════');
    log('SAYFA ' + pageKey + ' — Otonom İşleme');
    log('  Resim: ' + imageUrl);

    // 1. Resim indir
    let imgData;
    try {
        imgData = await downloadImage(imageUrl);
        log('  Boyut: ' + imgData.width + 'x' + imgData.height + ' (' + (imgData.size / 1024).toFixed(0) + ' KB)');
        log('  Format: ' + (imgData.mimeType || 'bilinmiyor'));
    } catch (e) {
        log('  HATA resim indirme: ' + e.message);
        return null;
    }

    // URL geçerlilik kontrolü — HTML sayfası değil, görsel olmalı
    if (imgData.mimeType && imgData.mimeType.startsWith('text/')) {
        log('  ❌ HATA: Bu bir görsel değil, web sayfası! (' + imgData.mimeType + ')');
        log('  💡 İPUCU: Doğrudan görsel URL\'si girin (ör: .webp, .jpg, .png uzantılı)');
        return null;
    }

    // ═══ TEK GEÇİŞ: Gemini Vision — Ürün + Bbox ═══
    log('\n  ═══ Gemini Vision — Ürün + Bbox (tek geçiş) ═══');
    let products;
    try {
        products = await extractProductsWithBbox(imgData.base64, imgData.mimeType);
    } catch (e) {
        log('  HATA Gemini: ' + e.message);
        return null;
    }

    if (!products || products.length === 0) {
        log('  Gemini ürün bulamadı!');
        return null;
    }

    const withBbox = products.filter(p => p.bbox);
    const withoutBbox = products.filter(p => !p.bbox);

    log('  Gemini: ' + products.length + ' ürün, ' + withBbox.length + ' bbox\'lu');
    products.forEach((p, i) => {
        const bboxStr = p.bbox ? ' bbox:' + JSON.stringify(p.bbox) : ' ❌ bbox yok';
        log('    ' + (i + 1) + '. ' + p.name + ' — ' + (p.price || 0) + '₺' + bboxStr);
    });

    if (withoutBbox.length > 0) {
        log('  ⚠️ ' + withoutBbox.length + ' ürünün bbox\'u eksik');
    }

    log('\n  ═══ SONUÇ ═══');
    log('  Toplam: ' + products.length + ' ürün');
    log('  Bbox: ' + withBbox.length + '/' + products.length + ' (' + Math.round(withBbox.length / products.length * 100) + '%)');

    return {
        image_url: imageUrl,
        items: products
    };
}

// ═══════════════════════════════════════════
// ANA FONKSİYON
// ═══════════════════════════════════════════
async function main() {
    log('=== Image Menu Extractor — Otonom Pipeline ===');
    log('Tarih: ' + new Date().toISOString());
    log('');

    const args = process.argv.slice(2);

    // ── MOD 1: --from-json <dosya> [--page N] ──
    if (args[0] === '--from-json') {
        const jsonFile = args[1];
        if (!jsonFile || !fs.existsSync(jsonFile)) {
            log('HATA: JSON dosyası bulunamadı: ' + jsonFile);
            process.exit(1);
        }

        const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
        const allPages = Object.keys(data).sort((a, b) => a - b);

        // --page filtresi
        const pageIdx = args.indexOf('--page');
        const targetPage = pageIdx >= 0 ? args[pageIdx + 1] : null;
        const pagesToProcess = targetPage ? [targetPage] : allPages;

        log('JSON: ' + jsonFile);
        log('Toplam sayfa: ' + allPages.length);
        log('İşlenecek: ' + pagesToProcess.length + ' sayfa');

        let totalItems = 0, totalMatched = 0;

        for (const pageKey of pagesToProcess) {
            if (!data[pageKey]) {
                log('Sayfa ' + pageKey + ' bulunamadı!');
                continue;
            }

            if (!data[pageKey].image_url) {
                log('Sayfa ' + pageKey + ': resim URL yok, atlanıyor');
                continue;
            }

            const result = await processImage(data[pageKey].image_url, pageKey);

            if (result) {
                data[pageKey] = result;
                totalItems += result.items.length;
                totalMatched += result.items.filter(r => r.bbox).length;
            }

            // Rate limit
            if (pagesToProcess.length > 1) {
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        // Kaydet
        fs.writeFileSync(jsonFile, JSON.stringify(data, null, 2));
        log('\n══════════════════════════════════════');
        log('TOPLAM SONUÇ:');
        log('  Sayfa: ' + pagesToProcess.length);
        log('  Ürün: ' + totalItems);
        log('  Eşleşen: ' + totalMatched + ' (' + (totalItems > 0 ? Math.round(totalMatched / totalItems * 100) : 0) + '%)');
        log('Kaydedildi: ' + jsonFile);
        return;
    }

    // ── MOD 2: Doğrudan URL ──
    if (args.length === 0) {
        log('Kullanım:');
        log('  node imageMenuExtractor.js <resim_url_1> [resim_url_2] ...');
        log('  node imageMenuExtractor.js --from-json <json_dosyası> [--page N]');
        process.exit(1);
    }

    const outputFile = 'extracted_image_menu.json';
    const output = {};

    for (let i = 0; i < args.length; i++) {
        const url = args[i];
        // URL'den Page numarasını çıkar (ör: "Page-7-scaled.webp" → "7")
        const pageMatch = url.match(/Page-(\d+)/i);
        const pageKey = pageMatch ? pageMatch[1] : String(i + 1);

        const result = await processImage(url, pageKey);
        if (result) {
            output[pageKey] = result;
        }

        if (args.length > 1 && i < args.length - 1) {
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
    log('\n══════════════════════════════════════');
    log('Kaydedildi: ' + outputFile);
    log('Toplam sayfa: ' + Object.keys(output).length);
    const totalItems = Object.values(output).reduce((s, p) => s + p.items.length, 0);
    const totalMatched = Object.values(output).reduce((s, p) => s + p.items.filter(r => r.bbox).length, 0);
    log('Toplam ürün: ' + totalItems);
    log('Eşleşen: ' + totalMatched + ' (' + (totalItems > 0 ? Math.round(totalMatched / totalItems * 100) : 0) + '%)');
}

// ═══════════════════════════════════════════
// MODULE EXPORTS (server.js'den çağrılabilir)
// ═══════════════════════════════════════════
module.exports = { processImage, processFromUrl, processAuto, isImageUrl, extractProductsWithGemini, setLogCallback };

// CLI modu
if (require.main === module) {
    main().catch(err => {
        log('FATAL ERROR: ' + err.message);
        if (err.stack) log(err.stack);
        process.exit(1);
    });
}
