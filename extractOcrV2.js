/**
 * OCR Position Extractor V2 - Gemini 2.5 Flash
 * Ürün adının başlangıç x pozisyonunu çıkarır (buton hizalama için)
 */
require('dotenv/config');
const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash';

const existingData = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'public', 'ocr-positions-tucco.json'), 'utf-8')
);

const PROMPT = `Bu bir restoran menü görseli. Görseldeki HER sipariş edilebilir ürünü bul.

Her ürün için şunları döndür:
- name: Ürün adı (BÜYÜK HARF, orijinal yazıldığı gibi)
- price: Fiyat (sadece sayı, TL işareti olmadan). Fiyatı yoksa null.
- x_percent: Ürün adı YAZISININ SOL kenarının, görselin sol kenarından yatay uzaklığı (% olarak, 0-100 arası tam sayı). Bu değer ürün adının başladığı noktadır.
- y_percent: Ürün adı YAZISININ DİKEY merkez noktasının, görselin üst kenarından dikey uzaklığı (% olarak, 0-100 arası tam sayı)

ÖNEMLİ KURALLAR:
1. Kategori başlıklarını (KAHVALTI, ORGANİK YUMURTALAR, APERATİFLER vb.) DAHİL ETME.
2. Fiyatı olmayan ürünleri ATLA.
3. x_percent değeri ürün adının SOL kenarıdır (yazının başladığı yer).
4. y_percent çok hassas olmalı — ürün adı satırının tam ortası.
5. İki sütunlu sayfalarda sol sütun x_percent ~7-10, sağ sütun x_percent ~55-60 civarında olur.

JSON formatında döndür, başka açıklama YAZMA:
[{"name": "ÜRÜN ADI", "price": 175, "x_percent": 8, "y_percent": 12}]

Sipariş edilebilir ürün yoksa: []`;

async function fetchImageBase64(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('Image fetch failed: ' + r.status);
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
    if (!resp.ok) {
        const err = await resp.text();
        throw new Error('API ' + resp.status + ': ' + err.substring(0, 200));
    }
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) { console.log('  ⚠️ No JSON found:', text.substring(0, 100)); return []; }
    return JSON.parse(m[0]).filter(i => i.price != null && i.price > 0);
}

async function main() {
    const allPages = Object.keys(existingData).map(Number).sort((a, b) => a - b);
    console.log(`\n🔍 Gemini 2.5 Flash ile ${allPages.length} sayfa işlenecek...\n`);

    let total = 0;
    for (const p of allPages) {
        const pg = existingData[p];
        if (!pg || !pg.image_url) { console.log(`⏭️  Page ${p}: yok`); continue; }

        process.stdout.write(`📄 Page ${p}... `);
        try {
            const items = await extractPage(p, pg.image_url);
            existingData[p].items = items;
            total += items.length;
            console.log(`✅ ${items.length} ürün`);
            if (items.length > 0) {
                items.slice(0, 3).forEach(i => console.log(`   ${i.name}: x=${i.x_percent}% y=${i.y_percent}%`));
                if (items.length > 3) console.log(`   ... +${items.length - 3} daha`);
            }
            // Rate limit: ~10 RPM safe
            await new Promise(r => setTimeout(r, 6500));
        } catch (e) {
            console.log(`❌ ${e.message.substring(0, 150)}`);
        }
    }

    fs.writeFileSync(path.join(__dirname, 'public', 'ocr-positions-tucco.json'), JSON.stringify(existingData, null, 2));
    console.log(`\n✅ Toplam ${total} ürün, kaydedildi!`);
}

main().catch(e => { console.error(e); process.exit(1); });
