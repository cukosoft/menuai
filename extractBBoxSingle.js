/**
 * Tek sayfa için bounding box extraction — test amaçlı
 */
require('dotenv/config');
const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash';
const dataPath = path.join(__dirname, 'public', 'ocr-positions-tucco.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

const PAGE = parseInt(process.argv[2] || '9');

const PROMPT = `Bu bir restoran menü görseli. Görseldeki her sipariş edilebilir ürünü tespit et.

Her ürün için:
1. Ürün adını bul (BÜYÜK HARF, orijinal yazıldığı gibi)
2. Fiyatını bul (sadece sayı)
3. Ürün adı yazısının BOUNDING BOX koordinatlarını ver

BOUNDING BOX: [y_min, x_min, y_max, x_max] — 0-1000 arası normalize koordinatlar.
- y_min: yazının üst kenarı (0 = görselin en üstü)
- x_min: yazının sol kenarı (0 = görselin en solu, İLK HARFİN SOL KENARI)
- y_max: yazının alt kenarı
- x_max: yazının sağ kenarı (SON HARFİN SAĞ KENARI)

KURALLAR:
- Kategori başlıkları (KAHVALTI, APERATİFLER vb.) DAHİL ETME
- Fiyatı olmayan, sipariş edilemeyen ürün ATLA
- Bounding box SADECE ürün adı yazısını kapsamalı (fiyat hariç)
- Açıklama metinleri DAHİL ETME

JSON döndür: [{"name":"PATATES CİPSİ","price":175,"bbox":[112,68,138,250]}]`;

async function run() {
    const pg = data[PAGE];
    if (!pg?.image_url) { console.log('Page', PAGE, 'yok'); return; }

    console.log('📄 Page', PAGE, '...');
    const imgResp = await fetch(pg.image_url);
    const imgB64 = Buffer.from(await imgResp.arrayBuffer()).toString('base64');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const body = {
        contents: [{
            parts: [
                { text: PROMPT },
                { inline_data: { mime_type: 'image/webp', data: imgB64 } }
            ]
        }],
        generationConfig: { temperature: 0.05, maxOutputTokens: 8192 }
    };

    const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await resp.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) { console.log('❌ Parse fail:', text.substring(0, 200)); return; }

    let jsonStr = m[0].replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']');
    let items;
    try {
        items = JSON.parse(jsonStr).filter(i => i.price > 0 && i.bbox);
    } catch (e) {
        console.log('❌ JSON error. Raw:');
        console.log(text.substring(0, 500));
        return;
    }

    // bbox → x_percent, y_percent
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

    data[PAGE].items = processed;
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

    console.log(`✅ ${processed.length} ürün`);
    processed.forEach(i => console.log(`  ${i.name}: bbox=[${i.bbox}] → x=${i.x_percent}% y=${i.y_percent}%`));
}

run().catch(e => { console.error(e); process.exit(1); });
