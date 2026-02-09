/**
 * cloudVisionBatch.js — Cloud Vision ile TÜM sayfalara hassas bbox ekle
 * 
 * ocr-positions-tucco.json'daki HER sayfayı:
 *  1. Resim indir
 *  2. Cloud Vision TEXT_DETECTION ile kelime konumları al
 *  3. Mevcut ürün isimleriyle eşleştir
 *  4. Hassas pixel-based bbox (0-1000 normalize) üret
 *  5. JSON'a geri yaz
 * 
 * Kullanım: node cloudVisionBatch.js [sayfa_no]
 *   Parametre verilmezse: TÜM sayfaları işler
 *   Parametre verilirse: sadece o sayfayı işler (test için)
 */

require('dotenv').config();
const fs = require('fs');
const axios = require('axios');

const API_KEY = process.env.GEMINI_API_KEY;
const VISION_URL = `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY}`;
const JSON_FILE = 'public/ocr-positions-tucco.json';

const LOG_FILE = 'cloudVisionBatch.log';
fs.writeFileSync(LOG_FILE, '');
function log(msg) {
    console.log(msg);
    fs.appendFileSync(LOG_FILE, msg + '\n');
}

// ═══════════════════════════════════════════
// RESIM İNDİR + BOYUT BUL
// ═══════════════════════════════════════════
async function downloadImage(url) {
    const resp = await axios.get(url, { responseType: 'arraybuffer' });
    var buffer = Buffer.from(resp.data);
    var base64 = buffer.toString('base64');
    var contentType = resp.headers['content-type'] || '';

    // Detect mime type from content-type header or extension
    var mimeType = 'image/webp';
    if (contentType.includes('image/jpeg') || contentType.includes('image/jpg')) mimeType = 'image/jpeg';
    else if (contentType.includes('image/png')) mimeType = 'image/png';
    else if (contentType.includes('image/webp')) mimeType = 'image/webp';
    else if (contentType.includes('image/gif')) mimeType = 'image/gif';
    else if (contentType.includes('text/html')) mimeType = 'text/html'; // not an image!
    else if (url.match(/\.(jpe?g)$/i)) mimeType = 'image/jpeg';
    else if (url.match(/\.(png)$/i)) mimeType = 'image/png';
    else if (url.match(/\.(gif)$/i)) mimeType = 'image/gif';
    else if (url.match(/\.(webp)$/i)) mimeType = 'image/webp';

    var width = 0, height = 0;
    try {
        // VP8 sync code: 0x9d 0x01 0x2a
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
        // VP8L lossless fallback
        if (width === 0 && buffer.toString('ascii', 12, 16) === 'VP8L') {
            var bits = buffer.readUInt32LE(21);
            width = (bits & 0x3FFF) + 1;
            height = ((bits >> 14) & 0x3FFF) + 1;
        }
        // JPEG dimensions
        if (mimeType === 'image/jpeg' && width === 0) {
            for (var j = 0; j < buffer.length - 8; j++) {
                if (buffer[j] === 0xFF && (buffer[j + 1] === 0xC0 || buffer[j + 1] === 0xC2)) {
                    height = buffer.readUInt16BE(j + 5);
                    width = buffer.readUInt16BE(j + 7);
                    break;
                }
            }
        }
        // PNG dimensions
        if (mimeType === 'image/png' && width === 0 && buffer.length > 24) {
            width = buffer.readUInt32BE(16);
            height = buffer.readUInt32BE(20);
        }
    } catch (e) {
        log('  WebP header parse hatasi: ' + e.message);
    }

    return { base64, width, height, size: buffer.length, mimeType };
}

