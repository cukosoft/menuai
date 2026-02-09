require('dotenv').config();
const fs = require('fs');
const axios = require('axios');

const k = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-3-flash-preview';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${k}`;

// Kahvaltı sayfaları (page_3, page_4, page_5)
const PAGES = [
    { file: 'original/page_3.webp', label: 'Page-4 Kahvalti' },
    { file: 'original/page_4.webp', label: 'Page-5 Kahvalti' },
    { file: 'original/page_5.webp', label: 'Page-6 Kahvalti' },
    { file: 'original/page_6.webp', label: 'Page-7' },
    { file: 'original/page_7.webp', label: 'Page-8 Atistirmaliklar' },
];
const OUTPUT_FILE = 'public/bbox-original-3flash.json';

const prompt = `Bu bir restoran menü görseli. Menüdeki sipariş edilebilir ürünleri bul.

Her ürün için JSON döndür:
[{"name": "ÜRÜN ADI", "price": 999, "bbox": [y_min, x_min, y_max, x_max]}]

BBOX KURALLARI (ÇOK ÖNEMLİ):
- Koordinatlar 0-1000 arası normalize (0=sol üst, 1000=sağ alt)
- bbox YALNIZCA ürün adı metninin HARFLERİNİ sıkıca sarsın
- Harflerin hemen etrafını çerçevele, gereksiz boşluk bırakma
- Ürün açıklamasını, fiyatı veya alt satırı KAPSAMASIN
- Kategori başlıklarını (KAHVALTILAR, TOSTLAR vb.) dahil ETME
- Boş array döndür eğer ürün yoksa: []

SADECE JSON array döndür, başka hiçbir şey yazma.`;

async function processImage(filepath) {
    const img = fs.readFileSync('./public/' + filepath).toString('base64');
    const mime = filepath.endsWith('.webp') ? 'image/webp' : 'image/png';
    console.log('  Gorsel: ' + (img.length / 1024).toFixed(0) + ' KB');

    const start = Date.now();
    const resp = await axios.post(API_URL, {
        contents: [{
            parts: [
                { inline_data: { mime_type: mime, data: img } },
                { text: prompt }
            ]
        }],
        generationConfig: { temperature: 0.02, maxOutputTokens: 16384 }
    });

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const text = resp.data.candidates[0].content.parts[0].text;
    const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const products = JSON.parse(jsonStr);

    console.log('  Sure: ' + elapsed + 's — ' + products.length + ' urun');
    products.forEach(function (p, i) {
        var b = p.bbox;
        if (b) {
            console.log('    ' + (i + 1) + '. ' + p.name.padEnd(30) + ' y:' + b[0] + '-' + b[2] + ' x:' + b[1] + '-' + b[3] + ' TL' + p.price);
        }
    });

    return products.map(function (p) {
        return {
            name: p.name,
            price: p.price,
            bbox: p.bbox && p.bbox.length === 4
                ? p.bbox.map(function (v) { return Math.max(0, Math.min(1000, Math.round(v))); })
                : null
        };
    });
}

async function main() {
    console.log('\n=== ORIGINAL HD BBOX TEST — ' + MODEL + ' ===\n');
    var output = {};
    var pageNum = 1;

    for (var i = 0; i < PAGES.length; i++) {
        var page = PAGES[i];
        console.log('\nSayfa ' + (i + 1) + ': ' + page.label);
        try {
            var items = await processImage(page.file);
            if (items.length > 0) {
                output[pageNum.toString()] = {
                    image_url: '/' + page.file,
                    items: items
                };
                pageNum++;
            } else {
                console.log('  SKIP: urun yok');
            }
        } catch (err) {
            console.log('  HATA: ' + err.message);
        }
        if (i < PAGES.length - 1) {
            console.log('  Bekleniyor 3s...');
            await new Promise(function (r) { setTimeout(r, 3000); });
        }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log('\nKaydedildi: ' + OUTPUT_FILE);
    console.log('Toplam sayfa: ' + Object.keys(output).length);
}

main();
