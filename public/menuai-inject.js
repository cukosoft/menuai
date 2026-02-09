/**
 * MenüAi Client-Side Injection Script
 * Bu script proxy modunda HTML'e enjekte edilir.
 * Server-side'da SLUG ve ORIGIN değişkenleri replace edilir.
 * 
 * Placeholders: __MENUAI_SLUG__, __MENUAI_ORIGIN__
 */
(function () {
    var SLUG = "__MENUAI_SLUG__";
    var PROXY_PREFIX = "/p/" + SLUG;
    var ORIGIN = "__MENUAI_ORIGIN__";

    // ═══════════════════════════════════════════════
    // 1. NETWORK INTERCEPTOR
    // ═══════════════════════════════════════════════
    var oFetch = window.fetch;
    window.fetch = function (u, o) {
        if (typeof u === "string") {
            if (u.startsWith("/") && !u.startsWith("/api/") && !u.startsWith(PROXY_PREFIX)) { u = PROXY_PREFIX + u; }
            else if (u.startsWith(ORIGIN)) { u = PROXY_PREFIX + u.substring(ORIGIN.length); }
        }
        return oFetch.call(this, u, o);
    };
    var oXHR = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (m, u) {
        if (typeof u === "string") {
            if (u.startsWith("/") && !u.startsWith("/api/") && !u.startsWith(PROXY_PREFIX)) { u = PROXY_PREFIX + u; }
            else if (u.startsWith(ORIGIN)) { u = PROXY_PREFIX + u.substring(ORIGIN.length); }
        }
        return oXHR.apply(this, [m, u].concat([].slice.call(arguments, 2)));
    };

    // ═══════════════════════════════════════════════
    // 2. SEPET SİSTEMİ (Global State)
    // ═══════════════════════════════════════════════
    var cart = window.__menuaiCart || (window.__menuaiCart = []);

    function showCartToast(msg) {
        var t = document.getElementById("menuai-toast");
        if (!t) { t = document.createElement("div"); t.id = "menuai-toast"; document.body.appendChild(t); }
        t.textContent = msg; t.className = "menuai-toast show";
        setTimeout(function () { t.className = "menuai-toast"; }, 2000);
    }

    function addToCart(name, price) {
        var found = false;
        for (var i = 0; i < cart.length; i++) {
            if (cart[i].name === name) { cart[i].qty++; found = true; break; }
        }
        if (!found) cart.push({ name: name, price: price, qty: 1 });
        updateCartFAB();
        showCartToast("\u2713 " + name + " sepete eklendi");
    }
    window.menuaiAddToCart = addToCart;

    function removeFromCart(idx) {
        cart.splice(idx, 1);
        updateCartFAB();
        renderCartSheet();
    }
    window.menuaiRemoveFromCart = removeFromCart;

    function changeQty(idx, delta) {
        cart[idx].qty += delta;
        if (cart[idx].qty <= 0) cart.splice(idx, 1);
        updateCartFAB();
        renderCartSheet();
    }
    window.menuaiChangeQty = changeQty;

    function updateCartFAB() {
        var fab = document.getElementById("menuai-cart-fab");
        var badge = document.getElementById("menuai-cart-badge");
        var total = 0;
        for (var i = 0; i < cart.length; i++) total += cart[i].qty;
        if (fab) fab.style.display = total > 0 ? "flex" : "none";
        if (badge) badge.textContent = total;
    }

    function toggleCartSheet() {
        var sheet = document.getElementById("menuai-cart-sheet");
        var overlay = document.getElementById("menuai-cart-overlay");
        if (!sheet) return;
        var isOpen = sheet.classList.contains("open");
        if (isOpen) { sheet.classList.remove("open"); overlay.classList.remove("open"); }
        else { renderCartSheet(); sheet.classList.add("open"); overlay.classList.add("open"); }
    }
    window.menuaiToggleCart = toggleCartSheet;

    function renderCartSheet() {
        var list = document.getElementById("menuai-cart-list");
        var totalEl = document.getElementById("menuai-cart-total");
        if (!list) return;
        if (cart.length === 0) {
            list.innerHTML = '<div class="menuai-empty">Sepetiniz bo\u015f</div>';
            if (totalEl) totalEl.textContent = "\u20BA0";
            return;
        }
        var html = ""; var grand = 0;
        for (var i = 0; i < cart.length; i++) {
            var c = cart[i]; var sub = c.price * c.qty; grand += sub;
            html += '<div class="menuai-cart-item">' +
                '<div class="menuai-ci-info">' +
                '<span class="menuai-ci-name">' + c.name + '</span>' +
                '<span class="menuai-ci-price">\u20BA' + c.price + '</span>' +
                '</div>' +
                '<div class="menuai-ci-actions">' +
                '<button class="menuai-qty-btn" onclick="menuaiChangeQty(' + i + ',-1)">\u2212</button>' +
                '<span class="menuai-ci-qty">' + c.qty + '</span>' +
                '<button class="menuai-qty-btn" onclick="menuaiChangeQty(' + i + ',1)">+</button>' +
                '<button class="menuai-del-btn" onclick="menuaiRemoveFromCart(' + i + ')">\uD83D\uDDD1</button>' +
                '</div>' +
                '</div>';
        }
        list.innerHTML = html;
        if (totalEl) totalEl.textContent = "\u20BA" + grand.toFixed(0);
    }

    function submitCartOrder() {
        if (cart.length === 0) { showCartToast("Sepetiniz bo\u015f!"); return; }
        var total = 0;
        for (var i = 0; i < cart.length; i++) total += cart[i].price * cart[i].qty;
        showCartToast("\u2705 Sipari\u015finiz g\u00f6nderildi! Toplam: \u20BA" + total.toFixed(0));
        cart.length = 0;
        updateCartFAB();
        toggleCartSheet();
    }
    window.menuaiSubmitOrder = submitCartOrder;

    // ═══════════════════════════════════════════════
    // 3. UI ENJEKSİYONU (DOM)
    // ═══════════════════════════════════════════════
    function injectCartUI() {
        if (document.getElementById("menuai-cart-fab")) return;

        // FAB
        var fab = document.createElement("div"); fab.id = "menuai-cart-fab";
        fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" width="24" height="24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg><span id="menuai-cart-badge">0</span>';
        fab.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); toggleCartSheet(); });
        document.body.appendChild(fab);

        // Overlay
        var ov = document.createElement("div"); ov.id = "menuai-cart-overlay";
        ov.addEventListener("click", function () { toggleCartSheet(); });
        document.body.appendChild(ov);

        // Bottom Sheet
        var sheet = document.createElement("div"); sheet.id = "menuai-cart-sheet";
        sheet.innerHTML = '<div class="menuai-sheet-header">' +
            '<div class="menuai-sheet-handle"></div>' +
            '<h3>\uD83D\uDED2 Sepetim</h3>' +
            '<button class="menuai-close" onclick="menuaiToggleCart()">\u2715</button>' +
            '</div>' +
            '<div class="menuai-cart-list" id="menuai-cart-list"><div class="menuai-empty">Sepetiniz bo\u015f</div></div>' +
            '<div class="menuai-sheet-footer">' +
            '<div class="menuai-total-row"><span>Toplam</span><span id="menuai-cart-total" class="menuai-total-amount">\u20BA0</span></div>' +
            '<button class="menuai-order-btn" onclick="menuaiSubmitOrder()">Sipari\u015fi G\u00f6nder</button>' +
            '</div>';
        document.body.appendChild(sheet);

        // Toast
        var toast = document.createElement("div"); toast.id = "menuai-toast"; toast.className = "menuai-toast";
        document.body.appendChild(toast);

        updateCartFAB();
    }

    // ═══════════════════════════════════════════════
    // 4. CSS ENJEKSİYONU
    // ═══════════════════════════════════════════════
    function injectStyles() {
        if (document.getElementById("menuai-styles")) return;
        var st = document.createElement("style"); st.id = "menuai-styles";
        st.textContent =
            ".menuai-plus{width:36px;height:36px;border-radius:50%;border:none;" +
            "background:linear-gradient(135deg,#e85d3a,#f0784a);color:#fff;font-size:20px;font-weight:700;" +
            "display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:9999;" +
            "box-shadow:0 2px 12px rgba(232,93,58,.4);transition:all .2s;pointer-events:auto!important;" +
            "flex-shrink:0;line-height:1;padding:0}" +
            ".menuai-plus:active{transform:translateY(-50%) scale(.85)!important}" +

            "#menuai-cart-fab{position:fixed;bottom:20px;right:20px;width:60px;height:60px;border-radius:50%;" +
            "background:linear-gradient(135deg,#e85d3a,#d44b2a);display:none;align-items:center;justify-content:center;" +
            "cursor:pointer;z-index:99999;box-shadow:0 4px 20px rgba(232,93,58,.5);" +
            "transition:transform .2s,box-shadow .2s;pointer-events:auto}" +
            "#menuai-cart-fab:active{transform:scale(.9)}" +
            "#menuai-cart-badge{position:absolute;top:-4px;right:-4px;background:#22c55e;color:#fff;" +
            "font-size:13px;font-weight:700;width:24px;height:24px;border-radius:50%;" +
            "display:flex;align-items:center;justify-content:center;border:2px solid #1a1a1a;" +
            "font-family:Inter,sans-serif}" +

            "#menuai-cart-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99998;" +
            "opacity:0;pointer-events:none;transition:opacity .3s}" +
            "#menuai-cart-overlay.open{opacity:1;pointer-events:auto}" +

            "#menuai-cart-sheet{position:fixed;bottom:0;left:0;right:0;" +
            "background:#1a1a1a;border-radius:20px 20px 0 0;z-index:100000;" +
            "transform:translateY(100%);transition:transform .35s cubic-bezier(.32,.72,0,1);" +
            "max-height:75vh;display:flex;flex-direction:column;font-family:Inter,sans-serif}" +
            "#menuai-cart-sheet.open{transform:translateY(0)}" +

            ".menuai-sheet-header{padding:12px 20px 8px;display:flex;align-items:center;justify-content:space-between;" +
            "border-bottom:1px solid #2a2a2a;position:relative}" +
            ".menuai-sheet-handle{position:absolute;top:8px;left:50%;transform:translateX(-50%);" +
            "width:40px;height:4px;border-radius:2px;background:#444}" +
            ".menuai-sheet-header h3{color:#fff;margin:0;font-size:18px;font-weight:600}" +
            ".menuai-close{background:none;border:none;color:#888;font-size:20px;cursor:pointer;padding:4px 8px}" +

            ".menuai-cart-list{flex:1;overflow-y:auto;padding:8px 20px;max-height:45vh}" +
            ".menuai-empty{color:#666;text-align:center;padding:40px 0;font-size:15px}" +
            ".menuai-cart-item{display:flex;align-items:center;justify-content:space-between;" +
            "padding:14px 0;border-bottom:1px solid #222}" +
            ".menuai-ci-info{display:flex;flex-direction:column;flex:1;min-width:0}" +
            ".menuai-ci-name{color:#fff;font-size:15px;font-weight:500;white-space:nowrap;" +
            "overflow:hidden;text-overflow:ellipsis}" +
            ".menuai-ci-price{color:#f0784a;font-size:14px;font-weight:600;margin-top:2px}" +
            ".menuai-ci-actions{display:flex;align-items:center;gap:6px;margin-left:12px}" +
            ".menuai-qty-btn{width:30px;height:30px;border-radius:8px;border:1px solid #444;" +
            "background:#2a2a2a;color:#fff;font-size:16px;font-weight:600;cursor:pointer;" +
            "display:flex;align-items:center;justify-content:center;transition:background .15s}" +
            ".menuai-qty-btn:active{background:#444}" +
            ".menuai-ci-qty{color:#fff;font-size:15px;font-weight:600;min-width:20px;text-align:center}" +
            ".menuai-del-btn{background:none;border:none;font-size:16px;cursor:pointer;padding:4px;" +
            "opacity:.5;transition:opacity .15s}" +
            ".menuai-del-btn:hover{opacity:1}" +

            ".menuai-sheet-footer{padding:16px 20px;border-top:1px solid #2a2a2a}" +
            ".menuai-total-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}" +
            ".menuai-total-row span{color:#aaa;font-size:16px}" +
            ".menuai-total-amount{color:#fff;font-size:22px;font-weight:700}" +
            ".menuai-order-btn{width:100%;padding:16px;border:none;border-radius:14px;" +
            "background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;font-size:16px;" +
            "font-weight:700;cursor:pointer;transition:transform .15s,box-shadow .15s;" +
            "box-shadow:0 4px 16px rgba(34,197,94,.35)}" +
            ".menuai-order-btn:active{transform:scale(.97)}" +

            ".menuai-toast{position:fixed;top:20px;left:50%;transform:translateX(-50%) translateY(-100px);" +
            "background:#1a1a1a;color:#fff;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:500;" +
            "z-index:200000;box-shadow:0 4px 20px rgba(0,0,0,.5);border:1px solid #333;" +
            "transition:transform .35s cubic-bezier(.32,.72,0,1);font-family:Inter,sans-serif;" +
            "pointer-events:none;white-space:nowrap}" +
            ".menuai-toast.show{transform:translateX(-50%) translateY(0)}";
        document.head.appendChild(st);
    }

    // ═══════════════════════════════════════════════
    // 5. MENÜ ÖĞE EŞLEŞTİRME + BUTON ENJEKSİYONU
    // ═══════════════════════════════════════════════
    var items = [];
    var menuCategories = [];

    function fetchMenu() {
        var x = new XMLHttpRequest();
        x.open("GET", "/api/menu-items/" + SLUG);
        x.onload = function () {
            try {
                var d = JSON.parse(x.responseText);
                if (d.success && d.categories) {
                    menuCategories = d.categories;
                    d.categories.forEach(function (c) {
                        c.items.forEach(function (i) {
                            items.push({ name: i.name, price: i.price, cat: c.name });
                        });
                    });
                    console.log("[Men\u00fcAi] " + items.length + " \u00fcr\u00fcn y\u00fcklendi");
                    tryInject();
                }
            } catch (e) { console.warn("[Men\u00fcAi] Parse hatas\u0131", e); }
        };
        x.send();
    }

    function tryInject() {
        if (!items.length) return;
        var els = document.querySelectorAll("h1,h2,h3,h4,h5,h6,p,span,div,a,li,td,label");
        var m = 0;
        items.forEach(function (item) {
            var n = item.name.trim().toUpperCase();
            if (n.length < 2) return;
            for (var i = 0; i < els.length; i++) {
                var el = els[i];
                if (el.dataset.menuaiDone) continue;
                var t = (el.textContent || "").trim().toUpperCase();
                if (t === n || (el.childElementCount === 0 && t.includes(n) && t.length < n.length * 2)) {
                    var ch = el.querySelectorAll("h1,h2,h3,h4,h5,h6,p,span");
                    var skip = false;
                    for (var j = 0; j < ch.length; j++) { if ((ch[j].textContent || "").trim().toUpperCase() === n) { skip = true; break; } }
                    if (skip) continue;
                    el.dataset.menuaiDone = "1";
                    var b = document.createElement("button");
                    b.className = "menuai-plus"; b.textContent = "+";
                    b.setAttribute("data-n", item.name); b.setAttribute("data-p", item.price);
                    b.addEventListener("click", function (e) {
                        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
                        var nm = this.getAttribute("data-n");
                        var pr = parseFloat(this.getAttribute("data-p"));
                        addToCart(nm, pr);
                        this.textContent = "\u2713"; this.style.background = "linear-gradient(135deg,#22c55e,#16a34a)";
                        var s = this; setTimeout(function () { s.textContent = "+"; s.style.background = ""; }, 800);
                        return false;
                    }, true);
                    var row = el.closest("a") || el.closest("li") || el.closest("[class*=flex]") || el.parentElement;
                    if (row && !row.querySelector(".menuai-plus")) {
                        row.style.position = "relative";
                        b.style.cssText = "position:absolute;right:8px;top:50%;transform:translateY(-50%);z-index:9999;";
                        row.appendChild(b); m++;
                    }
                    break;
                }
            }
        });
        if (m > 0) {
            console.log("[Men\u00fcAi] " + m + " \u00fcr\u00fcne + butonu eklendi");
        } else if (items.length > 0 && !document.getElementById("menuai-product-fab")) {
            console.log("[Men\u00fcAi] Text match yok, fallback panel modu aktif");
            injectProductPanel();
        }
    }

    // ═══════════════════════════════════════════════
    // 5b. FALLBACK PANEL (image-based menüler için)
    // ═══════════════════════════════════════════════
    function injectProductPanel() {
        if (document.getElementById("menuai-product-fab")) return;
        var sc = document.createElement("script");
        sc.src = "/menuai-fallback-panel.js";
        sc.onload = function () {
            if (window.__menuaiFallbackPanel) {
                window.__menuaiFallbackPanel(menuCategories, addToCart);
            }
        };
        document.head.appendChild(sc);
    }

    // ═══════════════════════════════════════════════
    // 6. BAŞLAT
    // ═══════════════════════════════════════════════
    function boot() {
        injectStyles(); injectCartUI(); fetchMenu();
        var obs = new MutationObserver(function () { if (items.length > 0) tryInject(); });
        if (document.body) obs.observe(document.body, { childList: true, subtree: true });
    }
    if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", boot); }
    else { boot(); }
})();
