/**
 * MenÃ¼Ai Basic Tier â€” Client-Side Injection Script
 * Orijinal menÃ¼ sitesi aynen gÃ¶sterilir, Ã¼stÃ¼ne sadece:
 * - Alt bar: Garson Ã‡aÄŸÄ±r | Hesap Ä°ste | SipariÅŸ Ver
 * - SaÄŸ floating buton: Kategorik menÃ¼ paneli
 * - Sepet sistemi
 * 
 * Placeholders: __MENUAI_SLUG__, __MENUAI_ORIGIN__
 */
(function () {
    var SLUG = "__MENUAI_SLUG__";
    var PROXY_PREFIX = "/p/" + SLUG;
    var ORIGIN = "__MENUAI_ORIGIN__";

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // 1. NETWORK INTERCEPTOR (sadece proxy modunda gerekli)
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // 2. SEPET SÄ°STEMÄ°
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
        var badge = document.getElementById("menuai-fab-badge");
        if (!badge) return;
        if (total > 0) {
            badge.style.display = "flex";
            badge.textContent = String(total);
        } else {
            badge.style.display = "none";
            badge.textContent = "";
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
            // â”€â”€ CLOCHE SVG â”€â”€
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
            // â”€â”€ SUCCESS CONTENT â”€â”€
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

        // â”€â”€ ANIMATION TIMELINE â”€â”€
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

        // 0.0s â€” Dim overlay
        tl.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.3 });

        // 0.2s â€” Cloche descends
        tl.fromTo(cloche,
            { y: "-150vh", scale: 1 },
            { y: "0", duration: 1.2, ease: "power2.in" },
            0.2
        );

        // 0.8s â€” Landing impact (squash & stretch)
        tl.to(cloche, { scaleY: 0.93, scaleX: 1.07, duration: 0.08, ease: "power1.in" });
        tl.to(cloche, { scaleY: 1, scaleX: 1, duration: 0.15, ease: "elastic.out(1.2,0.4)" });

        // Haptic feedback
        tl.call(function () {
            if (navigator.vibrate) navigator.vibrate(50);
        });

        // Pause (anticipation)
        tl.to({}, { duration: 0.8 });

        // 1.4s â€” Cloche lifts up & reveals
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

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // 3. SHEET HELPERS
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    function openSheet(id) {
        var s = document.getElementById(id);
        var ov = document.getElementById("menuai-overlay");
        if (s) s.classList.add("open");
        if (ov) ov.classList.add("open");
        renderMenuPanel();
        // Hide bell/bill while menu panel is open
        hideMiniButtons(true);
    }
    function closeSheet(id) {
        var s = document.getElementById(id);
        var ov = document.getElementById("menuai-overlay");
        if (s) s.classList.remove("open");
        if (ov) ov.classList.remove("open");
        // Bring bell/bill back when menu closes (if already expanded)
        if (fabExpanded) hideMiniButtons(false);
    }
    function closeAllSheets() {
        closeSheet("menuai-menu-panel");
    }
    window.menuaiOpenCart = function () { activeTab = 'cart'; openSheet("menuai-menu-panel"); };
    window.menuaiCloseAll = closeAllSheets;

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // 4. KATEGORÄ°K MENÃœ PANELÄ°
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    var menuCategories = [];
    var activeCat = null;
    var activeParent = null; // For hierarchical menus
    var activeTab = 'menu'; // 'menu' or 'cart'
    var fabExpanded = false;
    var fabExpandedAt = 0;

    function toggleMenuPanel() {
        // Backward-compatible guard:
        // If any older DOM still calls menuaiToggleMenu directly, first tap must only expand actions.
        if (!fabExpanded) {
            setFabExpanded(true);
            return;
        }
        if (Date.now() - fabExpandedAt < 260) return;

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
            // â”€â”€ CART TAB â”€â”€
            html += renderCartContent();
            body.innerHTML = html;
            return;
        }

        // â”€â”€ MENU TAB â”€â”€
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
            // Arama modunda: tÃ¼m kategorilerden eÅŸleÅŸen Ã¼rÃ¼nleri gÃ¶ster
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
            // Kategori detay gÃ¶rÃ¼nÃ¼mÃ¼: geri butonu + Ã¼rÃ¼n listesi
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
            // Parent seÃ§ildi: alt kategorileri gÃ¶ster
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
            // Ana gÃ¶rÃ¼nÃ¼m: dikey kategori listesi
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

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // 5. ALT BAR + UI ENJEKSÄ°YONU
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    function injectUI() {
        // Overlay
        var ov = document.getElementById("menuai-overlay");
        if (!ov) {
            ov = document.createElement("div"); ov.id = "menuai-overlay";
            ov.addEventListener("click", closeAllSheets);
            document.body.appendChild(ov);
        }

        // ── Gold Skeuomorphic FAB ──
        var fab = document.getElementById("menuai-fab");
        if (!fab) {
            fab = document.createElement("div");
            fab.id = "menuai-fab";
            document.body.appendChild(fab);
        }
        fab.innerHTML =
            /* Glass bezel frame */
            '<div class="m-glass-bezel">' +
            /* Gold surface */
            '<div class="m-gold-surface">' +
            /* Bell zone (hidden initially) */
            '<button id="menuai-fab-bell" class="m-fab-zone m-fab-side" onclick="event.stopPropagation();menuaiCallWaiter()" aria-label="Garson Çağır">' +
            '<svg viewBox="0 0 24 24"><path d="M12 2a1 1 0 011 1v1.07A7 7 0 0119 11v3.29a1 1 0 00.3.7L21 16.71A1 1 0 0120.29 18H3.71A1 1 0 013 16.71L4.71 15a1 1 0 00.29-.71V11a7 7 0 016-6.93V3a1 1 0 011-1z"/><path d="M9 18a3 3 0 006 0"/></svg>' +
            '</button>' +
            /* Main center zone (always visible) */
            '<button id="menuai-fab-main" class="m-fab-zone m-fab-center" onclick="menuaiPrimaryFabTap()" aria-label="Menü">' +
            '<span class="m-fab-badge" id="menuai-fab-badge">0</span>' +
            '</button>' +
            /* Bill zone (hidden initially) */
            '<button id="menuai-fab-bill" class="m-fab-zone m-fab-side" onclick="event.stopPropagation();menuaiRequestBill()" aria-label="Hesap İste">' +
            '<svg viewBox="0 0 24 24"><path d="M9 7h6M9 11h6M9 15h4"/><path d="M5 3h14a1 1 0 011 1v16.382a.5.5 0 01-.724.447L17 19.618l-2.276 1.211a.5.5 0 01-.448 0L12 19.618l-2.276 1.211a.5.5 0 01-.448 0L7 19.618l-2.276 1.211A.5.5 0 014 20.382V4a1 1 0 011-1z"/></svg>' +
            '</button>' +
            '</div>' + /* end gold-surface */
            '</div>'; /* end glass-bezel */

        // Menu + cart panel
        var menuPanel = document.getElementById("menuai-menu-panel");
        if (!menuPanel) {
            menuPanel = document.createElement("div"); menuPanel.id = "menuai-menu-panel"; menuPanel.className = "menuai-b-sheet menuai-b-sheet-right";
            menuPanel.innerHTML =
                '<div class="menuai-b-sheet-head">' +
                '<h3>Menü</h3>' +
                '<button class="menuai-b-close" onclick="menuaiCloseAll()">✕</button>' +
                '</div>' +
                '<div class="menuai-b-sheet-body" id="menuai-menu-body"><div class="menuai-b-empty">Yükleniyor...</div></div>' +
                '<div class="menuai-b-service-footer">' +
                '<button class="menuai-b-svc-btn" onclick="menuaiCallWaiter()">' +
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5"/><path d="M10 17a2 2 0 004 0"/></svg>' +
                '<span>Garson Çağır</span>' +
                '</button>' +
                '<button class="menuai-b-svc-btn" onclick="menuaiRequestBill()">' +
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 3h10a1 1 0 011 1v16l-2-1-2 1-2-1-2 1-2-1-2 1V4a1 1 0 011-1z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>' +
                '<span>Hesap İste</span>' +
                '</button>' +
                '</div>';
            document.body.appendChild(menuPanel);
        }

        var toast = document.getElementById("menuai-toast");
        if (!toast) {
            toast = document.createElement("div"); toast.id = "menuai-toast"; toast.className = "menuai-toast";
            document.body.appendChild(toast);
        }

        setFabExpanded(false);
    }

    function setFabExpanded(expanded) {
        fabExpanded = !!expanded;
        if (fabExpanded) fabExpandedAt = Date.now();
        var fab = document.getElementById("menuai-fab");
        var bell = document.getElementById("menuai-fab-bell");
        var bill = document.getElementById("menuai-fab-bill");
        var bezel = fab ? fab.querySelector(".m-glass-bezel") : null;
        var surface = fab ? fab.querySelector(".m-gold-surface") : null;
        if (!fab || !bell || !bill || !bezel || !surface) return;

        if (fabExpanded) {
            fab.classList.add("expanded");
            if (typeof gsap !== "undefined") {
                // Morph bezel: squircle → pill
                gsap.to(bezel, { borderRadius: "32px", duration: 0.55, ease: "elastic.out(1,0.5)" });
                gsap.to(surface, { borderRadius: "28px", duration: 0.55, ease: "elastic.out(1,0.5)" });
                // Expand side zones
                gsap.to(bell, {
                    width: 52, opacity: 1, duration: 0.5, ease: "elastic.out(1,0.6)", delay: 0.08,
                    onStart: function () { bell.style.pointerEvents = "auto"; }
                });
                gsap.to(bill, {
                    width: 52, opacity: 1, duration: 0.5, ease: "elastic.out(1,0.6)", delay: 0.14,
                    onStart: function () { bill.style.pointerEvents = "auto"; }
                });
            } else {
                bezel.style.borderRadius = "32px";
                surface.style.borderRadius = "28px";
                bell.style.cssText += "width:52px;opacity:1;pointer-events:auto";
                bill.style.cssText += "width:52px;opacity:1;pointer-events:auto";
            }
        } else {
            fab.classList.remove("expanded");
            if (typeof gsap !== "undefined") {
                // Collapse side zones
                gsap.to([bell, bill], {
                    width: 0, opacity: 0, duration: 0.3, ease: "power3.inOut",
                    onComplete: function () { bell.style.pointerEvents = "none"; bill.style.pointerEvents = "none"; }
                });
                // Morph back to squircle
                gsap.to(bezel, { borderRadius: "26px", duration: 0.4, ease: "power2.out", delay: 0.1 });
                gsap.to(surface, { borderRadius: "22px", duration: 0.4, ease: "power2.out", delay: 0.1 });
            } else {
                bezel.style.borderRadius = "26px";
                surface.style.borderRadius = "22px";
                bell.style.cssText += "width:0;opacity:0;pointer-events:none";
                bill.style.cssText += "width:0;opacity:0;pointer-events:none";
            }
        }
    }

    function hideMiniButtons(hide) {
        var bell = document.getElementById("menuai-fab-bell");
        var bill = document.getElementById("menuai-fab-bill");
        if (!bell || !bill) return;
        if (hide) {
            if (typeof gsap !== "undefined") {
                gsap.to([bell, bill], {
                    width: 0, opacity: 0, duration: 0.25, ease: "power2.inOut",
                    onComplete: function () { bell.style.pointerEvents = "none"; bill.style.pointerEvents = "none"; }
                });
            } else {
                bell.style.cssText += "width:0;opacity:0;pointer-events:none";
                bill.style.cssText += "width:0;opacity:0;pointer-events:none";
            }
        } else if (fabExpanded) {
            if (typeof gsap !== "undefined") {
                gsap.to(bell, {
                    width: 52, opacity: 1, duration: 0.4, ease: "elastic.out(1,0.6)",
                    onStart: function () { bell.style.pointerEvents = "auto"; }
                });
                gsap.to(bill, {
                    width: 52, opacity: 1, duration: 0.4, ease: "elastic.out(1,0.6)", delay: 0.06,
                    onStart: function () { bill.style.pointerEvents = "auto"; }
                });
            } else {
                bell.style.cssText += "width:52px;opacity:1;pointer-events:auto";
                bill.style.cssText += "width:52px;opacity:1;pointer-events:auto";
            }
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

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // 6. GARSON Ã‡AÄIR & HESAP Ä°STE
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // 7. CSS
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    function injectStyles() {
        if (document.getElementById("menuai-basic-styles")) return;
        var s = document.createElement("style"); s.id = "menuai-basic-styles";
        s.textContent =
            /* ── FONT ── */
            "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');" +

            /* ── DESIGN TOKENS (Gold Skeuomorphic V2) ── */
            ":root{" +
            "--m-gold-highlight:#F5E6A3;" +
            "--m-gold-light:#DAB04D;" +
            "--m-gold:#B8860B;" +
            "--m-gold-dark:#8B6914;" +
            "--m-gold-shadow:#5C3D0A;" +
            "--m-gold-glow:rgba(218,176,77,.6);" +
            "--m-bg:rgba(28,28,30,.72);" +
            "--m-surface:rgba(44,44,46,.65);" +
            "--m-fill:rgba(120,120,128,.36);" +
            "--m-separator:rgba(84,84,88,.65);" +
            "--m-label:#FFFFFF;" +
            "--m-label2:rgba(235,235,245,.6);" +
            "--m-label3:rgba(235,235,245,.3);" +
            "--m-accent:#D4A650;" +
            "--m-accent-glow:rgba(212,166,80,.35);" +
            "--m-red:#FF453A;" +
            "--m-font:'Inter',-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',system-ui,sans-serif;" +
            "--m-r-sm:13px;--m-r-md:20px;--m-r-lg:26px;" +
            "}" +

            /* ── FAB CONTAINER ── */
            "@keyframes m-breathe{" +
            "0%,100%{filter:drop-shadow(0 4px 12px rgba(92,61,10,.4))}" +
            "50%{filter:drop-shadow(0 6px 20px rgba(218,176,77,.55)) drop-shadow(0 0 15px rgba(218,176,77,.25))}}" +
            "#menuai-fab{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:99990;" +
            "animation:m-breathe 3s ease-in-out infinite}" +

            /* ── GLASS BEZEL (outer crystal frame) ── */
            ".m-glass-bezel{" +
            "padding:5px;" +
            "border-radius:var(--m-r-lg);" +
            "background:linear-gradient(160deg,rgba(255,255,255,.45) 0%,rgba(255,255,255,.12) 40%,rgba(255,255,255,.06) 60%,rgba(255,255,255,.25) 100%);" +
            "border:1px solid rgba(255,255,255,.5);" +
            "box-shadow:" +
            "0 0 0 1px rgba(184,134,11,.25)," +
            "inset 0 1px 2px rgba(255,255,255,.6)," +
            "inset 0 -1px 1px rgba(0,0,0,.08)," +
            "0 10px 40px rgba(92,61,10,.35)," +
            "0 2px 8px rgba(0,0,0,.2);" +
            "transition:border-radius .5s cubic-bezier(.4,0,.2,1)}" +

            /* ── GOLD SURFACE (inner metal body) ── */
            ".m-gold-surface{" +
            "display:flex;align-items:center;justify-content:center;" +
            "background:" +
            "linear-gradient(165deg," +
            "#F5E6A3 0%," +
            "#DAB04D 15%," +
            "#B8860B 30%," +
            "#8B6914 50%," +
            "#B8860B 65%," +
            "#DAB04D 80%," +
            "#F5E6A3 95%," +
            "#DAB04D 100%);" +
            "border-radius:calc(var(--m-r-lg) - 5px);" +
            "position:relative;overflow:hidden;gap:0;" +
            "box-shadow:" +
            "inset 0 3px 6px rgba(245,230,163,.5)," +
            "inset 0 -3px 6px rgba(92,61,10,.45)," +
            "inset 1px 0 3px rgba(245,230,163,.2)," +
            "inset -1px 0 3px rgba(92,61,10,.15)," +
            "0 1px 3px rgba(0,0,0,.25);" +
            "transition:border-radius .5s cubic-bezier(.4,0,.2,1)}" +

            /* Brushed metal texture (visible fine lines) */
            ".m-gold-surface::before{content:'';position:absolute;inset:0;" +
            "background:repeating-linear-gradient(105deg," +
            "transparent 0px,transparent 2px," +
            "rgba(255,255,255,.07) 2px,rgba(255,255,255,.07) 3px," +
            "transparent 3px,transparent 5px," +
            "rgba(0,0,0,.03) 5px,rgba(0,0,0,.03) 6px);" +
            "pointer-events:none;z-index:1;mix-blend-mode:overlay}" +

            /* Specular highlight (top-left hot spot) */
            ".m-gold-surface::after{content:'';position:absolute;" +
            "top:-30%;left:-20%;width:100%;height:100%;" +
            "background:radial-gradient(ellipse at 35% 30%," +
            "rgba(255,255,255,.35) 0%," +
            "rgba(255,255,255,.1) 30%," +
            "transparent 60%);" +
            "pointer-events:none;z-index:2}" +

            /* ── FAB ZONE (button base) ── */
            ".m-fab-zone{border:none;background:transparent;cursor:pointer;display:flex;" +
            "align-items:center;justify-content:center;position:relative;z-index:3;" +
            "-webkit-tap-highlight-color:transparent;padding:0}" +
            ".m-fab-zone:active{transform:scale(.90);transition:transform .1s}" +

            /* ── CENTER ZONE ── */
            ".m-fab-center{width:56px;height:56px;flex-shrink:0}" +

            /* ── GROOVE DIVIDERS between zones (engraved metal lines) ── */
            "#menuai-fab.expanded .m-fab-center{" +
            "border-left:1px solid rgba(92,61,10,.5);" +
            "border-right:1px solid rgba(92,61,10,.5);" +
            "box-shadow:" +
            "-1px 0 0 rgba(245,230,163,.3)," +
            "1px 0 0 rgba(245,230,163,.3);" +
            "margin:0 2px}" +

            /* ── BADGE (embossed number) ── */
            ".m-fab-badge{" +
            "font-family:var(--m-font);font-size:24px;font-weight:900;" +
            "color:#5C3D0A;" +
            "text-shadow:" +
            "0 1.5px 0 rgba(245,230,163,.7)," +
            "0 -1px 0 rgba(92,61,10,.8)," +
            "0 0 8px rgba(218,176,77,.3);" +
            "letter-spacing:-.5px;line-height:1}" +
            ".m-fab-badge:empty,.m-fab-badge[data-count='0']{display:none}" +

            /* ── SIDE ZONES (bell & bill) ── */
            ".m-fab-side{width:0;height:56px;overflow:hidden;opacity:0;pointer-events:none;" +
            "display:flex;align-items:center;justify-content:center}" +
            ".m-fab-side svg{width:28px;height:28px;flex-shrink:0;" +
            "fill:#5C3D0A;stroke:none;" +
            "filter:" +
            "drop-shadow(0 1.5px 0 rgba(245,230,163,.6))" +
            "drop-shadow(0 -1px 0 rgba(92,61,10,.7));" +
            "opacity:.9}" +
            /* Amber glow behind when expanded */
            "#menuai-fab.expanded .m-fab-side svg{" +
            "filter:" +
            "drop-shadow(0 1.5px 0 rgba(245,230,163,.6))" +
            "drop-shadow(0 -1px 0 rgba(92,61,10,.7))" +
            "drop-shadow(0 0 10px rgba(218,176,77,.5));" +
            "opacity:1}" +

            /* ── OVERLAY ── */
            "#menuai-overlay{position:fixed;inset:0;background:rgba(0,0,0,.32);z-index:99992;" +
            "opacity:0;pointer-events:none;transition:opacity .3s ease;" +
            "backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px)}" +
            "#menuai-overlay.open{opacity:1;pointer-events:auto}" +

            /* ── SHEET (RIGHT PANEL) ── */
            ".menuai-b-sheet{position:fixed;top:0;bottom:0;right:0;width:380px;max-width:92vw;" +
            "background:rgba(28,28,30,.82);" +
            "backdrop-filter:blur(50px) saturate(190%);-webkit-backdrop-filter:blur(50px) saturate(190%);" +
            "border-left:1px solid rgba(255,255,255,.08);z-index:99993;" +
            "transform:translateX(100%);transition:transform .38s cubic-bezier(.32,.72,0,1);" +
            "display:flex;flex-direction:column;font-family:var(--m-font);" +
            "box-shadow:-8px 0 40px rgba(0,0,0,.35)}" +
            ".menuai-b-sheet.open{transform:translateX(0)}" +

            /* ── SHEET HEAD ── */
            ".menuai-b-sheet-head{padding:20px 20px 16px;display:flex;align-items:center;" +
            "justify-content:space-between;border-bottom:1px solid var(--m-separator)}" +
            ".menuai-b-sheet-head h3{color:var(--m-label);margin:0;font-size:20px;font-weight:800;letter-spacing:-.3px}" +
            ".menuai-b-close{width:30px;height:30px;border-radius:50%;border:none;" +
            "background:rgba(255,255,255,.1);color:var(--m-label2);font-size:15px;cursor:pointer;" +
            "display:flex;align-items:center;justify-content:center;transition:background .15s}" +
            ".menuai-b-close:active{background:rgba(255,255,255,.18)}" +

            /* ── SERVICE FOOTER ── */
            ".menuai-b-service-footer{display:flex;gap:8px;padding:12px 16px;border-top:1px solid var(--m-separator);" +
            "background:rgba(28,28,30,.5);flex-shrink:0}" +
            ".menuai-b-svc-btn{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;" +
            "background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.06);color:var(--m-label2);border-radius:var(--m-r-sm);" +
            "padding:12px 10px;cursor:pointer;font-family:var(--m-font);font-size:13px;" +
            "font-weight:600;transition:all .15s}" +
            ".menuai-b-svc-btn:active{transform:scale(.96);background:rgba(255,255,255,.12)}" +

            ".menuai-b-sheet-body{flex:1;overflow-y:auto;padding:0;-webkit-overflow-scrolling:touch}" +

            ".menuai-b-empty{color:var(--m-label3);text-align:center;padding:60px 20px;font-size:15px}" +

            /* ── SEARCH ── */
            ".menuai-b-search{display:flex;align-items:center;gap:8px;padding:10px 16px;" +
            "border-bottom:1px solid var(--m-separator);position:sticky;top:0;background:rgba(28,28,30,.85);" +
            "backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);z-index:1}" +
            ".menuai-b-search input{flex:1;background:rgba(118,118,128,.24);border:none;border-radius:10px;" +
            "padding:10px 14px;color:var(--m-label);font-size:15px;font-family:var(--m-font);outline:none;" +
            "transition:box-shadow .2s}" +
            ".menuai-b-search input:focus{box-shadow:0 0 0 2px var(--m-accent)}" +
            ".menuai-b-search input::placeholder{color:var(--m-label3)}" +
            ".menuai-b-search-clear{background:none;border:none;color:var(--m-label3);font-size:18px;cursor:pointer;padding:0 4px}" +
            ".menuai-b-result-count{padding:8px 20px;color:var(--m-label3);font-size:12px;font-weight:600}" +

            /* ── CATEGORY LIST ── */
            ".menuai-b-catlist{padding:8px 0}" +
            ".menuai-b-catrow{display:flex;align-items:center;justify-content:space-between;" +
            "width:calc(100% - 24px);margin:4px 12px;padding:14px 16px;" +
            "background:rgba(255,255,255,.04);" +
            "border:none;border-radius:var(--m-r-sm);cursor:pointer;transition:background .12s;font-family:var(--m-font)}" +
            ".menuai-b-catrow:active{background:rgba(255,255,255,.1)}" +
            ".menuai-b-catrow-left{display:flex;align-items:center;gap:14px}" +
            ".menuai-b-catrow-info{display:flex;flex-direction:column}" +
            ".menuai-b-catrow-name{color:var(--m-label);font-size:15px;font-weight:600}" +
            ".menuai-b-catrow-count{color:var(--m-label3);font-size:12px;margin-top:2px}" +

            /* ── BACK BUTTON ── */
            ".menuai-b-back{display:flex;align-items:center;gap:6px;padding:12px 16px;" +
            "cursor:pointer;color:var(--m-accent);font-size:14px;font-weight:600;border-bottom:1px solid var(--m-separator);" +
            "transition:opacity .15s;font-family:var(--m-font)}" +
            ".menuai-b-back:active{opacity:.6}" +
            ".menuai-b-cat-title{padding:16px 20px 10px;color:var(--m-label);font-size:22px;font-weight:800;" +
            "font-family:var(--m-font);letter-spacing:-.3px;border-bottom:1px solid var(--m-separator)}" +

            /* ── ITEM LIST ── */
            ".menuai-b-items{padding:4px 0}" +
            ".menuai-b-item{display:flex;align-items:center;justify-content:space-between;" +
            "width:calc(100% - 24px);margin:2px 12px;padding:14px 16px;" +
            "background:transparent;border-radius:var(--m-r-sm);transition:background .12s}" +
            ".menuai-b-item:active{background:rgba(255,255,255,.06)}" +
            ".menuai-b-item-info{display:flex;flex-direction:column;flex:1;min-width:0}" +
            ".menuai-b-item-name{color:var(--m-label);font-size:15px;font-weight:600;" +
            "white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
            ".menuai-b-item-cat{color:var(--m-label3);font-size:12px;margin-top:2px}" +
            ".menuai-b-item-price{color:var(--m-accent);font-size:14px;font-weight:700;margin-top:3px}" +
            ".menuai-b-add{width:32px;height:32px;border-radius:50%;border:none;" +
            "background:rgba(255,255,255,.1);color:var(--m-label);font-size:20px;" +
            "font-weight:400;cursor:pointer;display:flex;align-items:center;justify-content:center;" +
            "flex-shrink:0;transition:all .12s}" +
            ".menuai-b-add:active{background:var(--m-accent);transform:scale(.88)}" +

            /* ── CART ITEMS ── */
            ".menuai-b-cart-item{display:flex;flex-direction:column;" +
            "width:calc(100% - 24px);margin:4px 12px;padding:14px 16px;" +
            "background:rgba(255,255,255,.04);border-radius:var(--m-r-sm)}" +
            ".menuai-b-ci-info{display:flex;flex-direction:column;flex:1;min-width:0}" +
            ".menuai-b-ci-name{color:var(--m-label);font-size:15px;font-weight:600;" +
            "white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
            ".menuai-b-ci-price{color:var(--m-accent);font-size:14px;font-weight:700;margin-top:2px}" +
            ".menuai-b-ci-actions{display:flex;align-items:center;gap:8px;margin-left:12px}" +
            ".menuai-b-qty{width:30px;height:30px;border-radius:10px;border:none;" +
            "background:rgba(255,255,255,.1);color:var(--m-label);font-size:16px;font-weight:600;cursor:pointer;" +
            "display:flex;align-items:center;justify-content:center;transition:background .12s}" +
            ".menuai-b-qty:active{background:rgba(255,255,255,.2)}" +
            ".menuai-b-ci-q{color:var(--m-label);font-size:15px;font-weight:700;min-width:20px;text-align:center}" +
            ".menuai-b-del{background:none;border:none;font-size:16px;cursor:pointer;padding:4px;color:var(--m-red);opacity:.7}" +
            ".menuai-b-del:active{opacity:1}" +
            ".menuai-b-ci-row{display:flex;align-items:center;justify-content:space-between;width:100%}" +
            ".menuai-b-ci-note{width:100%;background:rgba(118,118,128,.24);border:none;border-radius:10px;" +
            "padding:10px 12px;color:var(--m-label);font-size:13px;font-family:var(--m-font);outline:none;" +
            "margin-top:10px;transition:box-shadow .2s}" +
            ".menuai-b-ci-note:focus{box-shadow:0 0 0 2px var(--m-accent)}" +
            ".menuai-b-ci-note::placeholder{color:var(--m-label3)}" +

            /* ── TOTAL & SUBMIT ── */
            ".menuai-b-total{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}" +
            ".menuai-b-total span{color:var(--m-label2);font-size:16px;font-weight:500}" +
            ".menuai-b-total-val{color:var(--m-label);font-size:28px;font-weight:800;letter-spacing:-.5px}" +
            ".menuai-b-submit{width:100%;padding:16px;border:none;border-radius:var(--m-r-sm);" +
            "background:var(--m-accent);color:#1a1a1a;font-size:16px;" +
            "font-weight:700;cursor:pointer;font-family:var(--m-font);transition:all .15s}" +
            ".menuai-b-submit:active{transform:scale(.97);filter:brightness(.9)}" +

            /* ── CLOCHE OVERLAY ── */
            "#menuai-cloche-overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);" +
            "backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);" +
            "z-index:200000;display:flex;align-items:center;justify-content:center;flex-direction:column}" +
            "#menuai-cloche-wrap{will-change:transform;display:flex;align-items:center;justify-content:center}" +

            /* ── TOAST ── */
            ".menuai-toast{position:fixed;top:20px;left:50%;transform:translateX(-50%) translateY(-100px);" +
            "background:rgba(30,30,32,.92);color:var(--m-label);padding:12px 24px;border-radius:var(--m-r-sm);font-size:14px;" +
            "font-weight:600;z-index:200000;box-shadow:0 8px 32px rgba(0,0,0,.4);" +
            "border:1px solid rgba(255,255,255,.08);transition:transform .35s cubic-bezier(.32,.72,0,1);" +
            "font-family:var(--m-font);pointer-events:none;white-space:nowrap;" +
            "backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}" +
            ".menuai-toast.show{transform:translateX(-50%) translateY(0)}" +

            /* ── TAB BAR ── */
            ".menuai-tabs{display:flex;border-bottom:1px solid var(--m-separator);position:sticky;top:0;" +
            "background:rgba(28,28,30,.9);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);z-index:2}" +
            ".menuai-tab{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;" +
            "padding:13px 8px;background:none;border:none;border-bottom:2px solid transparent;" +
            "color:var(--m-label2);font-size:14px;font-weight:600;cursor:pointer;transition:all .2s;" +
            "font-family:var(--m-font)}" +
            ".menuai-tab.active{color:var(--m-label);border-bottom-color:var(--m-accent)}" +
            ".menuai-tab-badge{background:var(--m-accent);color:#1a1a1a;font-size:11px;font-weight:800;" +
            "min-width:18px;height:18px;border-radius:9px;display:inline-flex;align-items:center;" +
            "justify-content:center;padding:0 5px;margin-left:4px}" +

            /* ── CART EMPTY ── */
            ".menuai-b-cart-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;" +
            "padding:60px 20px;gap:14px;color:var(--m-label3);font-size:15px;font-family:var(--m-font)}" +
            ".menuai-b-cart-empty p{margin:0}" +
            ".menuai-tab-switch-btn{background:rgba(255,255,255,.1);color:var(--m-label);" +
            "border:none;border-radius:10px;padding:10px 24px;font-size:14px;font-weight:600;" +
            "cursor:pointer;font-family:var(--m-font);margin-top:8px;transition:all .15s}" +
            ".menuai-tab-switch-btn:active{transform:scale(.95);background:rgba(255,255,255,.16)}" +

            /* ── CART FOOTER ── */
            ".menuai-b-cart-footer{padding:16px 20px;border-top:1px solid var(--m-separator);" +
            "position:sticky;bottom:0;background:rgba(28,28,30,.9);" +
            "backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}" +
            ".menuai-b-cart-items{padding:0}" +

            /* ── FAB BADGE ── */
            "#menuai-fab-badge{position:absolute;top:-4px;right:-4px;background:var(--m-red);color:#fff;" +
            "font-size:11px;font-weight:700;min-width:20px;height:20px;border-radius:10px;" +
            "display:flex;align-items:center;justify-content:center;padding:0 5px;" +
            "font-family:var(--m-font);border:2px solid rgba(30,30,32,.9);z-index:3}" +
            ".menuai-b-sheet-right{left:auto;right:0;top:0;bottom:0;width:380px;max-width:92vw;" +
            "max-height:none;border-radius:0}" +
            ".menuai-b-sheet-right.open{transform:translateX(0)}";
        document.head.appendChild(s);
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // 8. MENÃœ VERÄ°SÄ° YÃœKLE
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // HELPERS
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
    function escAttr(s) { return s.replace(/'/g, "\\'").replace(/"/g, "&quot;"); }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // 9. BAÅLAT
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    function boot() {
        injectStyles();
        injectUI();
        updateBadge();
        fetchMenu();
    }
    if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", boot); }
    else { boot(); }
})();


