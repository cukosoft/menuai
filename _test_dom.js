const cheerio = require('cheerio');
const axios = require('axios');

async function test() {
    const url = 'https://cafeblanca.com.tr/menu/kahvalti';
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);

    // Remove non-menu elements (same as extractDOMText)
    $('footer, nav, header, script, style, noscript').remove();
    $('[class*="footer"], [class*="navbar"], [class*="copyright"]').remove();

    const text = $('body').text().replace(/\s+/g, ' ').trim();
    console.log('TEXT LENGTH:', text.length);
    console.log('\nFIRST 2000 CHARS:');
    console.log(text.substring(0, 2000));

    // Also check specific product elements
    const $2 = cheerio.load(html);
    const products = [];
    $2('.titlecard').each((i, el) => {
        const name = $2(el).text().trim();
        products.push(name);
    });
    console.log('\n\n--- PRODUCT NAMES (via .titlecard) ---');
    products.forEach(p => console.log('  - ' + p));

    const prices = [];
    $2('.prod_price p').each((i, el) => {
        prices.push($2(el).text().trim());
    });
    console.log('\n--- PRICES (via .prod_price p) ---');
    prices.forEach(p => console.log('  - ' + p));

    console.log(`\nTotal products found: ${products.length}, prices: ${prices.length}`);
}

test().catch(e => console.error(e.message));
