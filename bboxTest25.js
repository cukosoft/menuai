/**
 * bboxTest25.js — Gemini 2.5 Flash Bbox Test
 * 
 * İlk 3 screenshot üzerinde gemini-2.5-flash ile bbox doğruluğunu test et.
 * Eski gemini-2.0-flash ile karşılaştırma amaçlı.
 * 
 * Kullanım: node bboxTest25.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const GEMINI_KEY = process.env.GEMINI_API_KEY;

// ═══════════════════════════════════════════
// MODEL SEÇİMİ — Test edilecek model
// ═══════════════════════════════════════════
const MODEL = 'gemini-3-flash-preview';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`;

const SCREENSHOTS_DIR = './public';
const OUTPUT_FILE = 'public/bbox-test-3flash.json';
const TEST_COUNT = 3; // Kaç screenshot test edilecek

console.log('═══════════════════════════════════════════');
console.log(`BBOX TEST — Model: ${MODEL}`);
console.log('═══════════════════════════════════════════');

async function extractWithBbox(imageBase64, mimeType) {
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
    return JSON.parse(jsonStr);
}

async function main() {
    // Screenshot'ları bul ve sırala
    const files = fs.readdirSync(SCREENSHOTS_DIR)
        .filter(f => f.startsWith('menu_screenshot_1_') && f.endsWith('.png'))
        .sort((a, b) => {
            const na = parseInt(a.match(/(\d+)\.png$/)[1]);
            const nb = parseInt(b.match(/(\d+)\.png$/)[1]);
            return na - nb;
        })
        .slice(0, TEST_COUNT);

    console.log(`\n${files.length} screenshot test edilecek: ${files.join(', ')}\n`);

    const output = {};
    let totalProducts = 0;
    let totalWithBbox = 0;

    for (let i = 0; i < files.length; i++) {
        const filename = files[i];
        const pageNum = i + 1;
        console.log(`\n══════════════════════════════════════`);
        console.log(`SAYFA ${pageNum}/${files.length}: ${filename}`);

        try {
            const imgPath = path.join(SCREENSHOTS_DIR, filename);
            const imgBuf = fs.readFileSync(imgPath);
            const imageBase64 = imgBuf.toString('base64');
            console.log(`  Görsel: ${(imgBuf.length / 1024).toFixed(0)} KB`);

            const startMs = Date.now();
            const products = await extractWithBbox(imageBase64, 'image/png');
            const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
            console.log(`  Süre: ${elapsed}s`);

            if (products.length === 0) {
                console.log('  SKIP: Ürün yok (kapak/boş sayfa)');
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

            console.log(`  ✅ ${items.length} ürün, ${items.filter(i => i.bbox).length} bbox`);
            items.forEach((it, idx) => {
                const bboxStr = it.bbox
                    ? `y:${it.bbox[0]}-${it.bbox[2]} x:${it.bbox[1]}-${it.bbox[3]}`
                    : 'NO BBOX';
                console.log(`    ${idx + 1}. ${it.name.substring(0, 35).padEnd(35)} ${bboxStr} ${it.price ? '₺' + it.price : ''}`);
            });

        } catch (err) {
            console.log(`  ❌ HATA: ${err.message}`);
            if (err.response) {
                console.log('  API Response:', JSON.stringify(err.response.data).substring(0, 300));
            }
        }

        // Rate limit
        if (i < files.length - 1) {
            console.log('  ⏳ 2s bekleniyor...');
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    // Kaydet
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

    console.log('\n═══════════════════════════════════════════');
    console.log('SONUÇ');
    console.log('═══════════════════════════════════════════');
    console.log(`Model: ${MODEL}`);
    console.log(`Sayfa: ${Object.keys(output).length}`);
    console.log(`Toplam ürün: ${totalProducts}`);
    console.log(`Bbox var: ${totalWithBbox} (${totalProducts > 0 ? Math.round(totalWithBbox / totalProducts * 100) : 0}%)`);
    console.log(`Kaydedildi: ${OUTPUT_FILE}`);
}

main().catch(err => {
    console.error('FATAL:', err.message);
    if (err.response) console.error('API:', JSON.stringify(err.response.data).substring(0, 500));
});
