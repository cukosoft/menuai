/**
 * OCR Position Extractor - Gemini Vision ile menü görsellerinden
 * ürün pozisyonlarını (x_percent, y_percent) çıkarır.
 * 
 * Kullanım: node extractOcrPositions.js
 */

require('dotenv/config');
const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-2.0-flash';

// Mevcut OCR verisini oku - image_url'leri al
const existingData = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'public', 'ocr-positions-tucco.json'), 'utf-8')
);

// Sadece fiyatlı ürün içeren sayfaları işle (ilk 10 sayfa = Page 5-10 arası test)
const MAX_PAGE = 60; // tümü

const PROMPT = `Bu bir restoran menü görseli. Görseldeki HER sipariş edilebilir ürünü bul.

Her ürün için şunları döndür:
- name: Ürün adı (BÜYÜK HARF, orijinal yazıldığı gibi)
- price: Fiyat (sadece sayı, TL işareti olmadan). Fiyatı yoksa null yaz.
- x_percent: Fiyat yazısının SAĞ ucunun, görselin SOL kenarından yatay uzaklığı (% olarak, 0-100 arası tam sayı)
- y_percent: Ürün satırının, görselin ÜST kenarından dikey uzaklığı (% olarak, 0-100 arası tam sayı)

ÖNEMLİ KURALLAR:
1. Kategori başlıklarını (KAHVALTI, ORGANİK YUMURTALAR vb.) DAHİL ETME - sadece sipariş edilebilir ürünleri dahil et.
2. x_percent değeri, fiyat yazısının bittiği noktanın yatay konumudur. Buton bu noktanın hemen sağına yerleşecek.
3. Eğer sayfa iki sütunlu ise, sol sütun ürünleri için x_percent ~30-45, sağ sütun ürünleri için x_percent ~80-95 civarında olacaktır.
4. Fiyatı olmayan ürünleri ATLA.

JSON formatında döndür, başka açıklama yazma:
[
  {"name": "ÜRÜN ADI", "price": 175, "x_percent": 35, "y_percent": 12},
  ...
]

Eğer sayfada sipariş edilebilir ürün yoksa boş array döndür: []`;

async function extractPage(pageNum, imageUrl) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const body = {
        contents: [{
            parts: [
                { text: PROMPT },
                {
                    inline_data: {
                        mime_type: 'image/webp',
                        data: await fetchImageBase64(imageUrl)
                    }
                }
            ]
        }],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${err.substring(0, 200)}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // JSON'u parse et (```json ... ``` bloğundan çıkar)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
        console.log(`  ⚠️ Page ${pageNum}: JSON parse edilemedi, response: ${text.substring(0, 200)}`);
        return [];
    }

    try {
        return JSON.parse(jsonMatch[0]);
    } catch (e) {
        console.log(`  ⚠️ Page ${pageNum}: JSON parse hatası: ${e.message}`);
        return [];
    }
}

async function fetchImageBase64(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Image fetch failed: ${response.status}`);
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
}

async function main() {
    const pages = Object.keys(existingData)
        .map(Number)
        .filter(p => p <= MAX_PAGE)
        .sort((a, b) => a - b);

    console.log(`\n🔍 ${pages.length} sayfa işlenecek (Page ${pages[0]}-${pages[pages.length - 1]})\n`);

    const result = {};
    let totalItems = 0;
    let processedCount = 0;

    for (const pageNum of pages) {
        const pageData = existingData[pageNum];
        if (!pageData || !pageData.image_url) {
            console.log(`⏭️  Page ${pageNum}: image_url yok, atlanıyor`);
            continue;
        }

        process.stdout.write(`📄 Page ${pageNum}...`);

        try {
            const items = await extractPage(pageNum, pageData.image_url);
            const pricedItems = items.filter(i => i.price != null && i.price > 0);

            result[pageNum] = {
                image_url: pageData.image_url,
                items: pricedItems
            };

            totalItems += pricedItems.length;
            processedCount++;
            console.log(` ✅ ${pricedItems.length} ürün (${items.length - pricedItems.length} filtrelendi)`);

            // Rate limit - 15 RPM for free tier
            if (processedCount % 14 === 0) {
                console.log('⏳ Rate limit bekleniyor (60s)...');
                await new Promise(r => setTimeout(r, 61000));
            } else {
                await new Promise(r => setTimeout(r, 4500)); // ~13 RPM
            }
        } catch (err) {
            console.log(` ❌ Hata: ${err.message}`);
            // Mevcut veriyi koru
            result[pageNum] = pageData;
        }
    }

    // Kaydet
    const outputPath = path.join(__dirname, 'public', 'ocr-positions-tucco.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');

    console.log(`\n✅ Tamamlandı! ${totalItems} ürün, ${processedCount} sayfa`);
    console.log(`📁 Kaydedildi: ${outputPath}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
