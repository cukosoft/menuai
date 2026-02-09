/**
 * OCR Bounding Box Extractor - Gemini 2.5 Flash
 * Ürün adlarının TAM piksel koordinatlarını çıkarır (bounding box)
 * Sadece Page 5-10 (ilk 6 sayfa) test
 */
require('dotenv/config');
const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash';

const dataPath = path.join(__dirname, 'public', 'ocr-positions-tucco.json');
const existingData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

const PROMPT = `Bu bir restoran menü görseli. Görseldeki her sipariş edilebilir ürünü tespit et.

Her ürün için:
1. Ürün adını bul (BÜYÜK HARF, orijinal)
2. Fiyatını bul (sadece sayı)
3. Ürün adı yazısının BOUNDING BOX koordinatlarını ver

BOUNDING BOX formatı: [y_min, x_min, y_max, x_max] — 0-1000 arası normalize edilmiş koordinatlar.
- y_min: yazının üst kenarı
- x_min: yazının sol kenarı (ilk harfin sol kenarı)
- y_max: yazının alt kenarı  
- x_max: yazının sağ kenarı

KURALLAR:
- Kategori başlıkları (KAHVALTI, APERATİFLER vb.) DAHİL ETME
- Fiyatı olmayan ürün ATLA
- Bounding box SADECE ürün adı yazısını kapsamalı (fiyat dahil değil)

JSON formatında döndür:
[{"name": "PATATES CİPSİ", "price": 175, "bbox": [112, 68, 138, 250]}]

Ürün yoksa: []`;

async function fetchImageBase64(url) {
    const r = await fetch(url);
    return Buffer.from(await r.arrayBuffer()).toString('base64');
}

async function extractPage(pageNum, imageUrl) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const body = {
        contents: [{
            parts: [
                { text: PROMPT },
                { inline_data: { mime_type: 'image/webp', data: await fetchImageBase64(imageUrl) } }
            ]
        }],
        generationConfig: { temperature: 0.05, maxOutputTokens: 8192 }
    };

    const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!resp.ok) throw new Error('API ' + resp.status);
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) { console.log('  ⚠️ Parse fail:', text.substring(0, 100)); return []; }

    const raw = JSON.parse(m[0]).filter(i => i.price != null && i.price > 0 && i.bbox);

    // bbox [y_min, x_min, y_max, x_max] → x_percent, y_percent
    return raw.map(item => {
        const [y_min, x_min, y_max, x_max] = item.bbox;
        return {
            name: item.name,
            price: item.price,
            // x_percent = sol kenar (ilk harfin sol kenarı) / 10
            x_percent: Math.round(x_min / 10 * 10) / 10,
            // y_percent = dikey merkez / 10
            y_percent: Math.round((y_min + y_max) / 2 / 10 * 10) / 10,
            bbox: item.bbox // ham veriyi de tut
        };
    });
}

async function main() {
    const pages = [5, 6, 7, 8, 9, 10];
    console.log('🎯 Bounding Box Extraction — Gemini 2.5 Flash');
    console.log('📄 Sayfalar:', pages.join(', '), '\n');

    let total = 0;
    for (const p of pages) {
        const pg = existingData[p];
        if (!pg?.image_url) { console.log(`⏭️  Page ${p}: yok`); continue; }
        process.stdout.write(`📄 Page ${p}... `);
        try {
            const items = await extractPage(p, pg.image_url);
            existingData[p].items = items;
            total += items.length;
            console.log(`✅ ${items.length} ürün`);
            items.slice(0, 4).forEach(i =>
                console.log(`   ${i.name}: x=${i.x_percent}% y=${i.y_percent}% bbox=[${i.bbox}]`)
            );
            if (items.length > 4) console.log(`   ... +${items.length - 4} daha`);
            await new Promise(r => setTimeout(r, 6000));
        } catch (e) { console.log(`❌ ${e.message.substring(0, 150)}`); }
    }

    fs.writeFileSync(dataPath, JSON.stringify(existingData, null, 2));
    console.log(`\n✅ Toplam ${total} ürün, kaydedildi!`);
}

main().catch(e => { console.error(e); process.exit(1); });
