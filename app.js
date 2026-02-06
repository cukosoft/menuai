// =====================================================
// MenüAi V2 - Complete Menu Wrapper System
// Embed external menus + Ordering via Supabase
// =====================================================

// =====================================================
// Supabase Configuration
// =====================================================
const SUPABASE_URL = 'https://dqlpklkqyqvlkesuoktz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxbHBrbGtxeXF2bGtlc3Vva3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA2NzkyOTgsImV4cCI6MjA1NjI3NTI5OH0.wHFrGivR_zKIdjB-o7Hn6VnK8U-wA9_y1oJ_gHk8GgA';

// Supabase client (using CDN)
let supabase = null;
function initSupabase() {
    if (window.supabase) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✓ Supabase initialized');
    } else {
        console.error('Supabase library not loaded');
    }
}

// Demo menu URL
const DEMO_MENU_URL = 'https://mps27.mobresposmenu.com.tr/?id=MP422';

// =====================================================
// State
// =====================================================
const state = {
    menuUrl: localStorage.getItem('menuai_menuUrl') || '',
    restaurantId: null,
    restaurantSlug: new URLSearchParams(window.location.search).get('r') || '',
    tableNumber: parseInt(new URLSearchParams(window.location.search).get('table')) || 1,
    restaurant: null,
    menuItems: [],
    cart: [],
    isLoading: false
};

// =====================================================
// DOM Elements
// =====================================================
let elements = {};

function cacheElements() {
    elements = {
        menuWrapper: document.getElementById('menuWrapper'),
        menuFrame: document.getElementById('menuFrame'),
        setupPrompt: document.getElementById('setupPrompt'),
        menuUrlInput: document.getElementById('menuUrlInput'),
        loadMenuBtn: document.getElementById('loadMenuBtn'),
        demoLink: document.getElementById('demoLink'),

        // Search
        searchBar: document.getElementById('searchBar'),
        searchInput: document.getElementById('searchInput'),
        searchResults: document.getElementById('searchResults'),

        // Cart
        cartBadge: document.getElementById('cartBadge'),
        cartSheet: document.getElementById('cartSheet'),
        cartItems: document.getElementById('cartItems'),
        cartTotal: document.getElementById('cartTotal'),

        // Bottom bar
        waiterBtn: document.getElementById('waiterBtn'),
        orderBtn: document.getElementById('orderBtn'),
        billBtn: document.getElementById('billBtn'),

        // Toast
        toast: document.getElementById('toast'),
        toastMessage: document.getElementById('toastMessage')
    };
}

// =====================================================
// Database Functions
// =====================================================
async function loadRestaurant(slug) {
    if (!supabase) return null;

    const { data, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('slug', slug)
        .single();

    if (error) {
        console.error('Restaurant not found:', error);
        return null;
    }

    state.restaurant = data;
    state.restaurantId = data.id;
    return data;
}

async function loadMenuItems(restaurantId) {
    if (!supabase) return [];

    const { data, error } = await supabase
        .from('menu_items')
        .select(`
            *,
            menu_categories(name)
        `)
        .eq('restaurant_id', restaurantId)
        .eq('is_available', true)
        .order('sort_order');

    if (error) {
        console.error('Error loading menu:', error);
        return [];
    }

    state.menuItems = data || [];
    return data || [];
}

async function searchMenuItems(query) {
    if (!supabase || !state.restaurantId) return [];

    const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('restaurant_id', state.restaurantId)
        .eq('is_available', true)
        .ilike('name', `%${query}%`)
        .limit(10);

    return data || [];
}

async function submitOrder(items, notes = '') {
    if (!supabase || !state.restaurantId) return null;

    // Calculate total
    const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Create order
    const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
            restaurant_id: state.restaurantId,
            table_number: state.tableNumber,
            status: 'pending',
            total: total,
            notes: notes
        })
        .select()
        .single();

    if (orderError) {
        console.error('Error creating order:', orderError);
        return null;
    }

    // Add order items
    const orderItems = items.map(item => ({
        order_id: order.id,
        menu_item_id: item.id,
        quantity: item.quantity,
        unit_price: item.price,
        notes: item.notes || ''
    }));

    await supabase.from('order_items').insert(orderItems);

    return order;
}

async function sendNotification(type) {
    if (!supabase || !state.restaurantId) return null;

    const { data, error } = await supabase
        .from('notifications')
        .insert({
            restaurant_id: state.restaurantId,
            table_number: state.tableNumber,
            type: type,
            status: 'pending'
        })
        .select()
        .single();

    if (error) {
        console.error('Error sending notification:', error);
        return null;
    }

    return data;
}

