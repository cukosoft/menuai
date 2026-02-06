/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MenüAi Ultimate Core v2.0
 * "Universal Wrapper" - Her türlü menüyü tek arayüzde birleştiren sistem
 * 
 * MODLAR:
 *   - IFRAME: Hızlı, SPA/React siteler için
 *   - PROXY:  Korumalı siteler için (X-Frame-Options bypass)
 *   - VIEWER: PDF dosyaları için
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const zlib = require('zlib');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// Uploads directory
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer setup for PDF uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Sadece PDF dosyaları kabul edilir!'));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// ═══════════════════════════════════════════════════════════════════════════
// SMART OVERLAY HTML/CSS/JS (Common for all modes)
// ═══════════════════════════════════════════════════════════════════════════

const SMART_OVERLAY = `
<!-- MenüAi Smart Overlay v3.0 - Modern Cart UX -->
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  
  .menuai-overlay *, .menuai-overlay *::before, .menuai-overlay *::after {
    box-sizing: border-box !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  
  .menuai-overlay {
    position: fixed !important;
    bottom: 0 !important;
    left: 0 !important;
    right: 0 !important;
    z-index: 999999 !important;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif !important;
    transition: transform 0.3s ease !important;
  }
  
  /* Bottom Sheet Cart */
  .menuai-cart-sheet {
    background: rgba(12, 12, 16, 0.95) !important;
    backdrop-filter: blur(20px) !important;
    -webkit-backdrop-filter: blur(20px) !important;
    border-top: 2px solid #00C2FF !important;
    border-radius: 20px 20px 0 0 !important;
    box-shadow: 0 -8px 40px rgba(0, 194, 255, 0.2) !important;
    max-height: 70vh !important;
    overflow: hidden !important;
    display: flex !important;
    flex-direction: column !important;
  }
  
  /* Cart Header - Always visible */
  .menuai-cart-header {
    padding: 16px 20px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
    cursor: pointer !important;
  }
  
  .menuai-cart-title {
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
    color: #fff !important;
    font-size: 15px !important;
    font-weight: 600 !important;
  }
  
  .menuai-cart-badge {
    background: linear-gradient(135deg, #00C2FF, #0090CC) !important;
    color: #fff !important;
    font-size: 12px !important;
    font-weight: 700 !important;
    padding: 4px 10px !important;
    border-radius: 12px !important;
    min-width: 24px !important;
    text-align: center !important;
  }
  
  .menuai-cart-total {
    color: #FFB800 !important;
    font-size: 16px !important;
    font-weight: 700 !important;
  }
  
  .menuai-cart-toggle {
    color: rgba(255, 255, 255, 0.5) !important;
    transition: transform 0.3s ease !important;
  }
  
  .menuai-cart-toggle.expanded {
    transform: rotate(180deg) !important;
  }
  
  /* Cart Items List */
  .menuai-cart-items {
    max-height: 0 !important;
    overflow-y: auto !important;
    transition: max-height 0.3s ease !important;
  }
  
  .menuai-cart-items.expanded {
    max-height: 35vh !important;
    padding: 8px 0 !important;
  }
  
  .menuai-cart-item {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    padding: 12px 20px !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04) !important;
  }
  
  .menuai-cart-item:last-child {
    border-bottom: none !important;
  }
  
  .menuai-item-info {
    flex: 1 !important;
    min-width: 0 !important;
  }
  
  .menuai-item-name {
    color: #fff !important;
    font-size: 14px !important;
    font-weight: 500 !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }
  
  .menuai-item-price {
    color: rgba(255, 255, 255, 0.5) !important;
    font-size: 12px !important;
    margin-top: 2px !important;
  }
  
  .menuai-item-controls {
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
  }
  
  .menuai-qty-btn {
    width: 28px !important;
    height: 28px !important;
    border-radius: 8px !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    background: rgba(255, 255, 255, 0.05) !important;
    color: #fff !important;
    font-size: 16px !important;
    font-weight: 600 !important;
    cursor: pointer !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    transition: all 0.15s ease !important;
  }
  
  .menuai-qty-btn:hover {
    background: rgba(0, 194, 255, 0.2) !important;
    border-color: #00C2FF !important;
  }
  
  .menuai-qty-btn.remove {
    border-color: rgba(239, 68, 68, 0.4) !important;
  }
  
  .menuai-qty-btn.remove:hover {
    background: rgba(239, 68, 68, 0.2) !important;
    border-color: #EF4444 !important;
  }
  
  .menuai-item-qty {
    color: #fff !important;
    font-size: 14px !important;
    font-weight: 600 !important;
    min-width: 24px !important;
    text-align: center !important;
  }
  
  .menuai-item-subtotal {
    color: #FFB800 !important;
    font-size: 14px !important;
    font-weight: 600 !important;
    min-width: 60px !important;
    text-align: right !important;
  }
  
  /* Search Bar & Actions */
  .menuai-actions {
    padding: 14px 16px 24px !important;
    display: flex !important;
    gap: 10px !important;
    background: rgba(8, 8, 12, 0.8) !important;
  }
  
  .menuai-search-wrap {
    position: relative !important;
    flex: 1 !important;
  }
  
  .menuai-autocomplete {
    position: absolute !important;
    bottom: 100% !important;
    left: 0 !important;
    right: 0 !important;
    max-height: 250px !important;
    overflow-y: auto !important;
    background: rgba(20, 20, 25, 0.98) !important;
    border: 1px solid rgba(0, 194, 255, 0.3) !important;
    border-bottom: none !important;
    border-radius: 12px 12px 0 0 !important;
    display: none !important;
    z-index: 999999 !important;
    backdrop-filter: blur(10px) !important;
  }
  
  .menuai-autocomplete.active {
    display: block !important;
  }
  
  .menuai-autocomplete-item {
    padding: 14px 18px !important;
    cursor: pointer !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
    display: flex !important;
    justify-content: space-between !important;
    align-items: center !important;
    transition: background 0.15s ease !important;
  }
  
  .menuai-autocomplete-item:hover, .menuai-autocomplete-item.selected {
    background: rgba(0, 194, 255, 0.15) !important;
  }
  
  .menuai-autocomplete-item .item-name {
    color: #fff !important;
    font-size: 14px !important;
    font-weight: 500 !important;
  }
  
  .menuai-autocomplete-item .item-name mark {
    background: transparent !important;
    color: #00C2FF !important;
    font-weight: 700 !important;
  }
  
  .menuai-autocomplete-item .item-price {
    color: #FFB800 !important;
    font-size: 13px !important;
    font-weight: 600 !important;
  }
  
  .menuai-autocomplete-item .item-add {
    color: #10B981 !important;
    font-size: 18px !important;
    margin-left: 12px !important;
  }
  
  .menuai-input {
    width: 100% !important;
    padding: 14px 18px !important;
    border: 1px solid rgba(255, 255, 255, 0.15) !important;
    border-radius: 14px !important;
    background: rgba(255, 255, 255, 0.06) !important;
    color: #fff !important;
    font-size: 14px !important;
    outline: none !important;
    transition: all 0.2s ease !important;
  }
  
  .menuai-input::placeholder {
    color: rgba(255, 255, 255, 0.4) !important;
  }
  
  .menuai-input:focus {
    border-color: #00C2FF !important;
    background: rgba(0, 194, 255, 0.08) !important;
    box-shadow: 0 0 0 3px rgba(0, 194, 255, 0.15) !important;
  }
  
  .menuai-btn {
    padding: 14px 20px !important;
    border: none !important;
    border-radius: 14px !important;
    font-size: 14px !important;
    font-weight: 600 !important;
    cursor: pointer !important;
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
    transition: all 0.2s ease !important;
    white-space: nowrap !important;
  }
  
  .menuai-btn:active {
    transform: scale(0.96) !important;
  }
  
  .menuai-btn.order {
    background: linear-gradient(135deg, #10B981, #059669) !important;
    color: #fff !important;
    flex: 1 !important;
    justify-content: center !important;
  }
  
  .menuai-btn.order:hover {
    box-shadow: 0 4px 20px rgba(16, 185, 129, 0.4) !important;
  }
  
  .menuai-btn.order:disabled {
    opacity: 0.5 !important;
    cursor: not-allowed !important;
  }
  
  .menuai-btn.garson {
    background: linear-gradient(135deg, #FFB800, #FF9500) !important;
    color: #000 !important;
  }
  
  .menuai-btn.garson:hover {
    box-shadow: 0 4px 20px rgba(255, 184, 0, 0.4) !important;
  }
  
  /* Toast */
  .menuai-toast {
    position: fixed !important;
    bottom: 200px !important;
    left: 50% !important;
    transform: translateX(-50%) translateY(20px) !important;
    padding: 14px 28px !important;
    background: rgba(16, 185, 129, 0.95) !important;
    color: #fff !important;
    border-radius: 12px !important;
    font-size: 14px !important;
    font-weight: 500 !important;
    opacity: 0 !important;
    pointer-events: none !important;
    transition: all 0.3s ease !important;
    z-index: 9999999 !important;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3) !important;
  }
  
  .menuai-toast.visible {
    opacity: 1 !important;
    transform: translateX(-50%) translateY(0) !important;
  }
  
  /* Mode Badge */
  .menuai-mode-badge {
    position: fixed !important;
    top: 10px !important;
    right: 10px !important;
    padding: 6px 12px !important;
    background: rgba(0, 194, 255, 0.15) !important;
    border: 1px solid rgba(0, 194, 255, 0.3) !important;
    border-radius: 20px !important;
    color: #00C2FF !important;
    font-size: 11px !important;
    font-weight: 600 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.5px !important;
    z-index: 999998 !important;
  }
  
  /* Empty cart message */
  .menuai-cart-empty {
    padding: 20px !important;
    text-align: center !important;
    color: rgba(255, 255, 255, 0.4) !important;
    font-size: 13px !important;
  }
  
  /* Body padding */
  body {
    padding-bottom: 180px !important;
  }
</style>

<div class="menuai-mode-badge" id="menuaiModeBadge">MODE</div>

<div class="menuai-overlay">
  <div class="menuai-cart-sheet">
    <!-- Cart Header -->
    <div class="menuai-cart-header" onclick="menuaiToggleCart()">
      <div class="menuai-cart-title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="9" cy="21" r="1"></circle>
          <circle cx="20" cy="21" r="1"></circle>
          <path d="m1 1 4 4h16l-2.5 9H7"></path>
        </svg>
        Sepetiniz
        <span class="menuai-cart-badge" id="menuaiCartCount">0</span>
      </div>
      <div class="menuai-cart-total" id="menuaiCartTotal">0 ₺</div>
      <svg class="menuai-cart-toggle" id="menuaiCartToggle" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="18 15 12 9 6 15"></polyline>
      </svg>
    </div>
    
    <!-- Cart Items -->
    <div class="menuai-cart-items" id="menuaiCartItems">
      <div class="menuai-cart-empty" id="menuaiCartEmpty">Sepetiniz boş. Ürün aramak için aşağıya yazın.</div>
    </div>
    
    <!-- Search & Actions -->
    <div class="menuai-actions">
      <div class="menuai-search-wrap">
        <div id="menuaiAutocomplete" class="menuai-autocomplete"></div>
        <input type="text" class="menuai-input" id="menuaiOrderInput" 
               placeholder="Ürün ara... (Örn: Adana, Çorba)" autocomplete="off">
      </div>
      <button class="menuai-btn order" id="menuaiOrderBtn" onclick="menuaiSendOrder()" disabled>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        Sipariş Ver
      </button>
      <button class="menuai-btn garson" onclick="menuaiCallWaiter()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 8h1a4 4 0 0 1 0 8h-1"></path>
          <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path>
        </svg>
      </button>
    </div>
  </div>
</div>

<div class="menuai-toast" id="menuaiToast"></div>

<script>
  (function() {
    // State
    var menuItems = [];
    var cart = [];
    var selectedIndex = -1;
    var debounceTimer = null;
    var cartExpanded = false;
    
    // Fetch menu data on load
    fetch('/api/menu/items')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        menuItems = data.items || [];
        console.log('[MenüAi] Menu loaded:', menuItems.length, 'items');
      })
      .catch(function(e) {
        console.log('[MenüAi] Menu not loaded:', e.message);
      });
    
    // Toast
    window.menuaiShowToast = function(msg, duration) {
      duration = duration || 2500;
      var toast = document.getElementById('menuaiToast');
      if (!toast) return;
      toast.textContent = msg;
      toast.classList.add('visible');
      setTimeout(function() { toast.classList.remove('visible'); }, duration);
    };
    
    // Toggle cart expansion
    window.menuaiToggleCart = function() {
      cartExpanded = !cartExpanded;
      var items = document.getElementById('menuaiCartItems');
      var toggle = document.getElementById('menuaiCartToggle');
      if (items && toggle) {
        items.classList.toggle('expanded', cartExpanded);
        toggle.classList.toggle('expanded', cartExpanded);
      }
    };
    
    // Update cart UI
    function updateCartUI() {
      var itemsEl = document.getElementById('menuaiCartItems');
      var countEl = document.getElementById('menuaiCartCount');
      var totalEl = document.getElementById('menuaiCartTotal');
      var emptyEl = document.getElementById('menuaiCartEmpty');
      var orderBtn = document.getElementById('menuaiOrderBtn');
      
      if (!itemsEl) return;
      
      var total = 0;
      var count = 0;
      
      cart.forEach(function(item) {
        total += item.price * item.qty;
        count += item.qty;
      });
      
      if (countEl) countEl.textContent = count;
      if (totalEl) totalEl.textContent = total.toLocaleString('tr-TR') + ' ₺';
      if (orderBtn) orderBtn.disabled = cart.length === 0;
      
      if (cart.length === 0) {
        if (emptyEl) emptyEl.style.display = 'block';
        itemsEl.innerHTML = '<div class="menuai-cart-empty">Sepetiniz boş. Ürün aramak için aşağıya yazın.</div>';
      } else {
        var html = '';
        cart.forEach(function(item, i) {
          html += '<div class="menuai-cart-item">';
          html += '<div class="menuai-item-info">';
          html += '<div class="menuai-item-name">' + item.name + '</div>';
          html += '<div class="menuai-item-price">' + item.price + ' ₺ / adet</div>';
          html += '</div>';
          html += '<div class="menuai-item-controls">';
          html += '<button class="menuai-qty-btn remove" onclick="menuaiUpdateQty(' + i + ', -1)">−</button>';
          html += '<span class="menuai-item-qty">' + item.qty + '</span>';
          html += '<button class="menuai-qty-btn" onclick="menuaiUpdateQty(' + i + ', 1)">+</button>';
          html += '<span class="menuai-item-subtotal">' + (item.price * item.qty) + ' ₺</span>';
          html += '</div>';
          html += '</div>';
        });
        itemsEl.innerHTML = html;
      }
    }
    
    // Add item to cart
    window.menuaiAddToCart = function(item) {
      var existing = cart.find(function(c) { return c.name === item.name; });
      if (existing) {
        existing.qty++;
      } else {
        cart.push({ name: item.name, price: item.price, qty: 1 });
      }
      updateCartUI();
      menuaiShowToast('✓ ' + item.name + ' eklendi');
      
      // Clear input
      var input = document.getElementById('menuaiOrderInput');
      if (input) input.value = '';
      hideAutocomplete();
      
      // Expand cart to show item
      if (!cartExpanded) {
        menuaiToggleCart();
      }
    };
    
    // Update quantity
    window.menuaiUpdateQty = function(index, delta) {
      if (cart[index]) {
        cart[index].qty += delta;
        if (cart[index].qty <= 0) {
          cart.splice(index, 1);
        }
        updateCartUI();
      }
    };
    
    // Send order
    window.menuaiSendOrder = function() {
      if (cart.length === 0) {
        menuaiShowToast('⚠️ Sepetiniz boş!');
        return;
      }
      
      var items = cart.map(function(c) { return c.qty + 'x ' + c.name; }).join(', ');
      var total = cart.reduce(function(sum, c) { return sum + (c.price * c.qty); }, 0);
      
      console.log('[MenüAi] Order:', { items: cart, total: total });
      menuaiShowToast('✅ Sipariş gönderildi! Toplam: ' + total + ' ₺');
      
      // Clear cart
      cart = [];
      updateCartUI();
      if (cartExpanded) menuaiToggleCart();
    };
    
    // Call waiter
    window.menuaiCallWaiter = function() {
      menuaiShowToast('🙋 Garson çağrıldı!');
      console.log('[MenüAi] Waiter called');
    };
    
    // Autocomplete
    function hideAutocomplete() {
      var ac = document.getElementById('menuaiAutocomplete');
      if (ac) {
        ac.classList.remove('active');
        ac.innerHTML = '';
      }
      selectedIndex = -1;
    }
    
    function highlightMatch(text, query) {
      if (!query || !text) return text;
      var lowerText = text.toLowerCase();
      var lowerQuery = query.toLowerCase();
      var idx = lowerText.indexOf(lowerQuery);
      if (idx === -1) return text;
      return text.substring(0, idx) + '<mark>' + text.substring(idx, idx + query.length) + '</mark>' + text.substring(idx + query.length);
    }
    
    function showAutocomplete(results, query) {
      var ac = document.getElementById('menuaiAutocomplete');
      if (!ac || results.length === 0) {
        hideAutocomplete();
        return;
      }
      
      var html = '';
      results.forEach(function(item, i) {
        html += '<div class="menuai-autocomplete-item' + (i === selectedIndex ? ' selected' : '') + '" data-index="' + i + '">';
        html += '<span class="item-name">' + highlightMatch(item.name, query) + '</span>';
        html += '<span class="item-price">' + item.price + ' ₺</span>';
        html += '<span class="item-add">+</span>';
        html += '</div>';
      });
      
      ac.innerHTML = html;
      ac.classList.add('active');
      
      // Click handlers
      var items = ac.querySelectorAll('.menuai-autocomplete-item');
      items.forEach(function(el) {
        el.addEventListener('click', function() {
          var idx = parseInt(el.dataset.index);
          menuaiAddToCart(results[idx]);
        });
      });
    }
    
    function searchMenu(query) {
      if (!query || query.length < 2) {
        hideAutocomplete();
        return;
      }
      
      query = query.toLowerCase();
      var results = menuItems.filter(function(item) {
        return item.name.toLowerCase().includes(query);
      }).slice(0, 6);
      
      showAutocomplete(results, query);
    }
    
    // Input event listener with debounce
    document.addEventListener('input', function(e) {
      if (e.target.id === 'menuaiOrderInput') {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function() {
          searchMenu(e.target.value);
        }, 150);
      }
    });
    
    // Keyboard navigation
    document.addEventListener('keydown', function(e) {
      if (e.target.id !== 'menuaiOrderInput') return;
      
      var ac = document.getElementById('menuaiAutocomplete');
      var items = ac ? ac.querySelectorAll('.menuai-autocomplete-item') : [];
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
        updateSelection(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, -1);
        updateSelection(items);
      } else if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault();
        var query = e.target.value.toLowerCase();
        var results = menuItems.filter(function(item) {
          return item.name.toLowerCase().includes(query);
        }).slice(0, 6);
        if (results[selectedIndex]) {
          menuaiAddToCart(results[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        hideAutocomplete();
      }
    });
    
    function updateSelection(items) {
      items.forEach(function(el, i) {
        if (i === selectedIndex) {
          el.classList.add('selected');
          el.scrollIntoView({ block: 'nearest' });
        } else {
          el.classList.remove('selected');
        }
      });
    }
    
    // Hide autocomplete on outside click
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.menuai-search-wrap')) {
        hideAutocomplete();
      }
    });
    
    console.log('[MenüAi] Smart Overlay v3.0 with Cart loaded ✨');
  })();
</script>
<!-- End MenüAi Smart Overlay v3.0 -->
`;
// ═══════════════════════════════════════════════════════════════════════════
// SMART SWITCHER - Analyzes target and decides the mode
// ═══════════════════════════════════════════════════════════════════════════




