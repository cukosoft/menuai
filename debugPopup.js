const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 430, height: 932, isMobile: true });

    console.log('Navigating to Starbucks...');
    await page.goto('https://www.starbucks.com.tr/menu', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    // Tüm butonları listele
    const buttons = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button')).map(btn => ({
            text: btn.textContent?.trim(),
            classes: btn.className,
            visible: btn.offsetWidth > 0,
            rect: btn.getBoundingClientRect()
        })).filter(b => b.visible && b.text);
    });

    console.log('Found buttons:', buttons.length);
    buttons.forEach((b, i) => {
        console.log(`${i}: "${b.text}" - ${b.classes} - top:${Math.round(b.rect.top)}`);
    });

    await browser.close();
    console.log('Done');
})().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
