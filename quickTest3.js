require('dotenv').config();
const fs = require('fs');
const axios = require('axios');

const k = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-3-flash-preview';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${k}`;

const SCREENSHOTS = [
    'menu_screenshot_1_4.png',
    'menu_screenshot_1_5.png'
];
const OUTPUT_FILE = 'public/bbox-test-3flash.json';

const prompt = `Bu bir restoran menü görseli. Menüdeki sipariş edilebilir ürünleri bul.

Her ürün için JSON döndür:
[{"name": "ÜRÜN ADI", "price": 999, "bbox": [y_min, x_min, y_max, x_max]}]

BBOX KURALLARI (ÇOK ÖNEMLİ):
- Koordinatlar 0-1000 arası normalize (0=sol üst, 1000=sağ alt)
- bbox YALNIZCA ürün adı metninin HARFLERİNİ sıkıca sarsın
- Harflerin hemen etrafını çerçevele, gereksiz boşluk bırakma
- Ürün açıklamasını, fiyatı veya alt satırı KAPSAMASIN
- y_min = ilk harf satırının tam üstü, y_max = son harf satırının tam altı
- x_min = ilk harfin sol kenarı, x_max = son harfin sağ kenarı
- Kategori başlıklarını (KAHVALTILAR, TOSTLAR vb.) dahil ETME
- Boş array döndür eğer ürün yoksa: []

SADECE JSON array döndür, başka hiçbir şey yazma.`;

async function processImage(filename) {
    const img = fs.readFileSync('./public/' + filename).toString('base64');
    console.log('  Gorsel: ' + (img.length / 1024).toFixed(0) + ' KB');

    const start = Date.now();
    const resp = await axios.post(API_URL, {
        contents: [{
            parts: [
                { inline_data: { mime_type: 'image/png', data: img } },
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
        var h = b ? (b[2] - b[0]) : 0;
        var w = b ? (b[3] - b[1]) : 0;
        console.log('    ' + (i + 1) + '. ' + p.name.padEnd(30) + ' y:' + b[0] + '-' + b[2] + '(h' + h + ') x:' + b[1] + '-' + b[3] + '(w' + w + ') TL' + p.price);
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
    console.log('\n=== BBOX TEST — ' + MODEL + ' ===\n');
    var output = {};

    for (var i = 0; i < SCREENSHOTS.length; i++) {
        var fn = SCREENSHOTS[i];
        console.log('\nSayfa ' + (i + 1) + ': ' + fn);
        try {
            var items = await processImage(fn);
            output[(i + 1).toString()] = {
                image_url: '/' + fn,
                items: items
            };
        } catch (err) {
            console.log('  HATA: ' + err.message);
            if (err.response) console.log('  API:', JSON.stringify(err.response.data).substring(0, 300));
        }
        if (i < SCREENSHOTS.length - 1) {
            console.log('  Bekleniyor 3s...');
            await new Promise(function (r) { setTimeout(r, 3000); });
        }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log('\nKaydedildi: ' + OUTPUT_FILE);
}

main();