height: 1px!important;
background: linear - gradient(90deg,
  transparent 0 %, 
      #00C2FF 25 %, 
      #00E5FF 50 %, 
      #00C2FF 75 %,
  transparent 100 %
    )!important;
box - shadow: 0 0 15px #00C2FF, 0 0 30px rgba(0, 194, 255, 0.5)!important;
animation: menuai - pulse 2s ease -in -out infinite!important;
}

@keyframes menuai - pulse {
  0 %, 100 % { opacity: 0.6; }
  50 % { opacity: 1; }
}
  
  .menuai - content {
  display: flex!important;
  gap: 12px!important;
  align - items: center!important;
  max - width: 600px!important;
  margin: 0 auto!important;
}
  
  .menuai - input - wrap {
  flex: 1!important;
  position: relative!important;
}
  
  .menuai - input {
  width: 100 % !important;
  padding: 14px 18px!important;
  border: 1px solid rgba(255, 255, 255, 0.12)!important;
  border - radius: 14px!important;
  background: rgba(255, 255, 255, 0.08)!important;
  color: #fff!important;
  font - size: 15px!important;
  outline: none!important;
  transition: all 0.3s ease!important;
}
  
  .menuai - input:focus {
  border - color: #00C2FF!important;
  box - shadow: 0 0 0 3px rgba(0, 194, 255, 0.15)!important;
}
  
  .menuai - input::placeholder {
  color: rgba(255, 255, 255, 0.45)!important;
}
  
  .menuai - btn {
  padding: 14px 22px!important;
  border: none!important;
  border - radius: 14px!important;
  font - size: 14px!important;
  font - weight: 600!important;
  cursor: pointer!important;
  display: flex!important;
  align - items: center!important;
  gap: 8px!important;
  transition: all 0.2s ease!important;
  white - space: nowrap!important;
}
  
  .menuai - btn:active {
  transform: scale(0.96)!important;
}
  
  .menuai - btn.garson {
  background: linear - gradient(135deg, #FFB800, #FF9500)!important;
  color: #000!important;
}
  
  .menuai - btn.garson:hover {
  box - shadow: 0 4px 20px rgba(255, 184, 0, 0.4)!important;
}
  
  .menuai - btn.send {
  background: linear - gradient(135deg, #00C2FF, #0090CC)!important;
  color: #fff!important;
}
  
  .menuai - btn.send:hover {
  box - shadow: 0 4px 20px rgba(0, 194, 255, 0.4)!important;
}

  /* Toast */
  .menuai - toast {
  position: fixed!important;
  bottom: 110px!important;
  left: 50 % !important;
  transform: translateX(-50 %) translateY(20px)!important;
  padding: 12px 24px!important;
  background: rgba(16, 185, 129, 0.95)!important;
  color: #fff!important;
  border - radius: 10px!important;
  font - size: 14px!important;
  font - weight: 500!important;
  opacity: 0!important;
  pointer - events: none!important;
  transition: all 0.3s ease!important;
  z - index: 9999999!important;
}
  
  .menuai - toast.visible {
  opacity: 1!important;
  transform: translateX(-50 %) translateY(0)!important;
}

  /* Autocomplete Dropdown */
  .menuai - autocomplete {
  position: absolute!important;
  bottom: 100 % !important;
  left: 0!important;
  right: 0!important;
  max - height: 250px!important;
  overflow - y: auto!important;
  background: rgba(20, 20, 25, 0.98)!important;
  border: 1px solid rgba(0, 194, 255, 0.3)!important;
  border - bottom: none!important;
  border - radius: 12px 12px 0 0!important;
  margin - bottom: -2px!important;
  display: none!important;
  z - index: 999999!important;
  backdrop - filter: blur(10px)!important;
}
  
  .menuai - autocomplete.active {
  display: block!important;
}
  
  .menuai - autocomplete - item {
  padding: 14px 18px!important;
  cursor: pointer!important;
  border - bottom: 1px solid rgba(255, 255, 255, 0.05)!important;
  display: flex!important;
  justify - content: space - between!important;
  align - items: center!important;
  transition: background 0.15s ease!important;
}
  
  .menuai - autocomplete - item: last - child {
  border - bottom: none!important;
}
  
  .menuai - autocomplete - item: hover, .menuai - autocomplete - item.selected {
  background: rgba(0, 194, 255, 0.15)!important;
}
  
  .menuai - autocomplete - item.item - name {
  color: #fff!important;
  font - size: 14px!important;
  font - weight: 500!important;
}
  
  .menuai - autocomplete - item.item - name mark {
  background: transparent!important;
  color: #00C2FF!important;
  font - weight: 700!important;
}
  
  .menuai - autocomplete - item.item - price {
  color: #FFB800!important;
  font - size: 13px!important;
  font - weight: 600!important;
}
  
  .menuai - autocomplete - item.item - category {
  color: rgba(255, 255, 255, 0.4)!important;
  font - size: 11px!important;
  margin - left: 8px!important;
}

  /* Mode Badge */
  .menuai - mode - badge {
  position: fixed!important;
  top: 10px!important;
  right: 10px!important;
  padding: 6px 12px!important;
  background: rgba(0, 194, 255, 0.15)!important;
  border: 1px solid rgba(0, 194, 255, 0.3)!important;
  border - radius: 20px!important;
  color: #00C2FF!important;
  font - size: 11px!important;
  font - weight: 600!important;
  text - transform: uppercase!important;
  letter - spacing: 0.5px!important;
  z - index: 999998!important;
}

  /* Body padding */
  body {
  padding - bottom: 100px!important;
}
</style >

<div class="menuai-mode-badge" id="menuaiModeBadge">MODE</div>

<div class="menuai-overlay">
  <div id="menuaiAutocomplete" class="menuai-autocomplete"></div>
  <div class="menuai-content">
    <div class="menuai-input-wrap">
      <input type="text" class="menuai-input" id="menuaiOrderInput" 
             placeholder="Siparişinizi yazın... (Örn: 1.5 Acılı Adana)"
             autocomplete="off">
    </div>
    <button class="menuai-btn send" onclick="menuaiSendOrder()">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
      </svg>
    </button>
    <button class="menuai-btn garson" onclick="menuaiCallWaiter()">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 8h1a4 4 0 0 1 0 8h-1"></path>
        <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path>
      </svg>
      Garson
    </button>
  </div>
</div>

<div class="menuai-toast" id="menuaiToast"></div>

<script>
  (function() {
    var menuItems = [];
    var selectedIndex = -1;
    var debounceTimer = null;
    
    // Fetch menu data on load
    fetch('/api/menu/items')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        menuItems = data.items || [];
        console.log('[MenüAi] Menu loaded:', menuItems.length, 'items');
      })
      .catch(function(e) {
        console.log('[MenüAi] Menu not loaded:', e.message);
      });
    
    window.menuaiShowToast = function(msg, duration) {
      duration = duration || 2500;
      var toast = document.getElementById('menuaiToast');
      if (!toast) return;
      toast.textContent = msg;
      toast.classList.add('visible');
      setTimeout(function() { toast.classList.remove('visible'); }, duration);
    };
    
    window.menuaiCallWaiter = function() {
      menuaiShowToast('🙋 Garson çağrıldı!');
      console.log('[MenüAi] Waiter called');
    };
    
    window.menuaiSendOrder = function() {
      var input = document.getElementById('menuaiOrderInput');
      var order = input ? input.value.trim() : '';
      if (order) {
        menuaiShowToast('✅ Sipariş gönderildi: "' + order + '"');
        console.log('[MenüAi] Order:', order);
        input.value = '';
        hideAutocomplete();
      } else {
        menuaiShowToast('⚠️ Lütfen sipariş yazın!');
      }
    };
    
    function hideAutocomplete() {
      var ac = document.getElementById('menuaiAutocomplete');
      if (ac) {
        ac.classList.remove('active');
        ac.innerHTML = '';
      }
      selectedIndex = -1;
    }
    
    function highlightMatch(text, query) {
      if (!query || !text) return text;
      var lowerText = text.toLowerCase();
      var lowerQuery = query.toLowerCase();
      var idx = lowerText.indexOf(lowerQuery);
      if (idx === -1) return text;
      return text.substring(0, idx) + '<mark>' + text.substring(idx, idx + query.length) + '</mark>' + text.substring(idx + query.length);
    }
    
    function showAutocomplete(results, query) {
      var ac = document.getElementById('menuaiAutocomplete');
      if (!ac || results.length === 0) {
        hideAutocomplete();
        return;
      }
      
      var html = '';
      results.forEach(function(item, i) {
        html += '<div class="menuai-autocomplete-item' + (i === selectedIndex ? ' selected' : '') + '" data-index="' + i + '">';
        html += '<span class="item-name">' + highlightMatch(item.name, query);
        if (item.category) {
          html += '<span class="item-category">(' + item.category + ')</span>';
        }
        html += '</span>';
        html += '<span class="item-price">' + item.price + ' ₺</span>';
        html += '</div>';
      });

ac.innerHTML = html;
ac.classList.add('active');

// Click handlers
var items = ac.querySelectorAll('.menuai-autocomplete-item');
items.forEach(function (el) {
  el.addEventListener('click', function () {
    var idx = parseInt(el.dataset.index);
    selectItem(results[idx]);
  });
});
    }

function selectItem(item) {
  var input = document.getElementById('menuaiOrderInput');
  if (input && item) {
    input.value = item.name;
    hideAutocomplete();
    input.focus();
  }
}

function searchMenu(query) {
  if (!query || query.length < 2) {
    hideAutocomplete();
    return;
  }

  query = query.toLowerCase();
  var results = menuItems.filter(function (item) {
    return item.name.toLowerCase().includes(query) ||
      (item.category && item.category.toLowerCase().includes(query));
  }).slice(0, 8);

  showAutocomplete(results, query);
}

// Input event listener with debounce
document.addEventListener('input', function (e) {
  if (e.target.id === 'menuaiOrderInput') {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      searchMenu(e.target.value);
    }, 150);
  }
});

