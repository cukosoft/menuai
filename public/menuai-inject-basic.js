/**
 * MenüAi Basic Tier — Client-Side Injection Script
 * Orijinal menü sitesi aynen gösterilir, üstüne sadece:
 * - Alt bar: Garson Çağır | Hesap İste | Sipariş Ver
 * - Sağ floating buton: Kategorik menü paneli
 * - Sepet sistemi
 * 
 * Placeholders: __MENUAI_SLUG__, __MENUAI_ORIGIN__
 */
(function () {
    var SLUG = "__MENUAI_SLUG__";
    var PROXY_PREFIX = "/p/" + SLUG;
    var ORIGIN = "__MENUAI_ORIGIN__";

    // ═══════════════════════════════════════════════
    // 1. NETWORK INTERCEPTOR (sadece proxy modunda gerekli)
    // ═══════════════════════════════════════════════
    var isIframeMode = !!document.getElementById('menuai-iframe-wrap');
    if (!isIframeMode) {
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
    }

    // ═══════════════════════════════════════════════
    // 2. SEPET SİSTEMİ
    // ═══════════════════════════════════════════════
    var cart = window.__menuaiCart || (window.__menuaiCart = []);

    function showToast(msg) {
        var t = document.getElementById("menuai-toast");
        if (!t) { t = document.createElement("div"); t.id = "menuai-toast"; document.body.appendChild(t); }
        t.textContent = msg; t.className = "menuai-toast show";
        setTimeout(function () { t.className = "menuai-toast"; }, 2200);
    }

    function addToCart(name, price) {
        var found = false;
        for (var i = 0; i < cart.length; i++) {
            if (cart[i].name === name) { cart[i].qty++; found = true; break; }
        }
        if (!found) cart.push({ name: name, price: price, qty: 1 });
        updateBadge();
        updateTabBadge();
        showToast("\u2713 " + name + " sepete eklendi");
    }
    window.menuaiAddToCart = addToCart;

    function updateTabBadge() {
        var count = 0;
        for (var i = 0; i < cart.length; i++) count += cart[i].qty;
        var tabs = document.querySelectorAll('.menuai-tab');
        if (tabs.length >= 2) {
            var svg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>';
            tabs[1].innerHTML = svg + ' Sepetim (' + count + ')';
        }
    }

    function removeFromCart(idx) { cart.splice(idx, 1); updateBadge(); renderMenuPanel(); }
    window.menuaiRemoveFromCart = removeFromCart;

    function changeQty(idx, delta) {
        cart[idx].qty += delta;
        if (cart[idx].qty <= 0) cart.splice(idx, 1);
        updateBadge(); renderMenuPanel();
    }
    window.menuaiChangeQty = changeQty;

    function updateNote(idx, val) { if (cart[idx]) cart[idx].note = val; }
    window.menuaiUpdateNote = updateNote;

    function updateBadge() {
        var total = 0;
        for (var i = 0; i < cart.length; i++) total += cart[i].qty;
        var badge = document.getElementById("menuai-plate-badge");
        if (!badge) return;
        badge.style.display = "flex";
        if (total > 0) {
            badge.textContent = String(total);
            badge.classList.remove("menuai-badge-empty");
            badge.classList.add("menuai-badge-filled");
        } else {
            badge.textContent = "Yeni";
            badge.classList.remove("menuai-badge-filled");
            badge.classList.add("menuai-badge-empty");
        }
    }

    function renderCartContent() {
        if (cart.length === 0) {
            return '<div class="menuai-b-cart-empty">' +
                '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>' +
                '<p>Sepetiniz bo\u015f</p>' +
                '<button class="menuai-tab-switch-btn" onclick="menuaiSwitchTab(\'menu\')">Men\u00fcye G\u00f6z At</button>' +
                '</div>';
        }
        var html = '<div class="menuai-b-cart-items">';
        var grand = 0;
        for (var i = 0; i < cart.length; i++) {
            var c = cart[i]; var sub = c.price * c.qty; grand += sub;
            html += '<div class="menuai-b-cart-item">' +
                '<div class="menuai-b-ci-row">' +
                '<div class="menuai-b-ci-info">' +
                '<span class="menuai-b-ci-name">' + esc(c.name) + '</span>' +
                '<span class="menuai-b-ci-price">\u20BA' + c.price + '</span>' +
                '</div>' +
                '<div class="menuai-b-ci-actions">' +
                '<button class="menuai-b-qty" onclick="menuaiChangeQty(' + i + ',-1)">\u2212</button>' +
                '<span class="menuai-b-ci-q">' + c.qty + '</span>' +
                '<button class="menuai-b-qty" onclick="menuaiChangeQty(' + i + ',1)">+</button>' +
                '<button class="menuai-b-del" onclick="menuaiRemoveFromCart(' + i + ')">' + '\uD83D\uDDD1</button>' +
                '</div></div>' +
                '<input type="text" class="menuai-b-ci-note" placeholder="Sipari\u015f detay\u0131 ekleyin... (az pi\u015fmi\u015f, soslu vb.)" ' +
                'value="' + esc(c.note || '') + '" ' +
                'onchange="menuaiUpdateNote(' + i + ',this.value)">' +
                '</div>';
        }
        html += '</div>';
        html += '<div class="menuai-b-cart-footer">' +
            '<div class="menuai-b-total"><span>Toplam</span><span class="menuai-b-total-val">\u20BA' + grand.toFixed(0) + '</span></div>' +
            '<button class="menuai-b-submit" onclick="menuaiSubmitOrder()">Sipari\u015fi G\u00f6nder</button>' +
            '</div>';
        return html;
    }

    function submitOrder() {
        if (cart.length === 0) { showToast("Sepetiniz bo\u015f!"); return; }
        var total = 0;
        for (var i = 0; i < cart.length; i++) total += cart[i].price * cart[i].qty;

        // Close panel first
        closeSheet("menuai-menu-panel");

        // Load GSAP if not loaded, then play cloche
        if (typeof gsap === "undefined") {
            var gs = document.createElement("script");
            gs.src = "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js";
            gs.onload = function () { playClocheAnimation(total); };
            document.head.appendChild(gs);
        } else {
            playClocheAnimation(total);
        }
    }

    function playClocheAnimation(total) {
        // Load Playfair Display font
        if (!document.getElementById("menuai-playfair")) {
            var link = document.createElement("link");
            link.id = "menuai-playfair";
            link.rel = "stylesheet";
            link.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,600&display=swap";
            document.head.appendChild(link);
        }

        // Create overlay
        var overlay = document.createElement("div");
        overlay.id = "menuai-cloche-overlay";
        overlay.innerHTML =
            // ── CLOCHE SVG ──
            '<div id="menuai-cloche-wrap">' +
            '<svg id="menuai-cloche-svg" viewBox="0 0 200 140" width="200" height="140" xmlns="http://www.w3.org/2000/svg">' +
            '<defs>' +
            '<linearGradient id="cloche-grad" x1="0%" y1="0%" x2="100%" y2="100%">' +
            '<stop offset="0%" stop-color="#FFFFFF"/>' +
            '<stop offset="30%" stop-color="#E8E8E8"/>' +
            '<stop offset="50%" stop-color="#C0C0C0"/>' +
            '<stop offset="75%" stop-color="#A0A0A0"/>' +
            '<stop offset="100%" stop-color="#808080"/>' +
            '</linearGradient>' +
            '<linearGradient id="knob-grad" x1="0%" y1="0%" x2="0%" y2="100%">' +
            '<stop offset="0%" stop-color="#FFFFFF"/>' +
            '<stop offset="100%" stop-color="#999"/>' +
            '</linearGradient>' +
            '<radialGradient id="shine-grad" cx="35%" cy="30%" r="60%">' +
            '<stop offset="0%" stop-color="rgba(255,255,255,0.6)"/>' +
            '<stop offset="100%" stop-color="rgba(255,255,255,0)"/>' +
            '</radialGradient>' +
            '</defs>' +
            // Shadow
            '<ellipse cx="100" cy="132" rx="80" ry="8" fill="rgba(0,0,0,0.25)" filter="url(#blur-shadow)"/>' +
            '<filter id="blur-shadow"><feGaussianBlur in="SourceGraphic" stdDeviation="4"/></filter>' +
            // Dome
            '<path d="M20,130 Q20,40 100,30 Q180,40 180,130 Z" fill="url(#cloche-grad)" stroke="#999" stroke-width="1"/>' +
            // Shine highlight
            '<path d="M40,120 Q40,55 100,45 Q130,50 140,80 Q100,60 50,120 Z" fill="url(#shine-grad)"/>' +
            // Base rim
            '<rect x="10" y="126" width="180" height="8" rx="4" fill="url(#cloche-grad)" stroke="#999" stroke-width="0.5"/>' +
            // Knob
            '<ellipse cx="100" cy="30" rx="12" ry="8" fill="url(#knob-grad)" stroke="#aaa" stroke-width="0.5"/>' +
            '<ellipse cx="100" cy="27" rx="6" ry="3" fill="rgba(255,255,255,0.7)"/>' +
            '</svg>' +
            '</div>' +
            // ── SUCCESS CONTENT ──
            '<div id="menuai-cloche-success" style="opacity:0;position:absolute;display:flex;flex-direction:column;align-items:center;gap:14px">' +
            '<svg id="menuai-check-svg" viewBox="0 0 80 80" width="80" height="80">' +
            '<circle cx="40" cy="40" r="36" fill="none" stroke="#d4af37" stroke-width="2" opacity="0.3"/>' +
            '<path id="menuai-check-path" d="M22,42 L35,55 L58,28" fill="none" stroke="#d4af37" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="60" stroke-dashoffset="60"/>' +
            '</svg>' +
            '<p style="font-family:Playfair Display,serif;font-style:italic;font-size:20px;color:#d4af37;margin:0;letter-spacing:1px">Sipari\u015finiz \u0130letildi</p>' +
            '<p style="font-family:Playfair Display,serif;font-style:italic;font-size:16px;color:#c9a94e;margin:4px 0 0;letter-spacing:0.5px;opacity:0.8">Afiyet Olsun!</p>' +
            '<p style="font-family:Inter,sans-serif;font-size:14px;color:#888;margin:0">Toplam: \u20BA' + total.toFixed(0) + '</p>' +
            '<div style="margin-top:6px;max-height:30vh;overflow-y:auto;width:260px">' +
            (function () {
                var items = '';
                for (var ci = 0; ci < cart.length; ci++) {
                    var it = cart[ci];
                    items += '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.08);font-family:Inter,sans-serif">' +
                        '<span style="color:#aaa;font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(it.name) + (it.qty > 1 ? ' x' + it.qty : '') + '</span>' +
                        '<span style="color:#d4af37;font-size:12px;margin-left:10px;white-space:nowrap">\u20BA' + (it.price * it.qty).toFixed(0) + '</span>' +
                        '</div>';
                }
                return items;
            })() +
            '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        // ── ANIMATION TIMELINE ──
        var tl = gsap.timeline({
            onComplete: function () {
                // Auto-dismiss after 2s
                gsap.to(overlay, {
                    opacity: 0, duration: 0.6, delay: 2.5,
                    onComplete: function () {
                        overlay.remove();
                        cart.length = 0;
                        updateBadge();
                        updateTabBadge();
                    }
                });
            }
        });

        var cloche = document.getElementById("menuai-cloche-wrap");
        var success = document.getElementById("menuai-cloche-success");
        var checkPath = document.getElementById("menuai-check-path");

        // 0.0s — Dim overlay
        tl.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.3 });

        // 0.2s — Cloche descends
        tl.fromTo(cloche,
            { y: "-150vh", scale: 1 },
            { y: "0", duration: 1.2, ease: "power2.in" },
            0.2
        );

        // 0.8s — Landing impact (squash & stretch)
        tl.to(cloche, { scaleY: 0.93, scaleX: 1.07, duration: 0.08, ease: "power1.in" });
        tl.to(cloche, { scaleY: 1, scaleX: 1, duration: 0.15, ease: "elastic.out(1.2,0.4)" });

        // Haptic feedback
        tl.call(function () {
            if (navigator.vibrate) navigator.vibrate(50);
        });

        // Pause (anticipation)
        tl.to({}, { duration: 0.8 });

        // 1.4s — Cloche lifts up & reveals
        tl.to(cloche, { y: "-150vh", duration: 1.2, ease: "power3.out" });

        // Play bell sound
        tl.call(function () {
            try {
                var ctx = new (window.AudioContext || window.webkitAudioContext)();
                // Crystal bell synthesis
                var osc = ctx.createOscillator();
                var gain = ctx.createGain();
                osc.type = "sine";
                osc.frequency.setValueAtTime(1200, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.8);
                gain.gain.setValueAtTime(0.15, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 1.2);
                // Harmonic overtone
                var osc2 = ctx.createOscillator();
                var gain2 = ctx.createGain();
                osc2.type = "sine";
                osc2.frequency.setValueAtTime(2400, ctx.currentTime);
                osc2.frequency.exponentialRampToValueAtTime(1600, ctx.currentTime + 0.6);
                gain2.gain.setValueAtTime(0.06, ctx.currentTime);
                gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
                osc2.connect(gain2);
                gain2.connect(ctx.destination);
                osc2.start(ctx.currentTime);
                osc2.stop(ctx.currentTime + 0.8);
            } catch (e) { /* silent fallback */ }
        }, null, "-=0.5");

        // Reveal success
        tl.to(success, { opacity: 1, duration: 0.4, ease: "power2.out" }, "-=0.3");

        // Draw checkmark
        tl.to(checkPath, { strokeDashoffset: 0, duration: 0.6, ease: "power2.out" }, "-=0.2");
    }
    window.menuaiSubmitOrder = submitOrder;

    // ═══════════════════════════════════════════════
    // 3. SHEET HELPERS
    // ═══════════════════════════════════════════════
    function openSheet(id) {
        var s = document.getElementById(id);
        var ov = document.getElementById("menuai-overlay");
        if (s) s.classList.add("open");
        if (ov) ov.classList.add("open");
        renderMenuPanel();
    }
    function closeSheet(id) {
        var s = document.getElementById(id);
        var ov = document.getElementById("menuai-overlay");
        if (s) s.classList.remove("open");
        if (ov) ov.classList.remove("open");
    }
    function closeAllSheets() {
        closeSheet("menuai-menu-panel");
    }
    window.menuaiOpenCart = function () { activeTab = 'cart'; openSheet("menuai-menu-panel"); };
    window.menuaiCloseAll = closeAllSheets;

    // ═══════════════════════════════════════════════
    // 4. KATEGORİK MENÜ PANELİ
    // ═══════════════════════════════════════════════
    var menuCategories = [];
    var activeCat = null;
    var activeParent = null; // For hierarchical menus
    var activeTab = 'menu'; // 'menu' or 'cart'

    function toggleMenuPanel() {
        var panel = document.getElementById("menuai-menu-panel");
        if (!panel) return;
        if (panel.classList.contains("open")) { closeSheet("menuai-menu-panel"); }
        else { activeTab = 'menu'; openSheet("menuai-menu-panel"); }
    }
    window.menuaiToggleMenu = toggleMenuPanel;

    function switchTab(tab) {
        activeTab = tab;
        renderMenuPanel();
    }
    window.menuaiSwitchTab = switchTab;

    var searchQuery = '';

    function renderMenuPanel() {
        var body = document.getElementById("menuai-menu-body");
        if (!body) return;

        // Tab badge count
        var cartCount = 0;
        for (var ci = 0; ci < cart.length; ci++) cartCount += cart[ci].qty;
        // Tab bar
        var tabBar = '<div class="menuai-tabs">' +
            '<button class="menuai-tab' + (activeTab === 'menu' ? ' active' : '') + '" onclick="menuaiSwitchTab(\'menu\')">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>' +
            ' Men\u00fc</button>' +
            '<button class="menuai-tab' + (activeTab === 'cart' ? ' active' : '') + '" onclick="menuaiSwitchTab(\'cart\')">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>' +
            ' Sepetim (' + cartCount + ')</button>' +
            '</div>';

        var html = tabBar;

        if (activeTab === 'cart') {
            // ── CART TAB ──
            html += renderCartContent();
            body.innerHTML = html;
            return;
        }

        // ── MENU TAB ──
        if (!menuCategories.length) {
            html += '<div class="menuai-b-empty">Y\u00fckleniyor...</div>';
            body.innerHTML = html;
            return;
        }

        // Arama kutusu
        var search = '<div class="menuai-b-search">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
            '<input type="text" id="menuai-search" placeholder="\u00dcr\u00fcn ara..." value="' + esc(searchQuery) + '" oninput="menuaiSearch(this.value)">' +
            (searchQuery ? '<button class="menuai-b-search-clear" onclick="menuaiSearch(\'\')">&#215;</button>' : '') +
            '</div>';

        html += search;

        if (searchQuery) {
            // Arama modunda: tüm kategorilerden eşleşen ürünleri göster
            var q = searchQuery.toUpperCase();
            var results = [];
            menuCategories.forEach(function (c) {
                // Flat items
                (c.items || []).forEach(function (item) {
                    if (item.name.toUpperCase().indexOf(q) >= 0) {
                        results.push({ item: item, cat: c.name });
                    }
                });
                // Hierarchical children
                (c.children || []).forEach(function (child) {
                    (child.items || []).forEach(function (item) {
                        if (item.name.toUpperCase().indexOf(q) >= 0) {
                            results.push({ item: item, cat: c.name + ' > ' + child.name });
                        }
                    });
                });
            });
            html += '<div class="menuai-b-items">';
            if (results.length === 0) {
                html += '<div class="menuai-b-empty">"' + esc(searchQuery) + '" i\u00e7in sonu\u00e7 bulunamad\u0131</div>';
            } else {
                html += '<div class="menuai-b-result-count">' + results.length + ' \u00fcr\u00fcn bulundu</div>';
                results.forEach(function (r) {
                    html += buildItemHtml(r.item, r.cat);
                });
            }
            html += '</div>';
        } else if (activeCat) {
            // Kategori detay görünümü: geri butonu + ürün listesi
            var catItems = [];
            var breadcrumb = activeCat;

            if (activeParent) {
                // Hierarchical: find items in parent's child
                menuCategories.forEach(function (c) {
                    if (c.name === activeParent) {
                        (c.children || []).forEach(function (child) {
                            if (child.name === activeCat) catItems = child.items || [];
                        });
                    }
                });
                breadcrumb = activeParent + ' > ' + activeCat;
            } else {
                menuCategories.forEach(function (c) { if (c.name === activeCat) catItems = c.items || []; });
            }

            html += '<div class="menuai-b-back" onclick="menuaiGoBack()">' +
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>' +
                '<span>' + (activeParent ? esc(activeParent) : 'Kategoriler') + '</span></div>';
            html += '<div class="menuai-b-cat-title">' + esc(activeCat) + '</div>';
            html += '<div class="menuai-b-items">';
            if (catItems.length === 0) {
                html += '<div class="menuai-b-empty">\u00dcr\u00fcn bulunamad\u0131</div>';
            } else {
                catItems.forEach(function (item) {
                    html += buildItemHtml(item, null);
                });
            }
            html += '</div>';
        } else if (activeParent) {
            // Parent seçildi: alt kategorileri göster
            var parentCat = null;
            menuCategories.forEach(function (c) { if (c.name === activeParent) parentCat = c; });

            html += '<div class="menuai-b-back" onclick="menuaiGoBack()">' +
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>' +
                '<span>Kategoriler</span></div>';
            html += '<div class="menuai-b-cat-title">' + esc(activeParent) + '</div>';

            if (parentCat && parentCat.children && parentCat.children.length > 0) {
                html += '<div class="menuai-b-catlist">';
                parentCat.children.forEach(function (child) {
                    var count = (child.items || []).length;
                    html += '<button class="menuai-b-catrow" onclick="menuaiSelectSubCat(\'' + escAttr(activeParent) + '\',\'' + escAttr(child.name) + '\')">' +
                        '<div class="menuai-b-catrow-left">' +
                        '<div class="menuai-b-catrow-info">' +
                        '<span class="menuai-b-catrow-name">' + esc(child.name) + '</span>' +
                        '<span class="menuai-b-catrow-count">' + count + ' \u00fcr\u00fcn</span>' +
                        '</div></div>' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
                        '</button>';
                });
                html += '</div>';
            }
            // Also show parent's own items if any
            if (parentCat && parentCat.items && parentCat.items.length > 0) {
                html += '<div class="menuai-b-items">';
                parentCat.items.forEach(function (item) {
                    html += buildItemHtml(item, null);
                });
                html += '</div>';
            }
        } else {
            // Ana görünüm: dikey kategori listesi
            html += '<div class="menuai-b-catlist">';
            menuCategories.forEach(function (c, i) {
                var count = (c.items || []).length;
                var hasChildren = c.children && c.children.length > 0;
                if (hasChildren) {
                    // Count total items from children
                    count = 0;
                    c.children.forEach(function (child) { count += (child.items || []).length; });
                    count += (c.items || []).length;
                }
                var onclick = hasChildren ?
                    'menuaiSelectParent(\'' + escAttr(c.name) + '\')' :
                    'menuaiSelectCat(\'' + escAttr(c.name) + '\')';
                html += '<button class="menuai-b-catrow" onclick="' + onclick + '">' +
                    '<div class="menuai-b-catrow-left">' +
                    '<div class="menuai-b-catrow-info">' +
                    '<span class="menuai-b-catrow-name">' + esc(c.name) + '</span>' +
                    '<span class="menuai-b-catrow-count">' + count + ' \u00fcr\u00fcn</span>' +
                    '</div></div>' +
                    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
                    '</button>';
            });
            html += '</div>';
        }

        body.innerHTML = html;
        // Arama input'una focus koru
        if (searchQuery) {
            var inp = document.getElementById('menuai-search');
            if (inp) { inp.focus(); inp.setSelectionRange(searchQuery.length, searchQuery.length); }
        }
    }


    function buildItemHtml(item, catLabel) {
        return '<div class="menuai-b-item">' +
            '<div class="menuai-b-item-info">' +
            '<span class="menuai-b-item-name">' + esc(item.name) + '</span>' +
            (catLabel ? '<span class="menuai-b-item-cat">' + esc(catLabel) + '</span>' : '') +
            '<span class="menuai-b-item-price">\u20BA' + item.price + '</span>' +
            '</div>' +
            '<button class="menuai-b-add" onclick="menuaiAddToCart(\'' + escAttr(item.name) + '\',' + item.price + ')">+</button>' +
            '</div>';
    }

    function doSearch(q) {
        searchQuery = q;
        renderMenuPanel();
    }
    window.menuaiSearch = doSearch;

    function goBack() {
        if (activeCat && activeParent) {
            // Go back from subcategory items to parent's children list
            activeCat = null;
            renderMenuPanel();
        } else {
            // Go back to top level
            activeCat = null;
            activeParent = null;
            searchQuery = '';
            renderMenuPanel();
        }
    }
    window.menuaiGoBack = goBack;

    function selectCat(name) {
        activeCat = name;
        activeParent = null;
        searchQuery = '';
        renderMenuPanel();
    }
    window.menuaiSelectCat = selectCat;

    function selectParent(name) {
        activeParent = name;
        activeCat = null;
        searchQuery = '';
        renderMenuPanel();
    }
    window.menuaiSelectParent = selectParent;

    function selectSubCat(parentName, childName) {
        activeParent = parentName;
        activeCat = childName;
        searchQuery = '';
        renderMenuPanel();
    }
    window.menuaiSelectSubCat = selectSubCat;
    window.menuaiSelectCat = selectCat;

    // ═══════════════════════════════════════════════
    // 5. ALT BAR + UI ENJEKSİYONU
    // ═══════════════════════════════════════════════
    function injectUI() {
        if (document.getElementById("menuai-bottom-bar")) return;

        // Overlay (sheet'ler için)
        var ov = document.createElement("div"); ov.id = "menuai-overlay";
        ov.addEventListener("click", closeAllSheets);
        document.body.appendChild(ov);

        // ── LUXURY MAGIC PLATE FAB ──
        var plateWrap = document.createElement("div"); plateWrap.id = "menuai-plate-wrap";
        plateWrap.innerHTML =
            '<div id="menuai-plate" class="magic-plate" onclick="menuaiToggleMenu()">' +
            '<span id="menuai-plate-cta"><span class="menuai-plate-cta-icon">+</span><span class="menuai-plate-cta-text">Sipariş</span></span>' +
            '<span id="menuai-plate-badge" style="display:none">0</span>' +
            '</div>' +
            '<div id="menuai-plate-teaser">Menüyü aç • 2 sn</div>';
        document.body.appendChild(plateWrap);

        // ── MENÜ + SEPET PANELİ (TEK PANEL, İKİ SEKMELİ) ──
        var menuPanel = document.createElement("div"); menuPanel.id = "menuai-menu-panel"; menuPanel.className = "menuai-b-sheet menuai-b-sheet-right";
        menuPanel.innerHTML =
            '<div class="menuai-b-sheet-head">' +
            '<h3>\uD83C\uDF7D Men\u00fcAi</h3>' +
            '<button class="menuai-b-close" onclick="menuaiCloseAll()">\u2715</button>' +
            '</div>' +
            '<div class="menuai-b-sheet-body" id="menuai-menu-body"><div class="menuai-b-empty">Y\u00fckleniyor...</div></div>' +
            // ── GARSON / HESAP FOOTER ──
            '<div class="menuai-b-service-footer">' +
            '<button class="menuai-b-svc-btn menuai-b-svc-waiter" onclick="menuaiCallWaiter()">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>' +
            '<span>Garson \u00c7a\u011f\u0131r</span>' +
            '</button>' +
            '<button class="menuai-b-svc-btn menuai-b-svc-bill" onclick="menuaiRequestBill()">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' +
            '<span>Hesap \u0130ste</span>' +
            '</button>' +
            '</div>';
        document.body.appendChild(menuPanel);

        // Toast
        var toast = document.createElement("div"); toast.id = "menuai-toast"; toast.className = "menuai-toast";
        document.body.appendChild(toast);
    }

    function runPlateIntro() {
        var plate = document.getElementById("menuai-plate");
        var teaser = document.getElementById("menuai-plate-teaser");
        if (!plate) return;

        // One-shot nudge animation to signal interactivity.
        plate.classList.add("menuai-plate-hint-once");
        setTimeout(function () { plate.classList.remove("menuai-plate-hint-once"); }, 1400);

        if (!teaser) return;
        teaser.classList.add("show");
        var dismiss = function () { teaser.classList.remove("show"); };
        setTimeout(dismiss, 6000);
        plate.addEventListener("click", dismiss, { once: true });
    }

    // ═══════════════════════════════════════════════
    // 6. GARSON ÇAĞIR & HESAP İSTE
    // ═══════════════════════════════════════════════
    function callWaiter() {
        if (confirm("Garson \u00e7a\u011fr\u0131ls\u0131n m\u0131?")) {
            showToast("\uD83D\uDC4B Garson \u00e7a\u011fr\u0131l\u0131yor...");
        }
    }
    function requestBill() {
        if (confirm("Hesap istensin mi?")) {
            showToast("\uD83D\uDCCB Hesap istendi!");
        }
    }
    window.menuaiCallWaiter = callWaiter;
    window.menuaiRequestBill = requestBill;

    // ═══════════════════════════════════════════════
    // 7. CSS
    // ═══════════════════════════════════════════════
    function injectStyles() {
        if (document.getElementById("menuai-basic-styles")) return;
        var s = document.createElement("style"); s.id = "menuai-basic-styles";
        s.textContent =
            /* ── FONT ── */
            "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');" +

            /* ── LUXURY MAGIC PLATE FAB ── */
            "@keyframes plate-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}" +
            "@keyframes plate-orbit{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}" +
            "@keyframes plate-hint-nudge{0%{transform:translateX(0)}22%{transform:translateX(-7px)}48%{transform:translateX(4px)}72%{transform:translateX(-2px)}100%{transform:translateX(0)}}" +
            "@keyframes plate-sheen-drift{0%{transform:translate(-6%,-4%) rotate(-2deg);opacity:.24}" +
            "50%{opacity:.42}100%{transform:translate(6%,4%) rotate(4deg);opacity:.3}}" +
            "@keyframes badge-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.2)}}" +
            "@keyframes teaser-pop{0%{opacity:0;transform:translateY(6px) scale(.96)}100%{opacity:1;transform:translateY(0) scale(1)}}" +

            "#menuai-plate-wrap{position:fixed;bottom:35px;right:25px;z-index:99990}" +

            "#menuai-plate{cursor:pointer;position:relative;animation:plate-float 4s ease-in-out infinite;" +
            "width:80px;height:80px;border-radius:50%;background:none;border:none;" +
            "background-image:url('/public/assets/menuai-plate-gold-rim.png');" +
            "background-size:118%;background-repeat:no-repeat;background-position:center;" +
            "box-shadow:0 16px 30px rgba(0,0,0,.26),0 3px 8px rgba(0,0,0,.18),inset 0 -2px 4px rgba(0,0,0,.06);" +
            "transition:transform .3s cubic-bezier(.175,.885,.32,1.275)}" +
            "#menuai-plate.menuai-plate-hint-once{animation:plate-float 4s ease-in-out infinite,plate-hint-nudge .9s cubic-bezier(.2,.8,.2,1) 1}" +
            "#menuai-plate:hover{transform:translateY(-1px) scale(1.03) rotate(-1.2deg)}" +
            "#menuai-plate:active{animation:none;transform:scale(.96) rotate(0deg)}" +
            "#menuai-plate::before{content:'';position:absolute;top:-7px;left:-7px;right:-7px;bottom:-7px;border-radius:50%;" +
            "background:conic-gradient(from 0deg," +
            "rgba(43,221,187,0) 0deg,rgba(43,221,187,0) 208deg,rgba(43,221,187,.76) 232deg,rgba(43,221,187,.24) 246deg,rgba(43,221,187,0) 262deg," +
            "rgba(78,124,255,0) 262deg,rgba(78,124,255,.72) 286deg,rgba(78,124,255,.22) 302deg,rgba(78,124,255,0) 320deg," +
            "rgba(238,86,255,0) 320deg,rgba(238,86,255,.7) 342deg,rgba(238,86,255,.2) 354deg,rgba(238,86,255,0) 360deg);" +
            "-webkit-mask:radial-gradient(circle,transparent 57%,#000 63%,#000 74%,transparent 81%);" +
            "mask:radial-gradient(circle,transparent 57%,#000 63%,#000 74%,transparent 81%);" +
            "filter:blur(3px);mix-blend-mode:screen;opacity:.82;animation:plate-orbit 2.8s linear infinite;pointer-events:none;z-index:0}" +
            "#menuai-plate::after{content:'';position:absolute;top:0;left:0;right:0;bottom:0;border-radius:50%;" +
            "background:linear-gradient(135deg,rgba(255,255,255,.4) 0%,rgba(255,255,255,0) 50%);" +
            "animation:plate-sheen-drift 7s ease-in-out infinite alternate;pointer-events:none;z-index:1}" +

            "#menuai-plate-cta{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);" +
            "display:flex;align-items:center;gap:4px;padding:3px 7px;border-radius:999px;" +
            "background:rgba(255,255,255,.78);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);" +
            "box-shadow:0 2px 8px rgba(0,0,0,.12);pointer-events:none;z-index:2}" +
            ".menuai-plate-cta-icon{display:inline-flex;align-items:center;justify-content:center;" +
            "width:14px;height:14px;border-radius:50%;background:#0f172a;color:#fff;font-size:12px;font-weight:700;line-height:1}" +
            ".menuai-plate-cta-text{font-size:10px;font-weight:700;color:#0f172a;letter-spacing:.2px;text-transform:uppercase}" +

            "#menuai-plate-badge{position:absolute;top:0px;right:5px;background:#ef4444;color:#fff;" +
            "font-size:11px;font-weight:700;min-width:20px;height:20px;border-radius:10px;" +
            "display:flex;align-items:center;justify-content:center;padding:0 5px;" +
            "font-family:Inter,sans-serif;border:2px solid #C9B896;animation:badge-pulse 2s ease-in-out infinite;z-index:3}" +
            "#menuai-plate-badge.menuai-badge-empty{background:#0f172a;border-color:#9fb2d1;font-size:9px;letter-spacing:.2px;min-width:34px;height:18px;animation:none}" +
            "#menuai-plate-badge.menuai-badge-filled{background:#ef4444;border-color:#C9B896}" +

            "#menuai-plate-teaser{position:absolute;right:90px;bottom:22px;max-width:150px;" +
            "background:rgba(15,23,42,.92);color:#fff;padding:8px 10px;border-radius:10px;font-size:11px;" +
            "font-weight:600;line-height:1.2;opacity:0;transform:translateY(6px) scale(.96);pointer-events:none;" +
            "transition:opacity .25s ease,transform .25s ease;white-space:nowrap}" +
            "#menuai-plate-teaser::after{content:'';position:absolute;right:-6px;top:50%;transform:translateY(-50%);" +
            "border-left:6px solid rgba(15,23,42,.92);border-top:6px solid transparent;border-bottom:6px solid transparent}" +
            "#menuai-plate-teaser.show{opacity:1;transform:translateY(0) scale(1);animation:teaser-pop .26s ease both}" +


            /* ── OVERLAY ── */
            "#menuai-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99992;" +
            "opacity:0;pointer-events:none;transition:opacity .3s}" +
            "#menuai-overlay.open{opacity:1;pointer-events:auto}" +

            /* ── SHEET (BOTTOM) ── */
            ".menuai-b-sheet{position:fixed;bottom:0;left:0;right:0;" +
            "background:#1a1a1a;border-radius:20px 20px 0 0;z-index:99993;" +
            "transform:translateY(100%);transition:transform .35s cubic-bezier(.32,.72,0,1);" +
            "max-height:80vh;display:flex;flex-direction:column;font-family:Inter,sans-serif}" +
            ".menuai-b-sheet.open{transform:translateY(0)}" +

            /* ── SHEET (RIGHT / MENÜ) ── */
            ".menuai-b-sheet-right{left:auto;right:0;top:0;bottom:0;width:340px;max-width:85vw;" +
            "max-height:none;border-radius:0 0 0 20px;" +
            "transform:translateX(100%)}" +
            ".menuai-b-sheet-right.open{transform:translateX(0)}" +

            /* ── SERVICE FOOTER (Garson / Hesap) ── */
            ".menuai-b-service-footer{display:flex;gap:8px;padding:10px 16px;border-top:1px solid #2a2a2a;" +
            "background:#1a1a1a;flex-shrink:0}" +
            ".menuai-b-svc-btn{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;" +
            "background:#252525;border:1px solid #333;color:#ccc;border-radius:12px;" +
            "padding:12px 10px;cursor:pointer;font-family:Inter,sans-serif;font-size:13px;" +
            "font-weight:500;transition:all .2s}" +
            ".menuai-b-svc-btn:active{transform:scale(.96);background:#333}" +
            ".menuai-b-svc-waiter:active{color:#4fc3f7;border-color:#4fc3f7}" +
            ".menuai-b-svc-bill:active{color:#ffd54f;border-color:#ffd54f}" +

            ".menuai-b-sheet-head{padding:14px 20px 10px;display:flex;align-items:center;" +
            "justify-content:space-between;border-bottom:1px solid #2a2a2a}" +
            ".menuai-b-handle{position:absolute;top:8px;left:50%;transform:translateX(-50%);" +
            "width:40px;height:4px;border-radius:2px;background:#444}" +
            ".menuai-b-sheet-head h3{color:#fff;margin:0;font-size:18px;font-weight:600}" +
            ".menuai-b-close{background:none;border:none;color:#888;font-size:20px;cursor:pointer;padding:4px 8px}" +

            ".menuai-b-sheet-body{flex:1;overflow-y:auto;padding:0}" +
            ".menuai-b-sheet-foot{padding:16px 20px;border-top:1px solid #2a2a2a}" +

            ".menuai-b-empty{color:#666;text-align:center;padding:40px 20px;font-size:15px}" +

            /* ── ARAMA ── */
            ".menuai-b-search{display:flex;align-items:center;gap:8px;padding:10px 16px;" +
            "border-bottom:1px solid #2a2a2a;position:sticky;top:0;background:#1a1a1a;z-index:1}" +
            ".menuai-b-search input{flex:1;background:#252525;border:1px solid #333;border-radius:10px;" +
            "padding:10px 14px;color:#fff;font-size:14px;font-family:Inter,sans-serif;outline:none;" +
            "transition:border-color .2s}" +
            ".menuai-b-search input:focus{border-color:#e85d3a}" +
            ".menuai-b-search input::placeholder{color:#666}" +
            ".menuai-b-search-clear{background:none;border:none;color:#888;font-size:20px;" +
            "cursor:pointer;padding:0 4px;line-height:1}" +
            ".menuai-b-result-count{padding:8px 20px;color:#888;font-size:12px;font-weight:500}" +

            /* ── KATEGORİ LİSTESİ (Dikey) ── */
            ".menuai-b-catlist{padding:8px 0}" +
            ".menuai-b-catrow{display:flex;align-items:center;justify-content:space-between;" +
            "width:100%;padding:16px 20px;background:none;border:none;border-bottom:1px solid #222;" +
            "cursor:pointer;transition:background .15s;font-family:Inter,sans-serif}" +
            ".menuai-b-catrow:active{background:#252525}" +
            ".menuai-b-catrow-left{display:flex;align-items:center;gap:14px}" +
            ".menuai-b-catrow-info{display:flex;flex-direction:column;align-items:flex-start}" +
            ".menuai-b-catrow-name{color:#fff;font-size:15px;font-weight:600}" +
            ".menuai-b-catrow-count{color:#888;font-size:12px;margin-top:2px}" +

            /* ── GERİ BUTONU ── */
            ".menuai-b-back{display:flex;align-items:center;gap:6px;padding:12px 16px;" +
            "cursor:pointer;color:#aaa;font-size:13px;font-weight:500;border-bottom:1px solid #222;" +
            "transition:color .15s;font-family:Inter,sans-serif}" +
            ".menuai-b-back:active{color:#fff}" +
            ".menuai-b-cat-title{padding:12px 20px 8px;color:#fff;font-size:18px;font-weight:700;" +
            "font-family:Inter,sans-serif;border-bottom:1px solid #2a2a2a}" +

            /* ── ÜRÜN LİSTESİ ── */
            ".menuai-b-items{padding:8px 0}" +
            ".menuai-b-item{display:flex;align-items:center;justify-content:space-between;" +
            "padding:14px 20px;border-bottom:1px solid #222;transition:background .15s}" +
            ".menuai-b-item:active{background:#222}" +
            ".menuai-b-item-info{display:flex;flex-direction:column;flex:1;min-width:0}" +
            ".menuai-b-item-name{color:#fff;font-size:14px;font-weight:500;" +
            "white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
            ".menuai-b-item-cat{color:#888;font-size:11px;margin-top:1px}" +
            ".menuai-b-item-price{color:#f0784a;font-size:13px;font-weight:600;margin-top:3px}" +
            ".menuai-b-add{width:36px;height:36px;border-radius:50%;border:none;" +
            "background:linear-gradient(135deg,#e85d3a,#f0784a);color:#fff;font-size:20px;" +
            "font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;" +
            "flex-shrink:0;transition:all .15s;box-shadow:0 2px 10px rgba(232,93,58,.3)}" +
            ".menuai-b-add:active{transform:scale(.85)}" +

            /* ── CART ITEMS ── */
            ".menuai-b-cart-item{display:flex;flex-direction:column;" +
            "padding:14px 20px;border-bottom:1px solid #222}" +
            ".menuai-b-ci-info{display:flex;flex-direction:column;flex:1;min-width:0}" +
            ".menuai-b-ci-name{color:#fff;font-size:14px;font-weight:500;" +
            "white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
            ".menuai-b-ci-price{color:#f0784a;font-size:13px;font-weight:600;margin-top:2px}" +
            ".menuai-b-ci-actions{display:flex;align-items:center;gap:6px;margin-left:12px}" +
            ".menuai-b-qty{width:30px;height:30px;border-radius:8px;border:1px solid #444;" +
            "background:#2a2a2a;color:#fff;font-size:16px;font-weight:600;cursor:pointer;" +
            "display:flex;align-items:center;justify-content:center}" +
            ".menuai-b-qty:active{background:#444}" +
            ".menuai-b-ci-q{color:#fff;font-size:15px;font-weight:600;min-width:20px;text-align:center}" +
            ".menuai-b-del{background:none;border:none;font-size:16px;cursor:pointer;padding:4px;opacity:.5}" +
            ".menuai-b-del:active{opacity:1}" +
            ".menuai-b-ci-row{display:flex;align-items:center;justify-content:space-between;width:100%}" +
            ".menuai-b-ci-note{width:100%;background:#222;border:1px solid #333;border-radius:8px;" +
            "padding:8px 10px;color:#aaa;font-size:12px;font-family:Inter,sans-serif;outline:none;" +
            "margin-top:8px;transition:border-color .2s}" +
            ".menuai-b-ci-note:focus{border-color:#e85d3a;color:#fff}" +
            ".menuai-b-ci-note::placeholder{color:#555}" +

            /* ── TOTAL & SUBMIT ── */
            ".menuai-b-total{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}" +
            ".menuai-b-total span{color:#aaa;font-size:16px}" +
            ".menuai-b-total-val{color:#fff;font-size:22px;font-weight:700}" +
            ".menuai-b-submit{width:100%;padding:16px;border:none;border-radius:14px;" +
            "background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;font-size:16px;" +
            "font-weight:700;cursor:pointer;font-family:Inter,sans-serif;" +
            "box-shadow:0 4px 16px rgba(34,197,94,.35);transition:transform .15s}" +
            ".menuai-b-submit:active{transform:scale(.97)}" +

            /* ── CLOCHE OVERLAY ── */
            "#menuai-cloche-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.75);" +
            "backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);" +
            "z-index:200000;display:flex;align-items:center;justify-content:center;" +
            "flex-direction:column}" +
            "#menuai-cloche-wrap{will-change:transform;display:flex;align-items:center;" +
            "justify-content:center}" +

            /* ── TOAST ── */
            ".menuai-toast{position:fixed;top:20px;left:50%;transform:translateX(-50%) translateY(-100px);" +
            "background:#1a1a1a;color:#fff;padding:12px 24px;border-radius:12px;font-size:14px;" +
            "font-weight:500;z-index:200000;box-shadow:0 4px 20px rgba(0,0,0,.5);" +
            "border:1px solid #333;transition:transform .35s cubic-bezier(.32,.72,0,1);" +
            "font-family:Inter,sans-serif;pointer-events:none;white-space:nowrap}" +
            ".menuai-toast.show{transform:translateX(-50%) translateY(0)}" +

            /* ── TAB BAR ── */
            ".menuai-tabs{display:flex;border-bottom:1px solid #2a2a2a;position:sticky;top:0;background:#1a1a1a;z-index:2}" +
            ".menuai-tab{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;" +
            "padding:12px 8px;background:none;border:none;border-bottom:2px solid transparent;" +
            "color:#888;font-size:14px;font-weight:500;cursor:pointer;transition:all .2s;" +
            "font-family:Inter,sans-serif;position:relative}" +
            ".menuai-tab.active{color:#fff;border-bottom-color:#e85d3a}" +
            ".menuai-tab:hover{color:#ccc}" +
            ".menuai-tab-badge{background:#e85d3a;color:#fff;font-size:11px;font-weight:700;" +
            "min-width:18px;height:18px;border-radius:9px;display:inline-flex;align-items:center;" +
            "justify-content:center;padding:0 5px;margin-left:4px}" +

            /* ── CART EMPTY ── */
            ".menuai-b-cart-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;" +
            "padding:60px 20px;gap:12px;color:#666;font-size:15px;font-family:Inter,sans-serif}" +
            ".menuai-b-cart-empty p{margin:0;color:#888}" +
            ".menuai-tab-switch-btn{background:linear-gradient(135deg,#e85d3a,#f0784a);color:#fff;" +
            "border:none;border-radius:10px;padding:10px 20px;font-size:14px;font-weight:600;" +
            "cursor:pointer;font-family:Inter,sans-serif;margin-top:8px;transition:transform .15s}" +
            ".menuai-tab-switch-btn:active{transform:scale(.95)}" +

            /* ── CART FOOTER (inside panel body) ── */
            ".menuai-b-cart-footer{padding:16px 20px;border-top:1px solid #2a2a2a;" +
            "position:sticky;bottom:0;background:#1a1a1a}" +
            ".menuai-b-cart-items{padding:0}";
        document.head.appendChild(s);
    }

    // ═══════════════════════════════════════════════
    // 8. MENÜ VERİSİ YÜKLE
    // ═══════════════════════════════════════════════
    function fetchMenu() {
        var x = new XMLHttpRequest();
        x.open("GET", "/api/menu-items/" + SLUG);
        x.onload = function () {
            try {
                var d = JSON.parse(x.responseText);
                if (d.success && d.categories) {
                    menuCategories = d.categories;
                    console.log("[Men\u00fcAi Basic] \u2705 " + d.categories.length + " kategori y\u00fcklendi");
                    renderMenuPanel();
                }
            } catch (e) { console.warn("[Men\u00fcAi Basic] Parse hatas\u0131", e); }
        };
        x.send();
    }

    // ═══════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════
    function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
    function escAttr(s) { return s.replace(/'/g, "\\'").replace(/"/g, "&quot;"); }

    // ═══════════════════════════════════════════════
    // 9. BAŞLAT
    // ═══════════════════════════════════════════════
    function boot() {
        injectStyles();
        injectUI();
        updateBadge();
        runPlateIntro();
        fetchMenu();
    }
    if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", boot); }
    else { boot(); }
})();