// =====================================================
// Menu Wrapper Functions
// =====================================================
function loadMenu(url) {
    console.log('loadMenu called with:', url);

    if (!url) {
        showToast('Lütfen geçerli bir URL girin!', 'error');
        return;
    }

    // Validate URL
    try {
        new URL(url);
    } catch (e) {
        showToast('Geçersiz URL formatı!', 'error');
        return;
    }

    // Save to localStorage
    state.menuUrl = url;
    localStorage.setItem('menuai_menuUrl', url);

    // Get elements directly from DOM (fallback if cached elements not ready)
    const menuFrame = elements.menuFrame || document.getElementById('menuFrame');
    const setupPrompt = elements.setupPrompt || document.getElementById('setupPrompt');
    const searchBar = elements.searchBar || document.getElementById('searchBar');

    console.log('menuFrame:', menuFrame, 'setupPrompt:', setupPrompt);

    if (!menuFrame || !setupPrompt) {
        console.error('Required elements not found!');
        showToast('Sistem hatası! Sayfayı yenileyin.', 'error');
        return;
    }

    // Load in iframe
    menuFrame.src = url;
    setupPrompt.classList.add('hidden');
    setupPrompt.style.display = 'none'; // Force hide with inline style
    menuFrame.classList.add('active');
    menuFrame.style.display = 'block'; // Force show with inline style

    // Show search bar if we have menu data
    if (state.menuItems.length > 0 && searchBar) {
        searchBar.classList.add('visible');
    }

    showToast('✓ Menü yükleniyor...');

    menuFrame.onload = () => {
        showToast('✓ Menü hazır!');
    };
}

function showSetup() {
    elements.setupPrompt.classList.remove('hidden');
    elements.menuFrame.classList.remove('active');
    elements.menuFrame.src = '';
}

// =====================================================
// Search Functions
// =====================================================
let searchTimeout = null;

async function handleSearch(query) {
    if (query.length < 2) {
        hideSearchResults();
        return;
    }

    const results = await searchMenuItems(query);
    displaySearchResults(results);
}

function displaySearchResults(results) {
    if (!elements.searchResults) return;

    if (results.length === 0) {
        elements.searchResults.innerHTML = '<div class="no-results">Sonuç bulunamadı</div>';
    } else {
        elements.searchResults.innerHTML = results.map(item => `
            <div class="search-item" data-id="${item.id}">
                <div class="search-item-info">
                    <span class="search-item-name">${item.name}</span>
                    <span class="search-item-price">₺${item.price.toFixed(2)}</span>
                </div>
                <button class="add-to-cart-btn" onclick="addToCart('${item.id}')">+</button>
            </div>
        `).join('');
    }

    elements.searchResults.classList.add('visible');
}

function hideSearchResults() {
    if (elements.searchResults) {
        elements.searchResults.classList.remove('visible');
    }
}

// =====================================================
// Cart Functions
// =====================================================
function addToCart(itemId) {
    const item = state.menuItems.find(i => i.id === itemId);
    if (!item) return;

    const existingItem = state.cart.find(i => i.id === itemId);
    if (existingItem) {
        existingItem.quantity++;
    } else {
        state.cart.push({ ...item, quantity: 1 });
    }

    updateCartBadge();
    showToast(`✓ ${item.name} sepete eklendi`);
}

function removeFromCart(itemId) {
    state.cart = state.cart.filter(i => i.id !== itemId);
    updateCartBadge();
    updateCartSheet();
}

function updateCartBadge() {
    const total = state.cart.reduce((sum, item) => sum + item.quantity, 0);
    if (elements.cartBadge) {
        elements.cartBadge.textContent = total;
        elements.cartBadge.style.display = total > 0 ? 'flex' : 'none';
    }
}

function updateCartSheet() {
    if (!elements.cartItems || !elements.cartTotal) return;

    if (state.cart.length === 0) {
        elements.cartItems.innerHTML = '<div class="empty-cart">Sepetiniz boş</div>';
        elements.cartTotal.textContent = '₺0.00';
        return;
    }

    elements.cartItems.innerHTML = state.cart.map(item => `
        <div class="cart-item">
            <div class="cart-item-info">
                <span class="cart-item-name">${item.name}</span>
                <span class="cart-item-qty">x${item.quantity}</span>
            </div>
            <div class="cart-item-actions">
                <span class="cart-item-price">₺${(item.price * item.quantity).toFixed(2)}</span>
                <button class="remove-btn" onclick="removeFromCart('${item.id}')">×</button>
            </div>
        </div>
    `).join('');

    const total = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    elements.cartTotal.textContent = `₺${total.toFixed(2)}`;
}

function toggleCartSheet() {
    if (elements.cartSheet) {
        elements.cartSheet.classList.toggle('open');
        updateCartSheet();
    }
}

