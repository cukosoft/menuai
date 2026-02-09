/**
 * singleQueryOcr.js — Her ürün için TEK TEK Gemini'ye sor
 * 
 * Gemini tüm ürünleri aynı anda sorduğunda koordinat uyduruyor.
 * Çözüm: Her ürünü AYRI AYRI sor, tek bir metne odaklanmasını sağla.
 */

require('dotenv').config();
const fs = require('fs');
const axios = require('axios');

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

const IMAGE_URL = 'https://tuccogastrocoffee.com/wp-content/uploads/2026/01/12-09-25-Page-9-scaled.webp';
const PAGE_KEY = '9';

const LOG_FILE = 'singleQuery_result.log';
fs.writeFileSync(LOG_FILE, '');
function log(msg) {
    console.log(msg);
    fs.appendFileSync(LOG_FILE, msg + '\n');
}

async function downloadImageAsBase64(url) {
    const resp = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(resp.data).toString('base64');
}

// Tek bir ürünün konumunu sor
async function findSingleProduct(imageBase64, productName) {
    const resp = await axios.post(GEMINI_URL, {
        contents: [{
            parts: [
                {
                    inline_data: {
                        mime_type: 'image/webp',
                        data: imageBase64
                    }
                },
                {
                    text: `Bu menü görselinde "${productName}" yazısını bul.

Bu yazının görseldeki TAM konumunu ver.

SADECE bir JSON nesnesi döndür:
{"y_min": 0, "x_min": 0, "y_max": 0, "x_max": 0}

Kurallar:
- Koordinatlar 0-1000 arasında normalize edilmiş olmalı
- 0,0 = sol üst köşe, 1000,1000 = sağ alt köşe
- SADECE "${productName}" YAZISINI kapsayan kutuyu ver
- Yazının açıklama satırını veya fiyatını KAPSAMASIN
- Mümkün olduğunca HASSAS ol`
                }
            ]
        }],
        generationConfig: {
            temperature: 0,
            maxOutputTokens: 256
        }
    });

    const text = resp.data.candidates[0].content.parts[0].text;
    const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(jsonStr);
    return [result.y_min, result.x_min, result.y_max, result.x_max];
}

async function main() {
    log('=== Tek Tek Urun Sorgusu ===');

    log('Resim indiriliyor...');
    var imageBase64 = await downloadImageAsBase64(IMAGE_URL);
    log('OK: ' + (imageBase64.length / 1024 / 1024).toFixed(1) + ' MB');

    // Mevcut urun listesi
    var preciseData = JSON.parse(fs.readFileSync('public/precise-ocr-test.json', 'utf8'));
    var products = preciseData[PAGE_KEY].items;
    log('Urun sayisi: ' + products.length);

    var results = [];
    for (var i = 0; i < products.length; i++) {
        var p = products[i];
        try {
            log('  [' + (i + 1) + '/' + products.length + '] ' + p.name + '...');
            var bbox = await findSingleProduct(imageBase64, p.name);
            log('    -> bbox: [' + bbox.join(', ') + ']');
            results.push({ name: p.name, price: p.price, bbox: bbox });

            // Rate limit - 100ms bekle
            await new Promise(r => setTimeout(r, 100));
        } catch (e) {
            log('    -> HATA: ' + e.message);
            results.push({ name: p.name, price: p.price, bbox: null });
        }
    }

    // Kontrol: y degerleri hala esit aralikli mi?
    log('\n=== Y Degerleri Analizi ===');
    var yValues = results.filter(r => r.bbox).map(r => r.bbox[0]);
    for (var i = 1; i < yValues.length; i++) {
        var diff = yValues[i] - yValues[i - 1];
        log('  ' + results[i].name.substring(0, 20) + ': y=' + yValues[i] + ' (fark: ' + diff + ')');
    }
    var diffs = [];
    for (var i = 1; i < yValues.length; i++) diffs.push(yValues[i] - yValues[i - 1]);
    var avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    var stdDev = Math.sqrt(diffs.reduce((a, d) => a + (d - avgDiff) ** 2, 0) / diffs.length);
    log('Ortalama aralik: ' + avgDiff.toFixed(1) + ', Std sapma: ' + stdDev.toFixed(1));
    if (stdDev < 5) {
        log('UYARI: Y degerleri hala cok esit aralikli! Gemini hala uyduruyor olabilir.');
    } else {
        log('OK: Y degerleri degisken - gercekci gorunuyor.');
    }

    // Kaydet
    var output = {
        [PAGE_KEY]: {
            image_url: IMAGE_URL,
            items: results
        }
    };
    fs.writeFileSync('public/precise-ocr-test.json', JSON.stringify(output, null, 2));
    log('\nKaydedildi: public/precise-ocr-test.json');
    log('Toplam: ' + results.length + ' urun, ' + results.filter(r => r.bbox).length + ' konum');
}

main().catch(err => {
    log('ERROR: ' + err.message);
    if (err.response) log('Data: ' + JSON.stringify(err.response.data).substring(0, 500));
});
