/**
 * MenüAi Universal Menu Extraction Engine v7
 * 
 * Tamamen Gemini Vision tabanlı — siteye özel DOM scraping YOK.
 * Playwright Edition — daha stabil, daha hızlı.
 * 
 * 3 Fazlı çalışır:
 *   Faz 0: Sayfa aç → "Menüyü Gör" / "Menu" butonunu tıkla
 *   Faz 1: Screenshot → Gemini → Kategori keşfi
 *   Faz 2: Her kategori → tıkla → Scroll + Screenshot → Gemini → Ürün çıkarma
 * 
 * HER SİTE İÇİN ÇALIŞIR — HTML yapısına bağımlılık SIFIR.
 */

const { chromium } = require('playwright');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const SmartScroll = require('./smartScroll');
require('dotenv').config();

class UniversalMenuExtractor {
    constructor(options = {}) {
        this.apiKey = options.apiKey || process.env.GEMINI_API_KEY;
        if (!this.apiKey) throw new Error('GEMINI_API_KEY gerekli!');

        this.genAI = new GoogleGenerativeAI(this.apiKey);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
        this.screenshotDir = options.screenshotDir || path.join(__dirname, 'screenshots');
        this.smartScroll = new SmartScroll({ verbose: true, maxScrolls: 50, scrollDelay: 600 });
        this.maxRetries = 3;
        this.baseDelay = 30000;
        this.verbose = options.verbose !== false;
    }

    log(...args) {
        if (this.verbose) console.log(...args);
    }

