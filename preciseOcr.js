/**
 * preciseOcr.js — İki Adımlı Hassas OCR
 * 
 * Adım 1: Gemini ile ürün listesini çıkar (isim + fiyat)
 * Adım 2: Gemini'ye resmi tekrar gösterip, 
 *          HER ÜRÜN İÇİN TEK TEK hassas bounding box iste
 * 
 * Kullanım: node preciseOcr.js
 */

require('dotenv').config();
const fs = require('fs');
const axios = require('axios');

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

// Test: Tucco sayfa 9
const IMAGE_URL = 'https://tuccogastrocoffee.com/wp-content/uploads/2026/01/12-09-25-Page-9-scaled.webp';
const PAGE_KEY = '9';
const LOG_FILE = 'preciseOcr_result.log';
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
// ADIM 1: Ürün listesini çıkar
// ═══════════════════════════════════════════
async function step1_extractProducts(imageBase64) {
    log('ADIM 1: Urun listesi cikariliyor...');

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
                    text: `Bu restoran menü görseli. Lütfen gördüğün TÜM ürünleri listele.

SADECE JSON array döndür, başka hiçbir şey yazma:
[
  {"name": "ÜRÜN ADI", "price": 999},
  ...
]

Kurallar:
- Ürün adlarını menüde YAZDIĞI GİBİ yaz (büyük/küçük harf dahil)
- Fiyatı sayı olarak yaz (₺ işareti koyma)
- Kategori başlıklarını (APERATİFLER gibi) ürün olarak EKLEME
- Sadece gerçek sipariş edilebilir ürünleri listele`
                }
            ]
        }],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096
        }
    });

    const text = resp.data.candidates[0].content.parts[0].text;
    const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const products = JSON.parse(jsonStr);
    log('  OK: ' + products.length + ' urun bulundu');
    products.forEach((p, i) => log('     ' + (i + 1) + '. ' + p.name + ' - T' + p.price));
    return products;
}

// ═══════════════════════════════════════════
// ADIM 2: Her ürün için hassas bbox iste
// ═══════════════════════════════════════════
async function step2_preciseLocations(imageBase64, products) {
    log('ADIM 2: Hassas konum bulma...');

    // Ürün isimlerini listele  
    const productNames = products.map(p => p.name);

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
                    text: `Bu menü görselinde aşağıdaki ürünler var. Her birinin YAZISININ görseldeki HASSAS konumunu bul.

Ürünler:
${productNames.map((n, i) => `${i + 1}. "${n}"`).join('\n')}

SADECE JSON array döndür:
[
  {
    "name": "ÜRÜN ADI",
    "text_bbox": [y_min, x_min, y_max, x_max]
  },
  ...
]

ÖNEMLİ KURALLAR:
- text_bbox koordinatları 0-1000 arasında normalize edilmiş olmalı (0=sol üst, 1000=sağ alt)
- text_bbox sadece ÜRÜN ADININ YAZISINI kapsamalı (fiyat veya açıklama değil)
- Her ürün adının başladığı ve bittiği pikseli MÜMKÜN OLDUĞUNCA HASSAS ver
- y_min = yazının üst kenarı, y_max = yazının alt kenarı
- x_min = yazının sol kenarı, x_max = yazının sağ kenarı
- Çok DİKKATLİ ol, her harfi görselde bul ve koordinatlarını doğru ver`
                }
            ]
        }],
        generationConfig: {
            temperature: 0.05,
            maxOutputTokens: 4096
        }
    });

    const text = resp.data.candidates[0].content.parts[0].text;
    const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const locations = JSON.parse(jsonStr);

    log('  OK: ' + locations.length + ' konum bulundu');
    locations.forEach(loc => {
        log('     ' + loc.name + ' -> bbox: [' + loc.text_bbox.join(', ') + ']');
    });

    return locations;
}

// ═══════════════════════════════════════════
// ADIM 3: Birleştir ve kaydet
// ═══════════════════════════════════════════
function step3_merge(products, locations) {
    log('ADIM 3: Birlestirme...');

    const merged = products.map(product => {
        // İsim eşleştirmesi (fuzzy)
        const loc = locations.find(l =>
            l.name.toUpperCase().trim() === product.name.toUpperCase().trim()
        ) || locations.find(l =>
            l.name.toUpperCase().includes(product.name.toUpperCase().substring(0, 8))
        ) || locations.find(l =>
            product.name.toUpperCase().includes(l.name.toUpperCase().substring(0, 8))
        );

        if (loc && loc.text_bbox) {
            log('  OK: ' + product.name + ' -> bbox: [' + loc.text_bbox.join(', ') + ']');
            return {
                name: product.name,
                price: product.price,
                bbox: loc.text_bbox
            };
        } else {
            log('  MISS: ' + product.name + ' -> konum bulunamadi');
            return {
                name: product.name,
                price: product.price,
                bbox: null
            };
        }
    });

    return merged;
}

// ═══════════════════════════════════════════
// ANA FONKSİYON
// ═══════════════════════════════════════════
async function main() {
    log('Hassas OCR basliyor - Sayfa ' + PAGE_KEY);
    log('Resim indiriliyor...');
    const imageBase64 = await downloadImageAsBase64(IMAGE_URL);
    log('  OK: ' + (imageBase64.length / 1024 / 1024).toFixed(1) + ' MB');

    // Adım 1
    const products = await step1_extractProducts(imageBase64);

    // Adım 2
    const locations = await step2_preciseLocations(imageBase64, products);

    // Adım 3
    const merged = step3_merge(products, locations);

    // Sonucu kaydet
    const output = {
        [PAGE_KEY]: {
            image_url: IMAGE_URL,
            items: merged
        }
    };

    fs.writeFileSync('public/precise-ocr-test.json', JSON.stringify(output, null, 2));
    log('Kaydedildi: public/precise-ocr-test.json');
    log('Toplam: ' + merged.length + ' urun, ' + merged.filter(m => m.bbox).length + ' konum bulundu');
    const withBbox = merged.filter(m => m.bbox);
    if (withBbox.length > 0) {
        withBbox.slice(0, 5).forEach(m => {
            log('   ' + m.name + ': y=' + m.bbox[0] + '-' + m.bbox[2] + ', x=' + m.bbox[1] + '-' + m.bbox[3]);
        });
    }
}


main().catch(err => {
    log('ERROR: ' + err.message);
    if (err.response) log('API: ' + JSON.stringify(err.response.data).substring(0, 500));
});
