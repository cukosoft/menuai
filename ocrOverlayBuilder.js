/**
 * OCR Overlay Builder — Tucco menu görselleri üzerinden ürün pozisyonlarını çıkarır
 * Her menü görseli için: ürün adı, fiyat, y_percent (dikey konum) → Supabase'e kaydeder
 * 
 * Kullanım: node ocrOverlayBuilder.js
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SLUG = "tucco";
const BASE_URL = "https://tuccogastrocoffee.com/wp-content/uploads/2026/01";

// Tüm sayfa numaraları
const PAGES = [
    1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 36, 37, 38, 39, 40,
    41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 54, 55, 56, 57, 58, 59, 60
];

// Özel isimli sayfalar (standart pattern dışı)
function getImageUrl(page) {
    if (page === 35) return `${BASE_URL}/12-09-25-Page-35-1.webp`;
    if (page === 52) return `${BASE_URL}/12-09-25-Page-52b-scaled.webp`;
    return `${BASE_URL}/12-09-25-Page-${page}-scaled.webp`;
}

async function ocrPage(pageNum) {
    const imgUrl = getImageUrl(pageNum);
    try {
        const imgResp = await axios.get(imgUrl, { responseType: "arraybuffer", timeout: 15000 });
        const base64 = Buffer.from(imgResp.data).toString("base64");

        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `Bu bir restoran menü sayfasının fotoğrafı. Görüntüdeki her yiyecek/içecek ürününü bul.

Her ürün için:
- name: ürün adı (görselde yazıldığı gibi, BÜYÜK harf)
- price: fiyat (sadece sayı, TL/₺ olmadan). Fiyat yoksa null
- y_percent: ürün adının görseldeki dikey konumu yüzde olarak (0=en üst, 100=en alt)

SADECE JSON dizisi döndür. Markdown fences kullanma. Ürün yoksa: []
Örnek: [{"name":"GRANDOLA","price":345,"y_percent":25}]`;

        const result = await model.generateContent([
            prompt,
            { inlineData: { mimeType: "image/webp", data: base64 } }
        ]);

        let text = result.response.text().trim();
        if (text.startsWith("```")) text = text.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");

        const items = JSON.parse(text);
        return items.map(item => ({
            ...item,
            page: pageNum,
            image_url: imgUrl
        }));
    } catch (e) {
        console.error(`  Page ${pageNum} ERROR: ${e.message}`);
        return [];
    }
}

async function run() {
    console.log("🔍 Tucco OCR Overlay Builder");
    console.log("============================\n");

    const allPositions = [];

    for (let i = 0; i < PAGES.length; i++) {
        const p = PAGES[i];
        process.stdout.write(`[${i + 1}/${PAGES.length}] Page ${p}... `);

        const items = await ocrPage(p);
        console.log(`${items.length} ürün`);

        if (items.length > 0) {
            items.forEach(it => {
                console.log(`    → ${it.name} (${it.price}TL) @ y=${it.y_percent}%`);
            });
            allPositions.push(...items);
        }

        // Rate limiting  
        if (i < PAGES.length - 1) await new Promise(r => setTimeout(r, 500));
    }

    console.log(`\n✅ Toplam ${allPositions.length} ürün-pozisyon bulundu\n`);

    // Save to JSON file (for client-side use)
    const fs = require("fs");
    const outputPath = require("path").join(__dirname, "public", "ocr-positions-tucco.json");

    // Group by page
    const byPage = {};
    allPositions.forEach(pos => {
        if (!byPage[pos.page]) byPage[pos.page] = { image_url: pos.image_url, items: [] };
        byPage[pos.page].items.push({
            name: pos.name,
            price: pos.price,
            y_percent: pos.y_percent
        });
    });

    fs.writeFileSync(outputPath, JSON.stringify(byPage, null, 2), "utf8");
    console.log(`💾 Pozisyon verisi kaydedildi: ${outputPath}`);
    console.log(`   Sayfa sayısı: ${Object.keys(byPage).length}`);
    console.log(`   Toplam ürün: ${allPositions.length}`);
}

run().catch(e => console.error("Fatal:", e.message));
