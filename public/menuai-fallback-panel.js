/**
 * MenüAi Fallback Product Panel
 * Image-based menüler için kategorili ürün listesi paneli
 * Text-match bulamazsa bu panel devreye girer
 */

(function () {
    // Bu fonksiyon global scope'a eklenir
    window.__menuaiFallbackPanel = function (menuCategories, addToCart) {

        // ══════ Styles ══════
        var style = document.createElement('style');
        style.id = 'menuai-pp-styles';
        style.textContent = [
            '#menuai-product-fab{position:fixed;bottom:20px;left:20px;height:46px;padding:0 18px;border-radius:23px;',
            'background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;',
            'cursor:pointer;z-index:99997;box-shadow:0 4px 20px rgba(99,102,241,.45);transition:transform .2s;',
            'font-family:Inter,system-ui,sans-serif;border:none;gap:6px}',
            '#menuai-product-fab:active{transform:scale(.92)}',
            '#menuai-product-fab svg{flex-shrink:0}',
            '#menuai-product-fab span{font-size:13px;font-weight:600;color:#fff;white-space:nowrap}',

            '#menuai-ppanel-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99998;',
            'opacity:0;pointer-events:none;transition:opacity .3s}',
            '#menuai-ppanel-overlay.open{opacity:1;pointer-events:auto}',

            '#menuai-ppanel{position:fixed;bottom:0;left:0;right:0;top:60px;',
            'background:#111;border-radius:20px 20px 0 0;z-index:100001;',
            'transform:translateY(100%);transition:transform .35s cubic-bezier(.32,.72,0,1);',
            'display:flex;flex-direction:column;font-family:Inter,system-ui,sans-serif;overflow:hidden;pointer-events:none}',
            '#menuai-ppanel.open{transform:translateY(0);pointer-events:auto}',

            '.menuai-pp-header{padding:14px 20px 10px;display:flex;align-items:center;justify-content:space-between;',
            'border-bottom:1px solid #222;flex-shrink:0}',
            '.menuai-pp-header h3{color:#fff;margin:0;font-size:18px;font-weight:600}',

            '.menuai-pp-search{padding:10px 20px;flex-shrink:0}',
            '.menuai-pp-search input{width:100%;padding:10px 14px;border-radius:10px;border:1px solid #333;',
            'background:#1a1a1a;color:#fff;font-size:14px;outline:none;box-sizing:border-box;',
            'font-family:Inter,system-ui,sans-serif}',
            '.menuai-pp-search input::placeholder{color:#666}',
            '.menuai-pp-search input:focus{border-color:#6366f1}',

            '.menuai-pp-cats{padding:6px 20px 10px;display:flex;gap:8px;overflow-x:auto;flex-shrink:0;',
            '-webkit-overflow-scrolling:touch;scrollbar-width:none}',
            '.menuai-pp-cats::-webkit-scrollbar{display:none}',
            '.menuai-pp-cat-btn{padding:6px 14px;border-radius:20px;border:1px solid #333;',
            'background:#1a1a1a;color:#aaa;font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap;',
            'transition:all .2s;font-family:Inter,system-ui,sans-serif;flex-shrink:0}',
            '.menuai-pp-cat-btn.active{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-color:transparent}',

            '.menuai-pp-items{flex:1;overflow-y:auto;padding:0 20px 80px;-webkit-overflow-scrolling:touch}',
            '.menuai-pp-item{display:flex;align-items:center;justify-content:space-between;',
            'padding:14px 0;border-bottom:1px solid #1a1a1a}',
            '.menuai-pp-item-info{flex:1;min-width:0;margin-right:12px}',
            '.menuai-pp-item-name{color:#fff;font-size:14px;font-weight:500;line-height:1.3}',
            '.menuai-pp-item-desc{color:#666;font-size:12px;margin-top:2px;line-height:1.3;',
            'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
            '.menuai-pp-item-price{color:#a78bfa;font-size:13px;font-weight:600;margin-top:3px}',
            '.menuai-pp-item .menuai-plus{flex-shrink:0;position:static;transform:none}'
        ].join('');
        document.head.appendChild(style);

        // ══════ FAB ══════
        var fab = document.createElement('div');
        fab.id = 'menuai-product-fab';
        fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" width="22" height="22"><path d="M4 6h16M4 12h16M4 18h16"/></svg><span>Sipariş</span>';
        fab.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); togglePanel(); });
        document.body.appendChild(fab);

        // ══════ Overlay ══════
        var ov = document.createElement('div');
        ov.id = 'menuai-ppanel-overlay';
        ov.addEventListener('click', function () { togglePanel(); });
        document.body.appendChild(ov);

        // ══════ Panel ══════
        var panel = document.createElement('div');
        panel.id = 'menuai-ppanel';
        panel.innerHTML = '<div class="menuai-pp-header">' +
            '<h3>\uD83D\uDCCB Sipariş Ver</h3>' +
            '<button class="menuai-close" style="background:none;border:none;color:#888;font-size:22px;cursor:pointer;padding:4px 8px">✕</button>' +
            '</div>' +
            '<div class="menuai-pp-search"><input type="text" id="menuai-pp-search-input" placeholder="Ürün ara..." /></div>' +
            '<div class="menuai-pp-cats" id="menuai-pp-cats"></div>' +
            '<div class="menuai-pp-items" id="menuai-pp-items"></div>';
        document.body.appendChild(panel);

        // Close button
        panel.querySelector('.menuai-close').addEventListener('click', function () { togglePanel(); });

        // ══════ State ══════
        var activeCat = 0;

        // ══════ Render Categories ══════
        function renderCats() {
            var container = document.getElementById('menuai-pp-cats');
            if (!container || !menuCategories.length) return;
            var html = '';
            menuCategories.forEach(function (c, idx) {
                html += '<button class="menuai-pp-cat-btn' + (idx === 0 ? ' active' : '') + '" data-idx="' + idx + '">' + escHtml(c.name) + '</button>';
            });
            container.innerHTML = html;
            container.querySelectorAll('.menuai-pp-cat-btn').forEach(function (btn) {
                btn.addEventListener('click', function (e) {
                    e.preventDefault(); e.stopPropagation();
                    container.querySelectorAll('.menuai-pp-cat-btn').forEach(function (b) { b.classList.remove('active'); });
                    this.classList.add('active');
                    activeCat = parseInt(this.getAttribute('data-idx'));
                    renderItems();
                    // Clear search
                    var si = document.getElementById('menuai-pp-search-input');
                    if (si) si.value = '';
                });
            });
            renderItems();
        }

        // ══════ Render Items ══════
        function renderItems() {
            var container = document.getElementById('menuai-pp-items');
            if (!container) return;
            var cat = menuCategories[activeCat];
            if (!cat) { container.innerHTML = '<div class="menuai-empty">Kategori bulunamadı</div>'; return; }
            var html = '';
            (cat.items || []).forEach(function (item) {
                html += buildItemHtml(item);
            });
            if (!html) html = '<div class="menuai-empty" style="color:#666;text-align:center;padding:40px 0">Bu kategoride ürün yok</div>';
            container.innerHTML = html;
            bindItemButtons(container);
        }

        // ══════ Filter Items ══════
        function filterItems(query) {
            var container = document.getElementById('menuai-pp-items');
            if (!container) return;
            var q = query.trim().toLowerCase();
            if (!q) { renderItems(); return; }
            var html = '';
            menuCategories.forEach(function (cat) {
                (cat.items || []).forEach(function (item) {
                    if (item.name.toLowerCase().indexOf(q) >= 0 || (item.description || '').toLowerCase().indexOf(q) >= 0) {
                        html += buildItemHtml(item, cat.name);
                    }
                });
            });
            if (!html) html = '<div class="menuai-empty" style="color:#666;text-align:center;padding:40px 0">Sonuç bulunamadı</div>';
            container.innerHTML = html;
            bindItemButtons(container);
        }

        // ══════ Build Item HTML ══════
        function buildItemHtml(item, catName) {
            var price = parseFloat(item.price) || 0;
            var desc = item.description || '';
            if (catName) desc = catName;
            return '<div class="menuai-pp-item">' +
                '<div class="menuai-pp-item-info">' +
                '<div class="menuai-pp-item-name">' + escHtml(item.name) + '</div>' +
                (desc ? '<div class="menuai-pp-item-desc">' + escHtml(desc) + '</div>' : '') +
                (price ? '<div class="menuai-pp-item-price">\u20BA' + price + '</div>' : '') +
                '</div>' +
                '<button class="menuai-plus" data-n="' + escAttr(item.name) + '" data-p="' + price + '">+</button>' +
                '</div>';
        }

        // ══════ Bind + Buttons ══════
        function bindItemButtons(container) {
            container.querySelectorAll('.menuai-plus').forEach(function (btn) {
                btn.addEventListener('click', function (e) {
                    e.preventDefault(); e.stopPropagation();
                    addToCart(this.getAttribute('data-n'), parseFloat(this.getAttribute('data-p')));
                    this.textContent = '\u2713';
                    this.style.background = 'linear-gradient(135deg,#22c55e,#16a34a)';
                    var s = this;
                    setTimeout(function () { s.textContent = '+'; s.style.background = ''; }, 600);
                });
            });
        }

        // ══════ Toggle Panel ══════
        function togglePanel() {
            var isOpen = panel.classList.contains('open');
            if (isOpen) {
                panel.classList.remove('open');
                ov.classList.remove('open');
            } else {
                panel.classList.add('open');
                ov.classList.add('open');
            }
        }

        // ══════ Escape HTML ══════
        function escHtml(str) {
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        function escAttr(str) {
            return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        // ══════ Search Handler ══════
        var searchInput = document.getElementById('menuai-pp-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', function () { filterItems(this.value); });
        }

        // Init
        renderCats();
        console.log('[MenüAi] Fallback panel injected — ' + menuCategories.length + ' kategori');
    };
})();
