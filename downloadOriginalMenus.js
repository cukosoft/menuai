/**
 * downloadOriginalMenus.js — Tucco orijinal yüksek çözünürlüklü menü görsellerini indir
 * 
 * Kaynak: tuccogastrocoffee.com/qrmenu/ 
 * Boyut: 1877x2560px webp
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const PAGES = [
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
    'https://tuccogastrocoffee.com/wp-content/uploads/2026/01/12-09-25-Page-12-scaled.webp',
    'https://tuccogastrocoffee.com/wp-content/uploads/2026/01/12-09-25-Page-13-scaled.webp',
    'https://tuccogastrocoffee.com/wp-content/uploads/2026/01/12-09-25-Page-14-scaled.webp',
    'https://tuccogastrocoffee.com/wp-content/uploads/2026/01/12-09-25-Page-15-scaled.webp',
    'https://tuccogastrocoffee.com/wp-content/uploads/2026/01/12-09-25-Page-16-scaled.webp',
    'https://tuccogastrocoffee.com/wp-content/uploads/2026/01/12-09-25-Page-17-scaled.webp',
    'https://tuccogastrocoffee.com/wp-content/uploads/2026/01/12-09-25-Page-18-scaled.webp',
    'https://tuccogastrocoffee.com/wp-content/uploads/2026/01/12-09-25-Page-19-scaled.webp',
    'https://tuccogastrocoffee.com/wp-content/uploads/2026/01/12-09-25-Page-20-scaled.webp',
    'https://tuccogastrocoffee.com/wp-content/uploads/2026/01/12-09-25-Page-21-scaled.webp',
];

const OUT_DIR = './public/original';

async function main() {
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

    console.log('Tucco orijinal menu gorselleri indiriliyor...');
    console.log('Toplam:', PAGES.length, 'sayfa\n');

    for (let i = 0; i < PAGES.length; i++) {
        const url = PAGES[i];
        // URL'den Page numarasını çıkar (ör: Page-7 → page_7.webp)
        const pageMatch = url.match(/Page-(\d+)/i);
        const pageNum = pageMatch ? pageMatch[1] : String(i + 1);
        const filename = 'page_' + pageNum + '.webp';
        const outPath = path.join(OUT_DIR, filename);

        try {
            const resp = await axios.get(url, { responseType: 'arraybuffer' });
            fs.writeFileSync(outPath, resp.data);
            const sizeKB = (resp.data.length / 1024).toFixed(0);
            console.log((i + 1) + '/' + PAGES.length + ' ' + filename + ' — ' + sizeKB + ' KB');
        } catch (err) {
            console.log((i + 1) + '/' + PAGES.length + ' HATA: ' + err.message);
        }
    }

    console.log('\nTamamlandi! Kaydedildi: ' + OUT_DIR);
}

main();
