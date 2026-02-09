/**
 * OCR V2 - Sadece ilk 6 sayfa (Page 5-10) test
 */
require('dotenv/config');
const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash';

const dataPath = path.join(__dirname, 'public', 'ocr-positions-tucco.json');
const existingData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

const PROMPT = `Bu bir restoran menü görseli. Görseldeki HER sipariş edilebilir ürünü bul.

Her ürün için şunları döndür:
- name: Ürün adı (BÜYÜK HARF, orijinal yazıldığı gibi)
- price: Fiyat (sadece sayı, TL işareti olmadan). Fiyatı yoksa null.
- x_percent: Ürün adı YAZISININ SOL kenarının, görselin sol kenarından yatay uzaklığı (% olarak, 0-100 arası tam sayı)
- y_percent: Ürün adı YAZISININ DİKEY merkez noktasının, görselin üst kenarından dikey uzaklığı (% olarak, 0-100 arası tam sayı)

KURALLAR:
1. Kategori başlıklarını DAHİL ETME. Sadece sipariş edilebilir ürünleri dahil et.
2. Fiyatı olmayan ürünleri ATLA.
3. x_percent = ürün adının SOL kenarı (yazının başladığı yer).
4. y_percent çok hassas olmalı.

JSON döndür, başka açıklama YAZMA:
[{"name": "ÜRÜN ADI", "price": 175, "x_percent": 8, "y_percent": 12}]

Sipariş edilebilir ürün yoksa: []`;

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
    if (!m) return [];
    return JSON.parse(m[0]).filter(i => i.price != null && i.price > 0);
}

async function main() {
    // Önceki çalışmadan Page 6 ve 7 zaten güncellendi, sadece 8-10 kaldı
    const pages = [9, 10];
    console.log('🔍 Kalan sayfalar:', pages.join(', '));

    for (const p of pages) {
        const pg = existingData[p];
        if (!pg?.image_url) { console.log(`⏭️  Page ${p}: yok`); continue; }
        process.stdout.write(`📄 Page ${p}... `);
        try {
            const items = await extractPage(p, pg.image_url);
            existingData[p].items = items;
            console.log(`✅ ${items.length} ürün`);
            items.forEach(i => console.log(`   ${i.name}: x=${i.x_percent}% y=${i.y_percent}%`));
            await new Promise(r => setTimeout(r, 6000));
        } catch (e) { console.log(`❌ ${e.message}`); }
    }

    fs.writeFileSync(dataPath, JSON.stringify(existingData, null, 2));
    console.log('\n✅ Kaydedildi!');
}

main().catch(e => { console.error(e); process.exit(1); });