// Keyboard navigation
document.addEventListener('keydown', function (e) {
  if (e.target.id !== 'menuaiOrderInput') return;

  var ac = document.getElementById('menuaiAutocomplete');
  var items = ac ? ac.querySelectorAll('.menuai-autocomplete-item') : [];

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
    updateSelection(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex = Math.max(selectedIndex - 1, -1);
    updateSelection(items);
  } else if (e.key === 'Enter') {
    if (selectedIndex >= 0 && items[selectedIndex]) {
      e.preventDefault();
      var results = menuItems.filter(function (item) {
        return item.name.toLowerCase().includes(e.target.value.toLowerCase());
      }).slice(0, 8);
      if (results[selectedIndex]) {
        selectItem(results[selectedIndex]);
      }
    } else {
      menuaiSendOrder();
    }
  } else if (e.key === 'Escape') {
    hideAutocomplete();
  }
});

function updateSelection(items) {
  items.forEach(function (el, i) {
    if (i === selectedIndex) {
      el.classList.add('selected');
      el.scrollIntoView({ block: 'nearest' });
    } else {
      el.classList.remove('selected');
    }
  });
}

// Hide on blur
document.addEventListener('click', function (e) {
  if (!e.target.closest('.menuai-overlay')) {
    hideAutocomplete();
  }
});

