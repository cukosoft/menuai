const cheerio = require('cheerio');
const axios = require('axios');

async function test() {
    const url = 'https://cafeblanca.com.tr/menu/kahvalti';
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);

    // Simulate exactly what extractDOMText does
    const skipSelectors = [
        'footer', 'nav', 'header', 'script', 'style', 'noscript',
        '.cookie-banner', '.cookie-consent', '[class*="footer"]',
        '[class*="navbar"]', '[class*="header-"]', '[class*="social"]',
        '[class*="copyright"]', '[class*="newsletter"]', '[class*="subscribe"]',
        '[id*="footer"]', '[id*="header"]', '[id*="cookie"]'
    ];

    for (const sel of skipSelectors) {
        $(sel).remove();
    }

    const text = $('body').text();
    const lines = text.split('\n').filter(l => l.trim());

    console.log('=== EXACT TEXT SENT TO GEMINI ===');
    console.log(`Total chars: ${text.length}`);
    console.log(`Total non-empty lines: ${lines.length}`);
    console.log('\n--- LINES ---');
    lines.forEach((l, i) => {
        console.log(`[${i}] "${l.trim().substring(0, 120)}"`);
    });
}

test().catch(e => console.error(e.message));
