/**
 * preciseOcrFull.js — Tüm Tucco menü screenshot'larını Gemini Direct Bbox ile işle
 * 
 * DOĞRU YAKLAŞIM: Chrome'dan alınan 430px screenshot'ları kullan
 * (zone-demo da aynı screenshot'ları gösteriyor → koordinatlar 1:1 eşleşir)
 * 
 * Kullanım: node preciseOcrFull.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;
const OUTPUT_FILE = 'public/ocr-positions-tuccotestt.json';
const SCREENSHOTS_DIR = './public';
const LOG_FILE = 'preciseOcrFull.log';

fs.writeFileSync(LOG_FILE, '');
function log(msg) {
    console.log(msg);
    fs.appendFileSync(LOG_FILE, msg + '\n');
}

// ═══════════════════════════════════════════
// TEK ADIM: Ürün listesi + hassas bbox (birlikte)
// ═══════════════════════════════════════════
async function extractWithBbox(imageBase64, mimeType, retries = 2) {
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
        try {
            const resp = await axios.post(GEMINI_URL, {
                contents: [{
                    parts: [
                        {
                            inline_data: {
                                mime_type: mimeType,
                                data: imageBase64
                            }
                        },
                        {
                            text: `Bu bir restoran menü görseli (mobil ekran screenshot'u). Menüdeki TÜM sipariş edilebilir ürünleri bul.

Her ürün için:
1. Ürün adını menüde YAZDIĞI GİBİ yaz
2. Fiyatı sayı olarak yaz (₺ işareti olmadan)  
3. Ürün adının görseldeki HASSAS konumunu bounding box olarak ver

SADECE JSON array döndür, başka hiçbir şey yazma:
[
  {
    "name": "ÜRÜN ADI",
    "price": 999,
    "bbox": [y_min, x_min, y_max, x_max]
  }
]

KURALLAR:
- bbox koordinatları 0-1000 arasında normalize edilmiş (0=sol üst, 1000=sağ alt)
- bbox SADECE ürün adının yazısını kapsar (fiyat veya açıklama DEĞİL)
- y_min = yazının üst kenarı, y_max = yazının alt kenarı
- x_min = yazının sol kenarı, x_max = yazının sağ kenarı
- Kategori başlıklarını (APERATİFLER, TOSTLAR gibi) ürün olarak EKLEME
- Sadece gerçek sipariş edilebilir ürünleri listele
- Eğer menüde hiç ürün yoksa boş array döndür: []`
                        }
                    ]
                }],
                generationConfig: {
                    temperature: 0.05,
                    maxOutputTokens: 8192
                }
            });

            const text = resp.data.candidates[0].content.parts[0].text;
            const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const products = JSON.parse(jsonStr);
            return products;
        } catch (err) {
            log('  Attempt ' + attempt + ' FAIL: ' + err.message);
            if (attempt > retries) throw err;
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

// ═══════════════════════════════════════════
// SCREENSHOT'LARI BUL VE SIRALA
// ═══════════════════════════════════════════
function findScreenshots() {
    const files = fs.readdirSync(SCREENSHOTS_DIR)
        .filter(f => f.startsWith('menu_screenshot_1_') && f.endsWith('.png'))
        .sort((a, b) => {
            const na = parseInt(a.match(/(\d+)\.png$/)[1]);
            const nb = parseInt(b.match(/(\d+)\.png$/)[1]);
            return na - nb;
        });
    return files;
}

// ═══════════════════════════════════════════
// ANA İŞLEM
// ═══════════════════════════════════════════
async function main() {
    log('═══════════════════════════════════════════');
    log('PreciseOCR Full — Gemini Direct Bbox (Screenshots)');
    log('═══════════════════════════════════════════');
    log('Zaman: ' + new Date().toISOString());

    const screenshots = findScreenshots();
    log('Toplam ' + screenshots.length + ' screenshot bulundu');

    const output = {};
    let totalProducts = 0;
    let totalWithBbox = 0;
    let pageNum = 1;

    for (const filename of screenshots) {
        log('\n══════════════════════════════════════');
        log('SAYFA ' + pageNum + '/' + screenshots.length + ': ' + filename);

        try {
            const imgPath = path.join(SCREENSHOTS_DIR, filename);
            const imgBuf = fs.readFileSync(imgPath);
            const imageBase64 = imgBuf.toString('base64');
            log('  Gorsel: ' + (imgBuf.length / 1024).toFixed(0) + ' KB');

            const products = await extractWithBbox(imageBase64, 'image/png');

            if (products.length === 0) {
                log('  SKIP: Urun yok (kapak/bos sayfa)');
                pageNum++;
                continue;
            }

            // Validate & fix bboxes
            const items = products.map(p => {
                const item = {
                    name: p.name,
                    price: p.price,
                    bbox: p.bbox && p.bbox.length === 4 ? p.bbox : null
                };

                if (item.bbox) {
                    item.bbox = item.bbox.map(v => Math.max(0, Math.min(1000, Math.round(v))));
                    totalWithBbox++;
                }

                return item;
            });

            output[pageNum.toString()] = {
                image_url: '/public/' + filename,
                items: items
            };

            totalProducts += items.length;

            log('  OK: ' + items.length + ' urun, ' + items.filter(i => i.bbox).length + ' bbox');
            items.forEach((it, i) => {
                if (it.bbox) {
                    log('    ' + (i + 1) + '. ' + it.name.substring(0, 30).padEnd(30) + ' y:' + it.bbox[0] + '-' + it.bbox[2] + ' x:' + it.bbox[1] + '-' + it.bbox[3]);
                } else {
                    log('    ' + (i + 1) + '. ' + it.name.substring(0, 30).padEnd(30) + ' NO BBOX');
                }
            });

        } catch (err) {
            log('  ERROR: ' + err.message);
        }

        pageNum++;

        // Rate limit — Gemini Free tier 15 RPM
        if (pageNum <= screenshots.length) {
            await new Promise(r => setTimeout(r, 4500));
        }
    }

    // Kaydet
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

    log('\n═══════════════════════════════════════════');
    log('SONUÇ');
    log('═══════════════════════════════════════════');
    log('Sayfa: ' + Object.keys(output).length);
    log('Toplam urun: ' + totalProducts);
    log('Bbox var: ' + totalWithBbox + ' (' + (totalProducts > 0 ? Math.round(totalWithBbox / totalProducts * 100) : 0) + '%)');
    log('Kaydedildi: ' + OUTPUT_FILE);
}

main().catch(err => {
    log('FATAL: ' + err.message);
    if (err.response) log('API: ' + JSON.stringify(err.response.data).substring(0, 500));
});
