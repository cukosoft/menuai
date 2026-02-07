/**
 * SmartScroll v2 — Resilient Scroll Engine
 * 
 * SPA'larda scroll resetlerini kökten çözer.
 * 
 * Yaklaşım:
 * 1. Container tespit — asıl scrollable elementi bulur
 * 2. Incremental scroll — küçük adımlarla, her adımda pozisyon doğrula
 * 3. Reset resilience — pozisyon sıfırlanırsa geri dön + bekle + devam et
 * 4. Multi-method — touch > keyboard > JS > container (başarılı olanı kullanır)
 * 5. Pixel tracking — gerçek pixel hareketini izler, DOM değişikliklerini yakalar
 */

const path = require('path');

class SmartScroll {
    constructor(options = {}) {
        this.verbose = options.verbose !== false;
        this.maxScrolls = options.maxScrolls || 60;
        this.scrollDelay = options.scrollDelay || 600;
        this.viewportOverlap = 0.15; // Screenshot'lar arasında %15 örtüşme
    }

    log(...args) {
        if (this.verbose) console.log('   🔄', ...args);
    }

    sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    // ═══════════════════════════════════════════════════════════
    // Container Tespiti (SPA-aware)
    // ═══════════════════════════════════════════════════════════
    async detectScrollContainer(page) {
        return await page.evaluate(() => {
            const docScrollable = document.documentElement.scrollHeight > window.innerHeight;
            const candidates = [];

            document.querySelectorAll('*').forEach(el => {
                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                const isScrollable =
                    (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
                    el.scrollHeight > el.clientHeight + 100;
                const coversViewport = rect.width > window.innerWidth * 0.5 && rect.height > window.innerHeight * 0.3;

                if (isScrollable && coversViewport) {
                    // Unique selector oluştur
                    let selector = '';
                    if (el.id) selector = `#${el.id}`;
                    else if (el.getAttribute('data-testid')) selector = `[data-testid="${el.getAttribute('data-testid')}"]`;
                    else {
                        // CSS path
                        const classes = Array.from(el.classList).filter(c => !c.includes(':') && c.length < 30).slice(0, 2);
                        selector = classes.length > 0 ? `.${classes.join('.')}` : el.tagName.toLowerCase();
                    }

                    candidates.push({
                        selector,
                        scrollHeight: el.scrollHeight,
                        clientHeight: el.clientHeight,
                        scrollableAmount: el.scrollHeight - el.clientHeight,
                        isMainContent: rect.height > window.innerHeight * 0.7
                    });
                }
            });

            candidates.sort((a, b) => b.scrollableAmount - a.scrollableAmount);

            return {
                docScrollable,
                docScrollHeight: document.documentElement.scrollHeight,
                windowHeight: window.innerHeight,
                bestContainer: candidates.length > 0 ? candidates[0] : null,
                containerCount: candidates.length
            };
        });
    }

    // ═══════════════════════════════════════════════════════════
    // Scroll Methodları
    // ═══════════════════════════════════════════════════════════

    async scrollViaTouch(page, distance) {
        const centerX = 215;
        const startY = 750;
        const steps = 8;

        await page.touchscreen.touchStart(centerX, startY);
        for (let i = 1; i <= steps; i++) {
            const y = startY - (distance * i / steps);
            await page.touchscreen.touchMove(centerX, Math.max(y, 50));
            await this.sleep(25);
        }
        await page.touchscreen.touchEnd();
    }

    async scrollViaKeyboard(page) {
        await page.evaluate(() => { document.body.focus(); document.body.click(); });
        await this.sleep(50);
        await page.keyboard.press('PageDown');
    }

    async scrollViaJS(page, distance, containerSelector) {
        if (containerSelector) {
            await page.evaluate((sel, d) => {
                const el = document.querySelector(sel);
                if (el) el.scrollTop += d;
            }, containerSelector, distance);
        } else {
            await page.evaluate((d) => window.scrollBy(0, d), distance);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // Pozisyon Oku (container-aware)
    // ═══════════════════════════════════════════════════════════
    async getPosition(page, containerSelector) {
        return await page.evaluate((sel) => {
            if (sel) {
                const el = document.querySelector(sel);
                if (el) return {
                    y: Math.round(el.scrollTop),
                    max: Math.round(el.scrollHeight - el.clientHeight),
                    height: el.scrollHeight,
                    type: 'container'
                };
            }
            return {
                y: Math.round(window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0),
                max: Math.round(document.documentElement.scrollHeight - window.innerHeight),
                height: document.documentElement.scrollHeight,
                type: 'window'
            };
        }, containerSelector);
    }

    // ═══════════════════════════════════════════════════════════
    // En İyi Scroll Yöntemini Test Et
    // ═══════════════════════════════════════════════════════════
    async findBestMethod(page, containerSelector) {
        // Başa dön
        await this.resetToTop(page, containerSelector);
        await this.sleep(300);

        const methods = ['touch', 'keyboard', 'js'];
        const distance = 400;
        let bestMethod = 'js'; // fallback
        let bestDelta = 0;

        for (const method of methods) {
            // Başa dön
            await this.resetToTop(page, containerSelector);
            await this.sleep(300);

            const before = await this.getPosition(page, containerSelector);

            try {
                if (method === 'touch') await this.scrollViaTouch(page, distance);
                else if (method === 'keyboard') await this.scrollViaKeyboard(page);
                else await this.scrollViaJS(page, distance, containerSelector);
            } catch (e) { continue; }

            await this.sleep(500);
            const after = await this.getPosition(page, containerSelector);

            const delta = after.y - before.y;
            this.log(`Test ${method}: ${before.y} → ${after.y} (delta: ${delta}px)`);

            if (delta > bestDelta) {
                bestDelta = delta;
                bestMethod = method;
            }
        }

        // Başa dön
        await this.resetToTop(page, containerSelector);
        await this.sleep(500);

        this.log(`En iyi yöntem: ${bestMethod} (${bestDelta}px/adım)`);
        return { method: bestMethod, stepSize: bestDelta || distance };
    }

    async resetToTop(page, containerSelector) {
        if (containerSelector) {
            await page.evaluate((sel) => {
                const el = document.querySelector(sel);
                if (el) el.scrollTop = 0;
            }, containerSelector);
        } else {
            await page.evaluate(() => window.scrollTo(0, 0));
        }
    }

    // ═══════════════════════════════════════════════════════════
    // Tek Adım Scroll
    // ═══════════════════════════════════════════════════════════
    async doScroll(page, method, distance, containerSelector) {
        try {
            if (method === 'touch') await this.scrollViaTouch(page, distance);
            else if (method === 'keyboard') await this.scrollViaKeyboard(page);
            else await this.scrollViaJS(page, distance, containerSelector);
            await this.sleep(this.scrollDelay);
            return true;
        } catch (e) {
            return false;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // ANA FONKSİYON: Scroll + Screenshot
    // ═══════════════════════════════════════════════════════════
    async scrollAndCapture(page, screenshotDir, prefix = 'scroll') {
        const screenshots = [];
        const timestamp = Date.now();

        // ─── 1. Container tespit ───
        const containerInfo = await this.detectScrollContainer(page);
        let containerSelector = null;

        if (containerInfo.bestContainer && containerInfo.bestContainer.scrollableAmount > 500) {
            containerSelector = containerInfo.bestContainer.selector;
            this.log(`Container: ${containerSelector} (${containerInfo.bestContainer.scrollableAmount}px)`);
        } else {
            this.log(`Window scroll (sayfa: ${containerInfo.docScrollHeight}px)`);
        }

        // ─── 2. En iyi scroll yöntemini test et ───
        const { method, stepSize } = await this.findBestMethod(page, containerSelector);
        const scrollDistance = Math.round(932 * (1 - this.viewportOverlap)); // ~792px

        // ─── 3. İlk screenshot ───
        const firstSS = path.join(screenshotDir, `${prefix}_0_${timestamp}.png`);
        await page.screenshot({ path: firstSS, fullPage: false });
        screenshots.push(firstSS);

        // ─── 4. Scroll loop ───
        let prevY = 0;
        let resetCount = 0;
        const maxResets = 5;       // Daha fazla tolerans
        let stuckCount = 0;
        let lastScreenshotY = 0;
        const minScreenshotGap = 200; // Minimum px fark — çok yakın SS alma

        for (let idx = 1; idx <= this.maxScrolls; idx++) {
            // Scroll yap
            await this.doScroll(page, method, scrollDistance, containerSelector);

            // Pozisyon oku
            const pos = await this.getPosition(page, containerSelector);

            // ─── RESET TESPİTİ ───
            if (pos.y <= 10 && prevY > 200) {
                resetCount++;
                this.log(`⚠️ Reset ${resetCount}/${maxResets} @ adım ${idx} (${prevY}px → 0)`);

                if (resetCount >= maxResets) {
                    this.log(`❌ Max reset — ${screenshots.length} screenshot ile devam`);
                    break;
                }

                // Pozisyona geri dön + bekle (SPA'nın stabilize olmasını bekle)
                await this.sleep(1500);

                // Geri dönmeyi dene
                if (containerSelector) {
                    await page.evaluate((sel, y) => {
                        const el = document.querySelector(sel);
                        if (el) el.scrollTop = y;
                    }, containerSelector, prevY);
                } else {
                    await page.evaluate((y) => window.scrollTo(0, y), prevY);
                }
                await this.sleep(2000);

                // Pozisyon kontrol — geri dönebildik mi?
                const recovered = await this.getPosition(page, containerSelector);
                if (recovered.y < prevY * 0.5) {
                    // Geri dönemedik — SPA sayfayı komple değiştirmiş
                    // Yine de scroll etmeye DEVAM ET (sıfırdan)
                    this.log(`🔄 Geri dönemedi (${recovered.y}px) — sıfırdan devam`);
                    prevY = recovered.y;
                    // Screenshot al çünkü farklı content olabilir
                    const ssPath = path.join(screenshotDir, `${prefix}_${idx}_${timestamp}.png`);
                    await page.screenshot({ path: ssPath, fullPage: false });
                    screenshots.push(ssPath);
                } else {
                    this.log(`✅ Pozisyon kurtarıldı: ${recovered.y}px`);
                    prevY = recovered.y;
                }
                continue;
            }

            // ─── TAKILMA TESPİTİ ───
            if (pos.y <= prevY && pos.y > 0) {
                stuckCount++;
                if (stuckCount >= 3) {
                    this.log(`📍 Scroll takılı @ ${pos.y}px — son`);
                    break;
                }
                continue;
            }
            stuckCount = 0;
            prevY = pos.y;

            // ─── SCREENSHOT ───
            // Sadece yeterli fark varsa SS al (gereksiz SS'den kaçın)
            if (pos.y - lastScreenshotY >= minScreenshotGap) {
                const ssPath = path.join(screenshotDir, `${prefix}_${idx}_${timestamp}.png`);
                await page.screenshot({ path: ssPath, fullPage: false });
                screenshots.push(ssPath);
                lastScreenshotY = pos.y;
            }

            // ─── PROGRESS LOG ───
            const pct = Math.round((pos.y / Math.max(pos.max, 1)) * 100);
            if (idx % 5 === 0 || pct >= 95) {
                this.log(`📍 ${pct}% (${pos.y}/${pos.max}px) [${method}] ss:${screenshots.length}`);
            }

            // ─── SAYFA SONU ───
            if (pos.y >= pos.max - 20) {
                this.log(`✅ Sayfa sonu: ${pos.y}/${pos.max}px (${screenshots.length} ss)`);
                break;
            }
        }

        this.log(`📸 ${screenshots.length} screenshot [${method}]`);
        return screenshots;
    }
}

module.exports = SmartScroll;
