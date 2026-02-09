/**
 * cloudVisionOcr.js — Google Cloud Vision TEXT_DETECTION (V3)
 * 
 * V3 İyileştirmeler:
 *  - BÜYÜK HARF önceliği: Menü başlıkları büyük harf, açıklamalar küçük harf
 *  - Daha akıllı çoklu kelime eşleştirmesi
 *  - Kullanılmış kelime takibi
 */

require('dotenv').config();
const fs = require('fs');
const axios = require('axios');

const API_KEY = process.env.GEMINI_API_KEY;
const VISION_URL = `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY}`;

const IMAGE_URL = 'https://tuccogastrocoffee.com/wp-content/uploads/2026/01/12-09-25-Page-9-scaled.webp';
const PAGE_KEY = '9';

const LOG_FILE = 'cloudVision_result.log';
fs.writeFileSync(LOG_FILE, '');
function log(msg) {
    console.log(msg);
    fs.appendFileSync(LOG_FILE, msg + '\n');
}

async function downloadImage(url) {
    const resp = await axios.get(url, { responseType: 'arraybuffer' });
    var buffer = Buffer.from(resp.data);
    var base64 = buffer.toString('base64');

    // WebP boyutunu header'dan oku
    var width = 0, height = 0;
    try {
        // VP8 sync code'u ara: 0x9d 0x01 0x2a
        for (var i = 0; i < Math.min(100, buffer.length - 6); i++) {
            if (buffer[i] === 0x9d && buffer[i + 1] === 0x01 && buffer[i + 2] === 0x2a) {
                width = buffer.readUInt16LE(i + 3) & 0x3fff;
                height = buffer.readUInt16LE(i + 5) & 0x3fff;
                break;
            }
        }
        // VP8X extended format fallback
        if (width === 0 && buffer.toString('ascii', 12, 16) === 'VP8X') {
            width = (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16)) + 1;
            height = (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16)) + 1;
        }
    } catch (e) {
        log('WebP header parse hatasi: ' + e.message);
    }

    log('WebP resim boyutu: ' + width + 'x' + height);
    return { base64: base64, width: width, height: height, size: buffer.length };
}

async function detectText(imageBase64) {
    log('Cloud Vision TEXT_DETECTION cagiriliyor...');

    const resp = await axios.post(VISION_URL, {
        requests: [{
            image: { content: imageBase64 },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
        }]
    });

    if (resp.data.responses[0].error) {
        log('HATA: ' + JSON.stringify(resp.data.responses[0].error));
        return null;
    }

    const annotations = resp.data.responses[0].textAnnotations;
    if (!annotations || annotations.length === 0) {
        log('Hic metin bulunamadi!');
        return null;
    }

    log('Toplam kelime/blok: ' + (annotations.length - 1));
    return annotations;
}

