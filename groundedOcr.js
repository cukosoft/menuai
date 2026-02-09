/**
 * groundedOcr.js — Gemini 2.0 Flash ile Grounded Object Detection
 * 
 * Normal text prompt yerine Gemini'nin OBJECT DETECTION özelliğini kullanarak
 * bounding box'ları daha hassas almayı deneyelim.
 * 
 * Ayrıca Cloud Vision API'yi service account ile de deneyebiliriz.
 */

require('dotenv').config();
const fs = require('fs');
const axios = require('axios');

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const PAGE_KEY = '9';
const IMAGE_URL = 'https://tuccogastrocoffee.com/wp-content/uploads/2026/01/12-09-25-Page-9-scaled.webp';

const LOG_FILE = 'groundedOcr_result.log';
fs.writeFileSync(LOG_FILE, '');
function log(msg) {
    console.log(msg);
    fs.appendFileSync(LOG_FILE, msg + '\n');
}

async function downloadImageAsBase64(url) {
    const resp = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(resp.data).toString('base64');
}

// ═══════════════════════════════════════════
// Yontem: Gemini 2.5 Flash — daha akilli model
// ═══════════════════════════════════════════
async function tryGemini25(imageBase64) {
    log('\n=== Gemini 2.5 Flash ile deneniyor ===');

    var url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;

    try {
        const resp = await axios.post(url, {
            contents: [{
                parts: [
                    {
                        inline_data: {
                            mime_type: 'image/webp',
                            data: imageBase64
                        }
                    },
                    {
                        text: `You are looking at a restaurant menu image. I need you to find the EXACT pixel position of each product name text on this image.

Return ONLY a JSON array with bounding boxes for each PRODUCT NAME (not descriptions, not prices):

[
  {"name": "PRODUCT NAME", "bbox": [y_min, x_min, y_max, x_max]}
]

CRITICAL RULES:
- Coordinates are normalized 0-1000 (0=top-left, 1000=bottom-right)
- bbox should ONLY cover the product NAME text (e.g. "PATATES CİPSİ"), NOT the price, NOT the description
- Be EXTREMELY precise with coordinates - look at each character closely
- DO NOT estimate uniform spacing - each product has a DIFFERENT y position
- Some products are closer together, some are further apart
- Category headers like "APERATİFLER" should NOT be included
- Only include actual orderable menu items`
                    }
                ]
            }],
            generationConfig: {
                temperature: 0,
                maxOutputTokens: 4096
            }
        });

        const text = resp.data.candidates[0].content.parts[0].text;
        const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const items = JSON.parse(jsonStr);

        log('Gemini 2.5 Flash sonuc: ' + items.length + ' urun');
        items.forEach(item => {
            log('  ' + item.name + ' -> [' + item.bbox.join(', ') + ']');
        });

        // Analiz: y degerleri esit aralikli mi?
        var yValues = items.map(i => i.bbox[0]);
        var diffs = [];
        for (var i = 1; i < yValues.length; i++) diffs.push(yValues[i] - yValues[i - 1]);
        var avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
        var std = Math.sqrt(diffs.reduce((a, d) => a + (d - avg) ** 2, 0) / diffs.length);
        log('Y farklari: ' + diffs.join(', '));
        log('Ortalama: ' + avg.toFixed(1) + ', Std sapma: ' + std.toFixed(1));

        if (std < 5) {
            log('UYARI: Esit aralikli - muhtemelen uyduruyor!');
        } else {
            log('OK: Degisken araliklar - gercekci');
        }

        return items;
    } catch (e) {
        log('Gemini 2.5 Flash HATA: ' + e.message);
        if (e.response) log('  ' + JSON.stringify(e.response.data).substring(0, 300));
        return null;
    }
}

// ═══════════════════════════════════════════
// Yontem: Resmi parcalara bol ve ayri ayri analiz et
// ═══════════════════════════════════════════
async function trySlicedApproach(imageBase64) {
    log('\n=== Dilimleme Yaklasimi ===');
    log('Tam resmi 3 parcaya bolup her parcayi ayri analiz edecegiz');

    // Resmin sadece sol tarafini (metin alani) kullanarak daha iyi sonuc almak
    // Bu yontem icin canvas gerekir - server-side bunu atliyoruz simdilik
    log('Bu yontem canvas gerektiriyor, client-side uygulanacak');
    return null;
}

async function main() {
    log('=== Grounded OCR Denemesi ===');

    log('Resim indiriliyor...');
    var imageBase64 = await downloadImageAsBase64(IMAGE_URL);
    log('OK: ' + (imageBase64.length / 1024 / 1024).toFixed(1) + ' MB');

    // Gemini 2.5 Flash dene
    var result = await tryGemini25(imageBase64);

    if (result && result.length > 0) {
        // Mevcut urun listesiyle kontrol et
        var preciseData = JSON.parse(fs.readFileSync('public/precise-ocr-test.json', 'utf8'));
        var existingProducts = preciseData[PAGE_KEY].items;

        // Sonucu kaydet
        var output = {
            [PAGE_KEY]: {
                image_url: IMAGE_URL,
                items: result.map(item => ({
                    name: item.name,
                    price: (existingProducts.find(p =>
                        p.name.toUpperCase().trim() === item.name.toUpperCase().trim()
                    ) || {}).price || 0,
                    bbox: item.bbox
                }))
            }
        };

        fs.writeFileSync('public/precise-ocr-test.json', JSON.stringify(output, null, 2));
        log('\nKaydedildi: public/precise-ocr-test.json');
    }
}

main().catch(err => {
    log('ERROR: ' + err.message);
    if (err.response) log('Data: ' + JSON.stringify(err.response.data).substring(0, 500));
});