// ═══════════════════════════════════════════
// CLOUD VISION TEXT_DETECTION
// ═══════════════════════════════════════════
async function detectText(imageBase64) {
    const resp = await axios.post(VISION_URL, {
        requests: [{
            image: { content: imageBase64 },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
        }]
    });

    if (resp.data.responses[0].error) {
        log('  VISION HATA: ' + JSON.stringify(resp.data.responses[0].error));
        return null;
    }

    const annotations = resp.data.responses[0].textAnnotations;
    if (!annotations || annotations.length === 0) {
        return null;
    }

    return annotations;
}

// ═══════════════════════════════════════════
// TÜRKÇE KARAKTER NORMALİZASYON
// ═══════════════════════════════════════════
function normalizeTR(s) {
    return s.toUpperCase()
        .replace(/İ/g, 'I')
        .replace(/Ğ/g, 'G')
        .replace(/Ü/g, 'U')
        .replace(/Ş/g, 'S')
        .replace(/Ö/g, 'O')
        .replace(/Ç/g, 'C')
        .replace(/[^A-Z0-9]/g, ''); // Noktalama ve özel karakterleri de temizle
}

// OCR karakter karışıklığı tablosu — genel çerçeve
// Cloud Vision bazen bu karakterleri birbirine karıştırır
function normalizeOcrConfusion(s) {
    return s
        .replace(/0/g, 'O')
        .replace(/1/g, 'I')
        .replace(/5/g, 'S')
        .replace(/8/g, 'B')
        .replace(/\$/g, 'S');
}

