/**
 * MenüAi Menu Parser - Gemini Vision + Puppeteer
 * 
 * Bu modül herhangi bir menü URL'sini alır, Puppeteer ile gezer,
 * screenshot'lar alır ve Gemini Vision API ile menü ürünlerini çıkarır.
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

class MenuParser {
    constructor(apiKey) {
        this.apiKey = apiKey || process.env.GEMINI_API_KEY;
        if (!this.apiKey) {
            throw new Error('GEMINI_API_KEY is required! Set it in .env file or pass as parameter.');
        }
        this.genAI = new GoogleGenerativeAI(this.apiKey);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        this.maxRetries = 3;
        this.baseDelay = 30000; // 30 seconds
    }

    /**
     * Retry helper with exponential backoff
     */
    async retryWithBackoff(fn, retries = this.maxRetries) {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                const isRetryable = error.message?.includes('retry') ||
                    error.message?.includes('429') ||
                    error.message?.includes('Resource exhausted');

                if (isRetryable && attempt < retries) {
                    // Extract wait time from error or use exponential backoff
                    const waitMatch = error.message.match(/(\d+\.?\d*)s/);
                    const waitTime = waitMatch ?
                        Math.ceil(parseFloat(waitMatch[1]) * 1000) + 2000 :
                        this.baseDelay * Math.pow(2, attempt);

                    console.log(`   ⏳ Rate limited. Waiting ${Math.ceil(waitTime / 1000)}s before retry ${attempt + 1}/${retries}...`);
                    await new Promise(r => setTimeout(r, waitTime));
                } else {
                    throw error;
                }
            }
        }
    }

    /**
     * Ana parse fonksiyonu - URL'den menü verisi çıkarır
     */
    async parseMenu(targetUrl, options = {}) {
        const {
            maxCategories = 20,
            screenshotDir = path.join(__dirname, 'screenshots'),
            verbose = true
        } = options;

        if (verbose) console.log(`\n🔍 [MenuParser] Starting parse for: ${targetUrl}`);

        // Screenshot klasörünü oluştur
        if (!fs.existsSync(screenshotDir)) {
            fs.mkdirSync(screenshotDir, { recursive: true });
        }

        let browser;
        try {
            // 1. Puppeteer ile sayfayı aç - Desktop viewport (popup'ları önlemek için)
            browser = await puppeteer.launch({
                headless: false,
                executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800', '--disable-blink-features=AutomationControlled']
            });

            const page = await browser.newPage();

            // Desktop viewport kullan (mobil popup'ları tetiklememek için)
            await page.setViewport({ width: 1280, height: 800, isMobile: false });

            // Normal user-agent (bot değil gibi görün)
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            if (verbose) console.log('🖥️ [MenuParser] Browser launched (desktop viewport)');

            // 2. Hedef URL'ye git (SPA desteği ile)
            try {
                await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            } catch (e) {
                // Timeout olursa domcontentloaded ile tekrar dene
                if (verbose) console.log('⚠️ [MenuParser] networkidle2 timeout, retrying with domcontentloaded...');
                await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
            }

            // SPA render bekle
            await new Promise(r => setTimeout(r, 5000));
            if (verbose) console.log('🌐 [MenuParser] Page loaded');

            // 3. Sayfa yapısını analiz et
            await this.waitForContent(page);

            // 4. Önce DOM scraping dene (QR menüler için çok daha hızlı ve doğru)
            const domItems = await this.tryDOMScraping(page, verbose);

            let allItems = [];

            if (domItems && domItems.length >= 5) {
                // DOM scraping başarılı - screenshot'a gerek yok
                if (verbose) console.log(`🏆 [MenuParser] DOM scraping successful: ${domItems.length} items found directly`);
                allItems = domItems;
            } else {
                // DOM scraping başarısız - screenshot + Gemini yöntemine geç
                if (verbose) console.log(`📸 [MenuParser] DOM scraping found ${domItems?.length || 0} items, falling back to screenshot+Gemini...`);

                const screenshots = await this.captureMenuScreenshots(page, screenshotDir, verbose);

                if (screenshots.length === 0) {
                    throw new Error('No menu content found on page');
                }

                // 5. Her screenshot'ı Gemini ile analiz et
                let lastKnownCategory = null; // Carry-over: önceki screenshot'ın son kategorisi

                for (const screenshot of screenshots) {
                    if (verbose) console.log(`🤖 [MenuParser] Analyzing: ${screenshot.name}`);

                    // Carry-over context ekle: önceki screenshot'tan kalan kategori
                    let enrichedContext = screenshot.context;
                    if (lastKnownCategory && !enrichedContext.includes('Kategori:')) {
                        enrichedContext += `. Önceki bölümün son kategorisi: "${lastKnownCategory}" - eğer başka kategori başlığı görmüyorsan bu kategoriyi kullan.`;
                    }

                    const items = await this.analyzeWithGemini(screenshot.path, enrichedContext);

                    // Screenshot context'inden kategori adını çıkar
                    let screenshotCategory = null;
                    const catMatch = screenshot.context?.match(/Kategori:\s*(.+?)(?:\s*-\s*(?:Tüm|scroll|sayfa|devam))/i);
                    if (catMatch) {
                        screenshotCategory = catMatch[1].trim();
                    } else {
                        const simpleMatch = screenshot.context?.match(/Kategori:\s*(.+?)$/);
                        if (simpleMatch) {
                            screenshotCategory = simpleMatch[1].trim();
                        }
                    }

                    // Her item'a screenshot'ın kategorisini ekle
                    for (const item of items) {
                        if (screenshotCategory && (!item.category || item.category === 'Genel' || item.category === '')) {
                            item.category = screenshotCategory;
                        }
                        allItems.push(item);
                    }

                    // Carry-over güncelle
                    const categoriesInThisBatch = items
                        .map(i => i.category)
                        .filter(c => c && c !== 'Genel' && c !== '');
                    if (categoriesInThisBatch.length > 0) {
                        lastKnownCategory = categoriesInThisBatch[categoriesInThisBatch.length - 1];
                    }
                }
            }

            // 6. Sonuçları düzenle ve döndür
            const menuData = this.organizeMenuData(allItems, targetUrl);

            if (verbose) {
                console.log(`✅ [MenuParser] Complete! Found ${menuData.totalItems} items in ${menuData.categories.length} categories`);
            }

            return menuData;

        } catch (error) {
            console.error('❌ [MenuParser] Error:', error.message);
            throw error;
        } finally {
            if (browser) await browser.close();
        }
    }

    /**
     * DOM scraping - Doğrudan HTML'den menü verisi çıkar (QR menüler için ideal)
     */
    async tryDOMScraping(page, verbose) {
        try {
            // Tab butonlarını bul
            const tabInfo = await page.evaluate(() => {
                const tabs = [];
                // Yaygın tab selectors
                const allButtons = document.querySelectorAll('button');
                const horizontalBtns = [];
                allButtons.forEach(btn => {
                    const rect = btn.getBoundingClientRect();
                    const text = btn.textContent?.trim();
                    if (text && text.length > 1 && text.length < 25 &&
                        rect.top < 400 && rect.top > 100 && rect.width > 50 && rect.height < 60 && rect.height > 20) {
                        horizontalBtns.push({ name: text, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, top: rect.top });
                    }
                });

                if (horizontalBtns.length >= 2) {
                    const firstY = horizontalBtns[0].top;
                    const sameLine = horizontalBtns.filter(b => Math.abs(b.top - firstY) < 20);
                    if (sameLine.length >= 2) {
                        tabs.push(...sameLine);
                    }
                }

                // role="tab" olanları da ara
                document.querySelectorAll('[role="tab"]').forEach(btn => {
                    const text = btn.textContent?.trim();
                    const rect = btn.getBoundingClientRect();
                    if (text && text.length > 1 && rect.width > 0) {
                        tabs.push({ name: text, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, top: rect.top });
                    }
                });

                return tabs;
            });

            if (verbose && tabInfo.length > 1) {
                console.log(`📑 [DOM] Found ${tabInfo.length} tabs: ${tabInfo.map(t => t.name).join(', ')}`);
            }

            let allItems = [];

            // Her tab için scrape yap
            const tabsToProcess = tabInfo.length > 1 ? tabInfo : [null]; // null = mevcut tab

            for (let t = 0; t < tabsToProcess.length; t++) {
                const tab = tabsToProcess[t];

                if (tab && t > 0) {
                    // Tab'a tıkla
                    await page.mouse.click(tab.x, tab.y);
                    await new Promise(r => setTimeout(r, 2000));
                    if (verbose) console.log(`📑 [DOM] Switched to tab: "${tab.name}"`);
                }

                // Accordion'ları aç (sadece kapalı olanları)
                await page.evaluate(async () => {
                    const ariaButtons = document.querySelectorAll('[aria-expanded="false"]');
                    for (const btn of ariaButtons) {
                        try { btn.click(); await new Promise(r => setTimeout(r, 200)); } catch (e) { }
                    }
                });
                await new Promise(r => setTimeout(r, 500));

                // DOM'dan ürünleri çıkar
                const tabItems = await page.evaluate((tabName) => {
                    const items = [];

                    // Strateji 1: FineDine - food-card-link pattern
                    const foodCards = document.querySelectorAll('[id^="food-card-link-"], [class*="food-card"], [class*="menu-item"], [class*="product-card"]');
                    if (foodCards.length > 0) {
                        // Kategori başlıklarını bul
                        const categoryButtons = document.querySelectorAll('button.w-full.flex.items-center.justify-between');
                        const categoryRanges = [];
                        categoryButtons.forEach(btn => {
                            const name = btn.textContent?.trim();
                            const rect = btn.getBoundingClientRect();
                            if (name && name.length > 1 && name.length < 50) {
                                categoryRanges.push({ name, top: rect.top });
                            }
                        });
                        categoryRanges.sort((a, b) => a.top - b.top);

                        foodCards.forEach(card => {
                            const spans = card.querySelectorAll('span');

                            // FineDine yapısı: spans[0]=ad, spans[1]=açıklama, ₺ içeren span=fiyat
                            let name = '';
                            let description = '';
                            let priceText = '0';

                            for (const span of spans) {
                                const text = span.textContent?.trim() || '';
                                if (text.includes('\u20BA')) {
                                    // ₺ sembolü olan span → fiyat (₺1,290.00 → 1290, ₺495.00 → 495)
                                    const pm = text.match(/₺?\s*([\d.,]+)/);
                                    if (pm) {
                                        // Binlik ayırıcıyı kaldır: "1,290.00" → "1290.00", "1.290,00" → "1290,00"
                                        let priceStr = pm[1];
                                        // Eğer virgül var ve ondalık nokta da varsa (1,290.00 formatı) → virgülü sil
                                        if (priceStr.includes(',') && priceStr.includes('.')) {
                                            if (priceStr.lastIndexOf(',') < priceStr.lastIndexOf('.')) {
                                                priceStr = priceStr.replace(/,/g, ''); // 1,290.00 → 1290.00
                                            } else {
                                                priceStr = priceStr.replace(/\./g, '').replace(',', '.'); // 1.290,00 → 1290.00
                                            }
                                        } else if (priceStr.includes(',')) {
                                            // Tek virgül: 1,290 (binlik) veya 12,50 (ondalık)?
                                            const parts = priceStr.split(',');
                                            if (parts[1]?.length === 3) {
                                                priceStr = priceStr.replace(',', ''); // 1,290 → 1290
                                            } else {
                                                priceStr = priceStr.replace(',', '.'); // 12,50 → 12.50
                                            }
                                        }
                                        priceText = priceStr;
                                    }
                                } else if (!name && text.length > 1 && text.length < 100) {
                                    name = text;
                                } else if (name && !description && text.length > 5 && text.length < 300 && !text.includes('\u20BA')) {
                                    description = text;
                                }
                            }

                            // Fallback: ₺ bulunamadıysa, card textContent'ten fiyat ara
                            if (priceText === '0') {
                                const allText = card.textContent || '';
                                const priceMatch = allText.match(/(\d+(?:[.,]\d+)?)\s*(?:₺|TL|tl)/);
                                if (priceMatch) priceText = priceMatch[1];
                            }

                            // Kategori bul - bu ürünün üstündeki en yakın kategori başlığı
                            const cardRect = card.getBoundingClientRect();
                            let category = tabName || 'Genel';
                            for (let i = categoryRanges.length - 1; i >= 0; i--) {
                                if (categoryRanges[i].top < cardRect.top) {
                                    category = categoryRanges[i].name;
                                    break;
                                }
                            }

                            if (name && name.length > 1 && name.length < 100) {
                                items.push({
                                    name: name,
                                    price: parseFloat(priceText.replace(',', '.')) || 0,
                                    category: category,
                                    description: description
                                });
                            }
                        });
                    }

                    // Strateji 2: Genel - price pattern ile ürün tespiti
                    if (items.length === 0) {
                        const allElements = document.querySelectorAll('div, li, tr, article');
                        allElements.forEach(el => {
                            const text = el.textContent?.trim() || '';
                            // Fiyat + isim pattern: "Ürün Adı ... 150₺"
                            const match = text.match(/^(.{3,60}?)\s+(\d{2,4}(?:[.,]\d{2})?)\s*(?:₺|TL|tl)?$/);
                            if (match && el.children.length < 10) {
                                items.push({
                                    name: match[1].trim(),
                                    price: parseInt(match[2]) || 0,
                                    category: tabName || 'Genel',
                                    description: ''
                                });
                            }
                        });
                    }

                    return items;
                }, tab?.name || null);

                if (verbose) console.log(`   📋 [DOM] Tab "${tab?.name || 'Ana Menü'}": ${tabItems.length} items found`);
                allItems.push(...tabItems);
            }

            if (verbose) console.log(`📊 [DOM] Total DOM items: ${allItems.length}`);
            return allItems;

        } catch (e) {
            if (verbose) console.log(`⚠️ [DOM] Scraping error: ${e.message}`);
            return [];
        }
    }

    /**
     * Sayfa içeriğinin yüklenmesini bekle
     */
    async waitForContent(page) {
        // Mobrespos gibi SPA'lar için bekle
        try {
            await page.waitForSelector('button, a[href*="menu"], [class*="menu"], [class*="category"]', { timeout: 10000 });
        } catch (e) {
            // Selector bulunamadı, devam et
        }

        // Animasyonların bitmesi için ekstra bekle
        await new Promise(r => setTimeout(r, 2000));

        // Cookie banner ve popup'ları kapat - 3 kez dene
        for (let attempt = 0; attempt < 3; attempt++) {
            await this.closePopups(page);
            await new Promise(r => setTimeout(r, 500));
        }
    }

    /**
     * Cookie bannerları ve popup'ları kapat
     */
    async closePopups(page) {
        console.log('   🔧 [Popup] Attempting to close popups...');

        // 1. Shadow DOM dahil "Tüm Çerezleri Kabul Et" veya "Kabul Et" butonunu bul ve tıkla
        try {
            const shadowClicked = await page.evaluate(() => {
                // Shadow DOM'u traverse eden helper fonksiyon
                function findInShadows(root, texts) {
                    if (!root) return null;

                    // Root'un kendisini kontrol et
                    if (root.textContent) {
                        const text = root.textContent.trim().toLowerCase();
                        for (const t of texts) {
                            if (text === t.toLowerCase()) {
                                return root;
                            }
                        }
                    }

                    // Çocukları kontrol et
                    const elements = root.querySelectorAll ? root.querySelectorAll('*') : [];
                    for (const el of elements) {
                        // Element text'ini kontrol et
                        const text = el.textContent?.trim().toLowerCase();
                        for (const t of texts) {
                            if (text === t.toLowerCase()) {
                                const rect = el.getBoundingClientRect();
                                if (rect.width > 0 && rect.height > 0) {
                                    return el;
                                }
                            }
                        }

                        // Shadow root varsa içine bak
                        if (el.shadowRoot) {
                            const found = findInShadows(el.shadowRoot, texts);
                            if (found) return found;
                        }
                    }
                    return null;
                }

                // Aranacak buton metinleri
                const buttonTexts = [
                    'Tüm Çerezleri Kabul Et',
                    'Kabul Et',
                    'Accept All',
                    'Accept',
                    'Kabul'
                ];

                const btn = findInShadows(document, buttonTexts);
                if (btn) {
                    btn.click();
                    return btn.textContent?.trim() || 'clicked';
                }
                return null;
            });

            if (shadowClicked) {
                console.log(`   ✓ [Popup] Shadow DOM button clicked: "${shadowClicked}"`);
                await new Promise(r => setTimeout(r, 1000));
            }
        } catch (e) {
            console.log('   ⚠ [Popup] Shadow DOM error:', e.message);
        }

        // 2. Alternatif: Normal DOM'da "Kabul Et" butonu ara
        try {
            const acceptBtnCoords = await page.evaluate(() => {
                const acceptTexts = ['kabul et', 'accept', 'kabul', 'hepsini kabul', 'accept all',
                    'tümünü kabul', 'çerezleri kabul', 'agree', 'tamam', 'anladım', 'got it',
                    'allow all', 'consent', 'onaylıyorum'];
                const elements = document.querySelectorAll('button, a, span, div, [role="button"]');

                for (const el of elements) {
                    const text = el.textContent?.trim().toLowerCase();
                    if (text && acceptTexts.some(t => text.includes(t))) {
                        const rect = el.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0 && rect.width < 400) {
                            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, found: el.textContent.trim() };
                        }
                    }
                }
                return null;
            });

            if (acceptBtnCoords) {
                console.log(`   ✓ [Popup] Accept button "${acceptBtnCoords.found}" at (${Math.round(acceptBtnCoords.x)}, ${Math.round(acceptBtnCoords.y)})`);
                await page.mouse.click(acceptBtnCoords.x, acceptBtnCoords.y);
                await new Promise(r => setTimeout(r, 1000));
            }
        } catch (e) {
            console.log('   ⚠ [Popup] Accept button error:', e.message);
        }

        // 3. X (close) butonunu bul - yüksek z-index sabit pozisyonlu elementlerde
        try {
            const closeBtnCoords = await page.evaluate(() => {
                // Tüm sabit pozisyonlu yüksek z-index elementleri kontrol et
                const allElements = document.querySelectorAll('*');

                for (const el of allElements) {
                    const style = window.getComputedStyle(el);
                    const zIndex = parseInt(style.zIndex) || 0;

                    // Yüksek z-index ve sabit/absolute pozisyonlu elementler (popup/modal)
                    if ((style.position === 'fixed' || style.position === 'absolute') && zIndex > 100) {
                        // Bu element içindeki küçük butonları ara (X butonu)
                        const buttons = el.querySelectorAll('button, svg, [role="button"], span');
                        for (const btn of buttons) {
                            const btnRect = btn.getBoundingClientRect();
                            // X butonu: küçük, kare-ish, üst kısımda
                            if (btnRect.width > 15 && btnRect.width < 80 &&
                                btnRect.height > 15 && btnRect.height < 80 &&
                                btnRect.top < 200) {
                                // İçeriği X, ×, veya close benzeri mi?
                                const text = btn.textContent?.trim() || '';
                                const ariaLabel = btn.getAttribute('aria-label') || '';

                                if (text === '×' || text === 'X' || text === '✕' || text === '✖' ||
                                    ariaLabel.toLowerCase().includes('close') ||
                                    ariaLabel.toLowerCase().includes('kapat') ||
                                    (typeof btn.className === 'string' && btn.className.includes('close'))) {
                                    return { x: btnRect.x + btnRect.width / 2, y: btnRect.y + btnRect.height / 2, text: text || 'close' };
                                }
                            }
                        }
                    }
                }

                // Alternatif: × karakteri olan herhangi bir görünür element
                const closeChars = ['×', 'X', '✕', '✖'];
                for (const el of allElements) {
                    const text = el.textContent?.trim();
                    if (closeChars.includes(text)) {
                        const rect = el.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0 && rect.top < 200) {
                            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, text: text };
                        }
                    }
                }

                return null;
            });

            if (closeBtnCoords) {
                console.log(`   ✓ [Popup] Close button "${closeBtnCoords.text}" at (${Math.round(closeBtnCoords.x)}, ${Math.round(closeBtnCoords.y)})`);
                await page.mouse.click(closeBtnCoords.x, closeBtnCoords.y);
                await new Promise(r => setTimeout(r, 500));
            }
        } catch (e) {
            console.log('   ⚠ [Popup] Close button error:', e.message);
        }

        // 4. Keyboard ile popup kapat (ESC tuşu - birden fazla kez)
        try {
            // 3 kez ESC bas
            for (let i = 0; i < 3; i++) {
                await page.keyboard.press('Escape');
                await new Promise(r => setTimeout(r, 200));
            }
        } catch (e) { }

        // 5. Fallback: Modal sağ üst köşesine tıkla (X butonu genelde orada)
        try {
            // Ekranın sağ üst bölgesinde modal X butonuna tıkla
            // Desktop 1280x800 viewport için, modal genelde ortada
            // X butonu yaklaşık (920, 110) civarında olur
            const xBtnPositions = [
                { x: 920, y: 110 },  // Starbucks modal X konumu
                { x: 900, y: 100 },
                { x: 940, y: 120 }
            ];

            for (const pos of xBtnPositions) {
                await page.mouse.click(pos.x, pos.y);
                await new Promise(r => setTimeout(r, 200));
            }
        } catch (e) { }

        // 4. Son çare: Sadece cookie/consent popup'larını kaldır (DİKKATLİ - genel overlay silme kapatıldı)
        try {
            const removed = await page.evaluate(() => {
                let count = 0;
                // Sadece cookie/consent popup'larını hedefle - genel overlay/modal TEHLİKELİ
                const safeSelectors = [
                    '[class*="cookie"]', '[class*="consent"]', '[class*="gdpr"]',
                    '[id*="cookie"]', '[id*="consent"]', '[id*="gdpr"]',
                    '[class*="CookieConsent"]', '[class*="cookie-banner"]'
                ];

                safeSelectors.forEach(sel => {
                    document.querySelectorAll(sel).forEach(el => {
                        el.remove();
                        count++;
                    });
                });

                // Body scroll'u aç
                document.body.style.overflow = 'auto';
                document.body.style.position = 'static';
                document.body.classList.remove('modal-open', 'no-scroll');

                return count;
            });

            if (removed > 0) {
                console.log(`   ✓ [Popup] Removed ${removed} cookie/consent elements`);
            }
        } catch (e) { }

        await new Promise(r => setTimeout(r, 300));
    }

    /**
     * Derin scroll ile sayfa sonuna kadar screenshot al (reusable helper)
     */
    async _deepScrollCapture(page, screenshotDir, screenshots, timestamp, prefix, tabName, verbose) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await new Promise(r => setTimeout(r, 500));

        const contextPrefix = tabName ? `Kategori: ${tabName}` : 'Ana sayfa';
        let prevScroll = -1;
        let idx = screenshots.length;

        for (let s = 0; s < 30; s++) {
            await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.75));
            await new Promise(r => setTimeout(r, 600));

            const scrollInfo = await page.evaluate(() => ({
                y: window.scrollY,
                max: document.documentElement.scrollHeight - window.innerHeight
            }));

            if (scrollInfo.y <= prevScroll) break;
            if (scrollInfo.y >= scrollInfo.max - 10) {
                const endPath = path.join(screenshotDir, `${prefix}_end_${timestamp}.png`);
                await page.screenshot({ path: endPath, fullPage: false });
                screenshots.push({ path: endPath, name: `${prefix}_end`, context: `${contextPrefix} - sayfa sonu` });
                break;
            }
            prevScroll = scrollInfo.y;

            const deepPath = path.join(screenshotDir, `${prefix}_s${s}_${timestamp}.png`);
            await page.screenshot({ path: deepPath, fullPage: false });
            screenshots.push({ path: deepPath, name: `${prefix}_s${s}`, context: `${contextPrefix} - scroll ${s + 1}` });
        }

        if (verbose) console.log(`   📸 [MenuParser] ${prefix}: ${screenshots.length - idx} new screenshots`);
    }

    /**
     * Menü screenshot'larını al - V2 (akıllı kategori keşfi)
     */
    async captureMenuScreenshots(page, screenshotDir, verbose) {
        const screenshots = [];
        const timestamp = Date.now();
        const startUrl = page.url();

        // 1. Önce "Menüyü Gör" gibi butonları bul ve tıkla
        const menuButtonClicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, a'));
            const menuBtn = buttons.find(b => {
                const text = b.textContent?.toLowerCase() || '';
                return text.includes('menü') || text.includes('menu') || text.includes('yemek');
            });
            if (menuBtn) { menuBtn.click(); return true; }
            return false;
        });
        if (menuButtonClicked) {
            await new Promise(r => setTimeout(r, 3000));
            if (verbose) console.log('🖱️ [MenuParser] Clicked menu button');
        }
        // 2. Ana sayfadan screenshot al (scroll ile)
        // NOT: Accordion açma ve tab keşfi DOM scraping'de yapılıyor.
        // Screenshot yönteminde accordion açmak ürünleri büyütüp ekranı kaplıyor.
        await page.evaluate(() => window.scrollTo(0, 0));
        await new Promise(r => setTimeout(r, 500));

        const mainPath = path.join(screenshotDir, `main_${timestamp}.png`);
        await page.screenshot({ path: mainPath, fullPage: false });
        screenshots.push({ path: mainPath, name: 'main_view', context: 'Ana menü sayfası' });
        if (verbose) console.log('📸 [MenuParser] Main screenshot captured');

        // Ana sayfada 3 scroll yap
        for (let s = 1; s <= 3; s++) {
            await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
            await new Promise(r => setTimeout(r, 800));
            const scrollPath = path.join(screenshotDir, `scroll_${s}_${timestamp}.png`);
            await page.screenshot({ path: scrollPath, fullPage: false });
            screenshots.push({ path: scrollPath, name: `scroll_${s}`, context: `Ana sayfa scroll ${s}` });
        }
        if (verbose) console.log(`📸 [MenuParser] Captured ${screenshots.length} main screenshots`);

        // 2.5. TAB/SEKME KEŞFİ - Sayfadaki aktif olmayan sekmelere tıklayıp içeriklerini yakala
        const tabButtons = await page.evaluate(() => {
            const tabs = [];
            // Tab benzeri elementleri bul: role="tab", .nav-tab, .tab-pane trigger, tab-like buttons
            const selectors = [
                '[role="tab"]',
                '.nav-tabs a, .nav-tabs button, .nav-tabs li',
                '.tab-btn, .tab-button, .tab-link',
                '[data-toggle="tab"], [data-bs-toggle="tab"]',
                '.tabs button, .tabs a',
                '.menu-tabs button, .menu-tabs a',
                '.tab-menu button, .tab-menu a',
            ];

            const allTabEls = new Set();
            for (const sel of selectors) {
                document.querySelectorAll(sel).forEach(el => allTabEls.add(el));
            }

            // Ek olarak: yan yana butonları tab olarak tespit et
            // (aynı parent içinde 2-5 arası, benzer boyutta buton/link grubu)
            document.querySelectorAll('.btn-group, .button-group, .menu-filter').forEach(group => {
                group.querySelectorAll('button, a').forEach(el => allTabEls.add(el));
            });

            // Eğer yukarıdakilerden hiçbiri yoksa, genel buton gruplarını dene
            if (allTabEls.size === 0) {
                // Aynı parent altında 2-5 arası buton/link bul
                const allButtons = Array.from(document.querySelectorAll('button, a.btn'));
                const parentGroups = {};
                for (const btn of allButtons) {
                    const parentKey = btn.parentElement?.tagName + '_' + btn.parentElement?.className;
                    if (!parentGroups[parentKey]) parentGroups[parentKey] = [];
                    parentGroups[parentKey].push(btn);
                }
                for (const [key, btns] of Object.entries(parentGroups)) {
                    if (btns.length >= 2 && btns.length <= 6) {
                        // Menü ile ilgili mi kontrol et
                        const groupText = btns.map(b => b.textContent?.toLowerCase() || '').join(' ');
                        if (groupText.includes('menü') || groupText.includes('menu') ||
                            groupText.includes('vejetaryen') || groupText.includes('vegan') ||
                            groupText.includes('normal') || groupText.includes('öğle') ||
                            groupText.includes('akşam') || groupText.includes('diyet')) {
                            btns.forEach(b => allTabEls.add(b));
                        }
                    }
                }
            }

            for (const el of allTabEls) {
                const text = el.textContent?.trim();
                const rect = el.getBoundingClientRect();
                if (!text || text.length < 2 || text.length > 40) continue;
                if (rect.width < 20 || rect.height < 15) continue;

                const isActive = el.classList.contains('active') ||
                    el.getAttribute('aria-selected') === 'true' ||
                    el.classList.contains('selected') ||
                    el.classList.contains('current');

                tabs.push({
                    text: text.replace(/\s+/g, ' ').substring(0, 30),
                    isActive,
                    // Element seçici
                    selector: el.id ? `#${el.id}` : null,
                    tagName: el.tagName,
                    index: Array.from(el.parentElement?.children || []).indexOf(el),
                    parentSelector: el.parentElement?.className ? '.' + el.parentElement.className.split(' ')[0] : null,
                    y: Math.round(rect.top)
                });
            }
            return tabs;
        });

        // Aktif olmayan tab'lara tıkla
        const inactiveTabs = tabButtons.filter(t => !t.isActive);
        if (inactiveTabs.length > 0 && tabButtons.length <= 8) {
            if (verbose) console.log(`🔀 [MenuParser] Found ${tabButtons.length} tabs (${inactiveTabs.length} inactive)`);

            for (let ti = 0; ti < inactiveTabs.length; ti++) {
                const tab = inactiveTabs[ti];
                try {
                    // Tab'a tıkla
                    const clicked = await page.evaluate((tabInfo) => {
                        // Önce selector ile dene
                        if (tabInfo.selector) {
                            const el = document.querySelector(tabInfo.selector);
                            if (el) { el.click(); return true; }
                        }
                        // Text ile bul
                        const allEls = document.querySelectorAll('button, a, [role="tab"], li');
                        for (const el of allEls) {
                            if (el.textContent?.trim().replace(/\s+/g, ' ') === tabInfo.text) {
                                el.click();
                                return true;
                            }
                        }
                        return false;
                    }, tab);

                    if (!clicked) continue;
                    await new Promise(r => setTimeout(r, 1500));

                    if (verbose) console.log(`   🔀 [MenuParser] Switched to tab: "${tab.text}"`);

                    // Tab içeriğini yakala: üste git + screenshot + scroll
                    await page.evaluate(() => window.scrollTo(0, 0));
                    await new Promise(r => setTimeout(r, 300));

                    const tabMainPath = path.join(screenshotDir, `tab_${ti}_${timestamp}.png`);
                    await page.screenshot({ path: tabMainPath, fullPage: false });
                    screenshots.push({
                        path: tabMainPath,
                        name: `tab_${ti}_main`,
                        context: `Sekme: "${tab.text}" - Tüm ürünleri listele`
                    });

                    // Tab içinde scroll
                    for (let ts = 1; ts <= 4; ts++) {
                        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
                        await new Promise(r => setTimeout(r, 600));

                        const atBottom = await page.evaluate(() =>
                            window.scrollY >= document.documentElement.scrollHeight - window.innerHeight - 10
                        );

                        const tabScrollPath = path.join(screenshotDir, `tab_${ti}_s${ts}_${timestamp}.png`);
                        await page.screenshot({ path: tabScrollPath, fullPage: false });
                        screenshots.push({
                            path: tabScrollPath,
                            name: `tab_${ti}_scroll_${ts}`,
                            context: `Sekme: "${tab.text}" - scroll ${ts}`
                        });

                        if (atBottom) break;
                    }
                } catch (e) {
                    if (verbose) console.log(`   ⚠️ [MenuParser] Tab "${tab.text}" error: ${e.message}`);
                }
            }

            // İlk tab'a geri dön (varsa)
            if (tabButtons.some(t => t.isActive)) {
                const activeTab = tabButtons.find(t => t.isActive);
                await page.evaluate((tabText) => {
                    const allEls = document.querySelectorAll('button, a, [role="tab"], li');
                    for (const el of allEls) {
                        if (el.textContent?.trim().replace(/\s+/g, ' ') === tabText) {
                            el.click(); break;
                        }
                    }
                }, activeTab.text);
                await new Promise(r => setTimeout(r, 500));
            }

            // Başa dön
            await page.evaluate(() => window.scrollTo(0, 0));
            await new Promise(r => setTimeout(r, 300));
        }

        // 3. KATEGORİ KEŞFİ - Link-based (en güvenilir yöntem)
        const categoryLinks = await page.evaluate(() => {
            const links = [];
            const seenHrefs = new Set();
            const currentPath = window.location.pathname;

            // Tüm <a> linklerini tara
            document.querySelectorAll('a[href]').forEach(a => {
                const href = a.href;
                const text = a.textContent?.trim();
                const rect = a.getBoundingClientRect();

                // Filtrele:
                if (!href || !text || text.length < 2 || text.length > 50) return;
                if (seenHrefs.has(href)) return;
                if (rect.width < 30 || rect.height < 15) return; // Çok küçük

                // Aynı domain ve menü/kategori gibi görünen linkler
                const url = new URL(href, window.location.origin);
                if (url.origin !== window.location.origin) return; // Farklı domain

                // URL'nin menü ile ilgili olduğunu kontrol et
                const urlPath = url.pathname.toLowerCase();
                const isMenuRelated = urlPath.includes('menu') || urlPath.includes('kategori') ||
                    urlPath.includes('category') || urlPath.includes('urun') || urlPath.includes('product') ||
                    urlPath.includes('yemek') || urlPath.includes('food') || urlPath.includes('lezzet');

                // Mevcut sayfanın alt sayfası mı?
                const isSubPage = urlPath.startsWith(currentPath) && urlPath !== currentPath && urlPath.length > currentPath.length;

                // Nav linkleri değil
                const navTexts = ['anasayfa', 'hakkımızda', 'iletişim', 'blog', 'kariyer', 'destek',
                    'giriş', 'kayıt', 'sepet', 'kampanya', 'şube', 'kurumsal', 'home', 'about', 'contact'];
                const isNav = navTexts.some(n => text.toLowerCase().includes(n));

                if ((isMenuRelated || isSubPage) && !isNav) {
                    seenHrefs.add(href);
                    links.push({
                        href: href,
                        name: text.replace(/\s+/g, ' ').substring(0, 40),
                        isSubPage: isSubPage,
                        y: Math.round(rect.top)
                    });
                }
            });

            // Eğer link bulunamadıysa, tıklanabilir büyük kartları da ara
            if (links.length === 0) {
                document.querySelectorAll('[onclick], [data-href], .category, .menu-category, [class*="kategori"]').forEach(el => {
                    const text = el.textContent?.trim();
                    const rect = el.getBoundingClientRect();
                    if (text && text.length >= 2 && text.length <= 40 && rect.width > 100 && rect.height > 50) {
                        links.push({
                            href: null,
                            name: text.replace(/\s+/g, ' ').substring(0, 40),
                            clickSelector: el.tagName + (el.className ? '.' + el.className.split(' ')[0] : ''),
                            y: Math.round(rect.top)
                        });
                    }
                });
            }

            return links.sort((a, b) => a.y - b.y);
        });

        if (verbose) console.log(`📋 [MenuParser] Found ${categoryLinks.length} category links`);

        // Kategori linki yoksa → tek sayfalık menü, derin scroll yap
        if (categoryLinks.length === 0) {
            if (verbose) console.log(`📜 [MenuParser] No category links - deep scrolling main page...`);

            // Sayfa sonuna kadar scroll + screenshot
            await this._deepScrollCapture(page, screenshotDir, screenshots, timestamp, 'main', null, verbose);

            if (verbose) console.log(`📸 [MenuParser] Total screenshots: ${screenshots.length}`);
        }

        // 4. Her kategoriye git, scroll yap, screenshot al, geri dön
        let categoryPagesVisited = 0;
        for (let i = 0; i < Math.min(categoryLinks.length, 20); i++) {
            try {
                const cat = categoryLinks[i];
                await this.closePopups(page);

                if (cat.href) {
                    // Link varsa navigate et
                    const originalUrl = page.url();
                    await page.goto(cat.href, { waitUntil: 'networkidle2', timeout: 15000 }).catch(() => { });
                    await new Promise(r => setTimeout(r, 3000));

                    // Aynı sayfaya mı geldik? (hash ve query hariç pathname karşılaştır)
                    const newUrl = page.url();
                    try {
                        const origPath = new URL(originalUrl).pathname;
                        const newPath = new URL(newUrl).pathname;
                        if (origPath === newPath) {
                            if (verbose) console.log(`   ⏩ [MenuParser] Category "${cat.name}" links to same page - skipping`);
                            continue;
                        }
                    } catch (e) { /* URL parse hatası - devam et */ }
                } else {
                    // Link yoksa text'e tıkla
                    const clicked = await page.evaluate((catName) => {
                        const allElements = document.querySelectorAll('*');
                        for (const el of allElements) {
                            if (el.textContent?.trim() === catName && el.children.length === 0) {
                                el.click();
                                return true;
                            }
                        }
                        return false;
                    }, cat.name);
                    if (!clicked) continue;
                    await new Promise(r => setTimeout(r, 3000));
                }

                // Sayfanın üstüne git
                await page.evaluate(() => window.scrollTo(0, 0));
                await new Promise(r => setTimeout(r, 500));

                // Gerçek kategori adını sayfadan çıkar (H1, title, veya URL'den)
                const realCatName = await page.evaluate((fallbackName) => {
                    // 1. H1'den al
                    const h1 = document.querySelector('h1');
                    if (h1 && h1.textContent?.trim().length > 1 && h1.textContent.trim().length < 50) {
                        return h1.textContent.trim();
                    }
                    // 2. H2'den al
                    const h2 = document.querySelector('h2');
                    if (h2 && h2.textContent?.trim().length > 1 && h2.textContent.trim().length < 50) {
                        return h2.textContent.trim();
                    }
                    // 3. URL path'inden çıkar (örn: /menu/kebap/ → Kebap)
                    const pathParts = window.location.pathname.split('/').filter(p => p.length > 0);
                    const lastPart = pathParts[pathParts.length - 1];
                    if (lastPart && lastPart.length > 1 && lastPart.length < 40) {
                        // URL decode + capitalize: "kebap" → "Kebap", "tatli-cesitleri" → "Tatlı Çeşitleri"
                        return decodeURIComponent(lastPart)
                            .replace(/-/g, ' ')
                            .replace(/\b\w/g, c => c.toUpperCase());
                    }
                    return fallbackName;
                }, cat.name);

                const categoryName = realCatName || cat.name;

                // İlk screenshot
                const catPath = path.join(screenshotDir, `cat_${i}_${timestamp}.png`);
                await page.screenshot({ path: catPath, fullPage: false });
                screenshots.push({
                    path: catPath,
                    name: `category_${i}`,
                    context: `Kategori: ${categoryName} - Tüm ürünleri listele`
                });
                if (verbose) console.log(`   📂 [MenuParser] Category "${categoryName}" captured`);
                categoryPagesVisited++;

                // Derin scroll - sayfa sonuna kadar (max 8 scroll)
                let prevHeight = 0;
                for (let scrollIdx = 0; scrollIdx < 8; scrollIdx++) {
                    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.75));
                    await new Promise(r => setTimeout(r, 600));

                    // Sayfa sonuna ulaştık mı kontrol et
                    const currentScroll = await page.evaluate(() => ({
                        scrollY: window.scrollY,
                        maxScroll: document.documentElement.scrollHeight - window.innerHeight
                    }));

                    if (currentScroll.scrollY >= currentScroll.maxScroll - 10) {
                        // Son pozisyonu da yakala
                        const endPath = path.join(screenshotDir, `cat_${i}_end_${timestamp}.png`);
                        await page.screenshot({ path: endPath, fullPage: false });
                        screenshots.push({
                            path: endPath,
                            name: `category_${i}_end`,
                            context: `Kategori: ${categoryName} - sayfa sonu`
                        });
                        break;
                    }

                    // Aynı yerde kalıyorsak dur
                    if (currentScroll.scrollY === prevHeight && scrollIdx > 0) break;
                    prevHeight = currentScroll.scrollY;

                    const catScrollPath = path.join(screenshotDir, `cat_${i}_s${scrollIdx + 1}_${timestamp}.png`);
                    await page.screenshot({ path: catScrollPath, fullPage: false });
                    screenshots.push({
                        path: catScrollPath,
                        name: `category_${i}_scroll_${scrollIdx + 1}`,
                        context: `Kategori: ${categoryName} - scroll ${scrollIdx + 1}`
                    });
                }

                // Menü ana sayfasına geri dön
                await page.goto(startUrl, { waitUntil: 'networkidle2', timeout: 15000 }).catch(() => { });
                await new Promise(r => setTimeout(r, 2000));
            } catch (e) {
                if (verbose) console.log(`   ⚠️ [MenuParser] Could not capture category ${i}: ${e.message}`);
                // Hata durumunda ana sayfaya dön
                try { await page.goto(startUrl, { waitUntil: 'networkidle2', timeout: 10000 }); } catch (e2) { }
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        // Eğer kategori linkleri vardı ama hepsi aynı sayfaya gidiyorsa → deep scroll yap
        if (categoryLinks.length > 0 && categoryPagesVisited === 0) {
            if (verbose) console.log(`📜 [MenuParser] All ${categoryLinks.length} category links were same-page - deep scrolling...`);
            await page.goto(startUrl, { waitUntil: 'networkidle2', timeout: 15000 }).catch(() => { });
            await new Promise(r => setTimeout(r, 2000));
            await this.closePopups(page);
            await page.evaluate(() => window.scrollTo(0, 0));
            await new Promise(r => setTimeout(r, 500));
            await this._deepScrollCapture(page, screenshotDir, screenshots, timestamp, 'main', null, verbose);
            if (verbose) console.log(`📸 [MenuParser] Total screenshots after deep scroll: ${screenshots.length}`);
        }

        return screenshots;
    }

    /**
     * Gemini Vision ile screenshot'ı analiz et
     */
    async analyzeWithGemini(imagePath, context = '') {
        const imageData = fs.readFileSync(imagePath);
        const base64Image = imageData.toString('base64');

        const prompt = `
Sen bir restoran menüsü analizörüsün. Bu ekran görüntüsünde görünen yiyecek ve içecek ürünlerini çıkar.

Bağlam: ${context}

Her ürün için şu bilgileri JSON formatında döndür:
- name: Ürün adı (Türkçe karakterleri koru)
- price: Fiyat (sayı olarak, yoksa 0)
- category: Ürünün ait olduğu kategori (AŞAĞIDAKİ KURALLARA GÖRE)
- description: Açıklama (varsa)

KATEGORİ ATAMA KURALLARI (ÖNCELİK SIRASI):
1. Eğer bağlam "Kategori: X" diyorsa, tüm ürünlerin kategorisi "X" olsun
2. Eğer screenshot'ta büyük fontlu KATEGORİ BAŞLIKLARI varsa (örn: "Çorbalar", "Başlangıçlar", "Ana Yemekler", "Tatlılar", "İçecekler"), her ürünü ÜSTÜNDE görünen en yakın başlığa ata
3. Hiçbiri yoksa "Genel" yaz

DİĞER KURALLAR:
1. Gerçek satılan ürünleri çıkar (yiyecek/içecekler)
2. KATEGORİ BAŞLIKLARINI ÜRÜN OLARAK ALMA (büyük fontlu başlıklar ürün DEĞİL)
3. Fiyat görünüyorsa mutlaka yaz, görünmüyorsa 0 yaz
4. Butonları, arama çubuğunu, navigasyonu ALMA
5. "Kase Kase Lezzet" gibi slogan/alt başlıkları ÜRÜN OLARAK ALMA

JSON format:
[{"name": "Ürün Adı", "price": 150, "category": "Kategori", "description": ""}]

Hiç ürün yoksa boş array döndür: []
`;

        try {
            const result = await this.retryWithBackoff(async () => {
                return await this.model.generateContent([
                    { text: prompt },
                    {
                        inlineData: {
                            mimeType: 'image/png',
                            data: base64Image
                        }
                    }
                ]);
            });

            const response = result.response.text();
            console.log(`   📝 [Gemini] Response length: ${response.length} chars`);

            // JSON çıkar
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const items = JSON.parse(jsonMatch[0]);
                console.log(`   ✅ [Gemini] Found ${items.length} items`);
                return Array.isArray(items) ? items : [];
            }

            console.log(`   ⚠️ [Gemini] No JSON array in response`);
            return [];
        } catch (error) {
            console.error(`   ❌ [Gemini] Analysis error: ${error.message}`);
            if (error.message.includes('API key')) {
                console.error('   💡 Tip: Check your GEMINI_API_KEY in .env file');
            }
            return [];
        }
    }

    /**
     * Menü verilerini düzenle ve tekrarları kaldır
     */
    organizeMenuData(allItems, sourceUrl) {
        // Tekrarları kaldır (isim bazlı)
        const uniqueItems = [];
        const seenNames = new Set();

        // Bilinen kategori başlıkları (filtre edilecek)
        const knownCategories = new Set([
            // Genel kategoriler
            'zeytin ve zeytinyağı', 'yemekler', 'alkollü içecekler', 'çerez',
            'suşi zamanı', 'içecekler', 'kahveler', 'tatlı', 'kokteyl',
            'çorbalar', 'ana yemekler', 'salatalar', 'mezeler', 'ara sıcaklar',
            'soğuk mezeler', 'sıcak mezeler', 'makarnalar', 'pizzalar',
            'burgerler', 'sandviçler', 'tost', 'kahvaltı', 'detox', 'yiyecekler',
            // Starbucks kategorileri
            'kısa süreliğine seninle', 'espresso bazlı içecekler', 'filtre kahveler',
            'protein içecekler', 'starbucks refresha drinks', 'starbucks refresha® drinks',
            'frappuccino® karışım içecekler', 'frappuccino karışım içecekler',
            'matcha ve tea latte', 'starbucks® çay çeşitleri', 'starbucks çay çeşitleri',
            'türk kahvesi', 'sıcak çikolata', 'dondurmalı içecekler', 'portakal suyu',
            'şişelenmiş içecekler', 'cheesecakeler', 'pasta ve kekler', 'muffin & cookie',
            'kahvaltılık ürünler', 'sandviç & tost', 'kahve ekipmanları', 'her zaman seninle',
            'demleme ekipmanları', 'şehir temalı kupalar', 'demleme yöntemleri',
            'çekirdek kahveler', 'via', 'kapsül kahveler', 'evde kahve keyfi'
        ]);

        for (const item of allItems) {
            const normalizedName = item.name?.toLowerCase().trim();
            const category = (item.category || 'Genel').toLowerCase().trim();
            const dedupKey = `${normalizedName}|||${category}`;

            // Kategori başlıklarını filtrele - sadece bilinen kategori isimleri
            const isCategoryTitle = normalizedName && knownCategories.has(normalizedName);

            if (normalizedName && !seenNames.has(dedupKey) && !isCategoryTitle) {
                seenNames.add(dedupKey);
                uniqueItems.push({
                    name: item.name.trim(),
                    price: parseInt(item.price) || 0,
                    category: item.category || 'Genel',
                    description: item.description || ''
                });
            }
        }

        // Sahte/placeholder kategorileri filtrele
        const junkCategories = new Set([
            'Genel', 'Menü Kategorileri', 'Menü', 'Menu', 'Ana Sayfa',
            'Homepage', 'Kategoriler', 'Categories'
        ]);

        // Kategori normalizasyon fonksiyonu - benzer isimleri birleştirmek için
        const normalizeCategory = (cat) => {
            let norm = cat.toLowerCase()
                .replace(/\s*\/\s*/g, '/') // " / " → "/"
                .replace(/\s+/g, ' ')      // Fazla boşlukları temizle
                .trim();
            // İngilizce çoğul → tekil
            norm = norm.replace(/\bdrinks\b/g, 'drink')
                .replace(/\bwines\b/g, 'wine')
                .replace(/\bmeals\b/g, 'meal')
                .replace(/\bappetizers\b/g, 'appetizer')
                .replace(/\bdesserts\b/g, 'dessert')
                .replace(/\bsalads\b/g, 'salad')
                .replace(/\bsoups\b/g, 'soup');
            // Türkçe yaygın varyasyonlar
            norm = norm.replace(/\bmezeller\b/g, 'mezeler')
                .replace(/\baperatifl?er\b/g, 'appetizer')
                .replace(/\bwhit\b/g, 'with');
            return norm;
        };

        // Kategori isim mapping: normalize → ilk görülen orijinal isim
        const categoryNameMap = {};

        // Önce gerçek kategorilerdeki tüm ürün isimlerini topla
        const realCategoryItemNames = new Set();
        for (const item of uniqueItems) {
            if (!junkCategories.has(item.category)) {
                realCategoryItemNames.add(item.name.toLowerCase().trim());
            }
        }

        // Kategorilere göre grupla (benzer isimli kategorileri birleştir + junk kaldır)
        const categoryMap = {};
        const globalSeenItems = new Set(); // Tüm kategoriler arası global dedup

        for (const item of uniqueItems) {
            // Junk kategorideki item zaten gerçek bir kategoride varsa atla
            if (junkCategories.has(item.category)) {
                if (realCategoryItemNames.has(item.name.toLowerCase().trim())) {
                    continue; // Duplicate - atla
                }
                // Gerçek kategoride yoksa "Diğer" olarak ekle
                item.category = 'Diğer';
            }

            // Kategori normalizasyonu ile merge
            const normCat = normalizeCategory(item.category);
            if (!categoryNameMap[normCat]) {
                categoryNameMap[normCat] = item.category; // İlk görülen ismi kullan
            }
            const finalCategory = categoryNameMap[normCat];

            // Global dedup: aynı ürün ismi sadece bir kez eklenir (herhangi bir kategoride)
            const globalKey = item.name.toLowerCase().trim();
            if (globalSeenItems.has(globalKey)) continue;
            globalSeenItems.add(globalKey);

            if (!categoryMap[finalCategory]) {
                categoryMap[finalCategory] = [];
            }
            categoryMap[finalCategory].push({
                name: item.name,
                price: item.price,
                description: item.description
            });
        }

        // Final format
        let categories = Object.keys(categoryMap).map(name => ({
            name,
            items: categoryMap[name]
        }));

        // "Diğer" kategorisindeki ürünleri anahtar kelime ile doğru kategoriye ata
        const digerIdx = categories.findIndex(c => c.name === 'Diğer');
        if (digerIdx !== -1 && categories.length > 1) {
            const digerItems = categories[digerIdx].items;
            const remainingDiger = [];

            // Anahtar kelime → kategori eşleştirme kuralları
            const keywordRules = [
                {
                    keywords: ['rakı', 'raki', 'votka', 'vodka', 'viski', 'whisky', 'whiskey', 'tequila', 'cin ', 'gin ', 'likör', 'liqueur', 'bira', 'beer', 'efes', 'tuborg', 'heineken', 'corona', 'miller', 'absolute', 'istanblue', 'chivas', 'jack daniel', 'ballantine', 'beylerbeyi', 'efe gold', 'altın seri', 'yeni seri', 'bremer', 'blanc', 'bomonti'],
                    categoryMatch: ['alkollü', 'alchol', 'alcohol', 'spirit', 'içki']
                },
                {
                    keywords: ['şarap', 'wine', 'cabernet', 'merlot', 'syrah', 'chardonnay', 'sauvignon', 'öküzgözü', 'kalecik', 'boğazkere', 'narince', 'emir', 'muskat', 'şampanya', 'champagne', 'prosecco', 'kocabağ', 'turasan'],
                    categoryMatch: ['şarap', 'wine']
                },
                {
                    keywords: ['kadeh'],
                    categoryMatch: ['kadeh']
                },
                {
                    keywords: ['çay', 'kahve', 'coffee', 'tea', 'cola', 'fanta', 'sprite', 'ayran', 'limonata', 'su ', 'soda', 'meşrubat', 'meyve suyu', 'juice', 'smoothie', 'nescafe'],
                    categoryMatch: ['alkolsüz', 'soft drink', 'içecek']
                },
                {
                    keywords: ['kebap', 'kebab', 'köfte', 'steak', 'tavuk', 'chicken', 'et ', 'meat', 'balık', 'fish', 'izgara', 'grill', 'pide', 'lahmacun'],
                    categoryMatch: ['ana yemek', 'meal', 'yemek']
                },
                {
                    keywords: ['salata', 'meze', 'appetizer', 'başlangıç', 'humus', 'cacık', 'ezme', 'börek', 'sigara'],
                    categoryMatch: ['meze', 'appetizer', 'salata', 'başlangıç']
                },
                {
                    keywords: ['tatlı', 'dessert', 'baklava', 'künefe', 'dondurma', 'pasta', 'cake', 'profiterol', 'cheesecake', 'tiramisu', 'sütlaç'],
                    categoryMatch: ['tatlı', 'dessert']
                },
            ];

            for (const item of digerItems) {
                const nameLower = item.name.toLowerCase();
                let assigned = false;

                for (const rule of keywordRules) {
                    const matchesKeyword = rule.keywords.some(kw => nameLower.includes(kw));
                    if (!matchesKeyword) continue;

                    // Bu kurala uyan en iyi kategoriyi bul
                    const targetCat = categories.find(c => {
                        if (c.name === 'Diğer') return false;
                        const catLower = c.name.toLowerCase();
                        return rule.categoryMatch.some(cm => catLower.includes(cm));
                    });

                    if (targetCat) {
                        // Duplicate kontrolü
                        const exists = targetCat.items.some(existing =>
                            existing.name.toLowerCase().trim() === nameLower.trim()
                        );
                        if (!exists) {
                            targetCat.items.push(item);
                        }
                        assigned = true;
                        break;
                    }
                }

                if (!assigned) {
                    remainingDiger.push(item);
                }
            }

            // Diğer'i güncelle veya tamamen kaldır
            if (remainingDiger.length === 0) {
                categories.splice(digerIdx, 1);
            } else {
                categories[digerIdx].items = remainingDiger;
            }
        }

        const actualTotalItems = categories.reduce((sum, cat) => sum + cat.items.length, 0);

        return {
            source: 'Gemini Vision AI',
            parsed_at: new Date().toISOString(),
            menu_url: sourceUrl,
            restaurant: this.extractRestaurantName(sourceUrl),
            totalItems: actualTotalItems,
            categories
        };
    }

    /**
     * URL'den restoran adını çıkarmaya çalış
     */
    extractRestaurantName(url) {
        try {
            const urlObj = new URL(url);
            // URL parametrelerinden veya hostname'den çıkar
            return urlObj.hostname.split('.')[0] || 'Restaurant';
        } catch {
            return 'Restaurant';
        }
    }

    /**
     * Sonucu dosyaya kaydet
     */
    async saveToFile(menuData, outputPath) {
        fs.writeFileSync(outputPath, JSON.stringify(menuData, null, 2), 'utf8');
        console.log(`💾 [MenuParser] Saved to: ${outputPath}`);
    }
}

module.exports = MenuParser;

// CLI kullanımı için
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log('Usage: node menuParser.js <menu_url> [api_key]');
        console.log('Example: node menuParser.js https://example.com/menu');
        process.exit(1);
    }

    const url = args[0];
    const apiKey = args[1] || process.env.GEMINI_API_KEY;

    const parser = new MenuParser(apiKey);
    parser.parseMenu(url).then(data => {
        parser.saveToFile(data, path.join(__dirname, 'parsed_menu.json'));
    }).catch(err => {
        console.error('Parse failed:', err.message);
        process.exit(1);
    });
}
