/**
 * FineDine QR Menu Adaptörü
 * Cookie dismiss → SPA navigasyon → Her menüye tıkla → Screenshot → Gemini Vision
 * 
 * Gemini kategorileri ve ürünleri ayırt eder.
 */

const { chromium } = require('playwright');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const NAME = 'FineDine';

function canHandle(url) {
    return url.includes('finedine');
}

async function askGemini(imagePaths, prompt) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY gerekli!');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const parts = [{ text: prompt }];
    for (const imgPath of (Array.isArray(imagePaths) ? imagePaths : [imagePaths])) {
        const imageData = fs.readFileSync(imgPath);
        parts.push({
            inlineData: { mimeType: 'image/png', data: imageData.toString('base64') }
        });
    }

    const result = await model.generateContent(parts);
    const text = result.response.text();

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
        try { return JSON.parse(jsonMatch[0]); } catch (e) { }
    }
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
        try { return JSON.parse(objMatch[0]); } catch (e) { }
    }
    return text;
}

const GEMINI_PROMPT = `Bu bir restoran menüsünün ekran görüntüsüdür.
Lütfen bu görüntüdeki TÜM menü öğelerini çıkar.

KURALLAR:
- Her öğenin "category" (kategori), "name" (ürün adı), "price" (fiyat, sayı olarak) ve "description" (açıklama) alanları olmalı.
- Kategori başlıkları genellikle büyük font / bold / farklı renktir. Alt kategoriler de olabilir.
- Fiyat ₺ sembolü ile gösterilir, sadece sayıyı yaz.
- Açıklama yoksa boş string "" yaz.
- Navigasyon butonları, header metinleri, footer gibi menü OLMAYAN kısımları ATLA.

JSON formatı (dizi olarak döndür):
[
  {"category": "Başlangıçlar", "name": "Mercimek Çorbası", "price": 120, "description": "..."},
  {"category": "Başlangıçlar", "name": "Humus", "price": 90, "description": ""},
  ...
]

SADECE JSON döndür, başka bir açıklama yazma.`;

