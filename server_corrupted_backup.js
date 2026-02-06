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
<!-- MenüAi Smart Overlay v4.0 - Ultra Modern Premium UX -->
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
  
  :root {
    --menuai-bg: rgba(8, 8, 12, 0.92);
    --menuai-glass: rgba(255, 255, 255, 0.03);
    --menuai-border: rgba(255, 255, 255, 0.08);
    --menuai-accent: #6366f1;
    --menuai-accent2: #8b5cf6;
    --menuai-success: #22c55e;
    --menuai-warning: #f59e0b;
    --menuai-text: #f8fafc;
    --menuai-muted: rgba(248, 250, 252, 0.5);
  }
  
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
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif !important;
  }
  
  /* Main Container with Aurora Effect */
  .menuai-container {
    position: relative !important;
    background: var(--menuai-bg) !important;
    backdrop-filter: blur(40px) saturate(180%) !important;
    -webkit-backdrop-filter: blur(40px) saturate(180%) !important;
    border-radius: 24px 24px 0 0 !important;
    overflow: hidden !important;
    box-shadow: 0 -20px 80px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
  }
  
  /* Aurora gradient border */
  .menuai-container::before {
    content: '' !important;
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    height: 2px !important;
    background: linear-gradient(90deg, 
      #6366f1, #8b5cf6, #d946ef, #f43f5e, #f59e0b, #22c55e, #6366f1) !important;
    background-size: 200% 100% !important;
    animation: menuai-aurora 4s linear infinite !important;
  }
  
  @keyframes menuai-aurora {
    0% { background-position: 0% 50%; }
    100% { background-position: 200% 50%; }
  }
  
  /* Header Section */
  .menuai-header {
    padding: 20px 24px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    cursor: pointer !important;
    transition: background 0.2s !important;
  }
  
  .menuai-header:hover {
    background: var(--menuai-glass) !important;
  }
  
  .menuai-brand {
    display: flex !important;
    align-items: center !important;
    gap: 14px !important;
  }
  
  .menuai-logo {
    width: 42px !important;
    height: 42px !important;
    background: linear-gradient(135deg, var(--menuai-accent), var(--menuai-accent2)) !important;
    border-radius: 14px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    color: white !important;
    font-size: 18px !important;
    font-weight: 700 !important;
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4) !important;
  }
  
  .menuai-title-group {
    display: flex !important;
    flex-direction: column !important;
  }
  
  .menuai-title {
    color: var(--menuai-text) !important;
    font-size: 16px !important;
    font-weight: 600 !important;
  }
  
  .menuai-subtitle {
    color: var(--menuai-muted) !important;
    font-size: 12px !important;
    font-weight: 500 !important;
  }
  
  .menuai-stats {
    display: flex !important;
    align-items: center !important;
    gap: 16px !important;
  }
  
  .menuai-count-pill {
    background: linear-gradient(135deg, var(--menuai-accent), var(--menuai-accent2)) !important;
    padding: 6px 14px !important;
    border-radius: 100px !important;
    color: white !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    display: flex !important;
    align-items: center !important;
    gap: 6px !important;
  }
  
  .menuai-total {
    color: var(--menuai-success) !important;
    font-size: 20px !important;
    font-weight: 700 !important;
  }
  
  .menuai-chevron {
    color: var(--menuai-muted) !important;
    transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
  }
  
  .menuai-chevron.expanded {
    transform: rotate(180deg) !important;
  }
  
  /* Cart Items Section */
  .menuai-items {
    max-height: 0 !important;
    overflow-y: auto !important;
    transition: max-height 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), padding 0.3s !important;
    background: rgba(0, 0, 0, 0.2) !important;
  }
  
  .menuai-items.expanded {
    max-height: 40vh !important;
    padding: 12px 0 !important;
  }
  
  .menuai-item {
    display: flex !important;
    align-items: center !important;
    padding: 16px 24px !important;
    gap: 16px !important;
    border-bottom: 1px solid var(--menuai-border) !important;
    transition: background 0.2s !important;
  }
  
  .menuai-item:last-child {
    border-bottom: none !important;
  }
  
  .menuai-item:hover {
    background: var(--menuai-glass) !important;
  }
  
  .menuai-item-info {
    flex: 1 !important;
    min-width: 0 !important;
  }
  
  .menuai-item-name {
    color: var(--menuai-text) !important;
    font-size: 14px !important;
    font-weight: 600 !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }
  
  .menuai-item-price {
    color: var(--menuai-muted) !important;
    font-size: 12px !important;
    margin-top: 2px !important;
  }
  
  .menuai-item-controls {
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
    background: var(--menuai-glass) !important;
    border-radius: 12px !important;
    padding: 4px !important;
    border: 1px solid var(--menuai-border) !important;
  }
  
  .menuai-qty-btn {
    width: 32px !important;
    height: 32px !important;
    border-radius: 10px !important;
    border: none !important;
    background: transparent !important;
    color: var(--menuai-text) !important;
    font-size: 18px !important;
    cursor: pointer !important;
    transition: all 0.2s !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
  
  .menuai-qty-btn:hover {
    background: var(--menuai-accent) !important;
  }
  
  .menuai-qty-btn.minus:hover {
    background: #ef4444 !important;
  }
  
  .menuai-qty {
    color: var(--menuai-text) !important;
    font-size: 15px !important;
    font-weight: 600 !important;
    min-width: 24px !important;
    text-align: center !important;
  }
  
  .menuai-item-subtotal {
    color: var(--menuai-success) !important;
    font-size: 15px !important;
    font-weight: 700 !important;
    min-width: 70px !important;
    text-align: right !important;
  }
  
  .menuai-empty {
    padding: 32px !important;
    text-align: center !important;
    color: var(--menuai-muted) !important;
    font-size: 14px !important;
  }
  
  .menuai-empty-icon {
    font-size: 40px !important;
    margin-bottom: 12px !important;
    opacity: 0.5 !important;
  }
  
  /* Action Bar */
  .menuai-actions {
    padding: 16px 20px 28px !important;
    display: flex !important;
    gap: 12px !important;
    background: linear-gradient(to top, rgba(8, 8, 12, 1), transparent) !important;
  }
  
  .menuai-search-container {
    position: relative !important;
    flex: 1 !important;
  }
  
  .menuai-search {
    width: 100% !important;
    padding: 16px 20px !important;
    padding-left: 48px !important;
    background: var(--menuai-glass) !important;
    border: 1px solid var(--menuai-border) !important;
    border-radius: 16px !important;
    color: var(--menuai-text) !important;
    font-size: 15px !important;
    font-weight: 500 !important;
    outline: none !important;
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
  }
  
  .menuai-search::placeholder {
    color: var(--menuai-muted) !important;
  }
  
  .menuai-search:focus {
    border-color: var(--menuai-accent) !important;
    background: rgba(99, 102, 241, 0.1) !important;
    box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15) !important;
  }
  
  .menuai-search-icon {
    position: absolute !important;
    left: 18px !important;
    top: 50% !important;
    transform: translateY(-50%) !important;
    color: var(--menuai-muted) !important;
    pointer-events: none !important;
  }
  
  /* Autocomplete Dropdown */
  .menuai-autocomplete {
    position: absolute !important;
    bottom: calc(100% + 8px) !important;
    left: 0 !important;
    right: 0 !important;
    max-height: 280px !important;
    overflow-y: auto !important;
    background: rgba(15, 15, 20, 0.98) !important;
    border: 1px solid var(--menuai-border) !important;
    border-radius: 16px !important;
    display: none !important;
    z-index: 999999 !important;
    backdrop-filter: blur(20px) !important;
    box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.4) !important;
  }
  
  .menuai-autocomplete.active {
    display: block !important;
    animation: menuai-slideUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
  }
  
  @keyframes menuai-slideUp {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  .menuai-ac-item {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    padding: 16px 20px !important;
    cursor: pointer !important;
    border-bottom: 1px solid var(--menuai-border) !important;
    transition: all 0.15s !important;
  }
  
  .menuai-ac-item:last-child {
    border-bottom: none !important;
  }
  
  .menuai-ac-item:hover, .menuai-ac-item.selected {
    background: rgba(99, 102, 241, 0.1) !important;
  }
  
  .menuai-ac-item .name {
    color: var(--menuai-text) !important;
    font-size: 14px !important;
    font-weight: 500 !important;
  }
  
  .menuai-ac-item .name mark {
    background: transparent !important;
    color: var(--menuai-accent) !important;
    font-weight: 700 !important;
  }
  
  .menuai-ac-item .price {
    color: var(--menuai-success) !important;
    font-size: 14px !important;
    font-weight: 600 !important;
  }
  
  .menuai-ac-item .add-btn {
    width: 32px !important;
    height: 32px !important;
    background: linear-gradient(135deg, var(--menuai-accent), var(--menuai-accent2)) !important;
    border-radius: 10px !important;
    color: white !important;
    font-size: 18px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    margin-left: 12px !important;
    transition: transform 0.2s !important;
  }
  
  .menuai-ac-item:hover .add-btn {
    transform: scale(1.1) !important;
  }
  
  /* Buttons */
  .menuai-btn {
    padding: 16px 24px !important;
    border: none !important;
    border-radius: 16px !important;
    font-size: 14px !important;
    font-weight: 600 !important;
    cursor: pointer !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 10px !important;
    transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
    white-space: nowrap !important;
    position: relative !important;
    overflow: hidden !important;
  }
  
  .menuai-btn::after {
    content: '' !important;
    position: absolute !important;
    inset: 0 !important;
    background: linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 50%) !important;
    pointer-events: none !important;
  }
  
  .menuai-btn:active {
    transform: scale(0.95) !important;
  }
  
  .menuai-btn.primary {
    flex: 1 !important;
    background: linear-gradient(135deg, var(--menuai-success), #16a34a) !important;
    color: white !important;
    box-shadow: 0 4px 20px rgba(34, 197, 94, 0.3) !important;
  }
  
  .menuai-btn.primary:hover {
    box-shadow: 0 6px 30px rgba(34, 197, 94, 0.5) !important;
    transform: translateY(-2px) !important;
  }
  
  .menuai-btn.primary:disabled {
    opacity: 0.4 !important;
    cursor: not-allowed !important;
    transform: none !important;
  }
  
  .menuai-btn.secondary {
    background: linear-gradient(135deg, var(--menuai-warning), #d97706) !important;
    color: #000 !important;
    box-shadow: 0 4px 20px rgba(245, 158, 11, 0.3) !important;
  }
  
  .menuai-btn.secondary:hover {
    box-shadow: 0 6px 30px rgba(245, 158, 11, 0.5) !important;
    transform: translateY(-2px) !important;
  }
  
  /* Toast */
  .menuai-toast {
    position: fixed !important;
    bottom: 220px !important;
    left: 50% !important;
    transform: translateX(-50%) translateY(20px) !important;
    padding: 16px 28px !important;
    background: var(--menuai-bg) !important;
    border: 1px solid var(--menuai-border) !important;
    border-radius: 16px !important;
    color: var(--menuai-text) !important;
    font-size: 14px !important;
    font-weight: 500 !important;
    opacity: 0 !important;
    pointer-events: none !important;
    transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
    z-index: 9999999 !important;
    backdrop-filter: blur(20px) !important;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4) !important;
  }
  
  .menuai-toast.visible {
    opacity: 1 !important;
    transform: translateX(-50%) translateY(0) !important;
  }
  
  /* Mode Badge */
  .menuai-mode-badge {
    position: fixed !important;
    top: 12px !important;
    right: 12px !important;
    padding: 8px 14px !important;
    background: var(--menuai-bg) !important;
    border: 1px solid var(--menuai-border) !important;
    border-radius: 100px !important;
    color: var(--menuai-accent) !important;
    font-size: 11px !important;
    font-weight: 600 !important;
    text-transform: uppercase !important;
    letter-spacing: 1px !important;
    z-index: 999998 !important;
    backdrop-filter: blur(10px) !important;
    display: flex !important;
    align-items: center !important;
    gap: 6px !important;
  }
  
  .menuai-mode-badge::before {
    content: '⚡' !important;
  }
  
  /* Body padding */
  body {
    padding-bottom: 200px !important;
  }
</style>

<div class="menuai-mode-badge" id="menuaiModeBadge">MODE</div>

<div class="menuai-overlay">
  <div class="menuai-container">
    <!-- Header -->
    <div class="menuai-header" onclick="menuaiToggleCart()">
      <div class="menuai-brand">
        <div class="menuai-logo">🍽️</div>
        <div class="menuai-title-group">
          <div class="menuai-title">Sepetiniz</div>
          <div class="menuai-subtitle">Siparişinizi hazırlayın</div>
        </div>
      </div>
      <div class="menuai-stats">
        <div class="menuai-count-pill">
          <span id="menuaiCartCount">0</span> ürün
        </div>
        <div class="menuai-total" id="menuaiCartTotal">0 ₺</div>
        <svg class="menuai-chevron" id="menuaiChevron" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="18 15 12 9 6 15"></polyline>
        </svg>
      </div>
    </div>
    
    <!-- Cart Items -->
    <div class="menuai-items" id="menuaiItems">
      <div class="menuai-empty" id="menuaiEmpty">
        <div class="menuai-empty-icon">🛒</div>
        <div>Sepet boş</div>
        <div style="margin-top: 4px !important; font-size: 12px !important;">Aşağıdan ürün arayın</div>
      </div>
    </div>
    
    <!-- Action Bar -->
    <div class="menuai-actions">
      <div class="menuai-search-container">
        <svg class="menuai-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
        </svg>
        <div id="menuaiAutocomplete" class="menuai-autocomplete"></div>
        <input type="text" class="menuai-search" id="menuaiOrderInput" 
               placeholder="Ürün ara..." autocomplete="off">
      </div>
      <button class="menuai-btn primary" id="menuaiOrderBtn" onclick="menuaiSendOrder()" disabled>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        Sipariş Ver
      </button>
      <button class="menuai-btn secondary" onclick="menuaiCallWaiter()">
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
      if (toast) {
        toast.textContent = msg;
        toast.classList.add('visible');
        setTimeout(function() {
          toast.classList.remove('visible');
        }, duration);
      }
    };
    
    // Update cart UI
    function updateCartUI() {
      var countEl = document.getElementById('menuaiCartCount');
      var totalEl = document.getElementById('menuaiCartTotal');
      var itemsEl = document.getElementById('menuaiItems');
      var emptyEl = document.getElementById('menuaiEmpty');
      var orderBtn = document.getElementById('menuaiOrderBtn');
      
      var count = cart.reduce(function(sum, c) { return sum + c.qty; }, 0);
      var total = cart.reduce(function(sum, c) { return sum + (c.price * c.qty); }, 0);
      
      if (countEl) countEl.textContent = count;
      if (totalEl) totalEl.textContent = total + ' ₺';
      if (orderBtn) orderBtn.disabled = cart.length === 0;
      
      if (cart.length === 0) {
        if (emptyEl) emptyEl.style.display = 'block';
      } else {
        if (emptyEl) emptyEl.style.display = 'none';
        
        var html = '';
        cart.forEach(function(item, index) {
          html += '<div class="menuai-item">';
          html += '<div class="menuai-item-info">';
          html += '<div class="menuai-item-name">' + item.name + '</div>';
          html += '<div class="menuai-item-price">' + item.price + ' ₺/adet</div>';
          html += '</div>';
          html += '<div class="menuai-item-controls">';
          html += '<button class="menuai-qty-btn minus" onclick="menuaiUpdateQty(' + index + ', -1)">−</button>';
          html += '<span class="menuai-qty">' + item.qty + '</span>';
          html += '<button class="menuai-qty-btn plus" onclick="menuaiUpdateQty(' + index + ', 1)">+</button>';
          html += '</div>';
          html += '<div class="menuai-item-subtotal">' + (item.price * item.qty) + ' ₺</div>';
          html += '</div>';
        });
        
        if (itemsEl) {
          var existingEmpty = itemsEl.querySelector('.menuai-empty');
          itemsEl.innerHTML = html;
          if (existingEmpty) itemsEl.insertBefore(existingEmpty, itemsEl.firstChild);
        }
      }
    }
    
    // Toggle cart
    window.menuaiToggleCart = function() {
      cartExpanded = !cartExpanded;
      var items = document.getElementById('menuaiItems');
      var chevron = document.getElementById('menuaiChevron');
      
      if (items) items.classList.toggle('expanded', cartExpanded);
      if (chevron) chevron.classList.toggle('expanded', cartExpanded);
    };
    
    // Add to cart
    window.menuaiAddToCart = function(item) {
      var existing = cart.find(function(c) { return c.name === item.name; });
      if (existing) {
        existing.qty++;
      } else {
        cart.push({ name: item.name, price: item.price, qty: 1 });
      }
      
      updateCartUI();
      menuaiShowToast('✓ ' + item.name + ' eklendi');
      hideAutocomplete();
      
      var input = document.getElementById('menuaiOrderInput');
      if (input) input.value = '';
      
      if (!cartExpanded) menuaiToggleCart();
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
        menuaiShowToast('⚠️ Sepet boş!');
        return;
      }
      
      var total = cart.reduce(function(sum, c) { return sum + (c.price * c.qty); }, 0);
      console.log('[MenüAi] Order:', { items: cart, total: total });
      menuaiShowToast('✅ Sipariş gönderildi! ' + total + ' ₺');
      
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
      var idx = text.toLowerCase().indexOf(query.toLowerCase());
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
        html += '<div class="menuai-ac-item' + (i === selectedIndex ? ' selected' : '') + '" data-index="' + i + '">';
        html += '<span class="name">' + highlightMatch(item.name, query) + '</span>';
        html += '<span class="price">' + item.price + ' ₺</span>';
        html += '<span class="add-btn">+</span>';
        html += '</div>';
      });
      
      ac.innerHTML = html;
      ac.classList.add('active');
      
      var items = ac.querySelectorAll('.menuai-ac-item');
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
    
    document.addEventListener('input', function(e) {
      if (e.target.id === 'menuaiOrderInput') {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function() {
          searchMenu(e.target.value);
        }, 150);
      }
    });
    
    document.addEventListener('keydown', function(e) {
      if (e.target.id !== 'menuaiOrderInput') return;
      
      var ac = document.getElementById('menuaiAutocomplete');
      var items = ac ? ac.querySelectorAll('.menuai-ac-item') : [];
      
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
    
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.menuai-search-container')) {
        hideAutocomplete();
      }
    });
    
    console.log('[MenüAi] Smart Overlay v4.0 - Ultra Modern loaded ✨');
  })();
