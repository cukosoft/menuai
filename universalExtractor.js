/**
 * MenüAi Universal Menu Extraction Engine v8
 * 
 * DOM-First + Screenshot Fallback Architecture
 * Playwright Edition — daha stabil, daha hızlı.
 * 
 * 5 Fazlı çalışır:
 *   Faz 0: Sayfa aç → popup/cookie temizle → "Menüyü Gör" tıkla
 *   Faz 1: Yapı keşfi — alt sayfa linkleri + tab/accordion keşfi
 *   Faz 2: Tab/accordion auto-click — gizli içeriği aç
 *   Faz 3: DOM Text Extraction — tüm metin → Gemini → ürün çıkar (PRIMARY)
 *   Faz 4: Screenshot Fallback — DOM text yetersizse V7 screenshot pipeline (SECONDARY)
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

        return this._parseGeminiResponse(result);
    }

    // ─── Gemini'ye TEXT gönder, JSON cevap al (V8 yeni!) ───
    async askGeminiText(prompt) {
        const result = await this.retry(async () => {
            return await this.model.generateContent(prompt);
        });

        return this._parseGeminiResponse(result);
    }

    // ─── Gemini yanıtından JSON parse et ───
    _parseGeminiResponse(result) {
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
            document.querySelectorAll(
                '#gtx-trans, .goog-te-banner-frame, .skiptranslate, [id*="google_translate"], [class*="goog-te"]'
            ).forEach(el => el.remove());

            document.querySelectorAll('iframe').forEach(iframe => {
                const src = iframe.src || '';
                if (src.includes('translate.google') || src.includes('translate_') ||
                    iframe.className.includes('goog') || iframe.id.includes('goog')) {
                    iframe.remove();
                }
            });

            if (document.body.style.top) {
                document.body.style.top = '';
                document.body.style.position = '';
            }
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
                const coversScreen = rect.width > window.innerWidth * 0.7 && rect.height > window.innerHeight * 0.6;
                if (coversScreen) return;

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

    // ══════════════════════════════════════════════════════════════════
    // ═══ V8 YENİ METODLAR ═══
    // ══════════════════════════════════════════════════════════════════

    // ─── Alt sayfa link keşfi (BigChefs /menu/ → /yiyecekler/ gibi) ───
    async discoverSubPages(page, baseUrl) {
        this.log('\n🔍 Alt sayfa linkleri aranıyor...');

        const subPages = await page.evaluate((base) => {
            const links = Array.from(document.querySelectorAll('a[href]'));
            const menuKeywords = [
                'menu', 'yemek', 'food', 'drink', 'icecek', 'içecek',
                'yiyecek', 'tatli', 'dessert', 'beverage', 'carta',
                'speisekarte', 'getranke', 'boissons', 'plats',
                'appetizer', 'starter', 'main', 'entree', 'cocktail',
                'wine', 'beer', 'breakfast', 'lunch', 'dinner', 'brunch',
                'kahvalti', 'cocuk', 'child', 'kid', 'vegan', 'pizza',
                'burger', 'salad', 'soup', 'corba', 'salata'
            ];

            // Base URL normalize
            const baseNorm = base.replace(/\/$/, '');

            const found = [];
            const seen = new Set();

            for (const link of links) {
                const href = link.href;
                if (!href || href === base || href === baseNorm || href === baseNorm + '/') continue;
                if (seen.has(href)) continue;

                // Aynı domain'de mi?
                try {
                    const linkUrl = new URL(href);
                    const baseUrlObj = new URL(base);
                    if (linkUrl.hostname !== baseUrlObj.hostname) continue;
                } catch { continue; }

                // Menü ile ilgili keyword içeriyor mu?
                const hrefLower = href.toLowerCase();
                const textLower = (link.textContent || '').toLowerCase().trim();

                const hrefMatch = menuKeywords.some(kw => hrefLower.includes(kw));
                const textMatch = menuKeywords.some(kw => textLower.includes(kw));

                if (hrefMatch || textMatch) {
                    // Sadece base URL'in alt sayfalarını al (veya aynı path altını)
                    if (hrefLower.startsWith(baseNorm.toLowerCase())) {
                        seen.add(href);
                        found.push({
                            url: href,
                            text: link.textContent.trim().substring(0, 60)
                        });
                    }
                }
            }

            return found;
        }, baseUrl);

        // Filter out junk pages: index.php, lang params, hash-only, etc.
        const baseNormLower = baseUrl.replace(/\/$/, '').toLowerCase();
        const cleanPages = [];
        const seenPaths = new Set();

        for (const sp of subPages) {
            try {
                const u = new URL(sp.url);
                const pathKey = u.pathname.replace(/\/$/, '').toLowerCase();

                // Skip duplicates by path
                if (seenPaths.has(pathKey)) continue;

                // Skip index.php (same as main page)
                if (pathKey.endsWith('/index.php') || pathKey.endsWith('/index.html')) continue;

                // Skip lang variants (?lang=tr, ?lang=en etc.)
                if (u.search && /[?&]lang=/i.test(u.search)) continue;

                // Skip if path is same as base
                const basePath = new URL(baseUrl).pathname.replace(/\/$/, '').toLowerCase();
                if (pathKey === basePath) continue;

                seenPaths.add(pathKey);
                cleanPages.push(sp);
            } catch { continue; }
        }

        if (cleanPages.length > 0) {
            this.log(`📂 ${cleanPages.length} alt sayfa bulundu (${subPages.length - cleanPages.length} duplikat filtrelendi):`);
            cleanPages.forEach(sp => this.log(`   - ${sp.text}: ${sp.url}`));
        } else {
            this.log('   ℹ️ Alt sayfa bulunamadı');
        }

        return cleanPages;
    }

    // ─── Tab/Accordion otomatik keşif ve tıklama ───
    async discoverAndClickTabs(page) {
        this.log('\n🔘 Tab/Accordion elementleri aranıyor...');

        const tabInfo = await page.evaluate(() => {
            const tabSelectors = [
                '[role="tab"]',
                '.e-n-tab-title',
                '.elementor-tab-title',
                '[data-toggle="tab"]',
                '[data-bs-toggle="tab"]',
                '.nav-tabs .nav-link',
                '.tabs__nav-link',
                '.tab-link',
                '.menu-tab',
                // Accordion
                '.accordion-header',
                '.accordion-button',
                '[data-toggle="collapse"]',
                '[data-bs-toggle="collapse"]',
                '.elementor-accordion-title',
                // Generic tab patterns
                '[class*="tab-title"]',
                '[class*="tab-header"]',
                '[class*="category-tab"]',
                '[class*="menu-category"]'
            ];

            let allTabs = [];
            const seen = new Set();

            for (const selector of tabSelectors) {
                const elements = document.querySelectorAll(selector);
                for (const el of elements) {
                    const text = (el.textContent || '').trim();
                    if (text && text.length > 1 && text.length < 60 && !seen.has(text)) {
                        seen.add(text);
                        allTabs.push({
                            selector,
                            text,
                            index: allTabs.length
                        });
                    }
                }
            }

            return allTabs;
        });

        if (tabInfo.length === 0) {
            this.log('   ℹ️ Tab/Accordion bulunamadı');
            return 0;
        }

        this.log(`🔘 ${tabInfo.length} tab/accordion bulundu, hepsi tıklanıyor...`);

        // Her tab'ı tıkla — bu sayede gizli içerik DOM'a yüklenir
        let clickedCount = 0;
        for (const tab of tabInfo) {
            try {
                const clicked = await page.evaluate(({ selector, text }) => {
                    const elements = document.querySelectorAll(selector);
                    for (const el of elements) {
                        if ((el.textContent || '').trim() === text) {
                            el.click();
                            return true;
                        }
                    }
                    return false;
                }, tab);

                if (clicked) {
                    clickedCount++;
                    this.log(`   ✅ Tab tıklandı: "${tab.text}"`);
                    await this.sleep(800); // İçerik yüklenmesi için bekle
                }
            } catch (e) {
                // Tıklama hatası — devam et
            }
        }

        this.log(`   📊 ${clickedCount}/${tabInfo.length} tab tıklandı`);
        return clickedCount;
    }

    // ─── DOM'dan temiz metin çıkar (footer, nav, script hariç) ───
    async extractDOMText(page) {
        this.log('\n📝 DOM text çıkarılıyor...');

        const text = await page.evaluate(() => {
            // Footer, nav, header, script elementlerini atla
            const skipSelectors = [
                'footer', 'nav', 'header', 'script', 'style', 'noscript',
                '.cookie-banner', '.cookie-consent', '[class*="footer"]',
                '[class*="navbar"]', '[class*="header-"]', '[class*="social"]',
                '[class*="copyright"]', '[class*="newsletter"]', '[class*="subscribe"]',
                '[id*="footer"]', '[id*="header"]', '[id*="cookie"]'
            ];

            const clone = document.body.cloneNode(true);
            for (const sel of skipSelectors) {
                clone.querySelectorAll(sel).forEach(el => el.remove());
            }

            return clone.innerText || '';
        });

        const charCount = text.length;
        const lineCount = text.split('\n').filter(l => l.trim()).length;
        this.log(`   📊 ${charCount} karakter, ${lineCount} satır metin çıkarıldı`);

        return text;
    }

    // ─── Metin tabanlı ürün çıkarma — Gemini'ye raw text gönder (V8 PRIMARY) ───
    async extractFromText(text, contextName = 'Menü') {
        this.log('\n🤖 Gemini text-based extraction başlıyor...');

        // Metni chunk'lara böl (max ~6000 char per chunk — Gemini token limiti)
        const MAX_CHUNK = 6000;
        const chunks = [];
        const lines = text.split('\n').filter(l => l.trim());

        let currentChunk = '';
        for (const line of lines) {
            if (currentChunk.length + line.length + 1 > MAX_CHUNK) {
                if (currentChunk) chunks.push(currentChunk);
                currentChunk = line;
            } else {
                currentChunk += '\n' + line;
            }
        }
        if (currentChunk) chunks.push(currentChunk);

        this.log(`   📦 ${chunks.length} metin chunk'ı hazırlandı`);

        let allItems = [];

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];

            // Menü içeriği olup olmadığını kontrol et — çok kısa veya anlamsızsa atla
            if (chunk.length < 30) continue;

            const prompt = `Aşağıda bir restoranın web sitesinden çıkarılmış menü metni var.

METIN:
"""
${chunk}
"""

GÖREV: Bu metindeki TÜM yiyecek ve içecek ürünlerini çıkar.

TÜRKÇE YAZIM KURALLARI (ÇOK ÖNEMLİ!):
- Türkçe özel karakterleri DOĞRU kullan: ı İ ş Ş ç Ç ğ Ğ ö Ö ü Ü
- "i" ve "ı" farkına dikkat: "Kahvaltı" (doğru), "Kahvalti" (YANLIŞ)
- Metindeki yazımı AYNEN kopyala

HER ÜRÜN İÇİN ÇIKAR:
- "name": Ürün adı (metindeki haliyle)
- "price": Fiyat (sadece sayı). Fiyat belirtilmemişse 0
- "category": Ürünün ait olduğu kategori. Metinde kategori başlığı varsa onu kullan, yoksa "Genel"
- "description": Ürün açıklaması (varsa, yoksa boş string)

KATEGORİ TESPİT KURALLARI:
1. Metinde BÜYÜK HARFLE veya belirgin başlık olarak yazılmış kategorileri kullan
2. "Kahvaltılar", "Salatalar", "Burgerler", "İçecekler" gibi grup başlıkları = KATEGORİ
3. Her ürünü en yakın üst kategoriye ata

DİĞER KURALLAR:
1. Sadece GERÇEK SATIŞ ÜRÜNLERİ — yiyecek, içecek, tatlı
2. Navigasyon metni, footer, slogan, buton yazıları → ÜRÜN DEĞİL
3. Aynı ürün iki kez geçiyorsa TEK KEZ yaz
4. "₺ 250" → 250, "250 TL" → 250, "₺1.290" → 1290, fiyat yoksa 0
5. İçindekiler/malzeme listesi = description (ürün değil)

JSON (sadece array):
[{"name": "Ürün", "price": 0, "category": "Kategori", "description": "açıklama"}]

Hiç ürün yoksa: []`;

            this.log(`   🤖 Chunk ${i + 1}/${chunks.length} (${chunk.length} char)`);

            try {
                const items = await this.askGeminiText(prompt);
                if (Array.isArray(items)) {
                    allItems.push(...items);
                    this.log(`   ✅ ${items.length} ürün çıkarıldı`);
                }
            } catch (e) {
                this.log(`   ⚠️ Chunk ${i + 1} hatası: ${e.message}`);
            }

            // Rate limit — chunk'lar arası kısa bekleme
            if (i < chunks.length - 1) {
                await this.sleep(1500);
            }
        }

        // Deduplicate
        const seen = new Set();
        const unique = allItems.filter(item => {
            const key = (item.name || '').toLowerCase().trim();
            if (key.length > 1 && !seen.has(key)) { seen.add(key); return true; }
            return false;
        });

        this.log(`\n📊 Text extraction sonuç: ${unique.length} benzersiz ürün`);
        return unique;
    }

    // ══════════════════════════════════════════════════════════════════
    // ═══ V7 MEVCUT METODLAR (Screenshot-based — FAZ 4 fallback) ═══
    // ══════════════════════════════════════════════════════════════════

    // ─── FAZ 1 Legacy: Kategori Keşfi (Screenshot → Gemini) ───
    async discoverCategories(page) {
        this.log('\n═══ SCREENSHOT FALLBACK: KATEGORİ KEŞFİ ═══');

        const screenshotPaths = [];

        const ssPath = path.join(this.screenshotDir, 'phase1_main.png');
        await page.screenshot({ path: ssPath, fullPage: false });
        screenshotPaths.push(ssPath);

        await page.evaluate(() => {
            const modals = document.querySelectorAll(
                '[class*="modal"], [class*="sheet"], [class*="dialog"], [class*="bottom"], [class*="drawer"], [class*="menu-list"], [class*="category"]'
            );
            for (const m of modals) {
                if (m.scrollHeight > m.clientHeight + 50) {
                    m.scrollTop = m.scrollHeight * 0.4;
                    return;
                }
            }
            window.scrollBy(0, window.innerHeight * 0.5);
        });
        await this.sleep(500);
        const ssPath2 = path.join(this.screenshotDir, 'phase1_scroll1.png');
        await page.screenshot({ path: ssPath2, fullPage: false });
        screenshotPaths.push(ssPath2);

        await page.evaluate(() => {
            const modals = document.querySelectorAll(
                '[class*="modal"], [class*="sheet"], [class*="dialog"], [class*="bottom"], [class*="drawer"], [class*="menu-list"], [class*="category"]'
            );
            for (const m of modals) {
                if (m.scrollHeight > m.clientHeight + 50) {
                    m.scrollTop = m.scrollHeight;
                    return;
                }
            }
            window.scrollBy(0, window.innerHeight * 0.5);
        });
        await this.sleep(500);
        const ssPath3 = path.join(this.screenshotDir, 'phase1_scroll2.png');
        await page.screenshot({ path: ssPath3, fullPage: false });
        screenshotPaths.push(ssPath3);

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
        let result = await this._tryClickCategory(page, categoryName);

        if (!result.found) {
            await page.evaluate(() => {
                const modals = document.querySelectorAll('[class*="modal"], [class*="sheet"], [class*="dialog"], [class*="bottom"], [class*="drawer"]');
                modals.forEach(m => m.scrollTop = m.scrollHeight);
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

            let match = els.find(el => (el.textContent || '').trim() === name);
            if (!match) match = els.find(el => (el.textContent || '').trim().toLowerCase() === name.toLowerCase());
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

    // ─── "Menüyü Gör" / "Menu" butonunu bul ve tıkla → modal aç ───
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

    // ─── FAZ 4 Legacy: Ürün Çıkarma — SmartScroll + screenshot + Gemini ───
    async extractItemsFromPage(page, categoryName) {
        const safeName = categoryName.replace(/[^a-zA-Z0-9ğüşöçıĞÜŞÖÇİ]/g, '_').substring(0, 30);

        const screenshots = await this.smartScroll.scrollAndCapture(
            page,
            this.screenshotDir,
            `p2_${safeName}`
        );

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

        const seen = new Set();
        return allItems.filter(item => {
            const key = (item.name || '').toLowerCase().trim();
            if (key.length > 1 && !seen.has(key)) { seen.add(key); return true; }
            return false;
        });
    }

    // ══════════════════════════════════════════════════════════════════
    // ═══ V8 ANA EXTRACT FONKSİYONU ═══
    // ══════════════════════════════════════════════════════════════════
    async extract(targetUrl) {
        this.log(`\n🚀 Universal Menu Extraction v8 (DOM-First + Fallback): ${targetUrl}`);

        if (!fs.existsSync(this.screenshotDir)) {
            fs.mkdirSync(this.screenshotDir, { recursive: true });
        }

        let browser;
        try {
            browser = await chromium.launch({
                headless: false,
                channel: 'chrome',
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
            this.log('\n═══ FAZ 0: SAYFA AÇ ═══');
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
                await this.closeNonMenuPopups(page);
            }

            let allItems = [];

            // ═══ FAZ 1: YAPI KEŞFİ — Alt sayfa linkleri ═══
            this.log('\n═══ FAZ 1: YAPI KEŞFİ ═══');
            const subPages = await this.discoverSubPages(page, targetUrl);

            if (subPages.length > 0) {
                // Ana sayfayı atla — sub-pages zaten kategori detay sayfaları
                this.log('\n📄 Çoklu sayfa modu — sadece alt sayfalar işlenecek (ana sayfa atlandı)');

                const pagesToProcess = subPages;

                for (let pi = 0; pi < pagesToProcess.length; pi++) {
                    const pg = pagesToProcess[pi];
                    this.log(`\n[${pi + 1}/${pagesToProcess.length}] 📄 ${pg.text}: ${pg.url}`);

                    try {
                        // Sayfaya git
                        try {
                            await page.goto(pg.url, { waitUntil: 'networkidle', timeout: 30000 });
                        } catch {
                            await page.goto(pg.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
                        }
                        await this.sleep(2000);
                        await this.waitForContentRender(page);
                        await this.closeNonMenuPopups(page);

                        // Tab/accordion keşfi ve tıklama
                        await this.discoverAndClickTabs(page);
                        await this.sleep(1000);

                        // DOM text çıkar
                        const domText = await this.extractDOMText(page);

                        let pageItems = [];
                        if (domText.length > 100) {
                            pageItems = await this.extractFromText(domText, pg.text);
                            this.log(`   📊 ${pg.text}: ${pageItems.length} ürün (text)`);
                        }

                        // Screenshot fallback — text az ürün verdiyse görsel ile dene
                        if (pageItems.length < 3) {
                            this.log(`   📸 Screenshot fallback (${pageItems.length} < 3 ürün)`);
                            const ssItems = await this.extractItemsFromPage(page, pg.text || 'Menü');
                            if (ssItems.length > pageItems.length) {
                                this.log(`   ✅ Screenshot: ${ssItems.length} ürün (text'ten daha iyi)`);
                                pageItems = ssItems;
                            }
                        }

                        allItems.push(...pageItems);
                    } catch (e) {
                        this.log(`   ⚠️ Sayfa hatası: ${e.message}`);
                    }
                }
            } else {
                // ── TEK SAYFA MODU ──
                this.log('\n📄 Tek sayfa modu');

                // ═══ FAZ 2: TAB/ACCORDION KEŞFİ ═══
                this.log('\n═══ FAZ 2: TAB/ACCORDION KEŞFİ ═══');
                const tabCount = await this.discoverAndClickTabs(page);
                if (tabCount > 0) {
                    await this.sleep(1000);
                }

                // ═══ FAZ 3: DOM TEXT EXTRACTION (PRIMARY) ═══
                this.log('\n═══ FAZ 3: DOM TEXT EXTRACTION ═══');
                const domText = await this.extractDOMText(page);

                if (domText.length > 100) {
                    allItems = await this.extractFromText(domText, 'Menü');
                    this.log(`\n📊 DOM text extraction: ${allItems.length} ürün`);
                }

                // ═══ FAZ 4: SCREENSHOT FALLBACK ═══
                if (allItems.length < 5) {
                    this.log(`\n═══ FAZ 4: SCREENSHOT FALLBACK (${allItems.length} < 5 ürün, yetersiz) ═══`);

                    // V7 screenshot pipeline
                    const categories = await this.discoverCategories(page);
                    const startUrl = page.url();

                    if (categories.length === 0) {
                        const ssItems = await this.extractItemsFromPage(page, 'Menü');
                        allItems.push(...ssItems);
                    } else {
                        for (let ci = 0; ci < categories.length; ci++) {
                            const cat = categories[ci];
                            this.log(`\n[${ci + 1}/${categories.length}] 📂 ${cat.name}`);

                            try {
                                if (cat.clickable) {
                                    const reopenedFirst = await this.openMenuSelector(page);
                                    if (reopenedFirst) {
                                        this.log(`   🔄 Modal yeniden açıldı`);
                                        await this.sleep(2000);
                                        await this.waitForContentRender(page);
                                    }

                                    const clickResult = await this.clickCategory(page, cat.name);
                                    if (clickResult.found) {
                                        this.log(`   🖱️ Tıklandı: "${clickResult.text}"`);
                                    } else {
                                        this.log(`   ⚠️ Kategori bulunamadı, atlanıyor`);
                                        continue;
                                    }

                                    await this.sleep(3000);
                                    await this.waitForContentRender(page);
                                }

                                const items = await this.extractItemsFromPage(page, cat.name);
                                this.log(`   → ${items.length} ürün çıkarıldı`);
                                allItems.push(...items);

                                if (cat.clickable && ci < categories.length - 1) {
                                    try {
                                        await page.goBack({ waitUntil: 'networkidle', timeout: 10000 });
                                    } catch {
                                        try {
                                            await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 15000 });
                                        } catch { }
                                    }
                                    await this.sleep(2000);
                                    await this.waitForContentRender(page);

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
                } else {
                    this.log('\n✅ DOM text extraction yeterli — screenshot fallback atlandı');
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
        const toTitleCase = (str) => {
            return str.toLowerCase()
                .split(' ')
                .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ');
        };

        const normalizeCategory = (cat) => {
            if (!cat) return 'Genel';
            const trimmed = cat.trim();
            if (trimmed.length < 2) return 'Genel';
            if (trimmed === trimmed.toUpperCase() || trimmed === trimmed.toLowerCase()) {
                return toTitleCase(trimmed);
            }
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

        const catNormMap = {};
        const catMap = {};
        for (const item of unique) {
            const catLower = item.category.toLowerCase();
            if (!catNormMap[catLower]) {
                catNormMap[catLower] = item.category;
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
            source: 'Universal Vision AI v8 (DOM-First + Fallback)',
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
