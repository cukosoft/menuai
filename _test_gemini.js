require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testGemini() {
    const apiKey = process.env.GEMINI_API_KEY;
    console.log('API Key:', apiKey ? apiKey.substring(0, 8) + '...' : 'MISSING!');

    if (!apiKey) {
        console.error('❌ GEMINI_API_KEY not found in .env');
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Test 1: Simple text
    console.log('\n--- TEST 1: Simple text ---');
    try {
        const result = await model.generateContent('Say "hello" and nothing else.');
        const text = result.response.text();
        console.log('Response:', text);
        console.log('✅ Text API works!');
    } catch (e) {
        console.error('❌ Text API FAILED:', e.message);
    }

    // Test 2: Menu extraction (same prompt style as universalExtractor)
    console.log('\n--- TEST 2: Menu extraction ---');
    const menuText = `Kategoriler Çok Satanlar Yeni Eklenenler Kahvaltı Tostlar Pizza Hamburgerler
Kişiye Özel Kahvaltı 540.00₺ Blanca'ya özel bireysel kahvaltı tabağı
Kral Kahvaltı 1500.00₺ 4 ile 6 kişilik zengin kahvaltı
Serpme Kahvaltı 1140.00₺ 2 kişilik serpme kahvaltı
Pancake Kahvaltı 300.00₺ 
Sade Menemen 270.00₺
Blanca Menemen 330.00₺
Kavurmalı Menemen 360.00₺`;

    try {
        const prompt = `Aşağıda bir restoranın menü metni var.

METIN:
"""
${menuText}
"""

GÖREV: Bu metindeki TÜM yiyecek ve içecek ürünlerini çıkar.
HER ÜRÜN İÇİN: name, price (sadece sayı), category, description
JSON (sadece array):
[{"name": "Ürün", "price": 0, "category": "Kategori", "description": ""}]
Hiç ürün yoksa: []`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        console.log('Raw response:', text.substring(0, 500));

        // Try to parse JSON
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            const items = JSON.parse(jsonMatch[0]);
            console.log(`✅ Extracted ${items.length} items!`);
            items.forEach(i => console.log(`  - ${i.name}: ${i.price}₺`));
        } else {
            console.log('⚠️ No JSON array found in response');
        }
    } catch (e) {
        console.error('❌ Menu extraction FAILED:', e.message);
    }
}

testGemini();
