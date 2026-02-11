/**
 * MobResPos SPA Adaptör
 * API intercept yöntemiyle menü verilerini çeker
 * 
 * Desteklenen URL'ler:
 * - mps*.mobresposmenu.com.tr
 * - *.mobrespos.com
 */

const { chromium } = require('playwright');

const NAME = 'MobResPos';

function canHandle(url) {
    return url.includes('mobrespos');
}

async function extract(url) {
    console.log(`[${NAME}] 🔌 API intercept başlatılıyor: ${url}`);

    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 } });
    const page = await ctx.newPage();

    // JSON API yanıtlarını yakala
    const apiResponses = {};
    page.on('response', async (resp) => {
        if (!resp.url().includes('api.mobrespos.com')) return;
        try {
            const postData = resp.request().postData();
            if (!postData) return;
            const parsed = JSON.parse(postData);
            const path = parsed.path || '';

            if (path.includes('categoryno.json')) {
                apiResponses.categories = await resp.json();
            } else if (path.includes('restaurant.json')) {
                apiResponses.restaurant = await resp.json();
            } else if (path.includes('productsno.json')) {
                apiResponses.products = await resp.json();
            }
        } catch (e) { /* skip non-json */ }
    });

    // Sayfayı aç ve bekle
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    // "Menüyü Gör" butonuna tıkla (API çağrılarını tetikler)
    await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const menuBtn = btns.find(b => {
            const t = (b.textContent || '').toLowerCase().trim();
            return t.includes('menü') || t.includes('menu');
        });
        if (menuBtn) menuBtn.click();
    });
    await new Promise(r => setTimeout(r, 3000));

    // Kategori tıkla (kalan API'leri tetikle)
    await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('*'));
        const first = items.find(e => {
            const t = (e.textContent || '').trim();
            return t.length > 2 && t.length < 30 && e.offsetHeight > 30 &&
                e.children.length < 3 && e.closest('[class*="modal"], [class*="sheet"], [class*="dialog"]');
        });
        if (first) first.click();
    });
    await new Promise(r => setTimeout(r, 3000));

    await browser.close();

    // Veri kontrolü
    if (!apiResponses.products || apiResponses.products.length === 0) {
        throw new Error(`[${NAME}] API'den ürün verisi alınamadı`);
    }

    // Restaurant adı
    const restaurantName = apiResponses.restaurant && apiResponses.restaurant[0]
        ? apiResponses.restaurant[0].FIRMA
        : 'Bilinmeyen';

    // Kategori map: GENID → name
    const catMap = {};
    if (apiResponses.categories) {
        apiResponses.categories.forEach(c => {
            catMap[c.GENID] = {
                name: c.CATEGORY,
                parent: c.UP_CATEGORY_TR
            };
        });
    }

    // Ürünleri standart formata çevir
    const categoryItems = {};
    apiResponses.products
        .filter(p => p.DELETED !== '1' && p.TUKENDI !== '1')
        .forEach(p => {
            const name = p.URUN_ADI || '';
            if (!name.trim()) return;

            const catId = p.CINDEX || p.CATEGORY;
            const catInfo = catMap[catId];
            const catName = catInfo ? catInfo.name : (p.CATEGORY || 'Diğer');
            const price = parseFloat(p.FIYATI) || 0;
            const desc = p.URUN_ACIKLAMA || '';

            if (!categoryItems[catName]) categoryItems[catName] = [];
            categoryItems[catName].push({ name, price, description: desc });
        });

    // Standart format
    const result = {
        restaurant: restaurantName,
        menu_url: url,
        extracted_at: new Date().toISOString(),
        categories: Object.entries(categoryItems).map(([name, items]) => ({ name, items }))
    };

    const totalItems = result.categories.reduce((a, c) => a + c.items.length, 0);
    console.log(`[${NAME}] ✅ ${totalItems} ürün, ${result.categories.length} kategori çıkarıldı`);
    console.log(`[${NAME}] 🏪 Restoran: ${restaurantName}`);

    return result;
}

module.exports = { NAME, canHandle, extract };
