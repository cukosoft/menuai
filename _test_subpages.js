const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://www.happygroup.com.tr/menu/happy-moons-cafe', { waitUntil: 'networkidle', timeout: 30000 });

    // Get ALL links on the page
    const allLinks = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href]')).map(a => ({
            href: a.href,
            text: (a.textContent || '').trim().substring(0, 80)
        }));
    });

    // Filter for alkollu
    const alkolluLinks = allLinks.filter(l => l.href.includes('alkollu'));
    console.log('=== ALKOLLU LINKS ===');
    alkolluLinks.forEach(l => console.log(l.text, '->', l.href));

    // Filter for menu subpages (same domain, has keyword)
    const base = 'https://www.happygroup.com.tr/menu/happy-moons-cafe';
    const menuLinks = allLinks.filter(l => {
        if (!l.href.startsWith('https://www.happygroup.com.tr')) return false;
        if (l.href === base || l.href === base + '/') return false;
        return l.href.includes('menu') || l.href.includes('icecek');
    });

    const unique = [...new Map(menuLinks.map(l => [l.href, l])).values()];
    console.log('\n=== ALL MENU SUBPAGE LINKS (' + unique.length + ') ===');
    unique.forEach((l, i) => console.log(i + 1 + '.', l.text, '->', l.href));

    await browser.close();
})();
