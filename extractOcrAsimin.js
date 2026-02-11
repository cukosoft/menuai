/**
 * OCR Bounding Box Extractor for Asimin Yeri
 * Playwright ile sayfadan menü görsellerini yakalar,
 * Gemini'ye gönderip bounding box + ürün bilgisi çıkarır
 */
require('dotenv/config');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash';
const SLUG = 'asimin-yeri';
const URL = 'https://www.asiminyeri.com.tr/sayfa-menu-2';

const PROMPT = `Bu bir restoran menü görseli. Görseldeki her sipariş edilebilir ürünü tespit et.

Her ürün için:
1. Ürün adını bul (orijinal yazıldığı gibi)
2. Fiyatını bul (sadece sayı, TL)
3. Ürün adı yazısının BOUNDING BOX koordinatlarını ver

BOUNDING BOX formatı: [y_min, x_min, y_max, x_max] — 0-1000 arası normalize edilmiş koordinatlar.
- y_min: yazının üst kenarı
- x_min: yazının sol kenarı
- y_max: yazının alt kenarı
- x_max: yazının sağ kenarı

KURALLAR:
- Kategori başlıkları (ANA YEMEKLER, MEZELER vb.) DAHİL ETME
- Fiyatı olmayan ürün ATLA
- Bounding box SADECE ürün adı yazısını kapsamalı (fiyat dahil değil)

JSON formatında döndür:
[{"name": "Testi Kebabı / Clay Kebab", "price": 900, "bbox": [112, 68, 138, 450]}]

Ürün yoksa: []`;

async function askGemini(base64Image) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const body = {
        contents: [{
            parts: [
                { text: PROMPT },
                { inline_data: { mime_type: 'image/png', data: base64Image } }
            ]
        }],
        generationConfig: { temperature: 0.05, maxOutputTokens: 16384, responseMimeType: 'application/json' }
    };

    const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error('API ' + resp.status + ': ' + errText.substring(0, 200));
    }
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) { console.log('  ⚠️ Parse fail:', text.substring(0, 200)); return []; }

    // Robust JSON repair
    let jsonStr = m[0];
    // Fix trailing commas before ] or }
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
    // Fix unquoted property names
    jsonStr = jsonStr.replace(/(\{|,)\s*([a-zA-Z_]\w*)\s*:/g, '$1"$2":');

    try {
        return JSON.parse(jsonStr).filter(i => i.price != null && i.price > 0 && i.bbox);
    } catch (e2) {
        console.log('  ⚠️ JSON repair failed:', e2.message.substring(0, 100));
        console.log('  Raw:', jsonStr.substring(0, 300));
        return [];
    }
}

async function main() {
    console.log('🎯 OCR BBox Extraction for Asimin Yeri\n');

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    console.log('🌐 Sayfa açılıyor...');
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Menü görsellerini bul (büyük images)
    const imgData = await page.evaluate(() => {
        const imgs = document.querySelectorAll('img');
        const results = [];
        imgs.forEach((img, i) => {
            const rect = img.getBoundingClientRect();
            if (rect.width > 300 && rect.height > 300) {
                // Canvas ile base64'e çevir
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const dataUrl = canvas.toDataURL('image/png');
                results.push({
                    index: i,
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                    base64: dataUrl.split(',')[1],
                    src: img.src.substring(0, 50) + '...'
                });
            }
        });
        return results;
    });

    await browser.close();

    console.log(`📸 ${imgData.length} menü görseli bulundu\n`);

    const ocrResult = [];
    let totalItems = 0;

    for (let p = 0; p < imgData.length; p++) {
        const img = imgData[p];
        process.stdout.write(`📄 Image ${p + 1}/${imgData.length} (${img.width}x${img.height})... `);

        try {
            const items = await askGemini(img.base64);

            // bbox [y_min, x_min, y_max, x_max] → x_percent, y_percent
            const processed = items.map(item => {
                const [y_min, x_min, y_max, x_max] = item.bbox;
                return {
                    name: item.name,
                    price: item.price,
                    x_percent: Math.round(x_min / 10 * 10) / 10,
                    y_percent: Math.round((y_min + y_max) / 2 / 10 * 10) / 10,
                    bbox: item.bbox
                };
            });

            ocrResult.push({
                page: p + 1,
                image_width: img.width,
                image_height: img.height,
                items: processed
            });

            totalItems += processed.length;
            console.log(`✅ ${processed.length} ürün`);
            processed.slice(0, 3).forEach(i =>
                console.log(`   ${i.name}: ₺${i.price} bbox=[${i.bbox}]`)
            );
            if (processed.length > 3) console.log(`   ... +${processed.length - 3} daha`);

            // Rate limit
            if (p < imgData.length - 1) await new Promise(r => setTimeout(r, 4000));
        } catch (e) {
            console.log(`❌ ${e.message.substring(0, 200)}`);
            ocrResult.push({ page: p + 1, items: [] });
        }
    }

    // Save
    const outPath = path.join(__dirname, 'public', `ocr-positions-${SLUG}.json`);
    fs.writeFileSync(outPath, JSON.stringify(ocrResult, null, 2));
    console.log(`\n✅ Toplam ${totalItems} ürün, kaydedildi: ${outPath}`);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
