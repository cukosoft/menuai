/**
 * MenüAi Gemini Orchestrator Agent v3.0 — Auto-Publish Pipeline
 * 
 * Gemini 3 Pro = BEYİN (strateji, karar, analiz, kural yazma, yayın onayı)
 * Gemini 3 Flash = İŞÇİ (bulk extraction, OCR)
 * 
 * Agentic Loop:
 *   1. Pipeline kurallarını yükle → otomatik kararlar
 *   2. Kuralların kapsamadığı durumda Brain devreye girer
 *   3. Brain müdahale etti → sorun tespit → kalıcı kural üret
 *   4. Kural pipelineRules.json'a kaydedilir
 *   5. Aynı sorun bir daha yaşanmaz — pipeline kendini güçlendirir
 *
 * Felsefe: Brain her müdahale ettiğinde, kendini gereksiz kılacak
 *          bir kural yazmalı. Pipeline zamanla otonom olur.
 */

const { chromium } = require('playwright');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const SmartScroll = require('./smartScroll');
const { importMenu } = require('./importToSupabase');
require('dotenv').config();

// ═══════════════════════════════════════════════════════════════
// ═══ STRATEGY STORE — Öğrenilmiş stratejilerin hafızası ═══
// ═══════════════════════════════════════════════════════════════
class StrategyStore {
    constructor(storePath) {
        this.storePath = storePath || path.join(__dirname, 'strategyStore.json');
        this.store = this._load();
    }

    _load() {
        try {
            if (fs.existsSync(this.storePath)) {
                return JSON.parse(fs.readFileSync(this.storePath, 'utf-8'));
            }
        } catch (e) { /* ignore */ }
        return { patterns: [], version: 1 };
    }

    save() {
        fs.writeFileSync(this.storePath, JSON.stringify(this.store, null, 2), 'utf-8');
    }

    findStrategy(url) {
        try {
            const u = new URL(url);
            const domain = u.hostname.replace('www.', '');
            return this.store.patterns.find(p => p.domain === domain);
        } catch { return null; }
    }

    saveStrategy(url, strategy, itemCount) {
        try {
            const u = new URL(url);
            const domain = u.hostname.replace('www.', '');

            // Mevcut varsa güncelle
            const existing = this.store.patterns.findIndex(p => p.domain === domain);
            const entry = {
                domain,
                urlPattern: u.pathname,
                strategy,
                lastItemCount: itemCount,
                lastUsed: new Date().toISOString(),
                successRate: itemCount > 0 ? 1.0 : 0.0
            };

            if (existing >= 0) {
                this.store.patterns[existing] = { ...this.store.patterns[existing], ...entry };
            } else {
                this.store.patterns.push(entry);
            }
            this.save();
        } catch (e) {
            console.error('[StrategyStore] Kaydetme hatası:', e.message);
        }
    }
};

// ═══════════════════════════════════════════════════════════════
// ═══ PIPELINE RULES ENGINE — Otomatik kural motoru ═══
// ═══════════════════════════════════════════════════════════════
class PipelineRulesEngine {
    constructor(rulesPath) {
        this.rulesPath = rulesPath || path.join(__dirname, 'pipelineRules.json');
        this.store = this._load();
        this.appliedRules = []; // Bu çalışmada uygulanan kurallar
    }

    _load() {
        try {
            if (fs.existsSync(this.rulesPath)) {
                return JSON.parse(fs.readFileSync(this.rulesPath, 'utf-8'));
            }
        } catch (e) { /* ignore */ }
        return { version: 1, rules: [], metadata: { totalRulesGenerated: 0, totalRulesApplied: 0 } };
    }

    save() {
        fs.writeFileSync(this.rulesPath, JSON.stringify(this.store, null, 2), 'utf-8');
    }

    /**
     * Mevcut duruma uygulanabilir kuralları bul
     * @param {Object} context — sayfa analizi, URL bilgisi vb.
     * @returns {Array} Uygulanabilir kurallar listesi
     */
    findApplicableRules(context) {
        const applicable = [];
        for (const rule of this.store.rules) {
            if (!rule.active) continue;
            try {
                if (this._evaluateCondition(rule.condition, context)) {
                    applicable.push(rule);
                }
            } catch (e) {
                // Kural değerlendirmesi başarısız olsa da devam et
            }
        }
        return applicable;
    }

    /**
     * Kural koşulunu değerlendir
     */
    _evaluateCondition(condition, context) {
        // Koşul tipleri:
        // { type: 'priceCount', operator: '<', value: 3 }
        // { type: 'subPageCount', operator: '>', value: 0 }
        // { type: 'textLength', operator: '<', value: 500 }
        // { type: 'and', conditions: [...] }
        // { type: 'or', conditions: [...] }

        if (condition.type === 'and') {
            return condition.conditions.every(c => this._evaluateCondition(c, context));
        }
        if (condition.type === 'or') {
            return condition.conditions.some(c => this._evaluateCondition(c, context));
        }

        // url_contains — domain eşleşmesi
        if (condition.type === 'url_contains') {
            const url = context.url || '';
            return url.toLowerCase().includes(String(condition.value).toLowerCase());
        }

        const contextValue = this._getContextValue(condition.type, context);
        if (contextValue === undefined) return false;

        switch (condition.operator) {
            case '<': return contextValue < condition.value;
            case '>': return contextValue > condition.value;
            case '<=': return contextValue <= condition.value;
            case '>=': return contextValue >= condition.value;
            case '===': return contextValue === condition.value;
            case '!==': return contextValue !== condition.value;
            case 'includes': return String(contextValue).toLowerCase().includes(String(condition.value).toLowerCase());
            default: return false;
        }
    }

    _getContextValue(type, context) {
        const map = {
            'priceCount': context.priceCount ?? context.pageAnalysis?.priceCount,
            'subPageCount': context.subPageCount ?? context.pageAnalysis?.subPageCount,
            'menuLinkCount': context.menuLinkCount ?? context.pageAnalysis?.menuLinks,
            'textLength': context.textLength ?? context.pageAnalysis?.bodyTextLength,
            'productElementCount': context.productElementCount ?? context.pageAnalysis?.productElements,
            'hasTabs': context.hasTabs ?? context.pageAnalysis?.hasTabs,
            'itemCount': context.itemCount ?? context.totalItemsExtracted,
            'url': context.url,
            'domain': context.domain
        };
        return map[type];
    }

    /**
     * Yeni kural ekle
     */
    addRule(rule) {
        // Duplicate check
        const isDuplicate = this.store.rules.some(r =>
            r.name === rule.name ||
            (r.action === rule.action && JSON.stringify(r.condition) === JSON.stringify(rule.condition))
        );
        if (isDuplicate) return false;

        this.store.rules.push({
            ...rule,
            id: `rule_${Date.now()}`,
            active: true,
            createdAt: new Date().toISOString(),
            appliedCount: 0,
            successCount: 0
        });
        this.store.metadata.totalRulesGenerated++;
        this.save();
        return true;
    }

    /**
     * Kural uygulama sayacını güncelle
     */
    markApplied(ruleId, success = true) {
        const rule = this.store.rules.find(r => r.id === ruleId);
        if (rule) {
            rule.appliedCount = (rule.appliedCount || 0) + 1;
            if (success) rule.successCount = (rule.successCount || 0) + 1;
            this.store.metadata.totalRulesApplied++;
            this.save();
        }
    }

    /**
     * Tüm kuralların özetini döndür
     */
    getSummary() {
        return {
            totalRules: this.store.rules.length,
            activeRules: this.store.rules.filter(r => r.active).length,
            totalApplied: this.store.metadata.totalRulesApplied,
            rules: this.store.rules.map(r => ({
                name: r.name,
                action: r.action,
                appliedCount: r.appliedCount || 0,
                active: r.active
            }))
        };
    }
}

// ═══════════════════════════════════════════════════════════════
// ═══ GEMINI ORCHESTRATOR AGENT ═══
// ═══════════════════════════════════════════════════════════════
class GeminiOrchestrator {
    constructor(options = {}) {
        this.apiKey = options.apiKey || process.env.GEMINI_API_KEY;
        if (!this.apiKey) throw new Error('GEMINI_API_KEY gerekli!');

        this.genAI = new GoogleGenerativeAI(this.apiKey);

        // BEYİN: Gemini 3 Pro — strateji + karar
        this.brain = this.genAI.getGenerativeModel({
            model: 'gemini-3-pro-preview',
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 8192
            }
        });

