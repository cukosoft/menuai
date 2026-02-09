/**
 * findMenuPages.js — Tucco menü sayfalarının orijinal yüksek çözünürlüklü 
 * görsel URL'lerini bul
 */
require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');

async function main() {
    console.log('Tucco menu sayfalarini taraniyor...');
    const resp = await axios.get('https://tuccogastrocoffee.com/qrmenu/');
    const html = resp.data;

    // Tüm img srcset ve src'lerden yüksek çözünürlüklü URL'leri çıkar
    const urlSet = new Set();

    // Regex ile wp-content görsellerini bul
    const re = /https?:\/\/tuccogastrocoffee\.com\/wp-content\/uploads\/[^"'\s)]+\.(webp|jpg|jpeg|png)/gi;
    let match;
    while ((match = re.exec(html)) !== null) {
        urlSet.add(match[0]);
    }

    const urls = Array.from(urlSet).sort();
    console.log('Toplam', urls.length, 'gorsel URL bulundu\n');

    // Page numarasına göre filtrele
    const pageUrls = urls.filter(u => /page/i.test(u));
    console.log('Page gorselleri:', pageUrls.length);
    pageUrls.forEach((u, i) => {
        const fname = u.split('/').pop();
        console.log((i + 1) + ': ' + fname);
    });

    // scaled versiyonlar (yüksek çözünürlük)
    const scaled = pageUrls.filter(u => /scaled/i.test(u));
    console.log('\nScaled (yuksek cozunurluk):', scaled.length);
    scaled.forEach((u, i) => {
        console.log((i + 1) + ': ' + u);
    });
}

main().catch(e => console.error('ERR:', e.message));