</script>
<!-- End MenüAi Smart Overlay v4.0 -->
\`;

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
window.menuaiAddToCart = function (item) {
  var existing = cart.find(function (c) { return c.name === item.name; });
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
window.menuaiUpdateQty = function (index, delta) {
  if (cart[index]) {
    cart[index].qty += delta;
    if (cart[index].qty <= 0) {
      cart.splice(index, 1);
    }
    updateCartUI();
  }
};

// Send order
window.menuaiSendOrder = function () {
  if (cart.length === 0) {
    menuaiShowToast('⚠️ Sepetiniz boş!');
    return;
  }

  var items = cart.map(function (c) { return c.qty + 'x ' + c.name; }).join(', ');
  var total = cart.reduce(function (sum, c) { return sum + (c.price * c.qty); }, 0);

  console.log('[MenüAi] Order:', { items: cart, total: total });
  menuaiShowToast('✅ Sipariş gönderildi! Toplam: ' + total + ' ₺');

  // Clear cart
  cart = [];
  updateCartUI();
  if (cartExpanded) menuaiToggleCart();
};

// Call waiter
window.menuaiCallWaiter = function () {
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
  results.forEach(function (item, i) {
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
  items.forEach(function (el) {
    el.addEventListener('click', function () {
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
  var results = menuItems.filter(function (item) {
    return item.name.toLowerCase().includes(query);
  }).slice(0, 6);

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
  } else if (e.key === 'Enter' && selectedIndex >= 0) {
    e.preventDefault();
    var query = e.target.value.toLowerCase();
    var results = menuItems.filter(function (item) {
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
  items.forEach(function (el, i) {
    if (i === selectedIndex) {
      el.classList.add('selected');
      el.scrollIntoView({ block: 'nearest' });
    } else {
      el.classList.remove('selected');
    }
  });
}

// Hide autocomplete on outside click
document.addEventListener('click', function (e) {
  if (!e.target.closest('.menuai-search-wrap')) {
    hideAutocomplete();
  }
});

console.log('[MenüAi] Smart Overlay v3.0 with Cart loaded ✨');
  }) ();
</script >
< !--End MenüAi Smart Overlay v3.0 -- >
  `;
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

  console.log(`[Smart Switcher]Decision: ${result.mode.toUpperCase()} mode`);
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
      return res.json({ success: true, items, source: 'parsed_menu.json' });
    }

    // Fallback: Return empty if no menu file exists
    console.log('[Menu API] No parsed_menu.json found');
    return res.json({ success: false, items: [], source: null });

  } catch (error) {
    console.error('[Menu API] Error:', error.message);
    return res.json({ success: false, items: [], error: error.message });
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
    return res.status(400).json({ error: 'Missing URL parameter' });
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
// MENU API ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/menu/items', (req, res) => {
  try {
    const menuPath = path.join(__dirname, 'parsed_menu.json');
    if (!fs.existsSync(menuPath)) {
      return res.json({ items: [] });
    }

    const menuData = JSON.parse(fs.readFileSync(menuPath, 'utf8'));

    // Flatten categories into items array
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

    console.log('[Menu API] Returning', items.length, 'items from parsed_menu.json');
    res.json({ items });
  } catch (e) {
    console.error('[Menu API] Error:', e.message);
    res.json({ items: [] });
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
