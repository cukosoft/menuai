/**
 * MenüAi OCR Overlay v2.0 — Lazy-load aware + proxy-safe
 * Menu görselleri üzerine + butonları bindiren script
 * Orijinal menü görseli korunur, üstüne tıklanabilir katman eklenir
 *
 * Placeholder'lar: __MENUAI_SLUG__ (server.js tarafından set edilir)
 */
(function () {
    var SLUG = "__MENUAI_SLUG__";
    var ORIGIN = window.location.origin;
    var cart = [];
    var ocrData = null;
    var processedImages = {};

    // ═══ TEST: İlk 6 sayfa ile sınırla ═══
    var MAX_PAGE = 10; // Page 5-10 arası (data 5'ten başlıyor)

    console.log("[MenüAi OCR v2] Başlatılıyor — slug:", SLUG, "origin:", ORIGIN);

    // ═══ OCR POZİSYON VERİSİ YÜKLE ═══
    var jsonUrl = ORIGIN + "/ocr-positions-" + SLUG + ".json";
    console.log("[MenüAi OCR v2] JSON fetch:", jsonUrl);

    fetch(jsonUrl)
        .then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            var ct = r.headers.get("content-type") || "";
            if (!ct.includes("json")) throw new Error("Beklenen JSON, gelen: " + ct);
            return r.json();
        })
        .then(function (data) {
            // İlk 6 sayfa ile filtrele
            var filtered = {};
            var allPages = Object.keys(data).sort(function (a, b) { return parseInt(a) - parseInt(b); });
            var count = 0;
            allPages.forEach(function (p) {
                if (parseInt(p) <= MAX_PAGE) {
                    filtered[p] = data[p];
                    count += data[p].items.length;
                }
            });
            ocrData = filtered;
            var pages = Object.keys(filtered);
            console.log("[MenüAi OCR v2] ✅ " + count + " ürün pozisyonu yüklendi (" + pages.length + " sayfa)", pages);
            startOverlay();
        })
        .catch(function (e) {
            console.error("[MenüAi OCR v2] ❌ Pozisyon verisi yüklenemedi:", e.message);
            console.error("[MenüAi OCR v2] URL:", jsonUrl);
        });

    // ═══ MENU ITEMS API (fiyat eşleştirme için) ═══
    var menuItems = [];
    fetch(ORIGIN + "/api/menu-items/" + SLUG)
        .then(function (r) { return r.json(); })
        .then(function (d) {
            if (d.success && d.categories) {
                d.categories.forEach(function (c) {
                    (c.items || []).forEach(function (item) {
                        menuItems.push(item);
                    });
                });
                console.log("[MenüAi OCR v2] " + menuItems.length + " DB ürünü yüklendi");
            }
        })
        .catch(function () { });

    // ═══ OVERLAY ENGINE ═══
    function startOverlay() {
        // İlk taramayı yap
        scanAndApply();

        // Lazy-load'ları zorla yükle
        forceLazyImages();

        // MutationObserver — yeni eklenen img'leri yakala
        var mo = new MutationObserver(function (mutations) {
            var hasNewImg = false;
            mutations.forEach(function (m) {
                if (m.addedNodes) {
                    for (var i = 0; i < m.addedNodes.length; i++) {
                        var node = m.addedNodes[i];
                        if (node.tagName === "IMG" || (node.querySelectorAll && node.querySelectorAll("img").length > 0)) {
                            hasNewImg = true;
                        }
                    }
                }
                // Attribute değişiklikleri (src geçişleri) — lazy load tetiklenmesi
                if (m.type === "attributes" && m.attributeName === "src" && m.target.tagName === "IMG") {
                    hasNewImg = true;
                }
            });
            if (hasNewImg) {
                setTimeout(scanAndApply, 200);
            }
        });
        mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });

        // Scroll'da tekrar kontrol — lazy-load tetiklenince
        window.addEventListener("scroll", debounce(function () {
            scanAndApply();
            forceLazyImages();
        }, 400));

        // Resize'da butonları yeniden konumla
        window.addEventListener("resize", debounce(repositionAllButtons, 300));

        // Periyodik tarama (lazy-load gecikmeli tetiklenir)
        var scanCount = 0;
        var scanInterval = setInterval(function () {
            scanAndApply();
            forceLazyImages();
            scanCount++;
            if (scanCount > 30) clearInterval(scanInterval); // 30 saniye sonra dur
        }, 1000);
    }

    // ═══ LAZY-LOAD ZORLAMA ═══
    function forceLazyImages() {
        // WordPress lazy-load: loading="lazy", data-src, data-lazy-src gibi attribute'lar
        var imgs = document.querySelectorAll('img[loading="lazy"], img[data-src], img[data-lazy-src]');
        imgs.forEach(function (img) {
            // data-src → src geçişi
            var dataSrc = img.getAttribute("data-src") || img.getAttribute("data-lazy-src");
            if (dataSrc && !img.src.includes("Page-")) {
                if (dataSrc.includes("Page-")) {
                    console.log("[MenüAi OCR v2] Lazy-load zorlanıyor:", dataSrc.split("/").pop());
                    img.src = dataSrc;
                    img.removeAttribute("loading");
                }
            }
            // srcset de kontrol et
            var dataSrcset = img.getAttribute("data-srcset");
            if (dataSrcset && !img.srcset) {
                img.srcset = dataSrcset;
            }
        });
    }

    // ═══ SCAN & APPLY ═══
    function scanAndApply() {
        if (!ocrData) return;
        var images = document.querySelectorAll("img");
        var matched = 0;

        images.forEach(function (img) {
            // Zaten işlenmiş mi?
            if (img.dataset.menuaiOcrDone) return;
            // Çok küçük görselleri atla
            if (img.naturalWidth > 0 && img.naturalWidth < 200) return;

            // src, srcset, data-src hepsini kontrol et
            var allSrc = [
                img.src || "",
                img.srcset || "",
                img.dataset.src || "",
                img.dataset.lazySrc || "",
                img.currentSrc || ""
            ].join(" ");

            // Sayfa numarasını URL'den çıkar
            var pageMatch = allSrc.match(/Page[_-](\d+)/i);
            if (!pageMatch) return;
            var pageNum = pageMatch[1];

            // Bu sayfa OCR verimizde var mı?
            if (!ocrData[pageNum]) return;

            // Bu görseli daha önce işledik mi? (src bazlı)
            var imgId = img.src || allSrc.substring(0, 100);
            if (processedImages[imgId]) return;

            img.dataset.menuaiOcrDone = "1";
            img.dataset.menuaiPage = pageNum;
            processedImages[imgId] = true;

            // Görsel yüklendiyse hemen overlay'le, yüklenmediyse bekle
            if (img.complete && img.naturalHeight > 50) {
                createOverlayForImage(img, ocrData[pageNum], pageNum);
                matched++;
            } else {
                img.addEventListener("load", function () {
                    createOverlayForImage(img, ocrData[pageNum], pageNum);
                });
                matched++;
            }
        });

        if (matched > 0) {
            console.log("[MenüAi OCR v2] 🎯 " + matched + " yeni görsele overlay eklendi");
        }
    }

    // ═══ OVERLAY OLUŞTUR ═══
    function createOverlayForImage(img, pageData, pageNum) {
        var imgH = img.offsetHeight || img.naturalHeight;
        var imgW = img.offsetWidth || img.naturalWidth;
        if (imgH < 50 || imgW < 50) return;

        // Wrapper oluştur — img'yi sar
        var parent = img.parentElement;

        // Zaten wrapper eklenmiş mi kontrol et
        if (parent && parent.classList.contains("menuai-ocr-wrapper")) return;

        var wrapper = document.createElement("div");
        wrapper.className = "menuai-ocr-wrapper";
        wrapper.dataset.menuaiPage = pageNum;

        // Wrapper stilini parent'a göre ayarla
        var imgStyle = window.getComputedStyle(img);
        var imgDisplay = imgStyle.display;

        wrapper.style.cssText = "position:relative;display:" +
            (imgDisplay === "block" ? "block" : "inline-block") + ";" +
            "width:" + (img.style.width || imgStyle.width || "100%") + ";" +
            "max-width:100%;";

        // img'nin mevcut class ve style'ını koru
        parent.insertBefore(wrapper, img);
        wrapper.appendChild(img);

        // Butonları yerleştir
        placeButtonsOnWrapper(wrapper, img, pageData, pageNum);
    }

    function placeButtonsOnWrapper(wrapper, img, pageData, pageNum) {
        var imgH = img.offsetHeight || img.naturalHeight;
        if (imgH < 50) return;

        var btnCount = 0;
        pageData.items.forEach(function (item) {
            if (!item.name || item.y_percent === undefined) return;
            // Fiyatsız kategori başlıklarını atla
            if (item.price === null && isLikelyCategoryHeader(item.name)) return;

            var btn = document.createElement("button");
            btn.className = "menuai-ocr-btn";
            btn.textContent = "+";
            btn.title = item.name + (item.price ? " — ₺" + item.price : "");
            btn.dataset.itemName = item.name;
            btn.dataset.itemPrice = item.price || 0;
            btn.dataset.yPercent = item.y_percent;

            // Y pozisyonu hesapla
            var yPos = (item.y_percent / 100) * imgH;
            btn.style.cssText = "position:absolute;" +
                "right:6px;" +
                "top:" + yPos + "px;" +
                "transform:translateY(-50%);" +
                "width:34px;height:34px;" +
                "border-radius:50%;" +
                "border:2px solid rgba(255,255,255,.85);" +
                "background:linear-gradient(135deg,#e85d3a,#f0784a);" +
                "color:#fff;" +
                "font-size:20px;" +
                "font-weight:700;" +
                "cursor:pointer;" +
                "box-shadow:0 2px 12px rgba(232,93,58,.6);" +
                "z-index:100;" +
                "display:flex;align-items:center;justify-content:center;" +
                "transition:transform .15s,background .2s,box-shadow .2s;" +
                "font-family:Inter,system-ui,sans-serif;" +
                "line-height:1;padding:0;" +
                "-webkit-tap-highlight-color:transparent;";

            // Hover effect
            btn.addEventListener("mouseenter", function () {
                btn.style.transform = "translateY(-50%) scale(1.15)";
                btn.style.boxShadow = "0 4px 20px rgba(232,93,58,.7)";
            });
            btn.addEventListener("mouseleave", function () {
                btn.style.transform = "translateY(-50%) scale(1)";
                btn.style.boxShadow = "0 2px 12px rgba(232,93,58,.6)";
            });

            // Click
            btn.addEventListener("click", function (e) {
                e.preventDefault();
                e.stopPropagation();
                var price = item.price || findPriceInDB(item.name) || 0;
                addToCart(item.name, price);
                btn.textContent = "✓";
                btn.style.background = "linear-gradient(135deg,#22c55e,#16a34a)";
                btn.style.border = "2px solid rgba(255,255,255,.85)";
                setTimeout(function () {
                    btn.textContent = "+";
                    btn.style.background = "linear-gradient(135deg,#e85d3a,#f0784a)";
                }, 900);
            });

            wrapper.appendChild(btn);
            btnCount++;
        });

        console.log("[MenüAi OCR v2] Page " + pageNum + ": " + btnCount + " buton yerleştirildi (imgH=" + imgH + "px)");
    }

    // ═══ REPOSITION (resize için) ═══
    function repositionAllButtons() {
        var wrappers = document.querySelectorAll(".menuai-ocr-wrapper");
        wrappers.forEach(function (wrapper) {
            var img = wrapper.querySelector("img");
            if (!img) return;
            var imgH = img.offsetHeight;
            if (imgH < 50) return;

            var btns = wrapper.querySelectorAll(".menuai-ocr-btn");
            btns.forEach(function (btn) {
                var yPct = parseFloat(btn.dataset.yPercent);
                if (isNaN(yPct)) return;
                var yPos = (yPct / 100) * imgH;
                btn.style.top = yPos + "px";
            });
        });
    }

    // ═══ KATEGORİ HEADER TESPITI ═══
    function isLikelyCategoryHeader(name) {
        // Tek kelime, tamamı büyük, ve genel kategori isimleri
        var cats = ["KAHVALTI", "İÇECEKLER", "TATLILAR", "ARA SICAK", "SALATALAR",
            "MAKARNALAR", "PİZZALAR", "BURGERLER", "ET YEMEK", "COFFEE"];
        return cats.indexOf(name.toUpperCase().trim()) >= 0;
    }

    // ═══ FİYAT EŞLEŞTIRME ═══
    function findPriceInDB(name) {
        var n = name.toUpperCase().trim();
        for (var i = 0; i < menuItems.length; i++) {
            if (menuItems[i].name.toUpperCase().trim() === n) return menuItems[i].price;
        }
        for (var j = 0; j < menuItems.length; j++) {
            if (menuItems[j].name.toUpperCase().indexOf(n) >= 0 || n.indexOf(menuItems[j].name.toUpperCase()) >= 0) {
                return menuItems[j].price;
            }
        }
        return 0;
    }

    // ═══ CART SYSTEM ═══
    function addToCart(name, price) {
        var found = false;
        for (var i = 0; i < cart.length; i++) {
            if (cart[i].name === name) { cart[i].qty++; found = true; break; }
        }
        if (!found) cart.push({ name: name, price: price, qty: 1 });
        updateCartUI();
        showToast("✓ " + name + " sepete eklendi");
    }

    function updateCartUI() {
        var total = 0;
        cart.forEach(function (c) { total += c.qty; });

        var fab = document.getElementById("menuai-cart-fab");
        if (!fab) fab = createCartFab();
        fab.style.display = total > 0 ? "flex" : "none";
        var badge = document.getElementById("menuai-cart-badge");
        if (badge) badge.textContent = total;
    }

    function createCartFab() {
        var fab = document.createElement("div");
        fab.id = "menuai-cart-fab";
        fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" width="24" height="24">' +
            '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>' +
            '<path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>' +
            '<span id="menuai-cart-badge" style="position:absolute;top:-4px;right:-4px;background:#22c55e;color:#fff;' +
            'font-size:13px;font-weight:700;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;' +
            'justify-content:center;border:2px solid #0a0a0a;font-family:Inter,sans-serif;">0</span>';
        fab.style.cssText = "position:fixed;bottom:20px;right:20px;width:60px;height:60px;border-radius:50%;" +
            "background:linear-gradient(135deg,#e85d3a,#d44b2a);display:none;align-items:center;justify-content:center;" +
            "cursor:pointer;z-index:99999;box-shadow:0 4px 24px rgba(232,93,58,.5);";
        fab.addEventListener("click", toggleCart);
        document.body.appendChild(fab);
        createCartSheet();
        return fab;
    }

    function createCartSheet() {
        var overlay = document.createElement("div");
        overlay.id = "menuai-cart-overlay";
        overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:99998;opacity:0;" +
            "pointer-events:none;transition:opacity .3s;";
        overlay.addEventListener("click", toggleCart);
        document.body.appendChild(overlay);

        var sheet = document.createElement("div");
        sheet.id = "menuai-cart-sheet";
        sheet.style.cssText = "position:fixed;bottom:0;left:0;right:0;background:#141414;" +
            "border-radius:20px 20px 0 0;z-index:100000;transform:translateY(100%);" +
            "transition:transform .35s cubic-bezier(.32,.72,0,1);max-height:75vh;" +
            "display:flex;flex-direction:column;font-family:Inter,sans-serif;";
        sheet.innerHTML =
            '<div style="padding:14px 20px 10px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #222;position:relative;">' +
            '<div style="position:absolute;top:8px;left:50%;transform:translateX(-50%);width:40px;height:4px;border-radius:2px;background:#444;"></div>' +
            '<h3 style="color:#fff;font-size:18px;font-weight:600;">🛒 Sepetim</h3>' +
            '<button onclick="document.getElementById(\'menuai-cart-sheet\').style.transform=\'translateY(100%)\';document.getElementById(\'menuai-cart-overlay\').style.opacity=0;document.getElementById(\'menuai-cart-overlay\').style.pointerEvents=\'none\';" style="background:none;border:none;color:#888;font-size:22px;cursor:pointer;">✕</button>' +
            '</div>' +
            '<div id="menuai-cart-list" style="flex:1;overflow-y:auto;padding:8px 20px;max-height:45vh;">' +
            '<div style="color:#555;text-align:center;padding:40px 0;font-size:15px;">Sepetiniz boş</div>' +
            '</div>' +
            '<div style="padding:16px 20px;border-top:1px solid #222;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
            '<span style="color:#888;font-size:16px;">Toplam</span>' +
            '<span id="menuai-cart-total" style="color:#fff;font-size:22px;font-weight:700;">₺0</span>' +
            '</div>' +
            '<button id="menuai-order-btn" style="width:100%;padding:16px;border:none;border-radius:14px;' +
            'background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;font-size:16px;font-weight:700;' +
            'cursor:pointer;box-shadow:0 4px 16px rgba(34,197,94,.35);font-family:Inter,sans-serif;">Siparişi Gönder</button>' +
            '</div>';
        document.body.appendChild(sheet);

        document.getElementById("menuai-order-btn").addEventListener("click", function () {
            if (cart.length === 0) { showToast("Sepetiniz boş!"); return; }
            var total = 0;
            cart.forEach(function (c) { total += c.price * c.qty; });
            showToast("✅ Siparişiniz gönderildi! Toplam: ₺" + total.toFixed(0));
            cart.length = 0;
            updateCartUI();
            toggleCart();
        });
    }

    function toggleCart() {
        var sheet = document.getElementById("menuai-cart-sheet");
        var overlay = document.getElementById("menuai-cart-overlay");
        var isOpen = sheet.style.transform === "translateY(0px)" || sheet.style.transform === "translateY(0)";
        if (isOpen) {
            sheet.style.transform = "translateY(100%)";
            overlay.style.opacity = "0";
            overlay.style.pointerEvents = "none";
        } else {
            renderCart();
            sheet.style.transform = "translateY(0)";
            overlay.style.opacity = "1";
            overlay.style.pointerEvents = "auto";
        }
    }

    function renderCart() {
        var list = document.getElementById("menuai-cart-list");
        var totalEl = document.getElementById("menuai-cart-total");
        if (cart.length === 0) {
            list.innerHTML = '<div style="color:#555;text-align:center;padding:40px 0;font-size:15px;">Sepetiniz boş</div>';
            totalEl.textContent = "₺0";
            return;
        }
        var html = ""; var grand = 0;
        for (var i = 0; i < cart.length; i++) {
            var c = cart[i]; var sub = c.price * c.qty; grand += sub;
            html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid #1a1a1a;">' +
                '<div style="flex:1;min-width:0;">' +
                '<div style="color:#fff;font-size:15px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(c.name) + '</div>' +
                '<div style="color:#f0784a;font-size:14px;font-weight:600;margin-top:2px;">₺' + c.price + '</div>' +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:6px;margin-left:12px;">' +
                '<button onclick="window.__menuaiOCR.changeQty(' + i + ',-1)" style="width:32px;height:32px;border-radius:10px;border:1px solid #333;background:#1a1a1a;color:#fff;font-size:16px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;">−</button>' +
                '<span style="color:#fff;font-size:15px;font-weight:600;min-width:24px;text-align:center;">' + c.qty + '</span>' +
                '<button onclick="window.__menuaiOCR.changeQty(' + i + ',1)" style="width:32px;height:32px;border-radius:10px;border:1px solid #333;background:#1a1a1a;color:#fff;font-size:16px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;">+</button>' +
                '<button onclick="window.__menuaiOCR.removeItem(' + i + ')" style="background:none;border:none;font-size:16px;cursor:pointer;padding:4px;opacity:.4;">🗑</button>' +
                '</div>' +
                '</div>';
        }
        list.innerHTML = html;
        totalEl.textContent = "₺" + grand.toFixed(0);
    }

    // Global erişim (cart butonları için)
    window.__menuaiOCR = {
        changeQty: function (idx, delta) {
            cart[idx].qty += delta;
            if (cart[idx].qty <= 0) cart.splice(idx, 1);
            updateCartUI();
            renderCart();
        },
        removeItem: function (idx) {
            cart.splice(idx, 1);
            updateCartUI();
            renderCart();
        }
    };

    // ═══ TOAST ═══
    function showToast(msg) {
        var t = document.getElementById("menuai-toast");
        if (!t) {
            t = document.createElement("div");
            t.id = "menuai-toast";
            t.style.cssText = "position:fixed;top:20px;left:50%;transform:translateX(-50%) translateY(-100px);" +
                "background:#1a1a1a;color:#fff;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:500;" +
                "z-index:200000;box-shadow:0 4px 20px rgba(0,0,0,.5);border:1px solid #2a2a2a;" +
                "transition:transform .35s cubic-bezier(.32,.72,0,1);pointer-events:none;white-space:nowrap;" +
                "font-family:Inter,sans-serif;";
            document.body.appendChild(t);
        }
        t.textContent = msg;
        t.style.transform = "translateX(-50%) translateY(0)";
        setTimeout(function () {
            t.style.transform = "translateX(-50%) translateY(-100px)";
        }, 2200);
    }

    // ═══ UTIL ═══
    function esc(s) {
        return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function debounce(fn, ms) {
        var timer;
        return function () {
            clearTimeout(timer);
            timer = setTimeout(fn, ms);
        };
    }
})();