async function extract(url) {
    console.log(`[${NAME}] 🔌 Başlatılıyor: ${url}`);

    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({
        viewport: { width: 430, height: 932 },
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    });
    const page = await ctx.newPage();

    // Shop adını auth'dan yakala
    let shopName = '';
    page.on('response', async (resp) => {
        try {
            if (resp.url().includes('/v2/mobile-menu/auth')) {
                const data = await resp.json();
                shopName = data.shop?.name?.tr || data.shop?.name?.en || '';
            }
        } catch (e) { }
    });

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    // 1. Cookie consent dismiss
    for (const text of ['Hepsini kabul et', 'Kabul Et', 'Accept All']) {
        try { await page.click(`text=${text}`, { timeout: 1500 }); break; } catch (e) { }
    }
    await new Promise(r => setTimeout(r, 500));

    // 2. "Menüyü Gör" tıkla
    for (const sel of ['text=Menüyü Gör', 'text=View Menu']) {
        try { await page.click(sel, { timeout: 3000, force: true }); break; } catch (e) { }
    }
    await new Promise(r => setTimeout(r, 5000));

    // 3. Menü isimlerini DOM'dan al
    const menuNames = await page.evaluate(() => {
        const text = document.body.innerText;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
        const idx = lines.findIndex(l => l.includes('Menü seçin') || l.includes('Select menu'));
        if (idx < 0) return [];
        const names = [];
        for (let i = idx + 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line || line.includes('Gizlilik') || line.includes('cookie') || line.includes('Bilgi') || line.length < 3) break;
            names.push(line);
        }
        return names;
    });

    console.log(`[${NAME}] 📋 ${menuNames.length} menü bulundu: ${menuNames.join(', ')}`);

    if (menuNames.length === 0) {
        await browser.close();
        throw new Error(`[${NAME}] Menü listesi bulunamadı`);
    }

    // 4. Her menüye tıklayıp screenshot al → Gemini'ye gönder
    const allCategories = [];
    const tmpDir = path.join(process.cwd(), 'tmp_finedine');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    for (let m = 0; m < menuNames.length; m++) {
        const menuName = menuNames[m];
        console.log(`[${NAME}] [${m + 1}/${menuNames.length}] 📂 ${menuName}`);

        try {
            // Her seferinde baştan yükle (SPA state sorunlarını önle)
            await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
            await new Promise(r => setTimeout(r, 2000));

            // Cookie dismiss
            for (const t of ['Hepsini kabul et', 'Kabul Et']) {
                try { await page.click(`text=${t}`, { timeout: 1000 }); break; } catch (e) { }
            }
            await new Promise(r => setTimeout(r, 500));

            // Menüyü Gör
            for (const sel of ['text=Menüyü Gör', 'text=View Menu']) {
                try { await page.click(sel, { timeout: 2000, force: true }); break; } catch (e) { }
            }
            await new Promise(r => setTimeout(r, 3000));

            // Bu menüye tıkla
            await page.click(`text=${menuName}`, { timeout: 3000 });
            await new Promise(r => setTimeout(r, 5000));
        } catch (e) {
            console.log(`[${NAME}]   ⚠️ ${menuName} tıklanamadı, atlanıyor`);
            continue;
        }

        // Scroll ile tüm sayfayı yükle
        let lastH = 0;
        for (let s = 0; s < 10; s++) {
            await page.evaluate(() => window.scrollBy(0, 800));
            await new Promise(r => setTimeout(r, 500));
            const curH = await page.evaluate(() => document.body.scrollHeight);
            if (curH === lastH) break;
            lastH = curH;
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        await new Promise(r => setTimeout(r, 500));

        // Full page screenshot
        const ssPath = path.join(tmpDir, `menu_${m}.png`);
        await page.screenshot({ path: ssPath, fullPage: true });

        // Screenshot boyutunu kontrol et — çok büyükse böl
        const stats = fs.statSync(ssPath);
        const fileSizeMB = stats.size / (1024 * 1024);
        console.log(`[${NAME}]   📸 Screenshot: ${(fileSizeMB).toFixed(1)}MB`);

        let screenshots = [ssPath];

        // 4MB'dan büyükse parçala (Gemini limit)
        if (fileSizeMB > 3.5) {
            console.log(`[${NAME}]   📐 Büyük SS, viewport parçalara ayrılıyor...`);
            const pageHeight = await page.evaluate(() => document.body.scrollHeight);
            const viewH = 932;
            const chunks = Math.ceil(pageHeight / viewH);
            screenshots = [];

            for (let c = 0; c < chunks && c < 8; c++) {
                await page.evaluate((y) => window.scrollTo(0, y), c * viewH);
                await new Promise(r => setTimeout(r, 300));
                const chunkPath = path.join(tmpDir, `menu_${m}_chunk_${c}.png`);
                await page.screenshot({ path: chunkPath, fullPage: false });
                screenshots.push(chunkPath);
            }
        }

        // Gemini'ye gönder
        console.log(`[${NAME}]   🤖 Gemini Vision analiz ediyor...`);
        try {
            const geminiResult = await askGemini(screenshots, GEMINI_PROMPT);

            if (Array.isArray(geminiResult)) {
                // Kategorilere grupla
                const catMap = {};
                for (const item of geminiResult) {
                    const cat = item.category || 'Diğer';
                    if (!catMap[cat]) catMap[cat] = [];
                    catMap[cat].push({
                        name: item.name || '',
                        price: parseFloat(item.price) || 0,
                        description: item.description || ''
                    });
                }

                for (const [cat, items] of Object.entries(catMap)) {
                    allCategories.push({ name: cat, parentMenu: menuName, items });
                    console.log(`[${NAME}]   ✅ ${menuName} > ${cat}: ${items.length} ürün`);
                }
            } else {
                console.log(`[${NAME}]   ⚠️ Gemini beklenmeyen format döndürdü`);
            }
        } catch (gemErr) {
            console.log(`[${NAME}]   ❌ Gemini hatası: ${gemErr.message}`);
        }
    }

    await browser.close();

    // Cleanup
    try { fs.rmSync(tmpDir, { recursive: true }); } catch (e) { }

    const totalItems = allCategories.reduce((a, c) => a + c.items.length, 0);

    if (totalItems === 0) {
        throw new Error(`[${NAME}] Hiç ürün çıkarılamadı!`);
    }

    const result = {
        restaurant: shopName || new URL(url).pathname.split('/').pop(),
        menu_url: url,
        extracted_at: new Date().toISOString(),
        categories: allCategories
    };

    console.log(`[${NAME}] ✅ Toplam: ${totalItems} ürün, ${allCategories.length} kategori`);
    return result;
}

module.exports = { NAME, canHandle, extract };