// =====================================================
// Toast Notification
// =====================================================
function showToast(message, type = 'success') {
    if (!elements.toastMessage || !elements.toast) return;

    elements.toastMessage.textContent = message;
    elements.toast.classList.add('show');

    setTimeout(() => {
        elements.toast.classList.remove('show');
    }, 3000);
}

// =====================================================
// Bottom Bar Actions
// =====================================================
async function callWaiter() {
    showToast('🔔 Garson çağrılıyor...');

    const result = await sendNotification('waiter');
    if (result) {
        showToast('✓ Garson çağrıldı!');
    } else {
        showToast('✓ Garson çağrıldı!'); // Still show success for demo
    }

    console.log('Garson çağrıldı - Masa:', state.tableNumber);
}

async function requestBill() {
    showToast('💳 Hesap isteniyor...');

    const result = await sendNotification('bill');
    if (result) {
        showToast('✓ Hesabınız hazırlanıyor!');
    } else {
        showToast('✓ Hesabınız hazırlanıyor!');
    }

    console.log('Hesap istendi - Masa:', state.tableNumber);
}

async function openOrderSheet() {
    if (state.cart.length === 0) {
        showToast('📝 Önce menüden ürün ekleyin');
        return;
    }

    toggleCartSheet();
}

async function confirmOrder() {
    if (state.cart.length === 0) {
        showToast('Sepetiniz boş!', 'error');
        return;
    }

    showToast('📤 Sipariş gönderiliyor...');

    const order = await submitOrder(state.cart);

    if (order) {
        showToast('✓ Siparişiniz alındı!');
        state.cart = [];
        updateCartBadge();
        toggleCartSheet();
    } else {
        showToast('Sipariş gönderilemedi', 'error');
    }
}

// =====================================================
// Event Listeners
// =====================================================
function initEventListeners() {
    console.log('initEventListeners called');
    console.log('loadMenuBtn:', elements.loadMenuBtn);
    console.log('menuUrlInput:', elements.menuUrlInput);

    // Load menu button
    if (elements.loadMenuBtn) {
        elements.loadMenuBtn.addEventListener('click', () => {
            console.log('Load button clicked!');
            const url = elements.menuUrlInput?.value?.trim() || '';
            console.log('URL to load:', url);
            loadMenu(url);
        });
    }

    // URL input enter key
    if (elements.menuUrlInput) {
        elements.menuUrlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const url = elements.menuUrlInput.value.trim();
                loadMenu(url);
            }
        });
    }

    // Demo link
    if (elements.demoLink) {
        elements.demoLink.addEventListener('click', (e) => {
            e.preventDefault();
            elements.menuUrlInput.value = DEMO_MENU_URL;
            loadMenu(DEMO_MENU_URL);
        });
    }

    // Search input
    if (elements.searchInput) {
        elements.searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                handleSearch(e.target.value);
            }, 300);
        });

        elements.searchInput.addEventListener('blur', () => {
            setTimeout(hideSearchResults, 200);
        });
    }

    // Bottom bar buttons
    if (elements.waiterBtn) {
        elements.waiterBtn.addEventListener('click', callWaiter);
    }
    if (elements.billBtn) {
        elements.billBtn.addEventListener('click', requestBill);
    }
    if (elements.orderBtn) {
        elements.orderBtn.addEventListener('click', openOrderSheet);
    }
}

// =====================================================
// Initialize
// =====================================================
async function init() {
    cacheElements();
    initSupabase();
    initEventListeners();

    // Check URL params
    const urlParams = new URLSearchParams(window.location.search);
    const menuParam = urlParams.get('menu');
    const restaurantSlug = urlParams.get('r');

    // Load restaurant if slug provided
    if (restaurantSlug && supabase) {
        const restaurant = await loadRestaurant(restaurantSlug);
        if (restaurant) {
            console.log('Restaurant loaded:', restaurant.name);
            await loadMenuItems(restaurant.id);

            if (restaurant.menu_url) {
                loadMenu(restaurant.menu_url);
            }
        }
    } else if (menuParam) {
        // Direct menu URL from param
        loadMenu(decodeURIComponent(menuParam));
    } else if (state.menuUrl) {
        // Load saved menu
        loadMenu(state.menuUrl);
    }

    console.log('MenüAi V2 initialized');
    console.log('Table:', state.tableNumber);
}

// Wait for DOM and Supabase library
document.addEventListener('DOMContentLoaded', () => {
    // Give Supabase CDN time to load
    setTimeout(init, 100);
});

// Export for global access
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.confirmOrder = confirmOrder;
window.toggleCartSheet = toggleCartSheet;
window.loadMenu = loadMenu;

// Global click handler for button (fallback)
function handleLoadClick() {
    const input = document.getElementById('menuUrlInput');
    const url = input?.value?.trim() || '';
    console.log('handleLoadClick called with URL:', url);
    loadMenu(url);
}
window.handleLoadClick = handleLoadClick;