// ═══════════════════════════════════════════
// V3: BÜYÜK HARF ÖNCELİKLİ EŞLEŞTİRME
// ═══════════════════════════════════════════
var actualImageSize = null; // global, main'den set edilecek
function matchProducts(annotations, productList) {
    log('\n=== V3 ESLESTIRME (Buyuk Harf Oncelikli) ===');

    const words = annotations.slice(1).map((a, idx) => {
        const v = a.boundingPoly.vertices;
        return {
            idx: idx,
            text: a.description,
            x: v[0] ? v[0].x || 0 : 0,
            y: v[0] ? v[0].y || 0 : 0,
            x2: v[2] ? v[2].x || 0 : 0,
            y2: v[2] ? v[2].y || 0 : 0,
            isUpperCase: a.description === a.description.toUpperCase() && /[A-ZÇĞİÖŞÜ]/.test(a.description)
        };
    });

    // Resim boyutları
    var imgW = 0, imgH = 0;
    words.forEach(w => {
        if (w.x2 > imgW) imgW = w.x2;
        if (w.y2 > imgH) imgH = w.y2;
    });
    // NOT: Bu sadece kelimelerin max'ı, gerçek resim daha büyük olabilir!
    log('Kelime max konumlar: ' + imgW + 'x' + imgH);

    // Gerçek resim boyutunu kullan (downloadImageAsBase64'ten alınacak)
    // Cloud Vision piksel koordinatları gerçek resim boyutuna göre
    // WebP header'dan boyut alabilmek için imageBuffer'ı kullanacağız
    // Şimdilik MAX'ı %15 artırarak düzelt (çünkü kelimelerin son noktası resmin kenarı değil)
    // DAHA İYİ: Resim boyutun dışarıdan geçirilecek
    if (actualImageSize) {
        imgW = actualImageSize.width;
        imgH = actualImageSize.height;
        log('Gercek resim boyutu: ' + imgW + 'x' + imgH);
    }

    // SOL SÜTUN FİLTRESİ (x < %55)
    var leftThreshold = imgW * 0.55;
    var leftWords = words.filter(w => w.x < leftThreshold);
    log('Sol sutun kelimeleri: ' + leftWords.length + ' / ' + words.length);

    // Büyük harf kelimeleri logla
    var upperWords = leftWords.filter(w => w.isUpperCase);
    log('BUYUK HARF kelimeler: ' + upperWords.length);
    upperWords.slice(0, 40).forEach(w => {
        log('  [U] "' + w.text + '" at y=' + w.y + ' x=' + w.x);
    });

    var usedIndices = new Set();
    var results = [];

    productList.forEach(product => {
        var productName = product.name.toUpperCase().trim();
        var mainName = productName.replace(/\s*\(.*\)$/, '').trim();
        var parenPart = '';
        var parenMatch = productName.match(/\(([^)]+)\)/);
        if (parenMatch) parenPart = parenMatch[1].toUpperCase().trim();

        var nameWords = mainName.split(/\s+/);
        var firstWord = nameWords[0];

        // ADIM 1: İlk kelimeyi bul — BÜYÜK HARF olanlar öncelikli
        var allCandidates = leftWords
            .map((w, i) => ({ word: w, localIdx: i }))
            .filter(c => {
                if (usedIndices.has(c.localIdx)) return false;
                var wUp = c.word.text.toUpperCase();
                return wUp === firstWord ||
                    (firstWord.length >= 5 && wUp.startsWith(firstWord.substring(0, 5))) ||
                    (firstWord.length >= 4 && firstWord.length < 5 && wUp.startsWith(firstWord.substring(0, 4)));
            });

        if (allCandidates.length === 0) {
            // Daha esnek arama
            allCandidates = leftWords
                .map((w, i) => ({ word: w, localIdx: i }))
                .filter(c => {
                    if (usedIndices.has(c.localIdx)) return false;
                    var wUp = c.word.text.toUpperCase();
                    return firstWord.length >= 3 && wUp.startsWith(firstWord.substring(0, 3));
                });
        }

        if (allCandidates.length === 0) {
            log('MISS: ' + product.name + ' -> "' + firstWord + '" bulunamadi');
            results.push({ name: product.name, price: product.price, bbox: null });
            return;
        }

        // ADIM 2: Büyük harf olanları öne al
        var upperCandidates = allCandidates.filter(c => c.word.isUpperCase);
        var lowerCandidates = allCandidates.filter(c => !c.word.isUpperCase);

        // Öncelik: BÜYÜK HARF > küçük harf
        var prioritizedCandidates = [...upperCandidates, ...lowerCandidates];

        // ADIM 3: Her aday için skor hesapla
        var bestMatch = null;
        var bestScore = -1;

        for (var ci of prioritizedCandidates) {
            var c = ci.word;
            var score = c.isUpperCase ? 10 : 0; // Büyük harf bonus
            var matchedWords = [c];
            var refY = c.y;

            // Sonraki kelimeleri aynı satırda ara
            for (var ni = 1; ni < nameWords.length; ni++) {
                var nw = nameWords[ni];
                if (nw === '&') {
                    var ampMatch = leftWords.find(w =>
                        !usedIndices.has(leftWords.indexOf(w)) &&
                        (w.text === '&' || w.text === 'and') &&
                        Math.abs(w.y - refY) < 25
                    );
                    if (ampMatch) { matchedWords.push(ampMatch); score += 2; }
                    continue;
                }
                var nextMatch = leftWords.find(w =>
                    !usedIndices.has(leftWords.indexOf(w)) &&
                    (w.text.toUpperCase() === nw ||
                        (nw.length >= 3 && w.text.toUpperCase().startsWith(nw.substring(0, 3)))) &&
                    Math.abs(w.y - refY) < 30 &&
                    w.x > c.x - 10
                );
                if (nextMatch) {
                    matchedWords.push(nextMatch);
                    score += 3;
                    // İkinci kelime de büyük harf mi?
                    if (nextMatch.isUpperCase) score += 5;
                }
            }

            // Parantez kontrolü
            if (parenPart) {
                var parenFirstWord = parenPart.split(/\s+/)[0];
                var paren = leftWords.find(w =>
                    Math.abs(w.y - refY) < 30 &&
                    (w.text.includes('(') || w.text.toUpperCase().includes(parenFirstWord.substring(0, 3)))
                );
                if (paren) score += 5;
            }

            if (score > bestScore) {
                bestScore = score;
                bestMatch = { words: matchedWords, candidate: ci, score: score };
            }
        }

        if (!bestMatch) {
            log('MISS: ' + product.name + ' -> skorlama basarisiz');
            results.push({ name: product.name, price: product.price, bbox: null });
            return;
        }

        // İlk kelimeyi işaretle
        usedIndices.add(bestMatch.candidate.localIdx);

        // Birleşik bbox
        var minX = Infinity, minY = Infinity, maxXb = 0, maxYb = 0;
        bestMatch.words.forEach(w => {
            if (w.x < minX) minX = w.x;
            if (w.y < minY) minY = w.y;
            if (w.x2 > maxXb) maxXb = w.x2;
            if (w.y2 > maxYb) maxYb = w.y2;
        });

        var bbox = [
            Math.round((minY / imgH) * 1000),
            Math.round((minX / imgW) * 1000),
            Math.round((maxYb / imgH) * 1000),
            Math.round((maxXb / imgW) * 1000)
        ];

        log('OK: ' + product.name.padEnd(35) + ' bbox:[' + bbox.join(',') + '] skor:' + bestMatch.score + ' upper:' + (bestMatch.words[0].isUpperCase ? 'Y' : 'N'));
        results.push({
            name: product.name,
            price: product.price,
            bbox: bbox
        });
    });

    return results;
}

