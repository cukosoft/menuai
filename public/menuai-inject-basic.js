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
        if (total > 0) {
            badge.style.display = "flex";
            badge.textContent = String(total);
            badge.classList.remove("menuai-badge-empty");
            badge.classList.add("menuai-badge-filled");
        } else {
            badge.style.display = "none";
            badge.textContent = "";
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
            '<p style="font-family:Manrope,sans-serif;font-size:14px;color:#64748b;margin:0">Toplam: \u20BA' + total.toFixed(0) + '</p>' +
            '<div style="margin-top:6px;max-height:30vh;overflow-y:auto;width:260px">' +
            (function () {
                var items = '';
                for (var ci = 0; ci < cart.length; ci++) {
                    var it = cart[ci];
                    items += '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(15,23,42,0.1);font-family:Manrope,sans-serif">' +
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
    var fabExpanded = false;
    var fabExpandedAt = 0;

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
        if (document.getElementById("menuai-plate-wrap") || document.getElementById("menuai-menu-panel")) return;

        // Overlay (sheet'ler için)
        var ov = document.createElement("div"); ov.id = "menuai-overlay";
        ov.addEventListener("click", closeAllSheets);
        document.body.appendChild(ov);

        // ── SMART ACTION FAB ──
        var plateWrap = document.createElement("div"); plateWrap.id = "menuai-plate-wrap";
        plateWrap.innerHTML =
            '<button id="menuai-mini-bell" class="menuai-mini-fab menuai-mini-bell" onclick="event.stopPropagation();menuaiCallWaiter()">' +
            '<img src="/public/assets/menuai-bell-gold.png" alt="Garson Çağır" loading="lazy" onerror="this.style.display=\'none\';this.parentNode.querySelector(\'span\').style.display=\'inline\';">' +
            '<span style="display:none">🔔</span>' +
            '</button>' +
            '<button id="menuai-mini-bill" class="menuai-mini-fab menuai-mini-bill" onclick="event.stopPropagation();menuaiRequestBill()">' +
            '<img src="/public/assets/menuai-bill-glass.png" alt="Hesap İste" loading="lazy" onerror="this.style.display=\'none\';this.parentNode.querySelector(\'span\').style.display=\'inline\';">' +
            '<span style="display:none">🧾</span>' +
            '</button>' +
            '<button id="menuai-plate" class="magic-plate" onclick="menuaiPrimaryFabTap()">' +
            '<span class="menuai-orbit"></span>' +
            '<span class="menuai-cutlery-icon">' +
            '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
            '<path d="M4 3v7M7 3v7M10 3v7M7 10v11"/><path d="M18 3c0 3-3 3-3 6v12"/>' +
            '</svg>' +
            '</span>' +
            '<span id="menuai-plate-badge" style="display:none">0</span>' +
            '</button>';
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

    function setFabExpanded(expanded) {
        fabExpanded = !!expanded;
        if (fabExpanded) fabExpandedAt = Date.now();
        var wrap = document.getElementById("menuai-plate-wrap");
        if (wrap) {
            if (fabExpanded) wrap.classList.add("expanded");
            else wrap.classList.remove("expanded");
        }
    }

    function primaryFabTap() {
        if (!fabExpanded) {
            setFabExpanded(true);
            return;
        }
        if (Date.now() - fabExpandedAt < 260) return;
        toggleMenuPanel();
    }
    window.menuaiPrimaryFabTap = primaryFabTap;

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
            "@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap');" +

            /* ── LUXURY MAGIC PLATE FAB ── */
            "@keyframes plate-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}" +
            "@keyframes badge-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.2)}}" +
            "@keyframes orbit-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}" +
            "@keyframes fab-spark{0%,100%{box-shadow:0 10px 24px rgba(0,0,0,.35),0 0 0 1px rgba(255,255,255,.2),0 0 18px rgba(227,187,98,.2)}50%{box-shadow:0 10px 24px rgba(0,0,0,.35),0 0 0 1px rgba(255,255,255,.25),0 0 28px rgba(227,187,98,.45)}}" +
            "@keyframes wink{0%,75%,100%{opacity:1;transform:translateY(0) scale(1)}82%{opacity:.55;transform:translateY(-1px) scale(.97)}88%{opacity:1;transform:translateY(0) scale(1)}}" +
            ":root{" +
            "--menuai-bg:rgba(11,15,23,.32);" +
            "--menuai-bg-strong:rgba(11,15,23,.44);" +
            "--menuai-border:rgba(255,255,255,.16);" +
            "--menuai-dash:rgba(255,255,255,.14);" +
            "--menuai-text:#f6f7fb;" +
            "--menuai-muted:#b8c1d1;" +
            "--menuai-gold:#e3bb62;" +
            "--menuai-gold-soft:#f3d88d;" +
            "--menuai-glass:rgba(22,28,40,.22);" +
            "--menuai-glass-strong:rgba(12,17,27,.34);" +
            "--menuai-glass-line:rgba(255,255,255,.28);" +
            "--menuai-gold-line:rgba(227,187,98,.48);" +
            "--menuai-chip:linear-gradient(180deg,rgba(84,89,99,.92),rgba(40,43,51,.94));" +
            "--menuai-chip-shadow:0 10px 22px rgba(12,18,31,.35);" +
            "}" +
            ".menuai-b-sheet,.menuai-b-sheet *,#menuai-plate-badge,.menuai-toast{font-family:'Plus Jakarta Sans',Manrope,sans-serif}" +

            "#menuai-plate-wrap{position:fixed;bottom:35px;right:25px;z-index:99990;display:flex;align-items:center;justify-content:flex-end;gap:10px;min-width:220px}" +
            "#menuai-plate-wrap.expanded #menuai-mini-bell{opacity:1;pointer-events:auto;transform:translateX(-124px) scale(1)}" +
            "#menuai-plate-wrap.expanded #menuai-mini-bill{opacity:1;pointer-events:auto;transform:translateX(-62px) scale(1)}" +

            ".menuai-mini-fab{position:absolute;right:0;bottom:8px;width:48px;height:48px;border-radius:14px;border:1px solid rgba(255,255,255,.32);" +
            "background:linear-gradient(145deg,rgba(88,98,116,.5),rgba(36,42,56,.34));backdrop-filter:blur(12px) saturate(120%);" +
            "-webkit-backdrop-filter:blur(12px) saturate(130%);display:flex;align-items:center;justify-content:center;cursor:pointer;" +
            "color:#f4f4f6;font-size:22px;box-shadow:0 10px 20px rgba(0,0,0,.35),0 0 14px rgba(227,187,98,.2);opacity:0;pointer-events:none;z-index:2;" +
            "transform:translateX(0) scale(.88);transition:transform .42s cubic-bezier(.34,1.56,.64,1),opacity .25s;overflow:hidden;animation:wink 3.6s ease-in-out infinite}" +
            ".menuai-mini-fab img{max-width:74%;max-height:74%;object-fit:contain;filter:drop-shadow(0 2px 6px rgba(0,0,0,.35))}" +
            ".menuai-mini-bell{animation-delay:.2s}" +
            ".menuai-mini-bill{animation-delay:1.1s}" +

            "#menuai-plate{cursor:pointer;position:absolute;right:0;bottom:0;animation:plate-float 4s ease-in-out infinite, fab-spark 2.8s ease-in-out infinite;" +
            "width:72px;height:72px;border-radius:20px;border:1px solid rgba(255,255,255,.34);" +
            "background:linear-gradient(145deg,rgba(84,96,118,.58),rgba(38,46,62,.4));" +
            "backdrop-filter:blur(16px) saturate(135%);-webkit-backdrop-filter:blur(16px) saturate(135%);" +
            "display:flex;align-items:center;justify-content:center;color:#f6eec8;z-index:3;" +
            "transition:transform .3s cubic-bezier(.175,.885,.32,1.275)}" +
            "#menuai-plate:hover{transform:translateY(-1px) scale(1.03)}" +
            "#menuai-plate:active{animation:none;transform:scale(.96)}" +
            ".menuai-cutlery-icon{position:relative;z-index:2;filter:drop-shadow(0 0 8px rgba(245,219,138,.34));opacity:.98}" +
            ".menuai-orbit{position:absolute;inset:-6px;border-radius:24px;border:2px solid rgba(237,199,89,.8);box-shadow:0 0 20px rgba(237,199,89,.35)}" +
            ".menuai-orbit::after{content:'';position:absolute;width:9px;height:9px;border-radius:50%;background:#ffe491;" +
            "top:-5px;left:50%;margin-left:-4px;box-shadow:0 0 10px rgba(255,230,142,.9),0 0 18px rgba(255,216,106,.85)}" +
            ".menuai-orbit{animation:orbit-spin 4.6s linear infinite}" +


            "#menuai-plate-badge{position:absolute;top:0px;right:5px;background:#ef4444;color:#fff;" +
            "font-size:11px;font-weight:700;min-width:20px;height:20px;border-radius:10px;" +
            "display:flex;align-items:center;justify-content:center;padding:0 5px;" +
            "font-family:'Plus Jakarta Sans',Manrope,sans-serif;border:2px solid #C9B896;animation:badge-pulse 2s ease-in-out infinite;z-index:3}" +
            "#menuai-plate-badge.menuai-badge-empty{background:#dc2626;border-color:#7f1d1d;font-size:12px;font-weight:800;letter-spacing:.15px;min-width:62px;height:26px;padding:0 10px;animation:none;box-shadow:0 6px 14px rgba(220,38,38,.32)}" +
            "#menuai-plate-badge.menuai-badge-filled{background:#dc2626;border-color:#7f1d1d}" +



            /* ── OVERLAY ── */
            "#menuai-overlay{position:fixed;inset:0;background:rgba(5,8,14,.18);z-index:99992;" +
            "opacity:0;pointer-events:none;transition:opacity .3s}" +
            "#menuai-overlay.open{opacity:1;pointer-events:auto}" +

            /* ── SHEET (BOTTOM) ── */
            ".menuai-b-sheet{position:fixed;bottom:0;left:0;right:0;" +
            "background:linear-gradient(160deg,rgba(22,28,39,.26),rgba(9,13,21,.34) 62%),var(--menuai-bg);" +
            "backdrop-filter:blur(22px) saturate(145%);-webkit-backdrop-filter:blur(22px) saturate(145%);" +
            "border:1px solid var(--menuai-border);border-radius:24px 24px 0 0;z-index:99993;position:fixed;overflow:hidden;" +
            "transform:translateY(100%);transition:transform .35s cubic-bezier(.32,.72,0,1);" +
            "max-height:82vh;display:flex;flex-direction:column;font-family:'Plus Jakarta Sans',Manrope,sans-serif;" +
            "box-shadow:0 18px 46px rgba(0,0,0,.45)}" +
            ".menuai-b-sheet::before{content:'';position:absolute;inset:0;" +
            "background:radial-gradient(120% 75% at 18% -12%,rgba(255,255,255,.2),rgba(255,255,255,0) 55%)," +
            "radial-gradient(80% 50% at 95% 120%,rgba(227,187,98,.12),rgba(227,187,98,0) 65%);" +
            "pointer-events:none}" +
            ".menuai-b-sheet>*{position:relative;z-index:1}" +
            ".menuai-b-sheet.open{transform:translateY(0)}" +

            /* ── SHEET (RIGHT / MENÜ) ── */
            ".menuai-b-sheet-right{left:auto;right:0;top:0;bottom:0;width:356px;max-width:88vw;" +
            "max-height:none;border-radius:0 0 0 24px;" +
            "transform:translateX(100%)}" +
            ".menuai-b-sheet-right.open{transform:translateX(0)}" +

            /* ── SERVICE FOOTER (Garson / Hesap) ── */
            ".menuai-b-service-footer{display:flex;gap:8px;padding:12px 16px;border-top:1px dashed var(--menuai-dash);" +
            "background:transparent;flex-shrink:0}" +
            ".menuai-b-svc-btn{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;" +
            "background:var(--menuai-chip);border:1px solid var(--menuai-border);color:var(--menuai-text);border-radius:999px;" +
            "padding:12px 10px;cursor:pointer;font-family:'Plus Jakarta Sans',Manrope,sans-serif;font-size:13px;" +
            "font-weight:700;transition:all .2s;box-shadow:var(--menuai-chip-shadow)}" +
            ".menuai-b-svc-btn:active{transform:scale(.96);filter:brightness(.95)}" +
            ".menuai-b-svc-waiter:active{box-shadow:0 8px 18px rgba(43,183,255,.28)}" +
            ".menuai-b-svc-bill:active{box-shadow:0 8px 18px rgba(214,166,74,.35)}" +

            ".menuai-b-sheet-head{padding:16px 20px 12px;display:flex;align-items:center;" +
            "justify-content:space-between;border-bottom:1px dashed var(--menuai-dash)}" +
            ".menuai-b-handle{position:absolute;top:8px;left:50%;transform:translateX(-50%);" +
            "width:40px;height:4px;border-radius:2px;background:rgba(255,255,255,.26)}" +
            ".menuai-b-sheet-head h3{color:var(--menuai-text);margin:0;font-size:20px;font-weight:800;letter-spacing:-.2px}" +
            ".menuai-b-close{background:none;border:none;color:var(--menuai-muted);font-size:20px;cursor:pointer;padding:4px 8px}" +

            ".menuai-b-sheet-body{flex:1;overflow-y:auto;padding:0}" +
            ".menuai-b-sheet-foot{padding:16px 20px;border-top:1px solid #2a2a2a}" +

            ".menuai-b-empty{color:var(--menuai-muted);text-align:center;padding:40px 20px;font-size:15px}" +

            /* ── ARAMA ── */
            ".menuai-b-search{display:flex;align-items:center;gap:8px;padding:10px 16px;" +
            "border-bottom:1px dashed var(--menuai-dash);position:sticky;top:0;background:rgba(8,12,20,.22);" +
            "backdrop-filter:blur(16px) saturate(140%);-webkit-backdrop-filter:blur(16px) saturate(140%);z-index:1}" +
            ".menuai-b-search input{flex:1;background:linear-gradient(135deg,rgba(255,255,255,.12),rgba(255,255,255,.04));border:1px solid var(--menuai-glass-line);border-radius:12px;" +
            "padding:10px 14px;color:var(--menuai-text);font-size:14px;font-family:'Plus Jakarta Sans',Manrope,sans-serif;outline:none;" +
            "transition:border-color .2s}" +
            ".menuai-b-search input:focus{border-color:var(--menuai-gold);box-shadow:0 0 0 1px rgba(227,187,98,.22),0 8px 20px rgba(0,0,0,.24)}" +
            ".menuai-b-search input::placeholder{color:#9ca3af}" +
            ".menuai-b-search-clear{background:none;border:none;color:var(--menuai-muted);font-size:20px;" +
            "cursor:pointer;padding:0 4px;line-height:1}" +
            ".menuai-b-result-count{padding:8px 20px;color:var(--menuai-muted);font-size:12px;font-weight:600}" +

            /* ── KATEGORİ LİSTESİ (Dikey) ── */
            ".menuai-b-catlist{padding:8px 0 12px}" +
            ".menuai-b-catrow{display:flex;align-items:center;justify-content:space-between;" +
            "width:calc(100% - 24px);margin:8px 12px;padding:14px 14px 14px 16px;" +
            "background:linear-gradient(140deg,rgba(255,255,255,.13),rgba(255,255,255,.03));" +
            "backdrop-filter:blur(18px) saturate(135%);-webkit-backdrop-filter:blur(18px) saturate(135%);" +
            "border:1px solid var(--menuai-gold-line);border-radius:14px;" +
            "cursor:pointer;transition:background .15s;font-family:'Plus Jakarta Sans',Manrope,sans-serif}" +
            ".menuai-b-catrow:active{background:linear-gradient(140deg,rgba(255,255,255,.14),rgba(255,255,255,.04))}" +
            ".menuai-b-catrow-left{display:flex;align-items:center;gap:14px}" +
            ".menuai-b-catrow-info{display:flex;flex-direction:column;align-items:flex-start}" +
            ".menuai-b-catrow-name{color:var(--menuai-text);font-size:15px;font-weight:700}" +
            ".menuai-b-catrow-count{color:var(--menuai-muted);font-size:12px;margin-top:2px}" +

            /* ── GERİ BUTONU ── */
            ".menuai-b-back{display:flex;align-items:center;gap:6px;padding:12px 16px;" +
            "cursor:pointer;color:var(--menuai-muted);font-size:13px;font-weight:600;border-bottom:1px dashed var(--menuai-dash);" +
            "transition:color .15s;font-family:'Plus Jakarta Sans',Manrope,sans-serif}" +
            ".menuai-b-back:active{color:var(--menuai-text)}" +
            ".menuai-b-cat-title{padding:12px 20px 8px;color:var(--menuai-text);font-size:19px;font-weight:800;" +
            "font-family:'Plus Jakarta Sans',Manrope,sans-serif;border-bottom:1px dashed var(--menuai-dash)}" +

            /* ── ÜRÜN LİSTESİ ── */
            ".menuai-b-items{padding:8px 0 14px}" +
            ".menuai-b-item{display:flex;align-items:center;justify-content:space-between;" +
            "width:calc(100% - 24px);margin:8px 12px;padding:14px 14px 14px 16px;" +
            "background:linear-gradient(140deg,rgba(255,255,255,.13),rgba(255,255,255,.03));" +
            "backdrop-filter:blur(18px) saturate(135%);-webkit-backdrop-filter:blur(18px) saturate(135%);" +
            "border:1px solid var(--menuai-gold-line);border-radius:14px;transition:background .15s}" +
            ".menuai-b-item:active{background:linear-gradient(140deg,rgba(255,255,255,.14),rgba(255,255,255,.04))}" +
            ".menuai-b-item-info{display:flex;flex-direction:column;flex:1;min-width:0}" +
            ".menuai-b-item-name{color:var(--menuai-text);font-size:14px;font-weight:700;" +
            "white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
            ".menuai-b-item-cat{color:var(--menuai-muted);font-size:11px;margin-top:1px}" +
            ".menuai-b-item-price{color:var(--menuai-gold);font-size:13px;font-weight:700;margin-top:3px}" +
            ".menuai-b-add{width:36px;height:36px;border-radius:50%;border:none;" +
            "background:var(--menuai-chip);color:#fff;font-size:20px;" +
            "font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;" +
            "flex-shrink:0;transition:all .15s;box-shadow:var(--menuai-chip-shadow)}" +
            ".menuai-b-add:active{transform:scale(.85)}" +

            /* ── CART ITEMS ── */
            ".menuai-b-cart-item{display:flex;flex-direction:column;" +
            "width:calc(100% - 24px);margin:8px 12px;padding:14px 14px 12px 16px;" +
            "background:linear-gradient(140deg,rgba(255,255,255,.12),rgba(255,255,255,.03));" +
            "backdrop-filter:blur(18px) saturate(135%);-webkit-backdrop-filter:blur(18px) saturate(135%);" +
            "border:1px solid var(--menuai-glass-line);border-radius:14px}" +
            ".menuai-b-ci-info{display:flex;flex-direction:column;flex:1;min-width:0}" +
            ".menuai-b-ci-name{color:var(--menuai-text);font-size:14px;font-weight:700;" +
            "white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
            ".menuai-b-ci-price{color:var(--menuai-gold);font-size:13px;font-weight:700;margin-top:2px}" +
            ".menuai-b-ci-actions{display:flex;align-items:center;gap:6px;margin-left:12px}" +
            ".menuai-b-qty{width:30px;height:30px;border-radius:10px;border:1px solid rgba(255,255,255,.22);" +
            "background:rgba(255,255,255,.08);color:#fff;font-size:16px;font-weight:700;cursor:pointer;" +
            "display:flex;align-items:center;justify-content:center}" +
            ".menuai-b-qty:active{background:rgba(255,255,255,.16)}" +
            ".menuai-b-ci-q{color:#fff;font-size:15px;font-weight:700;min-width:20px;text-align:center}" +
            ".menuai-b-del{background:none;border:none;font-size:16px;cursor:pointer;padding:4px;opacity:.55}" +
            ".menuai-b-del:active{opacity:1}" +
            ".menuai-b-ci-row{display:flex;align-items:center;justify-content:space-between;width:100%}" +
            ".menuai-b-ci-note{width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.16);border-radius:10px;" +
            "padding:8px 10px;color:var(--menuai-text);font-size:12px;font-family:'Plus Jakarta Sans',Manrope,sans-serif;outline:none;" +
            "margin-top:8px;transition:border-color .2s}" +
            ".menuai-b-ci-note:focus{border-color:var(--menuai-gold);color:#fff}" +
            ".menuai-b-ci-note::placeholder{color:#9ca3af}" +

            /* ── TOTAL & SUBMIT ── */
            ".menuai-b-total{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}" +
            ".menuai-b-total span{color:var(--menuai-muted);font-size:16px}" +
            ".menuai-b-total-val{color:#fff;font-size:30px;font-weight:800;letter-spacing:-.5px}" +
            ".menuai-b-submit{width:100%;padding:16px;border:none;border-radius:14px;" +
            "background:var(--menuai-chip);color:#fff;font-size:16px;" +
            "font-weight:800;cursor:pointer;font-family:'Plus Jakarta Sans',Manrope,sans-serif;" +
            "box-shadow:var(--menuai-chip-shadow);transition:transform .15s}" +
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
            "background:rgba(7,10,15,.9);color:#fff;padding:12px 24px;border-radius:14px;font-size:14px;" +
            "font-weight:700;z-index:200000;box-shadow:0 8px 24px rgba(0,0,0,.35);" +
            "border:1px solid var(--menuai-border);transition:transform .35s cubic-bezier(.32,.72,0,1);" +
            "font-family:'Plus Jakarta Sans',Manrope,sans-serif;pointer-events:none;white-space:nowrap}" +
            ".menuai-toast.show{transform:translateX(-50%) translateY(0)}" +

            /* ── TAB BAR ── */
            ".menuai-tabs{display:flex;border-bottom:1px dashed var(--menuai-dash);position:sticky;top:0;background:rgba(8,12,20,.24);" +
            "backdrop-filter:blur(16px) saturate(140%);-webkit-backdrop-filter:blur(16px) saturate(140%);z-index:2}" +
            ".menuai-tab{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;" +
            "padding:12px 8px;background:none;border:none;border-bottom:2px solid transparent;" +
            "color:var(--menuai-muted);font-size:14px;font-weight:700;cursor:pointer;transition:all .2s;" +
            "font-family:'Plus Jakarta Sans',Manrope,sans-serif;position:relative}" +
            ".menuai-tab.active{color:#fff;border-bottom-color:var(--menuai-gold)}" +
            ".menuai-tab:hover{color:#fff}" +
            ".menuai-tab-badge{background:var(--menuai-gold);color:#111827;font-size:11px;font-weight:800;" +
            "min-width:18px;height:18px;border-radius:9px;display:inline-flex;align-items:center;" +
            "justify-content:center;padding:0 5px;margin-left:4px}" +

            /* ── CART EMPTY ── */
            ".menuai-b-cart-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;" +
            "padding:60px 20px;gap:12px;color:var(--menuai-muted);font-size:15px;font-family:'Plus Jakarta Sans',Manrope,sans-serif}" +
            ".menuai-b-cart-empty p{margin:0;color:var(--menuai-muted)}" +
            ".menuai-tab-switch-btn{background:var(--menuai-chip);color:#fff;" +
            "border:none;border-radius:10px;padding:10px 20px;font-size:14px;font-weight:600;" +
            "cursor:pointer;font-family:'Plus Jakarta Sans',Manrope,sans-serif;margin-top:8px;transition:transform .15s}" +
            ".menuai-tab-switch-btn:active{transform:scale(.95)}" +

            /* ── CART FOOTER (inside panel body) ── */
            ".menuai-b-cart-footer{padding:16px 20px;border-top:1px dashed var(--menuai-dash);" +
            "position:sticky;bottom:0;background:var(--menuai-bg-strong)}" +
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
        fetchMenu();
    }
    if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", boot); }
    else { boot(); }
})();