console.log('[MenüAi] Smart Overlay v2.1 with Autocomplete loaded ✨');
  }) ();
</script >
< !--End MenüAi Smart Overlay-- >
  `;

// ═══════════════════════════════════════════════════════════════════════════
// SMART SWITCHER - Analyzes target and decides the mode
// ═══════════════════════════════════════════════════════════════════════════

async function analyzeTarget(targetUrl) {
  const result = {
    mode: 'iframe', // Default to iframe (fastest)
    blocked: false,
    isPdf: false,
    error: null,
    headers: {}
  };

  try {
    const parsedUrl = new URL(targetUrl);

    // Check if URL points to a PDF
    if (targetUrl.toLowerCase().endsWith('.pdf')) {
      result.mode = 'viewer';
      result.isPdf = true;
      return result;
    }

    // Make HEAD request to analyze headers
    const response = await axios.head(targetUrl, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      maxRedirects: 5,
      validateStatus: () => true
    });

    result.headers = response.headers;

    // Check Content-Type for PDF
    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('application/pdf')) {
      result.mode = 'viewer';
      result.isPdf = true;
      return result;
    }

    // Check X-Frame-Options
    const xFrameOptions = response.headers['x-frame-options'] || '';
    if (xFrameOptions.toLowerCase().includes('deny') ||
      xFrameOptions.toLowerCase().includes('sameorigin')) {
      result.blocked = true;
      result.mode = 'proxy';
      console.log('[Smart Switcher] X-Frame-Options detected:', xFrameOptions);
    }

    // Check Content-Security-Policy frame-ancestors
    const csp = response.headers['content-security-policy'] || '';
    if (csp.includes('frame-ancestors')) {
      // Check if it allows embedding
      if (!csp.includes("frame-ancestors *") && !csp.includes("frame-ancestors 'self'")) {
        result.blocked = true;
        result.mode = 'proxy';
        console.log('[Smart Switcher] CSP frame-ancestors detected');
      }
    }

  } catch (error) {
    console.error('[Smart Switcher] Analysis error:', error.message);
    // Default to proxy on error (safer)
    result.mode = 'proxy';
    result.error = error.message;
  }

  console.log(`[Smart Switcher]Decision: ${ result.mode.toUpperCase() } mode`);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// MODE A: IFRAME RENDERER
// ═══════════════════════════════════════════════════════════════════════════

function renderIframeMode(targetUrl, res) {
  const html = `
  < !DOCTYPE html >
    <html lang="tr">
      <head>
        <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>MenüAi | Menü</title>
            <style>
              * {margin: 0; padding: 0; box-sizing: border-box; }
              html, body {height: 100%; overflow: hidden; }
              .iframe-container {
                position: fixed;
              top: 0;
              left: 0;
              right: 0;
              bottom: 90px;
              background: #0a0a0a;
        }
              iframe {
                width: 100%;
              height: 100%;
              border: none;
        }
            </style>
          </head>
          <body>
            <div class="iframe-container">
              <iframe src="${targetUrl}" allowfullscreen></iframe>
            </div>
            ${SMART_OVERLAY}
            <script>
              document.getElementById('menuaiModeBadge').textContent = '⚡ IFRAME';
              document.getElementById('menuaiModeBadge').style.background = 'rgba(16, 185, 129, 0.15)';
              document.getElementById('menuaiModeBadge').style.borderColor = 'rgba(16, 185, 129, 0.3)';
              document.getElementById('menuaiModeBadge').style.color = '#10B981';
            </script>
          </body>
        </html>`;

        res.set('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
}

        // ═══════════════════════════════════════════════════════════════════════════
        // MODE B: PROXY RENDERER
        // ═══════════════════════════════════════════════════════════════════════════

        async function renderProxyMode(targetUrl, res) {
  try {
    const parsedUrl = new URL(targetUrl);

        // Fetch the target page
        const response = await axios.get(targetUrl, {
          responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br'
      },
        maxRedirects: 5,
      validateStatus: () => true
    });

        const contentType = response.headers['content-type'] || '';
        const contentEncoding = response.headers['content-encoding'] || '';

        // Non-HTML content - pass through
        if (!contentType.includes('text/html')) {
          res.set('Content-Type', contentType);
        return res.send(response.data);
    }

        // Decompress if needed
        let htmlBuffer = response.data;
        if (contentEncoding === 'gzip') {
          htmlBuffer = zlib.gunzipSync(response.data);
    } else if (contentEncoding === 'br') {
          htmlBuffer = zlib.brotliDecompressSync(response.data);
    } else if (contentEncoding === 'deflate') {
          htmlBuffer = zlib.inflateSync(response.data);
    }

        let html = htmlBuffer.toString('utf-8');

        // Parse and modify HTML
        const $ = cheerio.load(html);

        // Remove blocking headers from meta tags
        $('meta[http-equiv="X-Frame-Options"]').remove();
        $('meta[http-equiv="Content-Security-Policy"]').remove();

        // Add base tag for relative URLs
        const baseUrl = parsedUrl.origin;
        if (!$('base').length) {
          $('head').prepend(`<base href="${baseUrl}/">`);
    }

    // Rewrite relative URLs to absolute
    $('script[src]').each((i, el) => {
      const src = $(el).attr('src');
        if (src && !src.startsWith('http') && !src.startsWith('//') && !src.startsWith('data:')) {
          $(el).attr('src', new URL(src, baseUrl + '/').href);
      }
    });

    $('link[href]').each((i, el) => {
      const href = $(el).attr('href');
        if (href && !href.startsWith('http') && !href.startsWith('//') && !href.startsWith('data:')) {
          $(el).attr('href', new URL(href, baseUrl + '/').href);
      }
    });

    $('img[src]').each((i, el) => {
      const src = $(el).attr('src');
        if (src && !src.startsWith('http') && !src.startsWith('//') && !src.startsWith('data:')) {
          $(el).attr('src', new URL(src, baseUrl + '/').href);
      }
    });

        // Inject Smart Overlay + mode badge
        const modeBadgeScript = `
        <script>
          document.getElementById('menuaiModeBadge').textContent = '🔓 PROXY';
          document.getElementById('menuaiModeBadge').style.background = 'rgba(239, 68, 68, 0.15)';
          document.getElementById('menuaiModeBadge').style.borderColor = 'rgba(239, 68, 68, 0.3)';
          document.getElementById('menuaiModeBadge').style.color = '#EF4444';
        </script>`;

        $('body').append(SMART_OVERLAY + modeBadgeScript);

        const modifiedHtml = $.html();

        res.set('Content-Type', 'text/html; charset=utf-8');
        res.send(modifiedHtml);

  } catch (error) {
          console.error('[Proxy Mode] Error:', error.message);
        res.status(500).send(`
        <html>
          <body style="background:#0a0a0a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;">
            <div style="text-align:center;">
              <h1>❌ Proxy Hatası</h1>
              <p>${error.message}</p>
              <a href="/" style="color:#00C2FF;">Ana Sayfaya Dön</a>
            </div>
          </body>
        </html>
        `);
  }
}

        // ═══════════════════════════════════════════════════════════════════════════
        // MODE C: PDF VIEWER RENDERER
        // ═══════════════════════════════════════════════════════════════════════════

        function renderViewerMode(pdfUrl, res) {
  const html = `
        <!DOCTYPE html>
        <html lang="tr">
          <head>
            <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>MenüAi | PDF Menü</title>
                <style>
                  * {margin: 0; padding: 0; box-sizing: border-box; }
                  html, body {height: 100%; background: #0a0a0a; }
                  .pdf-container {
                    position: fixed;
                  top: 0;
                  left: 0;
                  right: 0;
                  bottom: 90px;
                  background: #1a1a1a;
        }
                  .pdf-container embed,
                  .pdf-container iframe {
                    width: 100%;
                  height: 100%;
                  border: none;
        }
                  .pdf-fallback {
                    display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  height: 100%;
                  color: #fff;
                  text-align: center;
                  padding: 20px;
        }
                  .pdf-fallback h2 {margin - bottom: 10px; }
                  .pdf-fallback a {
                    color: #00C2FF;
                  margin-top: 15px;
                  padding: 12px 24px;
                  border: 1px solid #00C2FF;
                  border-radius: 8px;
                  text-decoration: none;
        }
                </style>
              </head>
              <body>
                <div class="pdf-container">
                  <embed src="${pdfUrl}" type="application/pdf">
                    <noscript>
                      <div class="pdf-fallback">
                        <h2>📄 PDF Menü</h2>
                        <p>Tarayıcınız PDF görüntüleyemiyor.</p>
                        <a href="${pdfUrl}" target="_blank">PDF'i İndir</a>
                      </div>
                    </noscript>
                </div>
                ${SMART_OVERLAY}
                <script>
                  document.getElementById('menuaiModeBadge').textContent = '📄 PDF';
                  document.getElementById('menuaiModeBadge').style.background = 'rgba(139, 92, 246, 0.15)';
                  document.getElementById('menuaiModeBadge').style.borderColor = 'rgba(139, 92, 246, 0.3)';
                  document.getElementById('menuaiModeBadge').style.color = '#8B5CF6';
                </script>
              </body>
            </html>`;

            res.set('Content-Type', 'text/html; charset=utf-8');
            res.send(html);
}

            // ═══════════════════════════════════════════════════════════════════════════
            // ROUTES
            // ═══════════════════════════════════════════════════════════════════════════

            // Serve static files
            app.use('/public', express.static(path.join(__dirname, 'public')));

// Landing page
app.get('/', (req, res) => {
              res.send(`
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MenüAi Ultimate Core</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            min-height: 100vh;
            background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%);
            font-family: 'Inter', sans-serif;
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            text-align: center;
            padding: 40px;
            max-width: 550px;
        }
        .logo {
            font-size: 3rem;
            margin-bottom: 10px;
        }
        h1 {
            font-size: 2rem;
            margin-bottom: 8px;
            background: linear-gradient(90deg, #00C2FF, #00E5FF);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .subtitle {
            color: rgba(255,255,255,0.6);
            margin-bottom: 30px;
        }
        .input-group {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }
        input {
            flex: 1;
            padding: 16px 20px;
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 14px;
            background: rgba(255,255,255,0.08);
            color: #fff;
            font-size: 15px;
            outline: none;
        }
        input:focus { border-color: #00C2FF; }
        input::placeholder { color: rgba(255,255,255,0.4); }
        button {
            padding: 16px 28px;
            border: none;
            border-radius: 14px;
            background: linear-gradient(135deg, #00C2FF, #0090CC);
            color: #fff;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s;
        }
        button:hover { transform: scale(1.05); }
        .modes {
            display: flex;
            gap: 15px;
            justify-content: center;
            margin-top: 25px;
            flex-wrap: wrap;
        }
        .mode-card {
            padding: 15px 20px;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 12px;
            text-align: left;
            width: 150px;
        }
        .mode-card h4 {
            font-size: 13px;
            margin-bottom: 4px;
        }
        .mode-card p {
            font-size: 11px;
            color: rgba(255,255,255,0.5);
        }
        .mode-card.iframe h4 { color: #10B981; }
        .mode-card.proxy h4 { color: #EF4444; }
        .mode-card.pdf h4 { color: #8B5CF6; }
        .demo { margin-top: 20px; font-size: 14px; color: rgba(255,255,255,0.5); }
        .demo a { color: #00C2FF; text-decoration: none; }
        .upload-section {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid rgba(255,255,255,0.1);
        }
        .upload-btn {
            background: linear-gradient(135deg, #8B5CF6, #7C3AED);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🍽️</div>
        <h1>MenüAi Ultimate Core</h1>
        <p class="subtitle">Her türlü menüyü tek arayüzde aç</p>
        
        <div class="input-group">
            <input type="url" id="urlInput" placeholder="Menü URL'si girin...">
            <button onclick="openMenu()">Aç</button>
        </div>
        
        <p class="demo">Demo: <a href="/view?target=https://mps27.mobresposmenu.com.tr/?id=MP422">Pote Menüsü</a></p>
        
        <div class="modes">
            <div class="mode-card iframe">
                <h4>⚡ IFRAME</h4>
                <p>Hızlı mod, SPA siteler</p>
            </div>
            <div class="mode-card proxy">
                <h4>🔓 PROXY</h4>
                <p>Korumalı siteleri aç</p>
            </div>
            <div class="mode-card pdf">
                <h4>📄 VIEWER</h4>
                <p>PDF menüleri göster</p>
            </div>
        </div>
        
        <div class="upload-section">
            <form action="/upload" method="POST" enctype="multipart/form-data" style="display:flex;gap:10px;">
                <input type="file" name="pdf" accept=".pdf" required style="flex:1;">
                <button type="submit" class="upload-btn">PDF Yükle</button>
            </form>
        </div>
    </div>
    
    <script>
        function openMenu() {
            const url = document.getElementById('urlInput').value.trim();
            if (url) {
                window.location.href = '/view?target=' + encodeURIComponent(url);
            }
        }
        document.getElementById('urlInput').addEventListener('keypress', e => {
            if (e.key === 'Enter') openMenu();
        });
    </script>
</body>
</html>
    `);
});

// ═══════════════════════════════════════════════════════════════════════════
// THE GATEKEEPER: /view Endpoint
// ═══════════════════════════════════════════════════════════════════════════

app.get('/view', async (req, res) => {
  const targetUrl = req.query.target;
            const uploadId = req.query.id;
            const forceMode = req.query.mode; // Optional: force iframe/proxy/viewer

            // Handle uploaded file
            if (uploadId) {
    const filePath = path.join(UPLOADS_DIR, uploadId);
            if (fs.existsSync(filePath)) {
      return renderViewerMode(`/public/uploads/${uploadId}`, res);
    } else {
      return res.status(404).send('Dosya bulunamadı');
    }
  }

            // Handle URL target
            if (!targetUrl) {
    return res.redirect('/');
  }

            try {
              // Validate URL
              new URL(targetUrl);
  } catch (e) {
    return res.status(400).send('Geçersiz URL');
  }

            // Force mode if specified
            if (forceMode === 'iframe') {
              console.log('[View] Forced IFRAME mode');
            return renderIframeMode(targetUrl, res);
  } else if (forceMode === 'proxy') {
              console.log('[View] Forced PROXY mode');
            return renderProxyMode(targetUrl, res);
  } else if (forceMode === 'viewer') {
              console.log('[View] Forced VIEWER mode');
            return renderViewerMode(targetUrl, res);
  }

            // Smart Switcher - Analyze and decide
            const analysis = await analyzeTarget(targetUrl);

            switch (analysis.mode) {
    case 'iframe':
            return renderIframeMode(targetUrl, res);
            case 'proxy':
            return renderProxyMode(targetUrl, res);
            case 'viewer':
            return renderViewerMode(targetUrl, res);
            default:
            return renderIframeMode(targetUrl, res);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// MENU API - Returns menu items for autocomplete
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/menu/items', (req, res) => {
  try {
    // Try to load parsed menu from file
    const menuPath = path.join(__dirname, 'parsed_menu.json');

            if (fs.existsSync(menuPath)) {
      const menuData = JSON.parse(fs.readFileSync(menuPath, 'utf8'));

            // Flatten categories into a single items array
            const items = [];
            if (menuData.categories) {
              menuData.categories.forEach(category => {
                if (category.items) {
                  category.items.forEach(item => {
                    items.push({
                      name: item.name,
                      price: item.price,
                      category: category.name,
                      description: item.description || ''
                    });
                  });
                }
              });
      }

            console.log(`[Menu API] Returning ${items.length} items from parsed_menu.json`);
            return res.json({success: true, items, source: 'parsed_menu.json' });
    }

            // Fallback: Return empty if no menu file exists
            console.log('[Menu API] No parsed_menu.json found');
            return res.json({success: false, items: [], source: null });

  } catch (error) {
              console.error('[Menu API] Error:', error.message);
            return res.json({success: false, items: [], error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════

app.post('/upload', upload.single('pdf'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('Dosya yüklenemedi');
  }

            const fileId = req.file.filename;
            console.log('[Upload] File saved:', fileId);

            res.redirect(`/view?id=${fileId}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// PROXY PASS-THROUGH FOR API CALLS (Wildcard Route)
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api-tunnel', async (req, res) => {
  const apiUrl = req.query.url;

            if (!apiUrl) {
    return res.status(400).json({error: 'Missing URL parameter' });
  }

            try {
    const response = await axios.get(apiUrl, {
              headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      validateStatus: () => true
    });

            res.set('Content-Type', response.headers['content-type'] || 'application/json');
            res.send(response.data);
  } catch (error) {
              res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════════════

app.listen(PORT, () => {
              console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                                                                           ║
║   🍽️  MenüAi Ultimate Core v2.0                                           ║
║                                                                           ║
║   Server:  http://localhost:${PORT}                                          ║
║                                                                           ║
║   Endpoints:                                                              ║
║   • GET /view?target=URL      → Smart Switcher (Auto mode)               ║
║   • GET /view?target=URL&mode=iframe  → Force Iframe                     ║
║   • GET /view?target=URL&mode=proxy   → Force Proxy                      ║
║   • GET /view?id=FILE_ID      → View uploaded PDF                        ║
║   • POST /upload              → Upload PDF file                          ║
║   • GET /api-tunnel?url=API   → API pass-through                         ║
║                                                                           ║
║   Modes:                                                                  ║
║   ⚡ IFRAME  - Fast loading for SPA/React sites                          ║
║   🔓 PROXY   - Bypasses X-Frame-Options restrictions                     ║
║   📄 VIEWER  - PDF menu display                                          ║
║                                                                           ║
╚═══════════════════════════════════════════════════════════════════════════╝
    `);
});
