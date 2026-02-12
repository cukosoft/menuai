#!/usr/bin/env node
/**
 * parseBigChefs.js — BigChefs HTML menüsünü parse edip Supabase'e kaydeder
 * BigChefs fiyat paylaşmıyor, tüm fiyatlar 0 olacak.
 */
require('dotenv').config();
const cheerio = require('cheerio');
const axios = require('axios');
const { importMenu } = require('./importToSupabase');
const fs = require('fs');
const path = require('path');

const PAGES = [
    { url: 'https://bigchefs.com.tr/menu/yiyecekler/', type: 'food' },
    { url: 'https://bigchefs.com.tr/menu/icecekler/', type: 'drink' },
];

// Elementor tab başlıklarından kategori mapping
const FOOD_CATEGORIES = [
    'Kahvaltılar', 'Tostlar', 'Yumurtalar', 'Kahvaltını Yarat',
    'Çorbalar', 'Başlangıç & Atıştırmalıklar', 'Salatalar',
    'Dolu Dolu Kaseler', 'Sokak Lezzetleri', 'Burgerler',
    'Pizzalar', 'Mantı & Makarnalar', 'Menu Italiano',
    'Tavuklar', 'Sıcak Kaseler', 'Schnitzeller',
    'Et & Köfteler', 'Yanında', 'Fajitalar', 'Balıklar',
    'Vegan', 'Tatlılar'
];

const DRINK_CATEGORIES = [
    'Kahveler', 'Çaylar', 'Matchalar', 'Healthy & Fresh',
    'Protein Shakeler', 'Smoothieler', 'Avoya Blend',
    'Milkshakeler', 'Limonatalar', 'Bubble Tealar',
    'Soğuk İçecekler', 'Ice Tealar', 'Iced Coffee & Iced Latte',
    'Alkolsüz Kokteyller', 'Klasik Kokteyller', 'BigChefs Signatures',
    'Biralar', 'Alternatif İçkiler', 'Şaraplar'
];

async function fetchAndParse(url) {
    console.log(`📥 Fetching: ${url}`);
    const { data: html } = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });

    const $ = cheerio.load(html);
    const items = [];

    // Elementor tab panellerini bul
    const tabPanels = $('.e-n-tabs-content .e-con, .elementor-tab-content, [role="tabpanel"]');

    console.log(`📋 ${tabPanels.length} tab panel bulundu`);

    // Her tab paneli bir kategori
    tabPanels.each((tabIdx, panel) => {
        const $panel = $(panel);

        // Tab başlığını bul (eşleşen tab title)
        let categoryName = '';

        // Tab title'ları bul
        const tabTitles = $('.e-n-tab-title, .elementor-tab-title');
        if (tabTitles.length > tabIdx) {
            categoryName = $(tabTitles[tabIdx]).text().trim();
        }

        if (!categoryName) {
            // Panel içindeki ilk heading'i kategori olarak kullan
            const firstHeading = $panel.find('h2, h3').first();
            if (firstHeading.length) {
                categoryName = firstHeading.text().trim();
            }
        }

        // Panel içindeki tüm widget'ları tara
        // BigChefs pattern: her ürün bir heading (h4/h5/h6) widget'ı + açıklama
        const widgets = $panel.find('.elementor-widget-heading, .elementor-heading-title, h4, h5');

        let currentItem = null;

        widgets.each((i, el) => {
            const $el = $(el);
            const text = $el.text().trim();
            const tag = el.tagName?.toLowerCase() || $el.prop('tagName')?.toLowerCase();

            if (!text || text.length < 2) return;

            // Footer/navigation link'leri atla
            if (text.includes('bigchefs.com') || text.includes('Kariyer') ||
                text.includes('KVKK') || text.includes('Gizlilik') ||
                text.includes('Site Haritası') || text.includes('Yatırımcı')) return;

            // Kategori başlığı mı yoksa ürün mü?
            const isCategory = FOOD_CATEGORIES.includes(text) || DRINK_CATEGORIES.includes(text);

            if (isCategory) {
                categoryName = text;
                return;
            }

            // Ürün adı olabilir
            if (text.length > 1 && text.length < 200) {
                if (currentItem) {
                    items.push(currentItem);
                }
                currentItem = {
                    name: text,
                    price: 0,
                    category: categoryName || 'Diğer',
                    description: ''
                };
            }
        });

        if (currentItem) {
            items.push(currentItem);
            currentItem = null;
        }
    });

    // Eğer tab yapısı çalışmadıysa, tüm sayfadaki heading'leri tara
    if (items.length === 0) {
        console.log('⚠️ Tab yapısı bulunamadı, tüm sayfa taranıyor...');

        let currentCategory = 'Genel';
        const allElements = $('h2, h3, h4, h5, h6, .elementor-heading-title');

        allElements.each((i, el) => {
            const $el = $(el);
            const text = $el.text().trim();
            const tag = el.tagName?.toLowerCase() || '';
            const parentClasses = $el.parent().attr('class') || '';

            if (!text || text.length < 2) return;

            // Footer/navigation atla
            if (text.includes('bigchefs.com') || text.includes('Kariyer') ||
                text.includes('KVKK') || text.includes('Gizlilik') ||
                text.includes('Site Haritası') || text.includes('Yatırımcı') ||
                text.includes('İletişim') || text.includes('Franchise') ||
                text.includes('Halka Arz') || text.includes('Finansal')) return;

            // Kategori tab başlıkları
            const isTabTitle = parentClasses.includes('e-n-tab-title') ||
                parentClasses.includes('elementor-tab-title') ||
                $el.closest('[role="tab"]').length > 0;

            if (isTabTitle) {
                currentCategory = text;
                return;
            }

            // h4 = ürün adı, h6 = açıklama (BigChefs pattern)
            if (tag === 'h4' || (tag === 'h5' && !FOOD_CATEGORIES.includes(text) && !DRINK_CATEGORIES.includes(text))) {
                // Önceki açıklamayı tamamla
                items.push({
                    name: text,
                    price: 0,
                    category: currentCategory || 'Diğer',
                    description: ''
                });
            } else if (tag === 'h6' && items.length > 0) {
                // Son ürünün açıklaması
                const lastItem = items[items.length - 1];
                if (!lastItem.description) {
                    lastItem.description = text;
                }
            } else if ((tag === 'h2' || tag === 'h3') && !text.includes('Yiyecekler') && !text.includes('İçecekler')) {
                // Alt kategori başlığı
                if (FOOD_CATEGORIES.includes(text) || DRINK_CATEGORIES.includes(text)) {
                    currentCategory = text;
                }
            }
        });
    }

    return items;
}