        // İŞÇİ: Gemini 3 Flash — bulk extraction
        this.worker = this.genAI.getGenerativeModel({
            model: 'gemini-3-flash-preview',
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 8192
            }
        });

        this.strategyStore = new StrategyStore(options.strategyPath);
        this.rulesEngine = new PipelineRulesEngine(options.rulesPath);
        this.smartScroll = new SmartScroll({ verbose: false, maxScrolls: 50, scrollDelay: 600 });
        this.screenshotDir = options.screenshotDir || path.join(__dirname, 'screenshots');
        this.maxIterations = options.maxIterations || 30;
        this.verbose = options.verbose !== false;
        this.dryRun = options.dryRun || false;

        // Runtime state
        this.browser = null;
        this.page = null;
        this.currentUrl = null;
        this.logs = [];
        this.brainInterventions = []; // Brain'in müdahale ettiği anlar (kural üretmek için)

        if (!fs.existsSync(this.screenshotDir)) {
            fs.mkdirSync(this.screenshotDir, { recursive: true });
        }
    }

    log(...args) {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        this.logs.push(msg);
        if (this.verbose) console.log(...args);
    }

    // ─── Retry with backoff ───
    async retry(fn, retries = 3) {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                const isRetryable = error.message?.includes('429') ||
                    error.message?.includes('Resource exhausted');
                if (!isRetryable || attempt === retries) throw error;
                const delay = Math.pow(2, attempt) * 15000;
                this.log(`   ⏳ Rate limit, ${delay / 1000}s bekleniyor... (${attempt + 1}/${retries})`);
                await this.sleep(delay);
            }
        }
    }

    sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    // ═══════════════════════════════════════════════════════════════
    // ═══ TOOLS — Brain'in çağırabileceği araçlar ═══
    // ═══════════════════════════════════════════════════════════════

    /**
     * Tool: Sayfaya git
     */
    async tool_navigateTo(url) {
        this.log(`   🌐 Navigating: ${url}`);
        try {
            await this.page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        } catch {
            await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        }
        await this.sleep(2000);
        this.currentUrl = url;

        // Popup/cookie temizle
        await this._closePopups();

        const info = await this.page.evaluate(() => ({
            title: document.title,
            textLength: document.body?.innerText?.length || 0,
            linkCount: document.querySelectorAll('a[href]').length,
            imageCount: document.querySelectorAll('img').length,
            url: window.location.href
        }));

        return { success: true, ...info };
    }

    /**
     * Tool: Sayfa yapısını analiz et
     */
    async tool_analyzePageStructure() {
        this.log('   🔍 Sayfa yapısı analiz ediliyor...');

        const structure = await this.page.evaluate(() => {
            const body = document.body;

            // Linkleri analiz et
            const links = Array.from(document.querySelectorAll('a[href]')).map(a => {
                const href = typeof a.href === 'string' ? a.href : (a.href?.baseVal || a.getAttribute('href') || '');
                return {
                    text: (a.textContent || '').trim().substring(0, 60),
                    href: href,
                    isInternal: typeof href === 'string' && href.includes(window.location.hostname)
                };
            }).filter(l => l.text && l.isInternal);

            // Buttonları analiz et
            const buttons = Array.from(document.querySelectorAll('button, [role="button"], .btn, [class*="tab"]')).map(b => {
                const cn = typeof b.className === 'string' ? b.className : (b.className?.baseVal || '');
                return {
                    text: (b.textContent || '').trim().substring(0, 40),
                    tag: b.tagName,
                    classes: cn.substring(0, 60)
                };
            }).filter(b => b.text);

            // Menü ipuçları
            const menuKeywords = ['menu', 'menü', 'yemek', 'food', 'kahvaltı', 'pizza', 'burger', 'içecek', 'drink', 'tost', 'salata', 'tatlı', 'çorba'];
            const menuLinks = links.filter(l =>
                menuKeywords.some(kw => l.text.toLowerCase().includes(kw) || l.href.toLowerCase().includes(kw))
            );

            // Fiyat ipuçları
            const bodyText = body.innerText || '';
            const priceMatches = bodyText.match(/\d+(?:[.,]\d{1,2})?\s*[₺]|\d+(?:[.,]\d{1,2})?\s*TL|(?:^|\n|\s)\d{2,3}(?:[.,]\d{2})?(?:\s*$|\s*\n)/gim) || [];
            const productLikeElements = document.querySelectorAll('[class*="product"], [class*="item"], [class*="card"], [class*="menu-item"], .titlecard, .prod_price');

            return {
                title: document.title,
                bodyTextLength: bodyText.length,
                totalLinks: links.length,
                menuLinks: menuLinks.slice(0, 30),
                buttons: buttons.slice(0, 20),
                priceCount: priceMatches.length,
                productElementCount: productLikeElements.length,
                hasTabsOrAccordions: buttons.some(b =>
                    b.classes.includes('tab') || b.classes.includes('accordion') || b.classes.includes('category')
                ),
                hasPricesInDOM: priceMatches.length > 0,
                samplePrices: priceMatches.slice(0, 5)
            };
        });

        return structure;
    }

    /**
     * Tool: DOM text çıkar — selector-based fallback ile
     */
    async tool_extractDOMText() {
        this.log('   📝 DOM text çıkarılıyor...');

        const textData = await this.page.evaluate(() => {
            // Skip elements
            const skip = ['footer', 'nav', 'header', 'script', 'style', 'noscript',
                '.cookie-banner', '.cookie-consent', '[class*="footer"]',
                '[class*="navbar"]', '[class*="copyright"]', '[class*="newsletter"]',
                '[id*="footer"]', '[id*="header"]', '[id*="cookie"]'];

            const clone = document.body.cloneNode(true);
            skip.forEach(sel => {
                try { clone.querySelectorAll(sel).forEach(el => el.remove()); } catch { }
            });

            const text = clone.innerText || clone.textContent || '';
            const lines = text.split('\n').filter(l => l.trim().length > 0);

            // ═══ SELECTOR-BASED FALLBACK ═══
            // innerText az döndüyse, hedefli selector'larla ürün isimlerini topla
            let selectorText = '';
            if (text.length < 500) {
                const productSelectors = [
                    '.woocommerce-loop-product__title',
                    '.product-title', '.product h2', '.product h3',
                    '.lte-product-title', '.product_title',
                    '.menu-item-title', '.menu-item h3', '.menu-item h4',
                    '.card-title', '.item-title', '.entry-title',
                    '[class*="product"] h2', '[class*="product"] h3',
                    '[class*="menu-item"] .title', '[class*="item-name"]',
                    '.wc-block-grid__product-title',
                    'li.product .woocommerce-loop-product__title'
                ];

                const foundItems = [];
                for (const sel of productSelectors) {
                    try {
                        const els = document.querySelectorAll(sel);
                        els.forEach(el => {
                            const name = el.textContent.trim();
                            if (name && name.length > 1 && name.length < 100) {
                                foundItems.push(name);
                            }
                        });
                    } catch { }
                }

                // Fiyat selector'ları
                const priceSelectors = ['.price', '.amount', '.woocommerce-Price-amount',
                    '[class*="price"]', '[class*="fiyat"]'];
                const foundPrices = [];
                for (const sel of priceSelectors) {
                    try {
                        document.querySelectorAll(sel).forEach(el => {
                            const p = el.textContent.trim();
                            if (p) foundPrices.push(p);
                        });
                    } catch { }
                }

                if (foundItems.length > 0) {
                    // Ürün isimlerinden yapay text oluştur — Gemini'nin parse edebileceği format
                    selectorText = '=== ÜRÜN LİSTESİ ===\n' +
                        foundItems.map((name, i) => {
                            const price = foundPrices[i] || '';
                            return `- ${name}${price ? ' — ' + price : ''}`;
                        }).join('\n');
                }
            }

            // Pagination bilgisi
            const paginationLinks = [];
            try {
                const pageLinks = document.querySelectorAll('a.page-numbers, a.next, a[href*="paged="], .pagination a, .nav-links a, a.wp-block-query-pagination-next');
                pageLinks.forEach(a => {
                    const href = a.href;
                    if (href && !a.classList.contains('current') && !a.classList.contains('prev')) {
                        paginationLinks.push(href);
                    }
                });
            } catch { }

            const finalText = selectorText || text;

            return {
                fullText: finalText,
                lineCount: finalText.split('\n').filter(l => l.trim().length > 0).length,
                charCount: finalText.length,
                sampleLines: finalText.split('\n').filter(l => l.trim().length > 0).slice(0, 10).map(l => l.trim().substring(0, 100)),
                selectorFallback: selectorText.length > 0,
                selectorItemCount: selectorText ? selectorText.split('\n').length - 1 : 0,
                paginationLinks: [...new Set(paginationLinks)]
            };
        });

        if (textData.selectorFallback) {
            this.log(`   🎯 Selector fallback: ${textData.selectorItemCount} ürün ismi DOM'dan çıkarıldı`);
        }
        if (textData.paginationLinks.length > 0) {
            this.log(`   📄 ${textData.paginationLinks.length} pagination linki bulundu`);
        }
        this.log(`   📊 ${textData.charCount} karakter, ${textData.lineCount} satır`);
        return textData;
    }

    /**
     * Tool: Alt sayfa keşfi
     */
    async tool_discoverSubPages() {
        this.log('   🔍 Alt sayfa keşfi...');

        const baseUrl = this.currentUrl;
        const subPages = await this.page.evaluate((base) => {
            const links = Array.from(document.querySelectorAll('a[href]'));
            const menuKeywords = [
                'menu', 'yemek', 'food', 'drink', 'icecek', 'içecek', 'yiyecek',
                'tatli', 'dessert', 'beverage', 'appetizer', 'cocktail', 'wine',
                'breakfast', 'lunch', 'dinner', 'brunch', 'kahvalti', 'pizza',
                'burger', 'salad', 'soup', 'corba', 'salata', 'tost', 'noodle',
                'waffle', 'makarna', 'nargile', 'dondurma', 'pasta', 'bowl',
                'sicak', 'soguk', 'soğuk', 'sıcak', 'lezzet', 'kahve', 'coffee',
                'tea', 'cay', 'çay', 'snack', 'atistirmalik', 'aperatif',
                'balik', 'et', 'tavuk', 'chicken', 'smoothie', 'milkshake',
                'frappe', 'espresso', 'latte', 'wrap', 'sandvic', 'sandwich',
                'ara-sicak', 'meze', 'sos', 'garnitur', 'yoresel', 'geleneksel'
            ];

            const baseNorm = base.replace(/\/$/, '');
            const found = [];
            const seen = new Set();

            for (const link of links) {
                const href = link.href;
                if (!href || href === base || href === baseNorm || href === baseNorm + '/') continue;
                if (seen.has(href)) continue;

                try {
                    const linkUrl = new URL(href);
                    const baseUrlObj = new URL(base);
                    if (linkUrl.hostname !== baseUrlObj.hostname) continue;
                } catch { continue; }

                const hrefLower = href.toLowerCase();
                const textLower = (link.textContent || '').toLowerCase().trim();

                const hrefMatch = menuKeywords.some(kw => hrefLower.includes(kw));
                const textMatch = menuKeywords.some(kw => textLower.includes(kw));

                if (hrefMatch || textMatch) {
                    // Aynı hostname yeterli — startsWith filtresi çok agresifti
                    // (/tunali-hilmi-menu/ /menu/ ile başlamıyor ama aynı site)
                    seen.add(href);
                    // Dedup text: some sites repeat text inside links (e.g., <a><span>Foo</span>Foo</a>)
                    let linkText = link.textContent.trim().substring(0, 120);
                    const tLen = linkText.length;
                    if (tLen >= 4 && tLen % 2 === 0) {
                        const half = linkText.substring(0, tLen / 2);
                        if (half === linkText.substring(tLen / 2)) {
                            linkText = half;
                        }
                    }
                    found.push({
                        url: href,
                        text: linkText.substring(0, 60)
                    });
                }
            }
            return found;
        }, baseUrl);

        // Filter duplicates
        const cleanPages = [];
        const seenPaths = new Set();
        for (const sp of subPages) {
            try {
                const u = new URL(sp.url);
                const pathKey = u.pathname.replace(/\/$/, '').toLowerCase();
                if (seenPaths.has(pathKey)) continue;
                if (pathKey.endsWith('/index.php') || pathKey.endsWith('/index.html')) continue;
                if (u.search && /[?&]lang=/i.test(u.search)) continue;
                const basePath = new URL(baseUrl).pathname.replace(/\/$/, '').toLowerCase();
                if (pathKey === basePath) continue;
                seenPaths.add(pathKey);
                cleanPages.push(sp);
            } catch { continue; }
        }

        this.log(`   📂 ${cleanPages.length} alt sayfa (${subPages.length - cleanPages.length} duplikat filtrelendi)`);
        return { subPages: cleanPages, totalFound: subPages.length, filtered: subPages.length - cleanPages.length };
    }

    /**
     * Tool: Screenshot al
     */
    async tool_takeScreenshots(prefix = 'page') {
        this.log('   📸 Screenshot alınıyor...');
        const screenshots = await this.smartScroll.scrollAndCapture(this.page, this.screenshotDir, prefix);
        this.log(`   📸 ${screenshots.length} screenshot kaydedildi`);
        return { screenshots, count: screenshots.length };
    }

    /**
     * Tool: Text'ten ürün çıkar (Worker — Flash)
     * Büyük metinleri chunk'lara böler ve her birini ayrı işler.
     */
    async tool_extractProductsFromText(text, categoryHint = 'Menü') {
        const CHUNK_SIZE = 10000; // Her chunk max 10K char
        const totalChars = text.length;

        // Küçük text → tek parça
        if (totalChars <= CHUNK_SIZE) {
            this.log(`   🤖 Text extraction (${totalChars} char, kategori: ${categoryHint})`);
            return await this._extractSingleChunk(text, categoryHint);
        }

        // Büyük text → chunk'lara böl (satır sınırlarında)
        const lines = text.split('\n');
        const chunks = [];
        let currentChunk = '';

        for (const line of lines) {
            if ((currentChunk.length + line.length + 1) > CHUNK_SIZE && currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = line;
            } else {
                currentChunk += (currentChunk ? '\n' : '') + line;
            }
        }
        if (currentChunk.trim()) chunks.push(currentChunk);

        this.log(`   🤖 Text extraction: ${totalChars} char → ${chunks.length} chunk (kategori: ${categoryHint})`);

        // Her chunk'ı paralel olarak işle (max 3 concurrent)
        const allItems = [];
        const batchSize = 3;
        for (let i = 0; i < chunks.length; i += batchSize) {
            const batch = chunks.slice(i, i + batchSize);
            const batchPromises = batch.map((chunk, idx) =>
                this._extractSingleChunk(chunk, categoryHint, i + idx + 1, chunks.length)
            );
            const results = await Promise.allSettled(batchPromises);
            for (const r of results) {
                if (r.status === 'fulfilled' && r.value.items.length > 0) {
                    allItems.push(...r.value.items);
                }
            }
            this.log(`   ✅ Batch ${Math.floor(i / batchSize) + 1}: ${allItems.length} ürün (toplam)`);
        }

        // Deduplication
        const seen = new Set();
        const uniqueItems = allItems.filter(item => {
            const key = `${item.name?.toLowerCase().trim()}_${item.price || 0}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        this.log(`   📊 Toplam: ${uniqueItems.length} ürün (${allItems.length - uniqueItems.length} duplike filtrelendi)`);
        return { items: uniqueItems, chunks: chunks.length };
    }

    /**
     * Tek bir text chunk'ından ürün çıkar
     */
    async _extractSingleChunk(text, categoryHint, chunkNum = 0, totalChunks = 0) {
        const chunkInfo = totalChunks > 0 ? ` [Chunk ${chunkNum}/${totalChunks}]` : '';

        const prompt = `Sen bir restoran menüsü analiz uzmanısın. Türkiye'deki restoranların menülerini parse ediyorsun.

METIN${chunkInfo}:
"""
${text}
"""

GÖREV: Yukarıdaki metindeki TÜM yiyecek ve içecek ürünlerini çıkar.
Kategori ipucu: "${categoryHint}"

KURALLAR:
- Sadece GERÇEK ürünler (navigasyon linkleri, kategori başlıkları DEĞİL)
- Fiyatı olan veya menü ürünü olduğu açık olan her şeyi dahil et
- Eğer metinde kategori başlıkları varsa (ör: "KAHVALTILAR", "İÇECEKLER"), her ürüne doğru kategori adını ata
- Türkçe karakter düzelt (Ã¼ → ü, Ã§ → ç, vb.)
- price sadece SAYI olsun (250.00 → 250)
- Hiç ürün yoksa boş array döndür: []

JSON FORMATI (sadece array, başka hiçbir şey yazma):
[{"name": "Ürün Adı", "price": 0, "category": "Uygun Kategori", "description": "varsa açıklama"}]`;

        try {
            const result = await this.retry(async () => {
                const res = await this.worker.generateContent(prompt);
                return res.response.text();
            });

            const items = this._parseJSON(result);
            return { items, raw: result.substring(0, 200) };
        } catch (e) {
            this.log(`   ❌ Chunk extraction hatası: ${e.message}`);
            return { items: [], error: e.message };
        }
    }

    /**
     * Tool: Screenshot'tan ürün çıkar (Worker — Flash)
     */
    async tool_extractProductsFromImages(screenshotPaths, categoryHint = 'Menü') {
        this.log(`   🤖 Screenshot extraction (${screenshotPaths.length} görsel)`);

        let allItems = [];
        for (let i = 0; i < screenshotPaths.length; i += 2) {
            const batch = screenshotPaths.slice(i, i + 2);
            const imageParts = batch.map(imgPath => ({
                inlineData: {
                    mimeType: 'image/png',
                    data: fs.readFileSync(imgPath).toString('base64')
                }
            }));

            const prompt = `Bu restoran menüsünün ekran görüntüsü.

TÜM ürünleri çıkar. JSON formatı:
[{"name": "Ürün Adı", "price": 0, "category": "Kategori", "description": ""}]

ÖNEMLİ: Görselde bölüm/kategori başlığı görünüyorsa (örn: SICAK İÇECEKLER, KAHVALTI, TOSTLAR) o başlığı category alanına yaz. Başlık yoksa "${categoryHint}" kullan.

Kurallar:
- Sadece GERÇEK ürünler (başlıklar, logolar DEĞİL)
- Fiyat sadece sayı
- Türkçe karakterler düzgün
- Ürün yoksa: []`;

            try {
                const result = await this.retry(async () => {
                    const res = await this.worker.generateContent([prompt, ...imageParts]);
                    return res.response.text();
                });

                const items = this._parseJSON(result);
                allItems.push(...items);
                this.log(`   ✅ Batch ${Math.floor(i / 2) + 1}: ${items.length} ürün`);
            } catch (e) {
                this.log(`   ⚠️ Batch ${Math.floor(i / 2) + 1} hatası: ${e.message}`);
            }
            await this.sleep(1000);
        }

        // Dedup
        const seen = new Set();
        allItems = allItems.filter(item => {
            const key = `${item.name?.toLowerCase()}_${item.price}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        return { items: allItems };
    }

    /**
     * Tool: Element tıkla
     */
    async tool_clickElement(selectorOrText) {
        this.log(`   🖱️ Tıklama: ${selectorOrText}`);
        try {
            // Önce selector dene
            const el = await this.page.$(selectorOrText);
            if (el) {
                await el.click();
                await this.sleep(1500);
                return { success: true, method: 'selector' };
            }
        } catch { }

        // Text ile dene
        try {
            await this.page.click(`text="${selectorOrText}"`, { timeout: 5000 });
            await this.sleep(1500);
            return { success: true, method: 'text' };
        } catch {
            return { success: false, error: 'Element bulunamadı' };
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // ═══ BRAIN PRE-SCAN — Agentic Exploration ═══════════════════
    // ═══════════════════════════════════════════════════════════════

    /**
     * Agentic Pre-Scan: Brain sayfayı aktif keşfeder — tıkla, scroll et, bak.
     * İnsan gibi: "Önce sayfayı gez, butonlara tıkla, ne var ne yok anla."
     * Max 5 iterasyon, 15s timeout — hızlı keşif, derin dalış değil.
     */
    async _brainPreScan(structure, pageTitle, originalUrl = '') {
        this.log('\n🔭 BRAIN AGENTIC PRE-SCAN — Sayfayı aktif keşfediyor...');
        const MAX_ITERATIONS = 5;
        const startTime = Date.now();
        const TIMEOUT_MS = 45000;
        const explorationHistory = [];

        try {
            for (let i = 0; i < MAX_ITERATIONS; i++) {
                // Timeout kontrolü
                if (Date.now() - startTime > TIMEOUT_MS) {
                    this.log(`   ⏱️ Pre-scan timeout (${((Date.now() - startTime) / 1000).toFixed(1)}s) — mevcut bilgiyle devam`);
                    break;
                }

                // 1. Mevcut görünümün screenshot'ını al
                const screenshot = await this.page.screenshot({ fullPage: false });
                const screenshotB64 = screenshot.toString('base64');

                // 2. Brain'e gönder
                const scrollHeight = await this.page.evaluate(() => document.body.scrollHeight);
                const scrollY = await this.page.evaluate(() => window.scrollY);

                const stepsLeft = MAX_ITERATIONS - i;
                const prompt = `Sen MenüAi Brain'isin. Extraction BAŞLAMADAN ÖNCE sayfayı KEŞFEDİYORSUN.
Amacın: sayfada kaç ürün var, hangi kategoriler var → beklenti oluştur.
Extraction YAPMA, sadece BAK ve ANLA.

SAYFA BİLGİSİ:
- Başlık: "${pageTitle}"
- Ürün elementleri: ${structure.productElementCount}
- Fiyat sayısı: ${structure.priceCount}
- Text uzunluğu: ${structure.bodyTextLength} karakter
- Sayfa yüksekliği: ${scrollHeight}px, şu an: ${scrollY}px
- Tab/Accordion: ${structure.hasTabsOrAccordions}
- Menü linkleri: ${structure.menuLinks?.map(l => l.text).join(', ') || 'yok'}

KEŞİF GEÇMİŞİ (${explorationHistory.length} adım):
${explorationHistory.length > 0 ? explorationHistory.map((h, idx) => `${idx + 1}. ${h.action} → ${h.result}`).join('\n') : 'Henüz hiçbir keşif yapılmadı.'}

AKSİYONLAR (${stepsLeft} adım kaldı):
1. CLICK — Bir elemente tıkla (menü butonu, kategori tab'ı).
   {"action":"CLICK","selector":"text=Menüyü Gör"}
2. SCROLL_TO — Scroll et: {"action":"SCROLL_TO","target":"bottom|middle|top"}
3. DONE — Beklentiyi oluştur ve BİTİR.

${stepsLeft <= 2 ? '🚨 SON ' + stepsLeft + ' ADIM KALDI — DONE cevabı ver!' : ''}

⚠️ KRİTİK KURALLAR:
- ${explorationHistory.length >= 2 ? 'Zaten ' + explorationHistory.length + ' adım keşfettin — DONE ver!' : ''}
- Sayfa zaten açık ve ürünler görünüyorsa → HEMEN DONE de, gereksiz scroll yapma!
- Sadece gizli içerik varsa (buton, tab, modal) tıkla. Aksi halde DONE.
- CLICK: sipariş/sepet/login butonlarına ASLA tıklama!
- DONE, mutlaka expectations içermeli.

DONE CEVABI:
{
  "action": "DONE",
  "expectations": {
    "expectedItemRange": { "min": 50, "max": 200 },
    "expectedCategoryCount": { "min": 5, "max": 15 },
    "likelyCategories": ["Kahvaltı", "Ana Yemek", "İçecek"],
    "pageComplexity": "simple|medium|complex",
    "hiddenContent": false,
    "notes": "Kısa özet"
  }
}

CEVAP (sadece JSON):`;

                const result = await this.retry(async () => {
                    const res = await this.brain.generateContent([
                        prompt,
                        { inlineData: { mimeType: 'image/png', data: screenshotB64 } }
                    ]);
                    return res.response.text();
                });

                const decision = this._parseJSON(result, true);
                if (!decision) {
                    this.log(`   ⚠️ Pre-scan iterasyon ${i + 1}: parse hatası, devam`);
                    break;
                }

                // 3. Aksiyonu uygula
                if (decision.action === 'DONE') {
                    const exp = decision.expectations;
                    if (exp) {
                        this.brainPreScanResult = exp;
                        this.log(`   ✅ Keşif tamamlandı (${i + 1} adım, ${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
                        this.log(`   📊 Beklenti: ${exp.expectedItemRange?.min}-${exp.expectedItemRange?.max} ürün, ${exp.expectedCategoryCount?.min}-${exp.expectedCategoryCount?.max} kategori`);
                        this.log(`   📋 Kategoriler: ${exp.likelyCategories?.join(', ') || 'belirtilmedi'}`);
                        this.log(`   🏷️ Karmaşıklık: ${exp.pageComplexity || '?'}, Gizli içerik: ${exp.hiddenContent ? 'EVET' : 'hayır'}`);
                        if (exp.notes) this.log(`   💭 Brain: "${exp.notes}"`);
                        // Scroll'u başa al
                        await this.page.evaluate(() => window.scrollTo(0, 0));
                        return exp;
                    }
                    break;
                }

                if (decision.action === 'CLICK' && decision.selector) {
                    this.log(`   🖱️ [${i + 1}/${MAX_ITERATIONS}] Tıklama: ${decision.selector}`);
                    try {
                        await this.page.click(decision.selector, { timeout: 3000 });
                        await this.sleep(1000);
                        explorationHistory.push({ action: `CLICK "${decision.selector}"`, result: 'başarılı' });
                    } catch (e) {
                        explorationHistory.push({ action: `CLICK "${decision.selector}"`, result: `hata: ${e.message.substring(0, 60)}` });
                        this.log(`   ⚠️ Tıklama başarısız: ${e.message.substring(0, 60)}`);
                    }
                    continue;
                }

                if (decision.action === 'SCROLL_TO') {
                    const target = decision.target || 'bottom';
                    this.log(`   📜 [${i + 1}/${MAX_ITERATIONS}] Scroll: ${target}`);
                    try {
                        if (target === 'bottom') {
                            await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                        } else if (target === 'middle') {
                            await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
                        } else if (target === 'top') {
                            await this.page.evaluate(() => window.scrollTo(0, 0));
                        } else {
                            // Text-based scroll — elementi bul ve scroll et
                            await this.page.evaluate((text) => {
                                const el = [...document.querySelectorAll('*')].find(e => e.textContent?.trim().includes(text));
                                if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
                            }, target);
                        }
                        await this.sleep(500);
                        explorationHistory.push({ action: `SCROLL_TO "${target}"`, result: 'başarılı' });
                    } catch (e) {
                        explorationHistory.push({ action: `SCROLL_TO "${target}"`, result: `hata: ${e.message.substring(0, 60)}` });
                    }
                    continue;
                }

                // Bilinmeyen aksiyon veya SCREENSHOT
                this.log(`   📸 [${i + 1}/${MAX_ITERATIONS}] Screenshot alındı`);
                explorationHistory.push({ action: 'SCREENSHOT', result: 'alındı' });
            }

            // Loop bitti ama DONE gelmedi — screenshot'lardan beklenti oluştur
            if (!this.brainPreScanResult) {
                this.log(`   ⚠️ Pre-scan ${MAX_ITERATIONS} adımda DONE demedi — screenshot'tan beklenti üretiliyor...`);
                try {
                    // Mevcut ekran görüntüsünden Brain'e beklenti soralım
                    const ssForExpect = await this.page.screenshot({ fullPage: false });
                    const ssB64 = ssForExpect.toString('base64');
                    const expectResult = await this.retry(async () => {
                        const res = await this.brain.generateContent([
                            { inlineData: { mimeType: 'image/png', data: ssB64 } },
                            {
                                text: `Bu bir restoran menü sayfasının screenshot'u.
Sayfadaki bilgilere bakarak şu soruları cevapla (sadece JSON):
{
  "expectedItemRange": { "min": 20, "max": 100 },
  "expectedCategoryCount": { "min": 3, "max": 15 },
  "likelyCategories": ["Kahveler", "Tatlılar", "Ana Yemekler"],
  "pageComplexity": "simple|medium|complex",
  "hiddenContent": false,
  "notes": "Kısa açıklama"
}` }
                        ]);
                        return JSON.parse(res.response.text().replace(/```json\n?|\n?```/g, '').trim());
                    }, 2);
                    this.brainPreScanResult = expectResult;
                    this.log(`   ✅ Screenshot'tan beklenti: ${expectResult.expectedItemRange?.min}-${expectResult.expectedItemRange?.max} ürün, ${expectResult.likelyCategories?.join(', ') || 'belirsiz'}`);
                } catch (e) {
                    this.log(`   ⚠️ Screenshot beklenti de başarısız — temel fallback kullanılıyor`);
                    this.brainPreScanResult = {
                        expectedItemRange: { min: Math.max(5, structure.priceCount), max: Math.max(structure.productElementCount, 50) },
                        expectedCategoryCount: { min: 3, max: 20 },
                        likelyCategories: [],
                        pageComplexity: structure.productElementCount > 100 ? 'complex' : 'medium',
                        hiddenContent: structure.hasTabsOrAccordions,
                        notes: `Fallback — ${explorationHistory.length} adım keşif + screenshot beklenti başarısız`
                    };
                }
            }

        } catch (e) {
            this.log(`   ⚠️ Pre-scan hatası (extraction devam eder): ${e.message}`);
            this.brainPreScanResult = null;
        }

        // Scroll'u başa al + URL değiştiyse orijinal sayfaya geri dön
        try {
            const currentUrl = this.page.url();
            if (originalUrl && currentUrl !== originalUrl) {
                const origPath = new URL(originalUrl).pathname;
                const curPath = new URL(currentUrl).pathname;
                if (origPath !== curPath) {
                    this.log(`   ↩️  Pre-Scan URL değiştirdi (${curPath}) — orijinale dönülüyor (${origPath})`);
                    await this.page.goto(originalUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                }
            }
            await this.page.evaluate(() => window.scrollTo(0, 0));
        } catch { }
        return this.brainPreScanResult;
    }

    // ═══════════════════════════════════════════════════════════════
    // ═══ BRAIN — Gemini 3 Pro ile karar mekanizması ═══
    // ═══════════════════════════════════════════════════════════════

    /**
     * Brain'e durumu göster, sonraki aksiyonu sor.
     * Gemini 3 Pro function calling kullanarak tool çağrısı yapacak.
     */
    async askBrain(context) {
        const systemPrompt = `Sen MenüAi platformunun akıllı extraction orkestratörüsün.
Bir restoran menü URL'sinden TÜM ürünleri çıkarman gerekiyor.

MEVCUT DURUM:
${JSON.stringify(context, null, 2)}

GÖREVİN: Bir sonraki adımda ne yapılması gerektiğine karar ver.

KULLANILABILIR AKSIYONLAR:
1. NAVIGATE — Bir URL'ye git
2. ANALYZE — Sayfa yapısını analiz et
3. EXTRACT_TEXT — DOM text çıkar ve ürünleri parse et
4. EXTRACT_SCREENSHOTS — Screenshot al ve ürünleri parse et
5. DISCOVER_SUBPAGES — Alt sayfa linklerini bul
6. CLICK — Bir elemente tıkla (tab, buton vb.)
7. DONE — Yeterli ürün çıkarıldı, bitir

KURALLARIN:
- Her adımda sonucu KONTROL ET. 0 ürün = sorun var, alternatif dene.
- Ana sayfa sadece kategori gösteriyorsa ürün arama, alt sayfalara git.
- Duplicate sayfaları (index.php, ?lang=) ATLA.
- En az 3 farklı strateji dene (text → screenshot → alt sayfalar).
- Minimum hedef: 10 ürün. Bu hedefe ulaşmadan DONE deme.

CEVAP FORMATI (sadece JSON, başka hiçbir şey yazma):
{
  "thinking": "Bu adımda şunu gözlemliyorum... bu yüzden şu kararı veriyorum...",
  "action": "NAVIGATE|ANALYZE|EXTRACT_TEXT|EXTRACT_SCREENSHOTS|DISCOVER_SUBPAGES|CLICK|DONE",
  "params": { "url": "...", "categoryHint": "...", "selector": "..." },
  "reason": "Kısa açıklama"
}`;

        try {
            const result = await this.retry(async () => {
                const res = await this.brain.generateContent(systemPrompt);
                return res.response.text();
            });

            return this._parseJSON(result, true);
        } catch (e) {
            this.log(`   ❌ Brain hatası: ${e.message}`);
            return null;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // ═══ ANA EXTRACTION DÖNGÜSÜ ═══
    // ═══════════════════════════════════════════════════════════════

    async extract(targetUrl) {
        this.log('\n╔══════════════════════════════════════════════════════════════╗');
        this.log('║  🧠 GEMINI ORCHESTRATOR AGENT v2.0 — Self-Improving         ║');
        this.log('║  Akıllı Menü Extraction — Powered by Gemini 3 Pro          ║');
        this.log('╚══════════════════════════════════════════════════════════════╝');
        this.log(`\n🎯 Hedef: ${targetUrl}\n`);
        this.brainInterventions = [];

        // 1. Strateji hafızasını kontrol et
        const savedStrategy = this.strategyStore.findStrategy(targetUrl);
        if (savedStrategy) {
            this.log(`📚 Kayıtlı strateji bulundu: ${savedStrategy.domain}`);
            this.log(`   Son sonuç: ${savedStrategy.lastItemCount} ürün`);
            this.log(`   Yöntem: ${JSON.stringify(savedStrategy.strategy)}`);
        }

        // 1b. Pipeline kurallarını göster
        const rulesSummary = this.rulesEngine.getSummary();
        if (rulesSummary.totalRules > 0) {
            this.log(`📘 Pipeline kuralları: ${rulesSummary.activeRules} aktif kural`);
            rulesSummary.rules.forEach(r => this.log(`   📌 ${r.name} (${r.appliedCount}x uygulandı)`));
        }

        // 2. Tarayıcı başlat
        this.log('\n🚀 Tarayıcı başlatılıyor...');
        this.browser = await chromium.launch({ headless: true });
        const browserContext = await this.browser.newContext({
            viewport: { width: 1280, height: 800 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        });
        this.page = await browserContext.newPage();

        let allItems = [];
        let extractionLog = [];
        let iteration = 0;
        let subPages = null;
        let processedPages = new Set();

        try {
            // 3. İlk sayfaya git
            const navResult = await this.tool_navigateTo(targetUrl);
            this.log(`   ✅ Sayfa yüklendi: ${navResult.title} (${navResult.textLength} char)`);

            // 4. Sayfa yapısını analiz et (Brain self-healing on crash)
            let structure;
            try {
                structure = await this.tool_analyzePageStructure();
                this.pageAnalysis = structure;
                this.log(`\n📊 Sayfa Analizi:`);
                this.log(`   Fiyat sayısı: ${structure.priceCount}`);
                this.log(`   Menü linkleri: ${structure.menuLinks.length}`);
                this.log(`   Ürün elementleri: ${structure.productElementCount}`);
                this.log(`   Tab/Accordion: ${structure.hasTabsOrAccordions}`);
            } catch (analysisError) {
                this.log(`\n⚠️ Sayfa analizi crash etti: ${analysisError.message}`);
                this.log(`   🧠 Brain'e screenshot gönderiliyor — kendi gözleriyle bakacak...`);

                // Brain self-healing: screenshot al, hatayı Brain'e göster
                try {
                    const screenshot = await this.page.screenshot({ fullPage: false });
                    const screenshotB64 = screenshot.toString('base64');

                    const healingPrompt = `Sen MenüAi Brain'isin. Sayfa analizi CRASH etti:
Hata: ${analysisError.message}
URL: ${targetUrl}

Screenshot'a bakarak bu sayfayı analiz et:
1. Bu bir menü sayfası mı?
2. Ürünler görünüyor mu? Yaklaşık kaç tane?
3. Fiyatlar var mı?
4. Kategoriler var mı? Hangileri?
5. Alt sayfa linkleri var mı?

JSON CEVAP:
{
  "isMenuPage": true/false,
  "priceCount": 0,
  "productElementCount": 0,
  "menuLinks": [],
  "buttons": [],
  "hasTabsOrAccordions": false,
  "hasPricesInDOM": false,
  "samplePrices": [],
  "bodyTextLength": 0,
  "totalLinks": 0,
  "brainDiagnosis": "Crash sebebi ve sayfa hakkında kısa analiz"
}`;

                    const result = await this.retry(async () => {
                        const response = await this.model.generateContent([
                            { inlineData: { mimeType: 'image/png', data: screenshotB64 } },
                            { text: healingPrompt }
                        ]);
                        return JSON.parse(response.response.text().replace(/```json\n?|\n?```/g, '').trim());
                    }, 2);

                    structure = {
                        ...result,
                        menuLinks: result.menuLinks || [],
                        buttons: result.buttons || [],
                        _brainHealed: true
                    };
                    this.pageAnalysis = structure;
                    this.log(`   ✅ Brain sayfayı okudu: ${result.brainDiagnosis || 'Analiz tamamlandı'}`);
                    this.log(`   📊 Brain tahmini: ~${structure.productElementCount} ürün, ${structure.priceCount} fiyat`);
                } catch (healError) {
                    this.log(`   ❌ Brain healing de başarısız: ${healError.message}`);
                    // Minimum fallback structure
                    structure = {
                        priceCount: 0, productElementCount: 0, menuLinks: [],
                        buttons: [], hasTabsOrAccordions: false, hasPricesInDOM: false,
                        samplePrices: [], bodyTextLength: 0, totalLinks: 0,
                        _brainHealed: false, _crashed: true
                    };
                    this.pageAnalysis = structure;
                }
            }

            // 4.5. Brain Pre-Scan — extraction öncesi büyük resmi oku
            await this._brainPreScan(structure, navResult.title || targetUrl, targetUrl);

            // 5. Alt sayfa keşfi
            const subPageResult = await this.tool_discoverSubPages();
            subPages = subPageResult.subPages;

            // 6. Önce pipeline kurallarını kontrol et — Brain'e gerek var mı?
            const ruleContext = {
                url: targetUrl,
                priceCount: structure.priceCount,
                subPageCount: subPages.length,
                menuLinkCount: structure.menuLinks.length,
                textLength: structure.bodyTextLength,
                productElementCount: structure.productElementCount,
                hasTabs: structure.hasTabsOrAccordions,
                totalItemsExtracted: 0
            };

            const applicableRules = this.rulesEngine.findApplicableRules(ruleContext);
            let useSubPages = false;
            let brainNeeded = true;

            if (applicableRules.length > 0) {
                // ✅ Kurallar var — Brain'e gerek yok!
                this.log(`\n📘 ${applicableRules.length} pipeline kuralı uygulanıyor (Brain DEVRE DIŞI):`);
                for (const rule of applicableRules) {
                    this.log(`   ✅ Kural: "${rule.name}" → ${rule.action}`);
                    this.rulesEngine.markApplied(rule.id);

                    // Kural aksiyonlarını uygula
                    if (rule.action === 'USE_SUBPAGES') useSubPages = true;
                    if (rule.action === 'SKIP_MAIN_PAGE') useSubPages = true;
                    if (rule.action === 'USE_SCREENSHOT_FALLBACK') { /* handled in extraction */ }
                }
                brainNeeded = false;

                // ═══ KRİTİK GÜVENLİK: USE_SUBPAGES dedik ama alt sayfa yoksa single-page'e düş ═══
                if (useSubPages && subPages.length === 0) {
                    this.log(`   ⚠️ Kural USE_SUBPAGES dedi ama 0 alt sayfa bulundu — SINGLE-PAGE fallback!`);
                    this.log(`   💡 Screenshot extraction ile devam edilecek`);
                    useSubPages = false;
                    brainNeeded = false; // Brain'e tekrar sormaya gerek yok
                }
            }

            // Brain'e sadece kuralların kapsamadığı durumlarda danış
            let firstDecision = null;
            if (brainNeeded) {
                const initialContext = {
                    url: targetUrl,
                    savedStrategy: savedStrategy?.strategy || null,
                    existingRules: rulesSummary,
                    pageAnalysis: {
                        title: navResult.title,
                        priceCount: structure.priceCount,
                        menuLinks: structure.menuLinks.length,
                        productElements: structure.productElementCount,
                        hasTabs: structure.hasTabsOrAccordions,
                        subPageCount: subPages.length,
                        subPages: subPages.map(sp => ({ text: sp.text, url: sp.url })).slice(0, 25)
                    },
                    totalItemsExtracted: 0,
                    iteration: 0
                };

                this.log('\n🧠 Kurallar kapsamıyor — Brain\'e strateji danışılıyor...');
                firstDecision = await this.askBrain(initialContext);

                if (firstDecision) {
                    this.log(`\n💭 Brain düşünce: ${firstDecision.thinking}`);
                    this.log(`📋 Karar: ${firstDecision.action} — ${firstDecision.reason}`);

                    // 🔧 Brain müdahale etti → kaydet, sonra kural üret
                    this.brainInterventions.push({
                        phase: 'strategy',
                        context: ruleContext,
                        decision: firstDecision,
                        timestamp: new Date().toISOString()
                    });
                }

                // Brain'in kararına göre strateji belirle
                useSubPages = subPages.length > 0 &&
                    (firstDecision?.action === 'DISCOVER_SUBPAGES' ||
                        firstDecision?.action === 'NAVIGATE' ||
                        (structure.priceCount < 3 && structure.bodyTextLength < 2000));
            }

            if (useSubPages) {
                // ═══ NON-MENU PAGE FILTER ═══
                const skipPatterns = [
                    'hakkimizda', 'about', 'iletisim', 'contact', 'kvkk', 'gizlilik',
                    'privacy', 'sozlesme', 'contract', 'aydinlatma', 'mesafeli-satis',
                    'teslimat', 'iade', 'return', 'franchise', 'bayilik', 'kariyer',
                    'career', 'blog', 'haber', 'news', 'duyuru', 'galeri', 'gallery',
                    'duraklar', 'subelerimiz', 'lokasyon', 'location', 'branch',
                    'acik-riza', 'cerez', 'cookie', 'terms', 'legal',
                    '/en/'  // İngilizce duplike sayfaları filtrele
                ];
                subPages = subPages.filter(sp => {
                    try {
                        const pathname = new URL(sp.url).pathname.toLowerCase();
                        const isSkip = skipPatterns.some(p => pathname.includes(p));
                        if (isSkip) this.log(`   ⏭️ Filtrelendi (menü-dışı): ${sp.text} → ${sp.url}`);
                        return !isSkip;
                    } catch { return true; }
                });

                // ═══ MULTI-PAGE MODE ═══
                this.log(`\n═══ MULTI-PAGE MODE: ${subPages.length} alt sayfa işlenecek ═══`);

                for (let pi = 0; pi < subPages.length; pi++) {
                    const sp = subPages[pi];
                    if (processedPages.has(sp.url)) continue;
                    processedPages.add(sp.url);

                    // ═══ GENERIC TEXT SANITIZER ═══
                    // Buton metinleri (Ürünü Görüntüle, Detay, İncele vb.) kategori adı olarak kullanılmamalı
                    const genericButtonTexts = [
                        'ürünü görüntüle', 'detay', 'incele', 'i̇ncele', 'detaylar',
                        'sepete ekle', 'satın al', 'daha fazla', 'more', 'view', 'details',
                        'add to cart', 'buy now', 'shop now', 'view product', 'read more',
                        'devamını oku', 'tümünü gör', 'see all', 'show more'
                    ];
                    if (genericButtonTexts.some(g => sp.text.toLowerCase().trim() === g)) {
                        // URL'den anlamlı kategori adı çıkar
                        try {
                            const pathParts = new URL(sp.url).pathname.split('/').filter(p => p && p !== 'page');
                            const lastPart = pathParts[pathParts.length - 1] || '';
                            const urlCategory = lastPart
                                .replace(/-/g, ' ')
                                .replace(/\b\w/g, c => c.toUpperCase());
                            if (urlCategory.length > 1) {
                                this.log(`   🏷️ Buton → URL kategori: "${sp.text}" → "${urlCategory}"`);
                                sp.text = urlCategory;
                            }
                        } catch { }
                    }

                    this.log(`\n[${pi + 1}/${subPages.length}] 📄 ${sp.text}: ${sp.url}`);
                    iteration++;

                    // Sayfaya git
                    const nav = await this.tool_navigateTo(sp.url);

                    // DOM text çıkar
                    const textData = await this.tool_extractDOMText();
                    let pageItems = [];

                    // ═══ PAGINATION HANDLİNG ═══
                    // DOM'da pagination linkleri bulunduysa kuyruğa ekle
                    if (textData.paginationLinks && textData.paginationLinks.length > 0) {
                        let paginationAdded = 0;
                        for (const pgLink of textData.paginationLinks) {
                            if (!processedPages.has(pgLink) && subPages.length < 30) {
                                subPages.push({ url: pgLink, text: sp.text || categoryName || 'Menü' });
                                paginationAdded++;
                            }
                        }
                        if (paginationAdded > 0) {
                            this.log(`   📄 ${paginationAdded} pagination sayfası kuyruğa eklendi`);
                        }
                    }

                    // ═══ SELECTOR FALLBACK → DOĞRUDAN ITEMS ═══
                    // Selector ile ürün bulunduysa Gemini'ye gönderme, doğrudan items yap
                    if (textData.selectorFallback && textData.selectorItemCount > 0) {
                        const selectorLines = textData.fullText.split('\n').filter(l => l.startsWith('- '));
                        pageItems = selectorLines.map(line => {
                            const parts = line.substring(2).split(' — ');
                            const name = parts[0].trim();
                            const price = parts[1] ? parseFloat(parts[1].replace(/[^0-9.,]/g, '')) || 0 : 0;
                            return { name, price, category: sp.text || 'Menü', description: '' };
                        }).filter(item => item.name.length > 1);
                        this.log(`   🎯 Selector → ${pageItems.length} ürün (Gemini bypass)`);
                    } else if (textData.charCount > 100) {
                        const textResult = await this.tool_extractProductsFromText(
                            textData.fullText,
                            sp.text || 'Menü'
                        );
                        pageItems = textResult.items;
                        this.log(`   📊 Text: ${pageItems.length} ürün`);
                    }

                    // Text yeterli mi? Brain değerlendir
                    if (pageItems.length < 3) {
                        this.log(`   📸 Screenshot fallback (${pageItems.length} < 3 ürün)`);
                        const ssResult = await this.tool_takeScreenshots(`sub_${pi}`);
                        if (ssResult.count > 0) {
                            const ssItemResult = await this.tool_extractProductsFromImages(
                                ssResult.screenshots, sp.text || 'Menü'
                            );
                            if (ssItemResult.items.length > pageItems.length) {
                                this.log(`   ✅ Screenshot daha iyi: ${ssItemResult.items.length} ürün`);
                                pageItems = ssItemResult.items;
                            }
                        }
                    }

                    // Kategori bilgisini ekle — generic buton texti varsa URL'den çıkar
                    const genericTexts = ['görüntüle', 'view', 'detay', 'details', 'menu', 'menü', 'daha fazla', 'more', 'incele'];
                    let categoryName = sp.text;
                    if (!categoryName || genericTexts.includes(categoryName.toLowerCase().trim())) {
                        // URL'den kategori adı çıkar: /menu/kebap → Kebap
                        try {
                            const urlPath = new URL(sp.url).pathname;
                            const lastSegment = urlPath.split('/').filter(Boolean).pop() || 'Genel';
                            categoryName = lastSegment
                                .replace(/-/g, ' ')
                                .replace(/\b\w/g, c => c.toUpperCase()); // Title case
                        } catch { categoryName = 'Genel'; }
                        this.log(`   📁 Kategori URL'den çıkarıldı: "${categoryName}" (orijinal text: "${sp.text}")`);
                    }
                    pageItems.forEach(item => {
                        if (!item.category || item.category === 'Menü') {
                            item.category = categoryName;
                        }
                    });

                    // ═══ RECURSIVE SUBPAGE DISCOVERY ═══
                    // Alt sayfadan 0 ürün çıktıysa VE sayfa menü-ilişkili bir URL'deyse,
                    // bu muhtemelen bir ara-kategori sayfası (ör: /icecekler/ → /sicak-icecekler/).
                    if (pageItems.length < 3 && subPages.length < 40) {
                        const menuUrlKeywords = [
                            'menu', 'yemek', 'food', 'drink', 'icecek', 'içecek', 'tatli',
                            'kahve', 'coffee', 'lezzet', 'product', 'urun', 'ürün', 'kategori',
                            'category', 'sicak', 'soguk', 'breakfast', 'burger', 'pizza',
                            'cocktail', 'salata', 'makarna', 'tost', 'dessert', 'beverage',
                            'alkollu', 'alkol', 'wine', 'beer', 'bira', 'sarap'
                        ];
                        const currentPathname = new URL(sp.url).pathname.toLowerCase();
                        const isMenuRelated = menuUrlKeywords.some(kw => currentPathname.includes(kw));

                        if (isMenuRelated) {
                            this.log(`   🔄 ${pageItems.length} ürün — hub sayfa olabilir, alt linkler keşfediliyor...`);
                            const deeperPages = await this.tool_discoverSubPages();
                            let added = 0;
                            for (const dp of deeperPages.subPages) {
                                // /en/ duplike filtresi recursive keşifte de uygula
                                const dpPath = new URL(dp.url).pathname.toLowerCase();
                                const isEnDuplicate = dpPath.includes('/en/');
                                if (!processedPages.has(dp.url) && subPages.length < 40 && !isEnDuplicate) {
                                    subPages.push(dp);
                                    added++;
                                }
                            }
                            if (added > 0) {
                                this.log(`   📂 ${added} yeni alt sayfa kuyruğa eklendi (toplam: ${subPages.length})`);
                                // Hub sayfadan çıkan 0-2 yanlış pozitif ürünü temizle
                                pageItems = [];
                            }
                        } else {
                            this.log(`   ⏭️ Menü-dışı sayfa, recursive keşif atlandı`);
                        }
                    }

                    allItems.push(...pageItems);
                    extractionLog.push({
                        page: sp.text,
                        url: sp.url,
                        itemCount: pageItems.length,
                        method: pageItems.length > 0 ? 'text' : 'screenshot'
                    });

                    this.log(`   📊 Toplam: ${allItems.length} ürün`);
                }
            } else {
                // ═══ SINGLE-PAGE MODE ═══
                this.log('\n═══ SINGLE-PAGE MODE ═══');

                // Text extraction
                const textData = await this.tool_extractDOMText();
                if (textData.charCount > 100) {
                    const textResult = await this.tool_extractProductsFromText(textData.fullText);
                    allItems.push(...textResult.items);
                    this.log(`   📊 Text: ${textResult.items.length} ürün`);
                }

                // Yetersizse screenshot
                if (allItems.length < 5) {
                    this.log(`   📸 Screenshot fallback (${allItems.length} < 5 ürün)`);
                    const ssResult = await this.tool_takeScreenshots('single');
                    if (ssResult.count > 0) {
                        const ssItemResult = await this.tool_extractProductsFromImages(ssResult.screenshots);
                        if (ssItemResult.items.length > allItems.length) {
                            allItems = ssItemResult.items;
                        }
                    }
                }
            }

            // 8. Deduplication
            const seen = new Set();
            allItems = allItems.filter(item => {
                if (!item.name || !item.name.trim()) return false;
                const key = `${item.name.toLowerCase().trim()}_${item.price || 0}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            // 9. Strateji kaydet
            const strategy = {
                mode: useSubPages ? 'multi-page' : 'single-page',
                subPageCount: subPages?.length || 0,
                primaryMethod: 'dom-text',
                fallback: 'screenshot',
                extractionLog
            };

            this.strategyStore.saveStrategy(targetUrl, strategy, allItems.length);
            this.log(`\n💾 Strateji kaydedildi: ${allItems.length} ürün`);

            // 10. 🔧 SELF-IMPROVEMENT — Brain müdahale ettiyse kural üret
            if (this.brainInterventions.length > 0) {
                this.log(`\n🔧 Self-Improvement: ${this.brainInterventions.length} Brain müdahalesi → kural üretiliyor...`);
                await this._generateRulesFromInterventions(allItems.length, extractionLog);
            } else {
                this.log(`\n✨ Pipeline kurallarla çalıştı — Brain müdahalesi gerekmedi!`);
            }

        } catch (error) {
            this.log(`\n❌ Kritik hata: ${error.message}`);
            this.log(error.stack);
        } finally {
            // Cleanup
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
                this.page = null;
            }
        }

        // 11. Sonuçları organize et
        const result = this._organizeResults(allItems, targetUrl);

        this.log('\n╔══════════════════════════════════════════════════════════════╗');
        this.log(`║  ✅ SONUÇ: ${result.totalItems} ürün, ${result.categories.length} kategori`);
        this.log('╚══════════════════════════════════════════════════════════════╝');

        // 12. AUTO-PUBLISH — Brain validasyonu + Supabase import
        if (!this.dryRun && result.totalItems > 0) {
            const publishResult = await this._publishToMenuAi(result, targetUrl);
            if (publishResult) {
                result.publishedUrl = publishResult.url;
                result.slug = publishResult.slug;
                this.log(`\n🌐 YAYINDA: ${publishResult.url}`);
            }
        } else if (this.dryRun) {
            this.log('\n⏭️ Dry-run modu — yayınlama atlandı');
        }

        return result;
    }

    // ═══════════════════════════════════════════════════════════════
    // ═══ YARDIMCI FONKSİYONLAR ═══
    // ═══════════════════════════════════════════════════════════════

    async _closePopups() {
        try {
            await this.page.evaluate(() => {
                const selectors = [
                    '[class*="cookie"] button', '[class*="consent"] button',
                    '[class*="popup"] [class*="close"]', '[class*="modal"] [class*="close"]',
                    'button[aria-label="Close"]', '.close-btn', '.dismiss'
                ];
                for (const sel of selectors) {
                    document.querySelectorAll(sel).forEach(el => {
                        try { el.click(); } catch { }
                    });
                }

                // Fixed overlays
                document.querySelectorAll('[style*="position: fixed"], [style*="position:fixed"]').forEach(el => {
                    const rect = el.getBoundingClientRect();
                    const coversScreen = rect.width > window.innerWidth * 0.7 && rect.height > window.innerHeight * 0.6;
                    if (coversScreen) return;
                    const isBar = rect.height < 150 && rect.width > window.innerWidth * 0.5;
                    const isAtEdge = rect.top < 60 || rect.bottom > window.innerHeight - 100;
                    if (isBar && isAtEdge) el.remove();
                });
            });
        } catch { }
    }

    _parseJSON(text, allowObject = false) {
        if (!text) return allowObject ? null : [];

        // Clean markdown
        let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        // Find JSON
        if (allowObject) {
            const objMatch = cleaned.match(/\{[\s\S]*\}/);
            if (objMatch) {
                try { return JSON.parse(objMatch[0]); } catch { }
            }
        }

        const arrMatch = cleaned.match(/\[[\s\S]*\]/);
        if (arrMatch) {
            try { return JSON.parse(arrMatch[0]); } catch { }
        }

        return allowObject ? null : [];
    }

    _organizeResults(allItems, sourceUrl) {
        // Kategorize et
        const catMap = {};
        for (const item of allItems) {
            const cat = (item.category || 'Genel').replace(/[\t\n\r]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
            if (!catMap[cat]) catMap[cat] = [];
            catMap[cat].push({
                name: item.name?.trim() || 'Bilinmeyen',
                price: parseFloat(item.price) || 0,
                description: item.description?.trim() || '',
                category: cat
            });
        }

        // ═══ AKILLI KATEGORİ MERGE — chunk'lar arası tutarsızlığı gider ═══
        // Türkçe çoğul/tekil normalizasyonu: "Biralar" → "Bira", "Burgerler" → "Burger"
        const normalize = (name) => {
            let n = name.trim().toLowerCase();
            // Türkçe çoğul eklerini kaldır
            const pluralSuffixes = ['lar', 'ler', 'leri', 'ları'];
            for (const suffix of pluralSuffixes) {
                if (n.endsWith(suffix) && n.length > suffix.length + 2) {
                    const stem = n.slice(0, -suffix.length);
                    // Stem çok kısa olmasın (ör: "bir" → "bi" olmasın)
                    if (stem.length >= 3) return stem;
                }
            }
            return n;
        };

        // İlk geçiş: normalize edilmiş isimlere göre grupla
        const mergedMap = {};
        const canonicalNames = {}; // normalized → en çok ürünlü orijinal isim

        for (const [catName, items] of Object.entries(catMap)) {
            const norm = normalize(catName);
            if (!mergedMap[norm]) {
                mergedMap[norm] = [];
                canonicalNames[norm] = { name: catName, count: items.length };
            } else {
                // En çok ürünü olan ismi kanonik yap
                if (items.length > canonicalNames[norm].count) {
                    canonicalNames[norm] = { name: catName, count: items.length };
                }
            }
            mergedMap[norm].push(...items);
        }

        // Kanonik isimlerle son listeyi oluştur + dedup
        const categories = Object.keys(mergedMap).map(norm => {
            const canonName = canonicalNames[norm].name;
            const items = mergedMap[norm];

            // İçindeki ürünlerin kategori alanını güncelle
            const seen = new Set();
            const uniqueItems = items.filter(item => {
                const key = `${item.name?.toLowerCase().trim()}_${item.price || 0}`;
                if (seen.has(key)) return false;
                seen.add(key);
                item.category = canonName;
                return true;
            });

            return { name: canonName, items: uniqueItems };
        }).filter(c => c.items.length > 0);

        const totalItems = categories.reduce((s, c) => s + c.items.length, 0);
        const mergedCount = Object.keys(catMap).length - categories.length;

        this.log(`\n═══ SONUÇ: ${totalItems} ürün, ${categories.length} kategori ═══`);
        if (mergedCount > 0) this.log(`   📦 ${mergedCount} benzer kategori birleştirildi`);
        categories.forEach(c => this.log(`   ${c.name}: ${c.items.length} ürün`));

        // Extract restaurant name from URL
        let restaurant = 'Bilinmeyen';
        try {
            const u = new URL(sourceUrl);
            restaurant = u.hostname.replace('www.', '').split('.')[0];
            restaurant = restaurant.charAt(0).toUpperCase() + restaurant.slice(1);
        } catch { }

        return {
            source: 'Gemini Orchestrator Agent v2.0 — Self-Improving Pipeline',
            parsed_at: new Date().toISOString(),
            menu_url: sourceUrl,
            restaurant,
            totalItems,
            categories,
            meta: {
                brainInterventions: this.brainInterventions.length,
                rulesApplied: this.rulesEngine.appliedRules.length,
                pipelineRulesTotal: this.rulesEngine.store.rules.length,
                categoriesMerged: mergedCount
            }
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // ═══ AUTO-PUBLISH — Brain validasyonu + Supabase import ═══
    // ═══════════════════════════════════════════════════════════════

    _generateSlug(url) {
        try {
            const u = new URL(url);
            let hostname = u.hostname.replace('www.', '');
            // .com.tr → -turkiye
            if (hostname.endsWith('.com.tr')) {
                hostname = hostname.replace('.com.tr', '') + '-turkiye';
            } else {
                hostname = hostname.replace(/\.(com|net|org|io|co)$/i, '');
            }
            // Slug cleanup
            return hostname.replace(/\./g, '-').toLowerCase().replace(/[^a-z0-9-]/g, '');
        } catch {
            return 'restoran-' + Date.now();
        }
    }

    _generateRestaurantName(url) {
        try {
            const u = new URL(url);
            let name = u.hostname.replace('www.', '').split('.')[0];
            // Capitalize
            name = name.charAt(0).toUpperCase() + name.slice(1);
            // .com.tr → Türkiye suffix
            if (u.hostname.endsWith('.com.tr')) {
                name += ' Türkiye';
            }
            return name;
        } catch {
            return 'Restoran';
        }
    }

    async _publishToMenuAi(result, sourceUrl) {
        this.log('\n═══ AUTO-PUBLISH — Brain Validasyonu ═══');

        const MAX_HEAL_ATTEMPTS = 3;
        let currentResult = result;
        let brainApproval = null;

        for (let attempt = 1; attempt <= MAX_HEAL_ATTEMPTS; attempt++) {
            this.log(`\n   🧠 Brain Validasyonu — Deneme ${attempt}/${MAX_HEAL_ATTEMPTS}`);

            // Brain validasyonu — yayınlamaya uygun mu?
            const zeroPriceCount = currentResult.categories.reduce((s, c) => s + c.items.filter(i => !i.price || i.price === 0).length, 0);
            const zeroPriceRatio = currentResult.totalItems > 0 ? zeroPriceCount / currentResult.totalItems : 1;

            const catSummary = currentResult.categories.map(c => c.name + ' (' + c.items.length + ')').join(', ');
            // Sayfa analiz bağlamı — Brain'in yield ratio'yu değerlendirebilmesi için
            const pa = this.pageAnalysis || {};
            const yieldRatio = pa.productElementCount > 0 ? (currentResult.totalItems / pa.productElementCount * 100).toFixed(0) : 'N/A';

            const validationPrompt = `Sen MenüAi platformunun OTONOM kalite kontrol Brain'isin.
Bir menü extraction tamamlandı. Yayınlamaya uygun mu değerlendir.
RED EDERSEN → sorunları tespit et VE nasıl düzeltileceğini söyle.

SAYFA ANALİZİ (orijinal sayfa verisi):
- Sayfadaki ürün elementleri: ${pa.productElementCount || 'Bilinmiyor'}
- Sayfadaki fiyat sayısı: ${pa.priceCount || 'Bilinmiyor'}
- DOM text uzunluğu: ${pa.bodyTextLength || 'Bilinmiyor'} karakter
- Extraction yield: ${yieldRatio}% (çıkarılan / sayfadaki element)
${this.brainPreScanResult ? `
BRAIN PRE-SCAN BEKLENTİLERİ (extraction ÖNCESI tahmin):
- Beklenen ürün aralığı: ${this.brainPreScanResult.expectedItemRange?.min}-${this.brainPreScanResult.expectedItemRange?.max}
- Beklenen kategori sayısı: ${this.brainPreScanResult.expectedCategoryCount?.min}-${this.brainPreScanResult.expectedCategoryCount?.max}
- Beklenen kategoriler: ${this.brainPreScanResult.likelyCategories?.join(', ') || 'yok'}
- Sayfa karmaşıklığı: ${this.brainPreScanResult.pageComplexity || 'bilinmiyor'}
- Brain notu: ${this.brainPreScanResult.notes || '-'}
⚠️ Eğer çıkarılan ürün sayısı beklenen MIN'in altındaysa veya beklenen kategoriler eksikse, bu ciddi bir sorun olabilir!
` : ''}

EXTRACTION SONUCU:
- Toplam çıkarılan ürün: ${currentResult.totalItems}
- Kategori sayısı: ${currentResult.categories.length}
- Kategoriler: ${catSummary}
- Fiyatı 0 olan ürün sayısı: ${zeroPriceCount} (${(zeroPriceRatio * 100).toFixed(0)}%)
- Kaynak: ${sourceUrl}
${attempt > 1 ? `- ÖNCEKİ DENEME: Bu ${attempt}. deneme. Önceki sorunlar düzeltilmeye çalışıldı.` : ''}

KRİTERLER:
1. En az 5 ürün olmalı
2. YIELD KONTROLÜ: ${this.brainPreScanResult?.expectedItemRange ?
                    `Brain Pre-Scan tahmini: ${this.brainPreScanResult.expectedItemRange.min}-${this.brainPreScanResult.expectedItemRange.max} ürün.
   Eğer çıkarılan ürün bu aralığın MIN değerinin %50'sinden azsa → LOW_YIELD_RATIO.
   NOT: DOM element sayısı (${this.pageAnalysis?.productElementCount || '?'}) güvenilir DEĞİLDİR — CSS dekoratif elementler de sayılır.` :
                    `Eğer sayfada belirgin şekilde çok ürün varken çıkarılan ürün çok azsa → LOW_YIELD_RATIO.
   NOT: DOM element sayısı kesin referans değildir.`}
3. FİYAT POLİTİKASI: Bazı firmalar fiyatlarını web sitelerinde YAYINLAMAZ.
   Eğer ürünlerin %40'ından fazlasında fiyat yoksa, bu bilinçli bir karardır — sorun DEĞİL.
4. Kategori isimleri anlamlı olmalı (boş, "undefined", "Görüntüle", "View" gibi generic olmamalı)
5. Ürün isimleri okunabilir Türkçe/İngilizce olmalı (garbled text olmamalı)
6. Kategori-ürün dağılımı mantıklı olmalı (tek kategoride 200 ürün olmamalı)

CEVAP (sadece JSON):
{
  "approved": true/false,
  "score": 1-10,
  "reason": "Kısa açıklama",
  "suggestedName": "Restoran Adı önerisi",
  "pricePolicy": "HAS_PRICES | NO_PRICES_INTENTIONAL | PARTIAL_MISSING",
  "issues": [
    {
      "type": "CATEGORY_NAMING | DUPLICATE_ITEMS | GARBLED_TEXT | UNBALANCED_CATEGORIES | LOW_ITEM_COUNT | LOW_YIELD_RATIO | OTHER",
      "description": "Sorunun açıklaması",
      "affectedCategories": ["kategori adları"],
      "fix": "Önerilen düzeltme açıklaması"
    }
  ]
}`;

            try {
                const approvalResult = await this.retry(async () => {
                    const res = await this.brain.generateContent(validationPrompt);
                    return res.response.text();
                });
                brainApproval = this._parseJSON(approvalResult, true);
            } catch (e) {
                this.log(`   ⚠️ Brain validasyonu başarısız: ${e.message}`);
                brainApproval = {
                    approved: currentResult.totalItems >= 5,
                    score: currentResult.totalItems >= 10 ? 7 : 5,
                    reason: 'Brain erişilemedi, basit kontrol yapıldı'
                };
            }

            if (brainApproval?.approved) {
                this.log(`   ✅ Brain ONAYLADI (Skor: ${brainApproval.score}/10): ${brainApproval.reason}`);
                break;
            }

            // ═══ BRAIN REDDETTİ → OTOMATİK DÜZELT ═══
            this.log(`   ⚠️ Brain reddetti (Skor: ${brainApproval?.score || 0}/10): ${brainApproval?.reason}`);

            if (!brainApproval?.issues?.length) {
                this.log(`   ❌ Brain sorun tespit edemedi — düzeltme yapılamıyor`);
                break;
            }

            // Her sorunu otomatik düzelt
            let fixApplied = false;
            for (const issue of brainApproval.issues) {
                this.log(`   🔧 Sorun: ${issue.type} — ${issue.description}`);

                switch (issue.type) {
                    case 'CATEGORY_NAMING': {
                        // Generic kategori adlarını düzelt
                        const genericNames = ['görüntüle', 'view', 'detay', 'details', 'menu', 'menü', 'undefined', 'null', ''];
                        for (const cat of currentResult.categories) {
                            if (genericNames.includes(cat.name?.toLowerCase().trim())) {
                                // Önce ürünlerin orijinal kategorisinden çıkarmayı dene
                                const originalCats = cat.items.map(i => i.originalCategory || i.category).filter(c => c && !genericNames.includes(c.toLowerCase().trim()));
                                const freq = {};
                                originalCats.forEach(c => { freq[c] = (freq[c] || 0) + 1; });
                                const bestFromFreq = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0];

                                if (bestFromFreq && !genericNames.includes(bestFromFreq.toLowerCase().trim())) {
                                    this.log(`      ✅ "${cat.name}" → "${bestFromFreq}" (orijinal kategoriden)`);
                                    cat.name = bestFromFreq;
                                    fixApplied = true;
                                } else {
                                    // Frequency'den bulunamadı → Brain'e ürün adlarından kategori önerttir
                                    const sampleItems = cat.items.slice(0, 15).map(i => i.name).join(', ');
                                    this.log(`      🧠 Brain'e kategori önerisi soruluyor (${cat.items.length} ürün)...`);
                                    try {
                                        const renameResult = await this.retry(async () => {
                                            const res = await this.brain.generateContent(
                                                `Bu ürünler bir restoran menüsünde aynı kategoride bulunuyor ama kategori adı kaybolmuş.
Ürünler: ${sampleItems}

Bu ürünlerin ait olduğu en uygun KATEGORİ ADINI öner. Sadece kategori adını yaz, başka bir şey yazma.
Örnek: "Kebaplar", "Tatlılar", "İçecekler", "Başlangıçlar", "Salatalar" gibi.`
                                            );
                                            return res.response.text().trim();
                                        });
                                        const suggestedName = renameResult.replace(/['"]/g, '').trim();
                                        if (suggestedName && suggestedName.length < 50) {
                                            this.log(`      ✅ "${cat.name}" → "${suggestedName}" (Brain önerisi)`);
                                            cat.name = suggestedName;
                                            fixApplied = true;
                                        }
                                    } catch (e) {
                                        this.log(`      ⚠️ Brain kategori önerisi başarısız: ${e.message}`);
                                        cat.name = 'Genel Menü';
                                        fixApplied = true;
                                    }
                                }
                            }
                        }
                        break;
                    }
                    case 'DUPLICATE_ITEMS': {
                        // Duplike ürünleri temizle
                        const beforeCount = currentResult.totalItems;
                        const seen = new Set();
                        currentResult.categories.forEach(cat => {
                            cat.items = cat.items.filter(item => {
                                const key = `${item.name?.toLowerCase().trim()}_${item.price || 0}`;
                                if (seen.has(key)) return false;
                                seen.add(key);
                                return true;
                            });
                        });
                        currentResult.totalItems = currentResult.categories.reduce((s, c) => s + c.items.length, 0);
                        const removed = beforeCount - currentResult.totalItems;
                        if (removed > 0) {
                            this.log(`      ✅ ${removed} duplike ürün silindi`);
                            fixApplied = true;
                        }
                        break;
                    }
                    case 'GARBLED_TEXT': {
                        // Garbled ürün adlarını filtrele
                        currentResult.categories.forEach(cat => {
                            const before = cat.items.length;
                            cat.items = cat.items.filter(item => {
                                // Türkçe/İngilizce alfabe + sayı + yaygın semboller
                                const cleanRatio = (item.name?.match(/[a-zA-ZğüşöçıİĞÜŞÖÇ0-9\s.,'-]/g) || []).length / (item.name?.length || 1);
                                return cleanRatio > 0.7;
                            });
                            const removed = before - cat.items.length;
                            if (removed > 0) {
                                this.log(`      ✅ "${cat.name}": ${removed} garbled ürün silindi`);
                                fixApplied = true;
                            }
                        });
                        currentResult.totalItems = currentResult.categories.reduce((s, c) => s + c.items.length, 0);
                        break;
                    }
                    case 'UNBALANCED_CATEGORIES': {
                        // 80+ ürünlü kategorileri böl — Brain'den akıllı isim al
                        const newCats = [];
                        for (const cat of currentResult.categories) {
                            if (cat.items.length > 80) {
                                const chunkSize = Math.ceil(cat.items.length / Math.ceil(cat.items.length / 40));
                                const chunks = [];
                                for (let i = 0; i < cat.items.length; i += chunkSize) {
                                    chunks.push(cat.items.slice(i, i + chunkSize));
                                }
                                // Brain'e chunk'ların içeriğine göre kategori isimleri önerttir
                                let chunkNames = chunks.map((_, idx) => `${cat.name} ${idx + 1}`);
                                try {
                                    const chunkSamples = chunks.map((ch, idx) =>
                                        `Grup ${idx + 1} (${ch.length} ürün): ${ch.slice(0, 8).map(i => i.name).join(', ')}`
                                    ).join('\n');
                                    this.log(`      🧠 Brain'e ${chunks.length} grup için kategori isimleri soruluyor...`);
                                    const nameResult = await this.retry(async () => {
                                        const res = await this.brain.generateContent(
                                            `Bu bir restoran menüsü. Aşağıdaki ürün gruplarına EN UYGUN kategori adlarını ver.
Her gruba Türkçe, kısa, anlamlı bir kategori adı ver.

${chunkSamples}

Sadece JSON array döndür, başka bir şey yazma:
["Kategori1", "Kategori2", ...]`
                                        );
                                        return this._parseJSON(res.response.text());
                                    });
                                    if (Array.isArray(nameResult) && nameResult.length === chunks.length) {
                                        chunkNames = nameResult;
                                        this.log(`      ✅ Brain isimleri: ${chunkNames.join(', ')}`);
                                    }
                                } catch (e) {
                                    this.log(`      ⚠️ Brain isimlendirme başarısız, varsayılan isimler kullanılıyor`);
                                }
                                chunks.forEach((chunk, idx) => {
                                    newCats.push({ name: chunkNames[idx], items: chunk });
                                });
                                fixApplied = true;
                                this.log(`      ✅ "${cat.name}" (${cat.items.length} ürün) → ${chunks.length} kategoriye bölündü`);
                            } else {
                                newCats.push(cat);
                            }
                        }
                        currentResult.categories = newCats;
                        break;
                    }
                    default:
                        this.log(`      ⚠️ "${issue.type}" tipi otomatik düzeltme desteklenmiyor — atlıyor`);
                }
            }

            if (!fixApplied) {
                this.log(`   ⚠️ Düzeltme uygulanamadı — son deneme olarak devam ediliyor`);
                // Fix uygulanamasa bile son denemede force-publish yapacağız
            }

            // Boş kategorileri temizle
            currentResult.categories = currentResult.categories.filter(c => c.items.length > 0);
            currentResult.totalItems = currentResult.categories.reduce((s, c) => s + c.items.length, 0);
            this.log(`   🔄 Düzeltilmiş data: ${currentResult.totalItems} ürün, ${currentResult.categories.length} kategori — tekrar deneniyor...`);
        }

        // ═══ BRAIN ASLA DURMAZ — en iyi sonucu yayınla ═══
        if (!brainApproval?.approved) {
            this.log(`   ⚠️ Brain ${MAX_HEAL_ATTEMPTS} denemede onaylamadı — FORCE PUBLISH yapılıyor!`);
            this.log(`   💡 Felsefe: Brain reddedip bekleyemez, her zaman çözüm üretmeli.`);
            this.log(`   📊 Mevcut en iyi sonuç: ${currentResult.totalItems} ürün, ${currentResult.categories.length} kategori`);
            // Score'u override et — en azından 5 verelim ki pipeline devam etsin
            brainApproval = {
                approved: true,
                score: Math.max(brainApproval?.score || 5, 5),
                reason: `Force-publish: Brain ${MAX_HEAL_ATTEMPTS}x reddetti ama ${currentResult.totalItems} ürün var — yayınlanıyor`,
                suggestedName: brainApproval?.suggestedName,
                pricePolicy: brainApproval?.pricePolicy || 'PARTIAL_MISSING',
                _forcePublished: true
            };
        }

        // 2. Slug ve restoran adı üret
        const slug = this._generateSlug(sourceUrl);
        const restaurantName = brainApproval.suggestedName || this._generateRestaurantName(sourceUrl);

        this.log(`   🏷️ Slug: ${slug}`);
        this.log(`   🏪 Restoran: ${restaurantName}`);

        // 3. Supabase import
        try {
            this.log('   📦 Supabase import başlıyor...');
            await importMenu(currentResult, slug, restaurantName, sourceUrl);

            // Smart URL: önce /p/ (proxy+overlay) dene, sorun varsa /m/ (standalone) fallback
            const proxyUrl = `https://menuai.tr/p/${slug}`;
            const standaloneUrl = `https://menuai.tr/m/${slug}`;

            this.log('\n╔══════════════════════════════════════════════════════════════╗');
            this.log(`║  🏪 ${restaurantName} — ${result.totalItems} ürün, ${result.categories.length} kategori`);
            this.log(`║  🧠 Brain Skoru: ${brainApproval.score}/10`);
            this.log('╚══════════════════════════════════════════════════════════════╝');

            // 4. Pipeline kuralı var mı? Proxy uyumsuzsa direkt standalone
            const domain = new URL(sourceUrl).hostname;
            const publishRuleContext = { url: sourceUrl };
            const publishRules = this.rulesEngine.findApplicableRules(publishRuleContext);
            const standaloneRule = publishRules.find(r => r.action === 'USE_STANDALONE');

            let verification, publishedUrl, proxyVerification;

            if (standaloneRule) {
                // 🧠 Kural aktif — proxy atla, direkt standalone
                this.log(`\n   📘 Kural aktif: "${standaloneRule.name}"`);
                this.log(`   ↪️  Proxy atlanıyor, direkt standalone deneniyor...`);
                this.rulesEngine.markApplied(standaloneRule.id);

                verification = await this._verifyPublishedUrl(standaloneUrl, restaurantName, result);
                publishedUrl = standaloneUrl;
                proxyVerification = null;
            } else {
                // Normal akış — önce proxy, sonra standalone
                this.log('\n   🔍 Proxy URL deneniyor...');
                verification = await this._verifyPublishedUrl(proxyUrl, restaurantName, result);
                publishedUrl = proxyUrl;
                proxyVerification = verification; // Proxy sonucunu sakla

                if (!verification?.verified) {
                    this.log('   ↪️  Proxy çalışmıyor, standalone URL deneniyor...');
                    verification = await this._verifyPublishedUrl(standaloneUrl, restaurantName, result);
                    publishedUrl = standaloneUrl;

                    if (verification?.verified) {
                        this.log(`   ✅ Standalone URL çalışıyor: ${standaloneUrl}`);

                        // 🧠 OTOMATİK KURAL ÜRET — Bu site için proxy çalışmıyor
                        const autoRule = {
                            name: `${domain} proxy uyumsuz — standalone kullan`,
                            description: `Brain tespiti: ${proxyVerification?.status || 'FAIL'} — ${proxyVerification?.details || 'Proxy doğrulaması başarısız'}`,
                            condition: {
                                type: 'url_contains',
                                value: domain
                            },
                            action: 'USE_STANDALONE',
                            priority: 8,
                            source: 'brain_auto_verify'
                        };
                        this.rulesEngine.addRule(autoRule);
                        this.log(`   📘 Kural üretildi: "${autoRule.name}"`);
                        this.log(`   → Gelecekte ${domain} için proxy denenmeyecek, direkt standalone`);
                    } else {
                        this.log(`   ⚠️  Her iki URL de sorunlu — Brain kural yazacak`);
                    }
                } else {
                    this.log(`   ✅ Proxy URL çalışıyor: ${proxyUrl}`);
                }
            } // else bloğu kapanış

            this.log(`\n   🌐 YAYINDA: ${publishedUrl}`);
            if (verification?.proofScreenshot) {
                this.log(`   📸 Kanıt: ${verification.proofScreenshot}`);
            }

            return {
                url: publishedUrl, slug, restaurantName,
                brainScore: brainApproval.score,
                verification,
                proofScreenshot: verification?.proofScreenshot || null,
                mode: publishedUrl.includes('/p/') ? 'proxy' : 'standalone'
            };
        } catch (e) {
            this.log(`   ❌ Supabase import hatası: ${e.message}`);
            return null;
        }
    }

    /**
     * Brain URL Verification — Publish sonrası URL'yi Playwright ile aç,
     * screenshot al, Brain'e analiz ettir. Sorun varsa kural yaz.
     */
    async _verifyPublishedUrl(url, restaurantName, menuData) {
        this.log('\n═══ BRAIN VERIFY — Yayın Doğrulama ═══');

        let browser, page;
        try {
            browser = await chromium.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const context = await browser.newContext({
                viewport: { width: 390, height: 844 } // iPhone 14 size
            });
            page = await context.newPage();

            this.log(`   🌐 ${url} açılıyor...`);

            const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
            const statusCode = response?.status() || 0;

            // 2 saniye bekle — JS render olsun
            await new Promise(r => setTimeout(r, 2000));

            // Screenshot al
            const screenshotPath = path.join(__dirname, `verify_${Date.now()}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: false });
            this.log(`   📸 Screenshot: ${screenshotPath}`);

            // Sayfa içeriğini al
            const pageText = await page.evaluate(() => document.body?.innerText || '');
            const pageTitle = await page.title();

            // Brain'e gönder — SERT KALİTE KONTROL
            const verifyPrompt = `Sen MenüAi platformunun kalite kontrol Brain'isin.
Sana bir sitenin fotoğrafı gelir. Sen de bizim lanet butonlarımızı üzerine giydirip teslim edersin.
Dandik bir menü listesi vermek senin gibi akıllı bir aygıt için HAKARETTİR.

═══ TEMEL FELSEFEMİZ ═══
MenüAi bir "Menu Wrapper" platformudur. Bizim işimiz:
1. Restoranın KENDİ sitesini aynen göstermek (proxy veya iframe ile)
2. Üzerine MenüAi overlay butonlarını (Garson Çağır, Menü, Hesap İste) giydirmek
3. Müşteriye restoranın orijinal tasarımını, görsellerini, markasını yaşatmak

DÜZ BİR METİN LİSTESİ = BAŞARISIZLIK. Bu bizim en kötü sonumuz.
Orijinal site görselleriyle, markasıyla, renkleriyle görünmeli.

═══ SAYFA BİLGİSİ ═══
- URL: ${url}
- HTTP Status: ${statusCode}
- Sayfa Title: ${pageTitle}
- Sayfa Text (ilk 800 char): ${pageText.substring(0, 800)}
- Beklenen restoran: ${restaurantName}
- Beklenen ürün sayısı: ${menuData.totalItems}
- Beklenen kategori sayısı: ${menuData.categories.length}
- URL tipi: ${url.includes('/p/') ? 'PROXY (/p/)' : 'STANDALONE (/m/)'}

═══ DOĞRULAMA KRİTERLERİ (SIRAYLA) ═══

1. HAYATI KONTROL — HTTP 200 mi?
   - 404 = route yok → ROUTE_ERROR
   - 500 = server patladı → SERVER_ERROR
   - "Cannot GET" = Express route eksik → ROUTE_ERROR

2. ORİJİNAL SİTE GÖRÜNMESİ (en önemli kriter!)
   - URL /p/ ile başlıyorsa: orijinal sitenin HTML'i, görselleri, CSS'i görünmeli
   - Sayfa text'te restoranın menü kategorileri / ürünleri doğrudan görünmeli
   - Eğer sadece "Menü yükleniyor..." spinner'ı varsa → DATA_ERROR
   - Eğer "Application error" / "client-side exception" varsa → JS_CRASH

3. MENÜAİ OVERLAY
   - Sayfada "Garson Çağır", "Hesap İste" butonları olmalı
   - "MenüAi" branding'i görünmeli
   - Overlay yoksa → OVERLAY_MISSING

4. SUNUM KALİTESİ (10 üzerinden puanla)
   - 10: Orijinal site birebir aynı + overlay → MÜKEMMEl
   - 7-9: Orijinal site görünüyor ama bazı assetler eksik → İYİ
   - 4-6: Orijinal site kısmen görünüyor, bazı bozukluklar var → ORTA
   - 1-3: Düz metin listesi, görsel yok, orijinal site hiç görünmüyor → REZALET
   - 0: Sayfa hiç yüklenmiyor → FELAKET

CEVAP (sadece JSON):
{
  "verified": true/false,
  "status": "PERFECT | GOOD | DEGRADED | BARE_LIST | ROUTE_ERROR | DATA_ERROR | SERVER_ERROR | JS_CRASH | OVERLAY_MISSING",
  "presentationScore": 0-10,
  "originalSiteVisible": true/false,
  "overlayVisible": true/false,
  "details": "Ne gördün, detaylı açıkla",
  "issues": ["varsa sorun listesi"],
  "suggestedFix": "Sorun varsa ne yapılmalı"
}`;

            let verification;
            try {
                const verifyResponse = await this.retry(async () => {
                    const res = await this.brain.generateContent(verifyPrompt);
                    return res.response.text();
                });
                const jsonMatch = verifyResponse.match(/\{[\s\S]*\}/);
                verification = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
            } catch (e) {
                verification = { verified: false, status: 'BRAIN_ERROR', details: e.message };
            }

            if (verification?.verified) {
                this.log(`   ✅ Brain DOĞRULADI: ${verification.details}`);
                this.log(`   📊 Status: ${verification.status} | Sunum: ${verification.presentationScore}/10`);
                this.log(`   🌐 Orijinal site: ${verification.originalSiteVisible ? '✅' : '❌'} | Overlay: ${verification.overlayVisible ? '✅' : '❌'}`);

                // ✅ Başarılı screenshot'u kalıcı kanıt olarak kaydet
                const proofDir = path.join(__dirname, 'verified_screenshots');
                if (!fs.existsSync(proofDir)) fs.mkdirSync(proofDir, { recursive: true });
                const slug = url.split('/').pop();
                const proofPath = path.join(proofDir, `${slug}_${Date.now()}.png`);
                fs.copyFileSync(screenshotPath, proofPath);
                verification.proofScreenshot = proofPath;
                this.log(`   📸 Kanıt screenshot: ${proofPath}`);
            } else {
                this.log(`   ⚠️ Brain SORUN BULDU: ${verification?.details || 'Bilinmeyen'}`);
                this.log(`   📊 Status: ${verification?.status} | Sunum: ${verification?.presentationScore || 0}/10`);
                this.log(`   🌐 Orijinal site: ${verification?.originalSiteVisible ? '✅' : '❌'} | Overlay: ${verification?.overlayVisible ? '✅' : '❌'}`);
                if (verification?.issues?.length) {
                    verification.issues.forEach(issue => this.log(`      ❗ ${issue}`));
                }
                if (verification?.suggestedFix) {
                    this.log(`   🔧 Önerilen fix: ${verification.suggestedFix}`);
                }

                // Sorunları pipeline kuralı olarak kaydet
                this.brainInterventions.push({
                    phase: 'url_verification',
                    action: 'Yayın doğrulama sorunu tespit edildi',
                    status: verification?.status,
                    presentationScore: verification?.presentationScore,
                    details: verification?.details,
                    issues: verification?.issues,
                    suggestedFix: verification?.suggestedFix
                });

                // Hatalı screenshot'u da debug için sakla
                verification.failedScreenshot = screenshotPath;
            }

            // Temp screenshot'u sil (proof zaten kalıcı dizine kopyalandı)
            try { fs.unlinkSync(screenshotPath); } catch (e) { }

            return verification;

        } catch (e) {
            this.log(`   ❌ Verification hatası: ${e.message}`);
            return { verified: false, status: 'VERIFY_FAILED', details: e.message };
        } finally {
            if (browser) await browser.close();
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // ═══ SELF-IMPROVEMENT — Brain müdahalelerinden kural üret ═══
    // ═══════════════════════════════════════════════════════════════

    /**
     * Brain'in tüm müdahalelerini analiz edip kalıcı kurallar üret.
     * Bu kurallar gelecekte aynı durumda Brain'e gerek kalmadan uygulanır.
     */
    async _generateRulesFromInterventions(totalItems, extractionLog) {
        const interventionSummary = this.brainInterventions.map(i => ({
            phase: i.phase,
            context: {
                priceCount: i.context.priceCount,
                subPageCount: i.context.subPageCount,
                menuLinkCount: i.context.menuLinkCount,
                textLength: i.context.textLength,
                productElementCount: i.context.productElementCount,
                hasTabs: i.context.hasTabs,
                itemCount: i.context.totalItemsExtracted
            },
            brainDecision: i.decision?.action,
            brainReason: i.decision?.reason
        }));

        const rulePrompt = `Sen bir pipeline mühendisisin. Aşağıdaki Brain müdahalelerini analiz et ve KALICI KURALLAR üret.

BRAIN MÜDAHALELERİ:
${JSON.stringify(interventionSummary, null, 2)}

EXTRACTION SONUCU: ${totalItems} ürün

GÖREV: Her müdahale için bir kural üret. Bu kurallar gelecekte Brain'e gerek kalmadan otomatik uygulanacak.

KURAL FORMATI (sadece JSON array döndür):
[
  {
    "name": "Kısa açıklayıcı isim (Türkçe)",
    "description": "Bu kural ne yapıyor ve neden gerekli",
    "condition": {
      "type": "and",
      "conditions": [
        { "type": "priceCount", "operator": "<", "value": 3 },
        { "type": "subPageCount", "operator": ">", "value": 0 }
      ]
    },
    "action": "USE_SUBPAGES|SKIP_MAIN_PAGE|USE_SCREENSHOT_FALLBACK|CLICK_TABS|SCROLL_MORE",
    "priority": 1
  }
]

KOŞUL TİPLERİ:
- priceCount: Sayfadaki fiyat sayısı
- subPageCount: Alt sayfa sayısı
- menuLinkCount: Menü link sayısı  
- textLength: DOM text uzunluğu
- productElementCount: Ürün DOM element sayısı
- hasTabs: Tab/accordion var mı (true/false)
- itemCount: O ana kadar çıkarılan ürün sayısı

OPERATÖRLER: <, >, <=, >=, ===, !==, includes

AKSIYONLAR:
- USE_SUBPAGES: Alt sayfalara git
- SKIP_MAIN_PAGE: Ana sayfayı atla
- USE_SCREENSHOT_FALLBACK: Screenshot al ve OCR yap
- CLICK_TABS: Tab/accordion tıkla
- SCROLL_MORE: Daha fazla scroll et

ÖNEMLİ:
- Kurallar GENEL olsun — sadece bu siteye değil, benzer tüm sitelere uygulanabilir
- Koşullar somut sayısal değerler kullanmalı
- Her müdahale için en az 1 kural üret`;

        try {
            const result = await this.retry(async () => {
                const res = await this.brain.generateContent(rulePrompt);
                return res.response.text();
            });

            const newRules = this._parseJSON(result);
            let addedCount = 0;

            for (const rule of newRules) {
                if (rule.name && rule.condition && rule.action) {
                    const added = this.rulesEngine.addRule(rule);
                    if (added) {
                        addedCount++;
                        this.log(`   📌 Yeni kural: "${rule.name}" → ${rule.action}`);
                    } else {
                        this.log(`   ⏭️ Zaten var: "${rule.name}"`);
                    }
                }
            }

            this.log(`\n🔧 Self-Improvement tamamlandı: ${addedCount} yeni kural eklendi`);
            this.log(`   📘 Toplam pipeline kuralı: ${this.rulesEngine.store.rules.length}`);
            this.log(`   🎯 Sonraki çalışmada bu kurallar otomatik uygulanacak — Brain'e gerek kalmayacak`);

        } catch (e) {
            this.log(`   ⚠️ Kural üretme hatası: ${e.message}`);
        }
    }
}

module.exports = GeminiOrchestrator;

// ─── CLI kullanım ───
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log('Kullanım: node geminiOrchestrator.js <menu_url>');
        console.log('Örnek:    node geminiOrchestrator.js "https://cafeblanca.com.tr/menu/"');
        process.exit(1);
    }

    const url = args[0];
    const dryRun = args.includes('--dry-run');

    const orchestrator = new GeminiOrchestrator({ dryRun });

    orchestrator.extract(url).then(result => {
        const outFile = `extracted_menu_${url.replace(/[^a-z0-9]/gi, '_').substring(0, 40)}.json`;
        fs.writeFileSync(outFile, JSON.stringify(result, null, 2), 'utf-8');
        console.log(`\n💾 JSON: ${outFile}`);
        console.log(`📊 ${result.totalItems} ürün, ${result.categories.length} kategori`);

        if (result.publishedUrl) {
            console.log(`\n🌐 YAYINDA → ${result.publishedUrl}`);
        } else if (dryRun) {
            console.log('\n⏭️ Dry-run — yayınlama atlandı');
        } else {
            console.log('\n⚠️ Yayınlama yapılamadı (Brain reddi veya hata)');
        }
    }).catch(err => {
        console.error('❌ Hata:', err.message);
        process.exit(1);
    });
}