    // ─── Retry with backoff ───
    async retry(fn, retries = this.maxRetries) {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                const isRetryable = error.message?.includes('429') ||
                    error.message?.includes('Resource exhausted') ||
                    error.message?.includes('retry');
                if (isRetryable && attempt < retries) {
                    const waitMatch = error.message.match(/(\d+\.?\d*)s/);
                    const wait = waitMatch
                        ? Math.ceil(parseFloat(waitMatch[1]) * 1000) + 2000
                        : this.baseDelay * Math.pow(2, attempt);
                    this.log(`   ⏳ Rate limited. ${Math.ceil(wait / 1000)}s bekleniyor (deneme ${attempt + 1}/${retries})...`);
                    await this.sleep(wait);
                } else {
                    throw error;
                }
            }
        }
    }

    sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    // ─── Sayfada görsel içerik render edilene kadar bekle ───
    async waitForContentRender(page, maxWait = 15000) {
        const start = Date.now();
        while (Date.now() - start < maxWait) {
            const hasContent = await page.evaluate(() => {
                const bodyText = document.body?.innerText?.trim() || '';
                const visibleEls = document.querySelectorAll('div, span, p, h1, h2, h3, img');
                let visibleCount = 0;
                visibleEls.forEach(el => {
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight) visibleCount++;
                });
                return {
                    textLen: bodyText.length,
                    visibleCount,
                    ready: bodyText.length > 50 || visibleCount > 10
                };
            });

            if (hasContent.ready) {
                this.log(`   ✅ Render OK (text:${hasContent.textLen}, visible:${hasContent.visibleCount})`);
                return true;
            }
            await this.sleep(500);
        }
        this.log('   ⚠️ Render timeout');
        return false;
    }

    // ─── Gemini Vision'a screenshot gönder, JSON cevap al ───
    async askGemini(imagePaths, prompt) {
        const parts = [{ text: prompt }];

        for (const imgPath of (Array.isArray(imagePaths) ? imagePaths : [imagePaths])) {
            const imageData = fs.readFileSync(imgPath);
            parts.push({
                inlineData: {
                    mimeType: 'image/png',
                    data: imageData.toString('base64')
                }
            });
        }

        const result = await this.retry(async () => {
            return await this.model.generateContent(parts);
        });

        const text = result.response.text();
        // JSON çıkar
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch (e) {
                this.log('   ⚠️ JSON parse hatası');
                return text;
            }
        }
        const objMatch = text.match(/\{[\s\S]*\}/);
        if (objMatch) {
            try { return JSON.parse(objMatch[0]); } catch (e) { }
        }
        return text;
    }

    // ─── Popup/Cookie kapatma (menü modallarına DOKUNMA!) ───
    async closeNonMenuPopups(page) {
        // ESC BASMA — modal açıkken modal kapanır!

        // 1. Cookie consent → "Kabul et" / "Accept" butonuna tıkla
        await page.evaluate(() => {
            const acceptKeywords = ['kabul', 'accept', 'hepsini kabul', 'accept all', 'tamam', 'ok', 'agree', 'consent'];
            const btns = Array.from(document.querySelectorAll('button, a'));
            for (const btn of btns) {
                const text = (btn.textContent || '').toLowerCase().trim();
                if (acceptKeywords.some(kw => text.includes(kw)) && text.length < 40) {
                    // Sadece fixed/sticky parent içindeki butonları tıkla
                    let el = btn;
                    while (el && el !== document.body) {
                        const style = window.getComputedStyle(el);
                        if (style.position === 'fixed' || style.position === 'sticky') {
                            btn.click();
                            return;
                        }
                        el = el.parentElement;
                    }
                }
            }
        });
        await this.sleep(500);

        // 2. Kalan cookie/consent/gdpr overlay'lerini DOM'dan kaldır
        await page.evaluate(() => {
            const keywords = ['cookie', 'consent', 'gdpr', 'privacy', 'onetrust', 'cc-banner', 'cc_banner'];
            keywords.forEach(kw => {
                document.querySelectorAll(`[class*="${kw}"], [id*="${kw}"]`).forEach(el => {
                    const style = window.getComputedStyle(el);
                    if (style.position === 'fixed' || style.position === 'absolute' || style.position === 'sticky') {
                        el.remove();
                    }
                });
            });
        });
        await this.sleep(200);

        // 3. Google Translate bar — iframe ve toolbar kaldır
        await page.evaluate(() => {
            // Google Translate toolbar (genellikle :goog-gt- prefix veya #gtx-trans)
            document.querySelectorAll(
                '#gtx-trans, .goog-te-banner-frame, .skiptranslate, [id*="google_translate"], [class*="goog-te"]'
            ).forEach(el => el.remove());

            // Google Translate iframe (sayfa üstünde yer kaplayan)
            document.querySelectorAll('iframe').forEach(iframe => {
                const src = iframe.src || '';
                if (src.includes('translate.google') || src.includes('translate_') ||
                    iframe.className.includes('goog') || iframe.id.includes('goog')) {
                    iframe.remove();
                }
            });

            // body'nin margin-top'unu sıfırla (translate bar bazen margin ekler)
            if (document.body.style.top) {
                document.body.style.top = '';
                document.body.style.position = '';
            }
            // html margin-top fix
            const html = document.documentElement;
            if (html.style.marginTop) html.style.marginTop = '0';
            if (html.className.includes('translated')) {
                html.style.marginTop = '0';
                html.style.top = '0';
            }
        });
        await this.sleep(200);

        // 4. Genel fixed/sticky overlay'ler — ekranın üstünü/altını kaplayan
        await page.evaluate(() => {
            const allFixed = document.querySelectorAll('*');
            allFixed.forEach(el => {
                const style = window.getComputedStyle(el);
                if (style.position !== 'fixed' && style.position !== 'sticky') return;
                const rect = el.getBoundingClientRect();
                // Menü modali DEĞİLSE kaldır (menü modali genellikle viewport'un büyük kısmını kaplar)
                const coversScreen = rect.width > window.innerWidth * 0.7 && rect.height > window.innerHeight * 0.6;
                if (coversScreen) return; // Bu muhtemelen menü modali, dokunma

                // Küçük bar/banner'lar → kaldır (cookie bar, translate bar, notification bar)
                const isBar = rect.height < 150 && rect.width > window.innerWidth * 0.5;
                const isAtEdge = rect.top < 60 || rect.bottom > window.innerHeight - 100;
                if (isBar && isAtEdge) {
                    el.remove();
                }
            });
        });
        await this.sleep(200);

        this.log('   🧹 Popup/overlay temizliği yapıldı');
    }

    // ─── FAZ 1: Kategori Keşfi (Screenshot → Gemini) ───
    async discoverCategories(page) {
        this.log('\n═══ FAZ 1: KATEGORİ KEŞFİ ═══');

        const screenshotPaths = [];

        // İlk screenshot — mevcut ekran
        const ssPath = path.join(this.screenshotDir, 'phase1_main.png');
        await page.screenshot({ path: ssPath, fullPage: false });
        screenshotPaths.push(ssPath);

        // Modal/sheet içinde scroll et — daha aşağıdaki kategorileri göster
        await page.evaluate(() => {
            // Modal/sheet/drawer arayüz elementini bul ve scroll et
            const modals = document.querySelectorAll(
                '[class*="modal"], [class*="sheet"], [class*="dialog"], [class*="bottom"], [class*="drawer"], [class*="menu-list"], [class*="category"]'
            );
            for (const m of modals) {
                if (m.scrollHeight > m.clientHeight + 50) {
                    m.scrollTop = m.scrollHeight * 0.4; // %40 aşağı
                    return;
                }
            }
            // Modal bulunamadıysa window scroll
            window.scrollBy(0, window.innerHeight * 0.5);
        });
        await this.sleep(500);
        const ssPath2 = path.join(this.screenshotDir, 'phase1_scroll1.png');
        await page.screenshot({ path: ssPath2, fullPage: false });
        screenshotPaths.push(ssPath2);

        // Daha da aşağı scroll — en alttaki kategoriler için
        await page.evaluate(() => {
            const modals = document.querySelectorAll(
                '[class*="modal"], [class*="sheet"], [class*="dialog"], [class*="bottom"], [class*="drawer"], [class*="menu-list"], [class*="category"]'
            );
            for (const m of modals) {
                if (m.scrollHeight > m.clientHeight + 50) {
                    m.scrollTop = m.scrollHeight; // En alta
                    return;
                }
            }
            window.scrollBy(0, window.innerHeight * 0.5);
        });
        await this.sleep(500);
        const ssPath3 = path.join(this.screenshotDir, 'phase1_scroll2.png');
        await page.screenshot({ path: ssPath3, fullPage: false });
        screenshotPaths.push(ssPath3);

        // Modal'ı başa geri al — sonra tekrar tıklamak için
        await page.evaluate(() => {
            const modals = document.querySelectorAll(
                '[class*="modal"], [class*="sheet"], [class*="dialog"], [class*="bottom"], [class*="drawer"], [class*="menu-list"], [class*="category"]'
            );
            for (const m of modals) {
                if (m.scrollHeight > m.clientHeight + 50) {
                    m.scrollTop = 0;
                    return;
                }
            }
            window.scrollTo(0, 0);
        });
        await this.sleep(300);

        this.log(`📸 ${screenshotPaths.length} screenshot alındı, Gemini analiz ediyor...`);

        const prompt = `Bu bir restoran menü sayfası / menü seçim ekranı. 

GÖREV: Ekranda görünen TÜM menü kategorilerini bul.

Olası durumlar:
A) "Menü Seçiniz" gibi bir modal/liste açık — listede kategoriler var (Yemekler, İçecekler, Çorbalar vb.)
B) Sayfa üstünde tab/buton şeklinde kategoriler var
C) Sayfada kategori başlıkları altında ürünler sıralanmış

Her kategori için döndür:
- "name": Kategori adı (ekrandaki haliyle)
- "clickable": true eğer tıklanabilir (link, buton, liste öğesi) — false eğer sadece başlık

ÖNEMLİ:
1. Sadece KATEGORİ isimlerini döndür 
2. Ürün isimlerini, restoran adını, buton yazılarını (Menüyü Gör, Bilgi vb) DÖNDÜRME
3. "Menü Seçiniz" başlığını kategori olarak ALMA

JSON FORMAT:
[{"name": "Kategori Adı", "clickable": true}]

Hiç kategori yoksa: []`;

        const categories = await this.askGemini(screenshotPaths, prompt);

        if (!Array.isArray(categories)) {
            this.log('⚠️ Gemini kategori bulamadı');
            return [];
        }

        this.log(`✅ ${categories.length} kategori keşfedildi:`);
        categories.forEach(c => this.log(`   - ${c.name} (${c.clickable ? 'tıklanabilir' : 'heading'})`));

        return categories;
    }

    // ─── Kategoriye tıkla (isim ile, modalde scroll destekli) ───
    async clickCategory(page, categoryName) {
        // İlk deneme: doğrudan tıkla
        let result = await this._tryClickCategory(page, categoryName);

        if (!result.found) {
            // Modal içinde aşağı scroll et ve tekrar dene
            await page.evaluate(() => {
                // Modal/sheet içindeki scrollable container bul
                const modals = document.querySelectorAll('[class*="modal"], [class*="sheet"], [class*="dialog"], [class*="bottom"], [class*="drawer"]');
                modals.forEach(m => m.scrollTop = m.scrollHeight);
                // Genel body scroll da dene
                window.scrollBy(0, 300);
            });
            await this.sleep(500);
            result = await this._tryClickCategory(page, categoryName);
        }

        return result;
    }

    async _tryClickCategory(page, categoryName) {
        return await page.evaluate((name) => {
            const els = Array.from(document.querySelectorAll('a, button, li, div[role="button"], span'));

            // Tam eşleşme
            let match = els.find(el => (el.textContent || '').trim() === name);

            // Lowercase eşleşme
            if (!match) match = els.find(el => (el.textContent || '').trim().toLowerCase() === name.toLowerCase());

            // Contains eşleşme
            if (!match) match = els.find(el => {
                const text = (el.textContent || '').trim();
                return text.length < name.length * 2 && text.toLowerCase().includes(name.toLowerCase());
            });

            if (match) {
                match.scrollIntoView({ block: 'center' });
                match.click();
                return { found: true, text: match.textContent.trim().substring(0, 50) };
            }
            return { found: false };
        }, categoryName);
    }

    // ─── "Menüyü Gör" / "Menu" butonunu bul ve tıkla→ modal aç ───
    async openMenuSelector(page) {
        const btnResult = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, a'));
            const menuBtn = btns.find(b => {
                const t = (b.textContent || '').toLowerCase().trim();
                return (t.includes('menü') || t.includes('menu')) && t.length < 30 &&
                    !t.includes('seçiniz') && !t.includes('select');
            });
            if (menuBtn) {
                menuBtn.click();
                return menuBtn.textContent.trim();
            }
            return null;
        });
        return btnResult;
    }

    // ─── FAZ 2: Ürün Çıkarma — SmartScroll + screenshot + Gemini ───
    async extractItemsFromPage(page, categoryName) {
        const safeName = categoryName.replace(/[^a-zA-Z0-9ğüşöçıĞÜŞÖÇİ]/g, '_').substring(0, 30);

        // SmartScroll: container tespit + otomatik strateji seçimi
        const screenshots = await this.smartScroll.scrollAndCapture(
            page,
            this.screenshotDir,
            `p2_${safeName}`
        );

        // Gemini'ye gönder (2'şerli batch)
        let allItems = [];

        for (let i = 0; i < screenshots.length; i += 2) {
            const batch = screenshots.slice(i, i + 2);

            const prompt = `Bu ekran görüntü${batch.length > 1 ? 'leri' : 'sü'} bir TÜRK restoranının menüsünden.
Aktif kategori: "${categoryName}"

TÜRKÇE YAZIM KURALLARI (ÇOK ÖNEMLİ!):
- Türkçe özel karakterleri DOĞRU kullan: ı İ ş Ş ç Ç ğ Ğ ö Ö ü Ü
- "i" ve "ı" farkına dikkat: "Kahvaltı" (doğru), "Kahvalti" (YANLIŞ)
- "Başlangıçlar" (doğru), "Başlangiçlar" (YANLIŞ)
- "İçecekler" (doğru), "Içecekler" (YANLIŞ)
- "Köfteler" (doğru), "Kofteler" (YANLIŞ)
- Menüden okuduğun metinleri aynen kopyala, Türkçe karakterleri asla değiştirme

HER ÜRÜN İÇİN ÇIKAR:
- "name": Ürün adı (Türkçe karakterleri AYNEN koru)
- "price": Fiyat (sadece sayı). Fiyat yoksa 0
- "category": Kategori adı (Türkçe karakterlerle)
- "description": Açıklama (varsa, yoksa boş string)

KATEGORİ KURALLARI:
1. Sayfada alt-kategori başlıkları varsa her ürünü kendi başlığına ata
2. Alt-kategori yoksa hepsini "${categoryName}" yap
3. Başlığın KENDİSİNİ ürün olarak EKLEME

DİĞER KURALLAR:
1. Sadece GERÇEK SATIŞ ÜRÜNLERİ (yiyecek, içecek)
2. Slogan, buton, navigasyon → ÜRÜN DEĞİL
3. Aynı ürün birden fazla screenshot'taysa TEK KEZ yaz  
4. "₺ 250" → 250, "250 TL" → 250, "₺1.290" → 1290

JSON (sadece array):
[{"name": "Ürün", "price": 250, "category": "Kategori", "description": ""}]

Hiç ürün yoksa: []`;

            this.log(`   🤖 Gemini batch ${Math.floor(i / 2) + 1}/${Math.ceil(screenshots.length / 2)}`);
            const items = await this.askGemini(batch, prompt);

            if (Array.isArray(items)) {
                allItems.push(...items);
                this.log(`   ✅ ${items.length} ürün`);
            }
            await this.sleep(1000);
        }

        // Deduplicate
        const seen = new Set();
        return allItems.filter(item => {
            const key = (item.name || '').toLowerCase().trim();
            if (key.length > 1 && !seen.has(key)) { seen.add(key); return true; }
            return false;
        });
    }

    // ─── ANA EXTRACT FONKSİYONU ───
    async extract(targetUrl) {
        this.log(`\n🚀 Universal Menu Extraction v7 (Playwright): ${targetUrl}`);

        if (!fs.existsSync(this.screenshotDir)) {
            fs.mkdirSync(this.screenshotDir, { recursive: true });
        }

        let browser;
        try {
            browser = await chromium.launch({
                headless: false,
                channel: 'chrome', // Sistemdeki Chrome'u kullan
                args: ['--window-size=430,1500']
            });

            const context = await browser.newContext({
                viewport: { width: 430, height: 1500 },
                isMobile: true,
                userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
                hasTouch: true
            });

            const page = await context.newPage();

            // ═══ FAZ 0: SAYFA AÇ ═══
            this.log('🌐 Sayfa açılıyor...');
            try {
                await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
            } catch (e) {
                await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
            }
            await this.sleep(3000);
            await this.waitForContentRender(page);
            await this.closeNonMenuPopups(page);

            // "Menüyü Gör" butonunu tıkla
            const menuBtn = await this.openMenuSelector(page);
            if (menuBtn) {
                this.log(`🖱️ "${menuBtn}" tıklandı`);
                await this.sleep(3000);
                await this.waitForContentRender(page);
                // Modal açıldıktan sonra tekrar popup temizle
                await this.closeNonMenuPopups(page);
            }

            // ═══ FAZ 1: KATEGORİ KEŞFİ ═══
            const categories = await this.discoverCategories(page);
            const startUrl = page.url();

            let allItems = [];

            if (categories.length === 0) {
                // ─── TEK SAYFALIK MENÜ ───
                this.log('\n═══ FAZ 2: TEK SAYFA ═══');
                allItems = await this.extractItemsFromPage(page, 'Menü');
            } else {
                // ─── ÇOKLU KATEGORİ ───
                this.log('\n═══ FAZ 2: KATEGORİ BAZLI EXTRACT ═══');

                for (let ci = 0; ci < categories.length; ci++) {
                    const cat = categories[ci];
                    this.log(`\n[${ci + 1}/${categories.length}] 📂 ${cat.name}`);

                    try {
                        if (cat.clickable) {
                            // ─── Modal Yeniden Aç (SPA modal menüler için) ───
                            // Modal kapanmış olabilir, önce açmayı dene
                            const reopenedFirst = await this.openMenuSelector(page);
                            if (reopenedFirst) {
                                this.log(`   🔄 Modal yeniden açıldı`);
                                await this.sleep(2000);
                                await this.waitForContentRender(page);
                            }

                            // ─── Kategori tıkla ───
                            const clickResult = await this.clickCategory(page, cat.name);
                            if (clickResult.found) {
                                this.log(`   🖱️ Tıklandı: "${clickResult.text}"`);
                            } else {
                                this.log(`   ⚠️ Kategori bulunamadı, atlanıyor`);
                                continue;
                            }

                            // Render bekle
                            await this.sleep(3000);
                            await this.waitForContentRender(page);
                        }

                        // Bu sayfadan ürünleri çıkar
                        const items = await this.extractItemsFromPage(page, cat.name);

                        this.log(`   → ${items.length} ürün çıkarıldı`);
                        allItems.push(...items);

                        // ─── GERİ DÖN: Ana menü seçiciye ───
                        if (cat.clickable && ci < categories.length - 1) {
                            // Geri butonuna bas
                            try {
                                await page.goBack({ waitUntil: 'networkidle', timeout: 10000 });
                            } catch {
                                // goBack başarısızsa, sayfayı yeniden yükle
                                try {
                                    await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 15000 });
                                } catch { }
                            }
                            await this.sleep(2000);
                            await this.waitForContentRender(page);

                            // "Menüyü Gör" tekrar tıkla (modal tekrar açılsın)
                            const reopened = await this.openMenuSelector(page);
                            if (reopened) {
                                await this.sleep(2000);
                                await this.waitForContentRender(page);
                            }
                        }
                    } catch (e) {
                        this.log(`   ⚠️ Hata: ${e.message}`);
                    }
                }
            }

            await browser.close();
            return this.organizeResults(allItems, targetUrl);

        } catch (error) {
            if (browser) await browser.close();
            throw error;
        }
    }

    // ─── Sonuçları düzenle, dedup, kategorize ───
    organizeResults(allItems, sourceUrl) {
        // Title Case normalize fonksiyonu
        const toTitleCase = (str) => {
            return str.toLowerCase()
                .split(' ')
                .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ');
        };

        // Kategori adı normalizasyonu — case-insensitive merge
        const normalizeCategory = (cat) => {
            if (!cat) return 'Genel';
            const trimmed = cat.trim();
            if (trimmed.length < 2) return 'Genel';
            // Eğer tamamı BÜYÜK veya tamamı küçükse → Title Case yap
            if (trimmed === trimmed.toUpperCase() || trimmed === trimmed.toLowerCase()) {
                return toTitleCase(trimmed);
            }
            // Zaten mixed case → olduğu gibi bırak
            return trimmed;
        };

        const seen = new Set();
        const unique = [];
        for (const item of allItems) {
            if (!item.name || item.name.length < 2) continue;
            const key = item.name.toLowerCase().trim();
            if (!seen.has(key)) {
                seen.add(key);
                unique.push({
                    name: item.name.trim(),
                    price: parseInt(item.price) || 0,
                    category: normalizeCategory(item.category),
                    description: (item.description || '').trim()
                });
            }
        }

        // Case-insensitive kategori gruplama
        const catNormMap = {}; // lowercase → normalized name
        const catMap = {};
        for (const item of unique) {
            const catLower = item.category.toLowerCase();
            if (!catNormMap[catLower]) {
                catNormMap[catLower] = item.category; // İlk gelen adı kullan
            }
            const normalizedName = catNormMap[catLower];
            if (!catMap[normalizedName]) catMap[normalizedName] = [];
            catMap[normalizedName].push({ name: item.name, price: item.price, description: item.description });
        }

        const categories = Object.keys(catMap).map(name => ({ name, items: catMap[name] }));
        const totalItems = categories.reduce((s, c) => s + c.items.length, 0);

        this.log(`\n═══ SONUÇ: ${totalItems} ürün, ${categories.length} kategori ═══`);
        categories.forEach(c => this.log(`   ${c.name}: ${c.items.length} ürün`));

        return {
            source: 'Universal Vision AI v7 (Playwright)',
            parsed_at: new Date().toISOString(),
            menu_url: sourceUrl,
            restaurant: this.extractRestaurantName(sourceUrl),
            totalItems,
            categories
        };
    }

    extractRestaurantName(url) {
        try { return new URL(url).hostname.split('.')[0]; }
        catch { return 'Restaurant'; }
    }
}

module.exports = UniversalMenuExtractor;

// ─── CLI kullanım ───
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log('Kullanım: node universalExtractor.js <menu_url>');
        process.exit(1);
    }

    const extractor = new UniversalMenuExtractor({ verbose: true });
    extractor.extract(args[0]).then(data => {
        fs.writeFileSync(path.join(__dirname, 'extracted_menu.json'), JSON.stringify(data, null, 2), 'utf8');
        console.log(`\n💾 Sonuç: extracted_menu.json`);
    }).catch(err => {
        console.error('❌ Hata:', err.message);
        process.exit(1);
    });
}