async function main() {
    console.log('\n' + '═'.repeat(60));
    console.log('  🍽️  BigChefs Menu Parser');
    console.log('═'.repeat(60) + '\n');

    let allItems = [];

    for (const page of PAGES) {
        try {
            const items = await fetchAndParse(page.url);
            console.log(`✅ ${page.type}: ${items.length} ürün çıkarıldı`);
            allItems.push(...items);
        } catch (err) {
            console.error(`❌ ${page.url} hata: ${err.message}`);
        }
    }

    // Deduplicate
    const seen = new Set();
    allItems = allItems.filter(item => {
        const key = item.name.toLowerCase().trim();
        if (key.length > 1 && !seen.has(key)) {
            seen.add(key);
            return true;
        }
        return false;
    });

    console.log(`\n📊 Toplam: ${allItems.length} benzersiz ürün`);

    // Kategorilere ayır
    const categories = {};
    for (const item of allItems) {
        if (!categories[item.category]) {
            categories[item.category] = [];
        }
        categories[item.category].push(item);
    }

    console.log(`📂 Kategoriler: ${Object.keys(categories).length}`);
    for (const [cat, items] of Object.entries(categories)) {
        console.log(`   - ${cat}: ${items.length} ürün`);
    }

    // Menu data format
    const menuData = {
        restaurant: 'Big Chefs',
        menu_url: 'https://bigchefs.com.tr/menu/',
        categories: Object.entries(categories).map(([name, items]) => ({
            name,
            items: items.map(it => ({
                name: it.name,
                price: it.price,
                description: it.description || ''
            }))
        }))
    };

    // JSON kaydet
    const outFile = path.join(__dirname, 'extracted_menu_bigchefs.json');
    fs.writeFileSync(outFile, JSON.stringify(menuData, null, 2), 'utf8');
    console.log(`\n💾 JSON kaydedildi: ${outFile}`);

    // Supabase'e import
    console.log('\n📤 Supabase\'e aktarılıyor...');
    try {
        await importMenu(menuData, 'bigchefs', 'Big Chefs', 'https://bigchefs.com.tr/menu/');
        console.log('\n' + '═'.repeat(60));
        console.log('  ✅ TAMAMLANDI!');
        console.log('═'.repeat(60));
        console.log('  🌐 Sayfa: https://menuai.tr/p/bigchefs');
        console.log(`  📊 ${allItems.length} ürün, ${Object.keys(categories).length} kategori`);
        console.log('═'.repeat(60) + '\n');
    } catch (err) {
        console.error(`❌ Supabase import hatası: ${err.message}`);
    }
}

main().catch(err => {
    console.error(`\n❌ HATA: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
});
