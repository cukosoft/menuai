const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");
require("dotenv").config();

async function testPage(pageNum) {
    const imgUrl = `https://tuccogastrocoffee.com/wp-content/uploads/2026/01/12-09-25-Page-${pageNum}-scaled.webp`;
    try {
        const imgResp = await axios.get(imgUrl, { responseType: "arraybuffer" });
        const base64 = Buffer.from(imgResp.data).toString("base64");

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `Bu bir restoran menü sayfasının fotoğrafıdır. Görüntüdeki her yiyecek/içecek ürününü bul.

Her ürün için şunları döndür:
- name: ürün adı
- price: fiyat (sadece sayı)  
- y_percent: ürün adının görselde dikey konumu (0=üst, 100=alt)

SADECE JSON dizisi döndür. Markdown yok.
Ürün yoksa: []`;

        const result = await model.generateContent([
            prompt,
            { inlineData: { mimeType: "image/webp", data: base64 } }
        ]);

        let text = result.response.text().trim();
        if (text.startsWith("```")) text = text.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");

        const items = JSON.parse(text);
        console.log(`Page ${pageNum}: ${items.length} products`);
        if (items.length > 0) {
            items.forEach(it => console.log(`  → ${it.name} (${it.price}TL) @ y=${it.y_percent}%`));
        }
        return items;
    } catch (e) {
        console.log(`Page ${pageNum}: ERROR - ${e.message}`);
        return [];
    }
}

async function run() {
    // Test a few typical pages
    for (const p of [2, 6, 10, 15, 20]) {
        await testPage(p);
        console.log("");
    }
}

run();