async function main() {
    log('=== Cloud Vision OCR V3 ===');
    log('Sayfa: ' + PAGE_KEY);

    log('Resim indiriliyor...');
    var imgData = await downloadImage(IMAGE_URL);
    log('OK: ' + (imgData.size / 1024 / 1024).toFixed(1) + ' MB');

    // Gerçek resim boyutunu global'e set et
    if (imgData.width > 0 && imgData.height > 0) {
        actualImageSize = { width: imgData.width, height: imgData.height };
    }

    var annotations = await detectText(imgData.base64);
    if (!annotations) { log('Cloud Vision basarisiz!'); return; }

    var preciseData;
    try {
        preciseData = JSON.parse(fs.readFileSync('public/precise-ocr-test.json', 'utf8'));
    } catch (e) {
        log('precise-ocr-test.json okunamiyor!');
        return;
    }
    var productList = preciseData[PAGE_KEY].items;
    log('Urun listesi: ' + productList.length + ' urun');

    var results = matchProducts(annotations, productList);

    // Sonuç analizi
    log('\n=== SONUC ANALIZI (y sirasina gore) ===');
    var matched = results.filter(r => r.bbox);
    var sorted = matched.slice().sort((a, b) => a.bbox[0] - b.bbox[0]);
    sorted.forEach((m, i) => {
        var diff = i > 0 ? m.bbox[0] - sorted[i - 1].bbox[0] : 0;
        log('  ' + (i + 1) + '. ' + m.name.padEnd(40) + ' y=' + m.bbox[0] + '-' + m.bbox[2] + '  x=' + m.bbox[1] + '-' + m.bbox[3] + (diff ? '  (fark:' + diff + ')' : ''));
    });

    var output = {
        [PAGE_KEY]: {
            image_url: IMAGE_URL,
            items: results
        }
    };

    fs.writeFileSync('public/precise-ocr-test.json', JSON.stringify(output, null, 2));
    log('\nKaydedildi: public/precise-ocr-test.json');
    log('Toplam: ' + results.length + ' urun, ' + matched.length + ' konum');
}

main().catch(err => {
    log('ERROR: ' + err.message);
    if (err.response) {
        log('Status: ' + err.response.status);
        log('Data: ' + JSON.stringify(err.response.data).substring(0, 800));
    }
});
