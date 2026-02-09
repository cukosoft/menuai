const extractor = require('./imageMenuExtractor');
const fs = require('fs');

async function test10() {
    // İlk 10 scaled URL
    const urls = [
        'https://tuccogastrocoffee.com/wp-content/uploads/2026/01/12-09-25-Page-1-scaled.webp',
        'https://tuccogastrocoffee.com/wp-content/uploads/2026/01/12-09-25-Page-2-scaled.webp',
        'https://tuccogastrocoffee.com/wp-content/uploads/2026/01/12-09-25-Page-4-scaled.webp',
        'https://tuccogastrocoffee.com/wp-content/uploads/2026/01/12-09-25-Page-5-scaled.webp',
        'https://tuccogastrocoffee.com/wp-content/uploads/2026/01/12-09-25-Page-6-scaled.webp',
        'https://tuccogastrocoffee.com/wp-content/uploads/2026/01/12-09-25-Page-7-scaled.webp',
        'https://tuccogastrocoffee.com/wp-content/uploads/2026/01/12-09-25-Page-8-scaled.webp',
        'https://tuccogastrocoffee.com/wp-content/uploads/2026/01/12-09-25-Page-9-scaled.webp',
        'https://tuccogastrocoffee.com/wp-content/uploads/2026/01/12-09-25-Page-10-scaled.webp',
        'https://tuccogastrocoffee.com/wp-content/uploads/2026/01/12-09-25-Page-11-scaled.webp',
    ];

    const output = {};
    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const pageMatch = url.match(/Page-(\d+)/i);
        const pageKey = pageMatch ? pageMatch[1] : String(i + 1);

        console.log(`\n[${i + 1}/${urls.length}] Page ${pageKey}...`);
        const result = await extractor.processImage(url, pageKey);
        if (result) {
            output[pageKey] = result;
            console.log(`  ✅ ${result.items.length} ürün`);
        } else {
            console.log(`  ⚠️ Boş sayfa`);
        }

        if (i < urls.length - 1) await new Promise(r => setTimeout(r, 2000));
    }

    fs.writeFileSync('./public/ocr-positions-tuccoo2.json', JSON.stringify(output, null, 2));

    const totalItems = Object.values(output).reduce((s, p) => s + p.items.length, 0);
    const totalBbox = Object.values(output).reduce((s, p) => s + p.items.filter(i => i.bbox).length, 0);
    console.log(`\n✅ Kaydedildi! ${Object.keys(output).length} sayfa, ${totalItems} ürün, ${totalBbox} bbox`);
}

test10().catch(console.error);
