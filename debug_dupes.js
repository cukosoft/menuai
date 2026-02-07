require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-position=-2400,-2400']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto('https://qr.finedinemenu.com/friends-2/menu/685fca1ee94dd83b4718e2a3', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));

    await page.evaluate(() => {
        const btns = document.querySelectorAll('button');
        for (const b of btns) {
            if (b.textContent.includes('Hepsini kabul et')) { b.click(); break; }
        }
    });
    await new Promise(r => setTimeout(r, 2000));

    await page.evaluate(async () => {
        const btns = document.querySelectorAll('[aria-expanded="false"]');
        for (const b of btns) { try { b.click(); await new Promise(r => setTimeout(r, 200)); } catch (e) { } }
    });
    await new Promise(r => setTimeout(r, 1000));

    // Price=0 veya çok düşük fiyatlı ürünlerin kartlarını detaylı incele
    const problemCards = await page.evaluate(() => {
        const cards = document.querySelectorAll('[id^="food-card-link-"]');
        const results = [];
        for (const c of cards) {
            const spans = c.querySelectorAll('span');
            const spanTexts = Array.from(spans).map(s => ({
                text: s.textContent?.trim(),
                hasTL: s.textContent?.includes('\u20BA')
            }));

            const name = spanTexts[0]?.text || '';
            // "Sashimi Moriawase", "Tuna Tataki", "Tunahunret" ara
            if (name.includes('Sashimi Moriawase') || name.includes('Tuna Tataki') || name.includes('Tunahunret')) {
                results.push({
                    id: c.id,
                    spans: spanTexts
                });
            }
        }
        return results;
    });

    fs.writeFileSync('debug_output.json', JSON.stringify(problemCards, null, 2));
    console.log('Written', problemCards.length, 'cards to debug_output.json');

    await browser.close();
})();
