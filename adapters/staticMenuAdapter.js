/**
 * Statik Menü Adaptör
 * Screenshot + Gemini Vision ile menü çıkarır
 * Mevcut universalExtractor.js mantığını kullanır
 * 
 * Fallback adaptör — diğer hiçbir adaptöre uymayan siteler için
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const NAME = 'StaticMenu';

function canHandle(url) {
    // Fallback — her URL'i kabul eder
    return true;
}

async function extract(url) {
    console.log(`[${NAME}] 📸 Screenshot + Gemini extraction başlatılıyor: ${url}`);

    // universalExtractor.js'i child process olarak çalıştır
    const extractorPath = path.join(__dirname, '..', 'universalExtractor.js');
    const outputFile = path.join(__dirname, '..', 'extracted_menu.json');

    try {
        execSync(`node "${extractorPath}" "${url}"`, {
            cwd: path.join(__dirname, '..'),
            stdio: 'inherit',
            timeout: 120000 // 2 dakika timeout
        });
    } catch (e) {
        console.error(`[${NAME}] ⚠️ Extractor hata verdi, kısmi sonuç kontrol ediliyor...`);
    }

    // Sonucu oku
    if (!fs.existsSync(outputFile)) {
        throw new Error(`[${NAME}] Extraction sonucu bulunamadı: ${outputFile}`);
    }

    const raw = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));

    // Format kontrolü — categories array mi items array mi?
    let result;
    if (raw.categories && Array.isArray(raw.categories)) {
        result = raw;
    } else if (raw.items && Array.isArray(raw.items)) {
        // items → categories dönüşümü
        const catMap = {};
        raw.items.forEach(item => {
            const cat = item.category || 'Diğer';
            if (!catMap[cat]) catMap[cat] = [];
            catMap[cat].push({ name: item.name, price: item.price, description: item.description || '' });
        });
        result = {
            restaurant: raw.restaurant || '',
            menu_url: url,
            extracted_at: new Date().toISOString(),
            categories: Object.entries(catMap).map(([name, items]) => ({ name, items }))
        };
    } else {
        throw new Error(`[${NAME}] Bilinmeyen JSON formatı`);
    }

    const totalItems = result.categories.reduce((a, c) => a + c.items.length, 0);
    console.log(`[${NAME}] ✅ ${totalItems} ürün, ${result.categories.length} kategori çıkarıldı`);

    return result;
}

module.exports = { NAME, canHandle, extract };