// ═══════════════════════════════════════════
// LEVENSHTEIN EDIT DISTANCE (Fuzzy Matching)
// ═══════════════════════════════════════════
function levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    var matrix = [];
    for (var i = 0; i <= b.length; i++) matrix[i] = [i];
    for (var j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (var i = 1; i <= b.length; i++) {
        for (var j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

// ═══════════════════════════════════════════
// ÜRÜN-KELİME EŞLEŞTİRME (V6 — Genel çerçeve: fuzzy + reuse + OCR confusion)
// ═══════════════════════════════════════════
function matchProducts(annotations, productList, imgW, imgH) {
    const words = annotations.slice(1).map((a, idx) => {
        const v = a.boundingPoly.vertices;
        var normText = normalizeTR(a.description);
        return {
            idx: idx,
            text: a.description,
            norm: normText,
            normOcr: normalizeOcrConfusion(normText), // OCR karışıklık tablosu
            x: v[0] ? v[0].x || 0 : 0,
            y: v[0] ? v[0].y || 0 : 0,
            x2: v[2] ? v[2].x || 0 : 0,
            y2: v[2] ? v[2].y || 0 : 0,
            isUpperCase: a.description === a.description.toUpperCase() && /[A-ZÇĞİÖŞÜ]/.test(a.description),
            useCount: 0  // Aynı kelime birden fazla kullanılabilir
        };
    });

    // Resim boyutu bilinmiyorsa kelime max'larından hesapla
    if (!imgW || !imgH || imgW === 0 || imgH === 0) {
        words.forEach(w => {
            if (w.x2 > imgW) imgW = w.x2;
            if (w.y2 > imgH) imgH = w.y2;
        });
        imgW = Math.round(imgW * 1.05);
        imgH = Math.round(imgH * 1.05);
    }

    // Kelime frekans tablosu — çok tekrarlanan kelimeler reuse edilebilir
    var wordFreq = {};
    words.forEach(w => { wordFreq[w.norm] = (wordFreq[w.norm] || 0) + 1; });

    var lastMatchY = -1;
    var results = [];

    // Ürün bazlı eşleştirme kuyruğu — çok tekrarlanan ürünleri say
    var productNameCount = {};
    productList.forEach(p => {
        var key = normalizeTR(p.name.split(/\s+/)[0]);
        productNameCount[key] = (productNameCount[key] || 0) + 1;
    });

    productList.forEach(product => {
        var productName = product.name.toUpperCase().trim();
        var mainName = productName.replace(/\s*\(.*\)$/, '').trim();
        var nameWords = mainName.split(/\s+/).map(w => normalizeTR(w));
        var firstWord = nameWords[0];
        var firstWordOcr = normalizeOcrConfusion(firstWord);
        var isMultiWord = nameWords.length > 1;

        // Kelime kullanım limiti: tekrarlanan ürünler varsa daha fazla reuse
        var maxUsePerWord = Math.max(1, productNameCount[firstWord] || 1);

        // ═══ Tier 1: Exact / prefix match (norm) ═══
        var allCandidates = words
            .filter(w => {
                if (w.useCount >= maxUsePerWord) return false;
                return w.norm === firstWord ||
                    (firstWord.length >= 5 && w.norm.startsWith(firstWord.substring(0, 5))) ||
                    (firstWord.length >= 4 && firstWord.length < 5 && w.norm.startsWith(firstWord.substring(0, 4)));
            });

        // ═══ Tier 2: Prefix 3 chars ═══
        if (allCandidates.length === 0) {
            allCandidates = words.filter(w => {
                if (w.useCount >= maxUsePerWord) return false;
                return firstWord.length >= 3 && w.norm.startsWith(firstWord.substring(0, 3));
            });
        }

        // ═══ Tier 3: OCR confusion table match ═══
        if (allCandidates.length === 0 && firstWord.length >= 3) {
            allCandidates = words.filter(w => {
                if (w.useCount >= maxUsePerWord) return false;
                return w.normOcr === firstWordOcr ||
                    (firstWordOcr.length >= 4 && w.normOcr.startsWith(firstWordOcr.substring(0, 4)));
            });
        }

        // ═══ Tier 4: Levenshtein fuzzy (edit dist ≤ 2) ═══
        if (allCandidates.length === 0 && firstWord.length >= 4) {
            var maxDist = firstWord.length >= 7 ? 2 : 1;
            allCandidates = words.filter(w => {
                if (w.useCount >= maxUsePerWord) return false;
                if (Math.abs(w.norm.length - firstWord.length) > maxDist) return false;
                return levenshtein(w.norm, firstWord) <= maxDist;
            });
        }

        // ═══ Tier 5: Contains match (substring) ═══
        if (allCandidates.length === 0 && firstWord.length >= 4) {
            allCandidates = words.filter(w => {
                if (w.useCount >= maxUsePerWord) return false;
                return w.norm.includes(firstWord) || firstWord.includes(w.norm);
            });
        }

        // ═══ Tier 6: Kısa kelimeler için exact + reuse (SU, ÇAY, BUD) ═══
        if (allCandidates.length === 0 && firstWord.length <= 3 && firstWord.length >= 2) {
            allCandidates = words.filter(w => {
                return w.norm === firstWord; // Kısa kelimeler sınırsız reuse
            });
        }

        if (allCandidates.length === 0) {
            log('  MISS: ' + product.name);
            results.push({ name: product.name, price: product.price, bbox: null });
            return;
        }

        // Her aday için çoklu kelime eşleştirme skoru hesapla
        var bestMatch = null;
        var bestScore = -Infinity;

        // Candidates'ı useCount'a göre sırala — kullanılmamışları önce dene
        allCandidates.sort(function (a, b) { return a.useCount - b.useCount; });

        for (var c of allCandidates) {
            var score = c.isUpperCase ? 10 : 0;
            // Tam eşleşme bonusu
            if (c.norm === firstWord) score += 20;
            // Kullanılmış kelime AĞIR ceza (her kullanım -50)
            score -= c.useCount * 50;
            var matchedWords = [c];
            var matchedIndices = [c.idx];
            var refY = c.y;

            // Sol sütun bonus
            if (c.x < imgW * 0.50) score += 10;

            // Dikey sıralama bonus — lastMatchY'ye yakınlık ÇOK önemli
            if (lastMatchY >= 0) {
                var yDist = Math.abs(c.y - lastMatchY);
                if (yDist < imgH * 0.08) score += 25;       // Çok yakın → güçlü bonus
                else if (yDist < imgH * 0.15) score += 15;
                else if (yDist < imgH * 0.30) score += 5;
                // Yukarı atlama cezası
                if (c.y < lastMatchY - imgH * 0.15) score -= 15;
            }

            // Sonraki kelimeleri aynı satırda ara
            // Y toleransı orantılı: yüksek çözünürlüklü görsellerde (2560px) sabit 50px
            // açıklama satırını da yakalıyordu. Artık imgH'ye orantılı.
            var lineYTolerance = Math.max(30, Math.round(imgH * 0.015)); // ~38px for 2560px
            for (var ni = 1; ni < nameWords.length; ni++) {
                var nw = nameWords[ni];
                var nwOcr = normalizeOcrConfusion(nw);
                var nextMatch = words.find(w =>
                    !matchedIndices.includes(w.idx) &&
                    (w.norm === nw ||
                        (nw.length >= 3 && w.norm.startsWith(nw.substring(0, 3))) ||
                        w.normOcr === nwOcr ||
                        (nw.length >= 4 && levenshtein(w.norm, nw) <= 1)) &&
                    Math.abs(w.y - refY) < lineYTolerance &&
                    w.x > c.x - 20
                );
                if (nextMatch) {
                    matchedWords.push(nextMatch);
                    matchedIndices.push(nextMatch.idx);
                    score += 5;
                    if (nextMatch.isUpperCase) score += 5;
                }
            }

            // Çoklu kelime kuralı — 3+ kelimede en az 2, 2 kelimede tercihen 2 ama 1 de kabul
            if (isMultiWord && nameWords.length >= 3 && matchedWords.length < 2) {
                score = -1;
            }

            if (score > bestScore) {
                bestScore = score;
                bestMatch = { words: matchedWords, indices: matchedIndices, score: score };
            }
        }

        if (!bestMatch || bestScore < 20) {
            log('  MISS: ' + product.name + (bestMatch ? ' (skor:' + bestScore + ' < 20)' : ''));
            results.push({ name: product.name, price: product.price, bbox: null });
            return;
        }

        // Kullanım sayacını artır (hard block yerine soft reuse)
        bestMatch.indices.forEach(idx => {
            var w = words.find(ww => ww.idx === idx);
            if (w) w.useCount++;
        });

        var matchCenterY = bestMatch.words.reduce((s, w) => s + w.y, 0) / bestMatch.words.length;
        lastMatchY = matchCenterY;

        // Birleşik bbox — sadece aynı satırdaki kelimeleri dahil et
        // İlk kelimenin yüksekliğini referans al, çok aşağıdaki eşleşmeleri filtrele
        var firstWordH = bestMatch.words[0].y2 - bestMatch.words[0].y;
        var maxLineOffset = Math.max(firstWordH * 1.5, imgH * 0.012); // Aynı satır toleransı
        var firstWordY = bestMatch.words[0].y;

        var minX = Infinity, minY = Infinity, maxXb = 0, maxYb = 0;
        bestMatch.words.forEach(w => {
            // Sadece ilk kelimeyle aynı satırda olan kelimeleri bbox'a dahil et
            if (Math.abs(w.y - firstWordY) > maxLineOffset) return; // Farklı satır → atla
            if (w.x < minX) minX = w.x;
            if (w.y < minY) minY = w.y;
            if (w.x2 > maxXb) maxXb = w.x2;
            if (w.y2 > maxYb) maxYb = w.y2;
        });

        // Fallback: hiçbir kelime kalmadıysa ilk kelimeyi kullan
        if (minX === Infinity) {
            var fw = bestMatch.words[0];
            minX = fw.x; minY = fw.y; maxXb = fw.x2; maxYb = fw.y2;
        }

        // 0-1000 normalize
        var bbox = [
            Math.round((minY / imgH) * 1000),
            Math.round((minX / imgW) * 1000),
            Math.round((maxYb / imgH) * 1000),
            Math.round((maxXb / imgW) * 1000)
        ];

        log('  OK: ' + product.name.padEnd(35) + ' bbox:[' + bbox.join(',') + '] skor:' + bestMatch.score);
        results.push({
            name: product.name,
            price: product.price,
            bbox: bbox
        });
    });

    // ═══ Y-INTERPOLATION ═══
    // OCR bulamadığı ürünler için komşu ürünlerin Y pozisyonlarından tahmin
    var nullCount = results.filter(r => !r.bbox).length;
    if (nullCount > 0 && results.length > 1) {
        log('  📐 Y-Interpolation: ' + nullCount + ' ürün için pozisyon tahmini...');

        // Eşleşen ürünlerden Y anchor'lar topla
        var anchors = []; // {index, yMin, yMax, xMin, xMax}
        results.forEach(function (r, i) {
            if (r.bbox) anchors.push({ i: i, y: r.bbox[0], y2: r.bbox[2], x: r.bbox[1], x2: r.bbox[3] });
        });

        if (anchors.length >= 1) {
            // Her null item için en yakın üst ve alt anchor'dan interpolasyon
            for (var ri = 0; ri < results.length; ri++) {
                if (results[ri].bbox) continue;

                // Üstteki en yakın anchor
                var above = null, below = null;
                for (var ai = anchors.length - 1; ai >= 0; ai--) {
                    if (anchors[ai].i < ri) { above = anchors[ai]; break; }
                }
                for (var ai = 0; ai < anchors.length; ai++) {
                    if (anchors[ai].i > ri) { below = anchors[ai]; break; }
                }

                var estY, estX, estX2;
                if (above && below) {
                    // İki anchor arasında lineer interpolasyon
                    var ratio = (ri - above.i) / (below.i - above.i);
                    estY = Math.round(above.y + (below.y - above.y) * ratio);
                    estX = Math.min(above.x, below.x);
                    estX2 = Math.max(above.x2, below.x2);
                } else if (above) {
                    // Üstten aşağı tahmin (her bir ürün ~25-35 birim aralık)
                    var avgStep = 30;
                    if (anchors.length >= 2) {
                        var steps = [];
                        for (var si = 1; si < anchors.length; si++) {
                            steps.push((anchors[si].y - anchors[si - 1].y) / Math.max(1, anchors[si].i - anchors[si - 1].i));
                        }
                        avgStep = Math.round(steps.reduce(function (a, b) { return a + b; }, 0) / steps.length);
                    }
                    estY = Math.round(above.y + avgStep * (ri - above.i));
                    estX = above.x;
                    estX2 = above.x2;
                } else if (below) {
                    // Alttan yukarı tahmin
                    var avgStep = 30;
                    if (anchors.length >= 2) {
                        var steps = [];
                        for (var si = 1; si < anchors.length; si++) {
                            steps.push((anchors[si].y - anchors[si - 1].y) / Math.max(1, anchors[si].i - anchors[si - 1].i));
                        }
                        avgStep = Math.round(steps.reduce(function (a, b) { return a + b; }, 0) / steps.length);
                    }
                    estY = Math.round(below.y - avgStep * (below.i - ri));
                    estX = below.x;
                    estX2 = below.x2;
                } else {
                    continue; // Hiç anchor yok → skip
                }

                estY = Math.max(0, Math.min(950, estY));
                var estY2 = Math.min(1000, estY + 25);

                results[ri].bbox = [estY, estX, estY2, estX2];
                results[ri].interpolated = true;
                log('  📐 INTERP: ' + results[ri].name.padEnd(30) + ' y:' + estY);
            }
        }
    }

    return results;
}

// ═══════════════════════════════════════════
// BİR SAYFAYI İŞLE
// ═══════════════════════════════════════════
async function processPage(pageKey, pageData) {
    log('\n══════════════════════════════════════');
    log('SAYFA ' + pageKey + ' isleniyor...');

    if (!pageData.items || pageData.items.length === 0) {
        log('  SKIP: Urun yok');
        return null;
    }

    if (!pageData.image_url) {
        log('  SKIP: Resim URL yok');
        return null;
    }

    log('  Urun sayisi: ' + pageData.items.length);
    log('  Resim: ' + pageData.image_url);

    // Resim indir
    var imgData;
    try {
        imgData = await downloadImage(pageData.image_url);
        log('  Resim: ' + imgData.width + 'x' + imgData.height + ' (' + (imgData.size / 1024).toFixed(0) + ' KB)');
    } catch (e) {
        log('  HATA resim indirme: ' + e.message);
        return null;
    }

    // Cloud Vision
    var annotations;
    try {
        annotations = await detectText(imgData.base64);
    } catch (e) {
        log('  HATA Cloud Vision: ' + e.message);
        return null;
    }

    if (!annotations) {
        log('  Cloud Vision metin bulamadi');
        return null;
    }

    log('  Cloud Vision: ' + (annotations.length - 1) + ' kelime');

    // Eşleştir
    var results = matchProducts(annotations, pageData.items, imgData.width, imgData.height);
    var matched = results.filter(r => r.bbox);
    log('  Sonuc: ' + matched.length + '/' + results.length + ' eslesme');

    return results;
}

// ═══════════════════════════════════════════
// ANA FONKSİYON
// ═══════════════════════════════════════════
async function main() {
    log('=== Cloud Vision Batch OCR ===');
    log('Tarih: ' + new Date().toISOString());

    var data = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
    var allPages = Object.keys(data).sort((a, b) => a - b);

    // Parametre kontrolü
    var targetPage = process.argv[2];
    var pagesToProcess = targetPage ? [targetPage] : allPages;

    log('Toplam sayfa: ' + allPages.length);
    log('Islenecek: ' + pagesToProcess.length + ' sayfa');

    var totalItems = 0, totalMatched = 0, totalMissed = 0;

    for (var pageKey of pagesToProcess) {
        if (!data[pageKey]) {
            log('Sayfa ' + pageKey + ' bulunamadi!');
            continue;
        }

        var results = await processPage(pageKey, data[pageKey]);

        if (results) {
            // JSON güncelle — mevcut bilgileri koru, bbox ekle
            data[pageKey].items = results;
            totalItems += results.length;
            totalMatched += results.filter(r => r.bbox).length;
            totalMissed += results.filter(r => !r.bbox).length;
        }

        // Rate limit — sayfa arası 1.5 sn bekle
        if (pagesToProcess.length > 1) {
            await new Promise(r => setTimeout(r, 1500));
        }
    }

    // Kaydet
    fs.writeFileSync(JSON_FILE, JSON.stringify(data, null, 2));
    log('\n══════════════════════════════════════');
    log('TOPLAM SONUC:');
    log('  Islenecek: ' + pagesToProcess.length + ' sayfa');
    log('  Urunler: ' + totalItems);
    log('  Eslesen: ' + totalMatched + ' (' + (totalItems > 0 ? Math.round(totalMatched / totalItems * 100) : 0) + '%)');
    log('  Eksik: ' + totalMissed);
    log('Kaydedildi: ' + JSON_FILE);
}

// ═══════════════════════════════════════════
// MODULE EXPORTS — imageMenuExtractor.js tarafından kullanılır
// ═══════════════════════════════════════════
module.exports = { matchProducts, normalizeTR, downloadImage, detectText };

// CLI modunda çalıştır
if (require.main === module) {
    main().catch(err => {
        log('FATAL ERROR: ' + err.message);
        if (err.response) {
            log('Status: ' + err.response.status);
            log('Data: ' + JSON.stringify(err.response.data).substring(0, 800));
        }
    });
}
