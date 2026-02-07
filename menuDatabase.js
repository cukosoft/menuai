/**
 * MenüAi Supabase Integration
 * Menü verilerini Supabase'e kaydetmek için yardımcı modül
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

class MenuDatabase {
    constructor() {
        this.supabaseUrl = process.env.SUPABASE_URL || 'https://dqlpklkqyqvlkesuoktz.supabase.co';
        this.supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxbHBrbGtxeXF2bGtlc3Vva3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA2NzkyOTgsImV4cCI6MjA1NjI3NTI5OH0.wHFrGivR_zKIdjB-o7Hn6VnK8U-wA9_y1oJ_gHk8GgA';

        this.supabase = createClient(this.supabaseUrl, this.supabaseKey);
        console.log('📦 [MenuDB] Supabase client initialized');
    }

    /**
     * Benzersiz restoran anahtarı oluştur
     * Format: {ISIM_KISALTMA}-{YIL}-{RANDOM}
     * Örnek: POTE-2026-X7K9
     */
    generateRestaurantKey(restaurantName) {
        const prefix = restaurantName
            .toUpperCase()
            .replace(/[^A-Z]/g, '')
            .substring(0, 4)
            .padEnd(4, 'X');

        const year = new Date().getFullYear();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();

        return `${prefix}-${year}-${random}`;
    }

    /**
     * URL'den slug oluştur
     */
    createSlug(name) {
        return name
            .toLowerCase()
            .replace(/ş/g, 's')
            .replace(/ğ/g, 'g')
            .replace(/ü/g, 'u')
            .replace(/ö/g, 'o')
            .replace(/ç/g, 'c')
            .replace(/ı/g, 'i')
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .substring(0, 50);
    }

    /**
     * Yeni restoran oluştur veya mevcut olanı getir
     */
    async getOrCreateRestaurant(name, menuUrl) {
        // Önce mevcut restoranı ara (menu_url ile)
        const { data: existing } = await this.supabase
            .from('restaurants')
            .select('*')
            .eq('menu_url', menuUrl)
            .single();

        if (existing) {
            console.log(`📍 [MenuDB] Found existing restaurant: ${existing.name} (${existing.restaurant_key})`);
            return existing;
        }

        // Yeni restoran oluştur
        const restaurantKey = this.generateRestaurantKey(name);
        const slug = this.createSlug(name);

        const { data: newRestaurant, error } = await this.supabase
            .from('restaurants')
            .insert({
                restaurant_key: restaurantKey,
                name: name,
                slug: slug,
                menu_url: menuUrl,
                is_active: true
            })
            .select()
            .single();

        if (error) {
            console.error('❌ [MenuDB] Error creating restaurant:', error.message);
            throw error;
        }

        console.log(`✅ [MenuDB] Created new restaurant: ${name} (Key: ${restaurantKey})`);
        return newRestaurant;
    }

    /**
     * Kategori oluştur veya mevcut olanı getir
     */
    async getOrCreateCategory(restaurantId, categoryName) {
        // Mevcut kategoriyi ara
        const { data: existing } = await this.supabase
            .from('menu_categories')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .eq('name', categoryName)
            .single();

        if (existing) {
            return existing;
        }

        // Yeni kategori oluştur
        const { data: newCategory, error } = await this.supabase
            .from('menu_categories')
            .insert({
                restaurant_id: restaurantId,
                name: categoryName,
                is_active: true
            })
            .select()
            .single();

        if (error) {
            console.error('❌ [MenuDB] Error creating category:', error.message);
            throw error;
        }

        return newCategory;
    }

    /**
     * Menü ürünü ekle veya güncelle
     */
    async upsertMenuItem(restaurantId, categoryId, item) {
        // Mevcut ürünü ara (isim bazlı)
        const { data: existing } = await this.supabase
            .from('menu_items')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .eq('name', item.name)
            .single();

        if (existing) {
            // Güncelle
            const { data: updated, error } = await this.supabase
                .from('menu_items')
                .update({
                    category_id: categoryId,
                    price: item.price || 0,
                    description: item.description || '',
                    is_available: true
                })
                .eq('id', existing.id)
                .select()
                .single();

            if (error) throw error;
            return { action: 'updated', item: updated };
        }

        // Yeni ürün ekle
        const { data: newItem, error } = await this.supabase
            .from('menu_items')
            .insert({
                restaurant_id: restaurantId,
                category_id: categoryId,
                name: item.name,
                price: item.price || 0,
                description: item.description || '',
                is_available: true
            })
            .select()
            .single();

        if (error) throw error;
        return { action: 'created', item: newItem };
    }

    /**
     * Parse log kaydı oluştur
     */
    async logParse(restaurantId, sourceUrl, itemsFound, categoriesFound, status = 'success', errorMessage = null) {
        const { error } = await this.supabase
            .from('menu_parse_logs')
            .insert({
                restaurant_id: restaurantId,
                source_url: sourceUrl,
                items_found: itemsFound,
                categories_found: categoriesFound,
                status: status,
                error_message: errorMessage
            });

        if (error) {
            console.warn('⚠️ [MenuDB] Could not log parse:', error.message);
        }
    }

    /**
     * Parsed menu verisini Supabase'e kaydet
     * @param {Object} menuData - menuParser'dan gelen veri
     * @returns {Object} - Kayıt sonucu
     */
    async saveMenuToDatabase(menuData) {
        const stats = {
            restaurantKey: null,
            restaurantId: null,
            categoriesCreated: 0,
            categoriesUpdated: 0,
            itemsCreated: 0,
            itemsUpdated: 0,
            errors: []
        };

        try {
            // 1. Restoran oluştur/getir
            const restaurantName = menuData.restaurant || 'Restaurant';
            const restaurant = await this.getOrCreateRestaurant(
                restaurantName,
                menuData.menu_url
            );

            stats.restaurantKey = restaurant.restaurant_key;
            stats.restaurantId = restaurant.id;

            console.log(`\n📊 [MenuDB] Saving menu for: ${restaurant.name}`);
            console.log(`   🔑 Restaurant Key: ${restaurant.restaurant_key}`);

            // 2. Kategorileri ve ürünleri kaydet
            for (const category of menuData.categories || []) {
                try {
                    const dbCategory = await this.getOrCreateCategory(
                        restaurant.id,
                        category.name
                    );

                    // Kategori ürünlerini kaydet
                    for (const item of category.items || []) {
                        try {
                            const result = await this.upsertMenuItem(
                                restaurant.id,
                                dbCategory.id,
                                item
                            );

                            if (result.action === 'created') {
                                stats.itemsCreated++;
                            } else {
                                stats.itemsUpdated++;
                            }
                        } catch (itemError) {
                            stats.errors.push(`Item "${item.name}": ${itemError.message}`);
                        }
                    }

                    stats.categoriesCreated++;
                } catch (catError) {
                    stats.errors.push(`Category "${category.name}": ${catError.message}`);
                }
            }

            // 3. Parse log kaydı
            await this.logParse(
                restaurant.id,
                menuData.menu_url,
                stats.itemsCreated + stats.itemsUpdated,
                stats.categoriesCreated,
                stats.errors.length > 0 ? 'partial' : 'success'
            );

            console.log(`\n✅ [MenuDB] Save complete!`);
            console.log(`   📁 Categories: ${stats.categoriesCreated}`);
            console.log(`   🆕 Items created: ${stats.itemsCreated}`);
            console.log(`   🔄 Items updated: ${stats.itemsUpdated}`);
            if (stats.errors.length > 0) {
                console.log(`   ⚠️ Errors: ${stats.errors.length}`);
            }

            return {
                success: true,
                restaurantKey: stats.restaurantKey,
                stats: stats
            };

        } catch (error) {
            console.error('❌ [MenuDB] Database save error:', error.message);

            // Hata kaydı
            if (stats.restaurantId) {
                await this.logParse(
                    stats.restaurantId,
                    menuData.menu_url,
                    0, 0, 'failed',
                    error.message
                );
            }

            return {
                success: false,
                error: error.message,
                stats: stats
            };
        }
    }

    /**
     * Restoran key ile menü verilerini getir
     */
    async getMenuByKey(restaurantKey) {
        // Restoranı bul
        const { data: restaurant, error: restError } = await this.supabase
            .from('restaurants')
            .select('*')
            .eq('restaurant_key', restaurantKey)
            .single();

        if (restError || !restaurant) {
            return { success: false, error: 'Restaurant not found' };
        }

        // Kategorileri getir
        const { data: categories } = await this.supabase
            .from('menu_categories')
            .select('*')
            .eq('restaurant_id', restaurant.id)
            .order('display_order');

        // Ürünleri getir
        const { data: items } = await this.supabase
            .from('menu_items')
            .select('*')
            .eq('restaurant_id', restaurant.id)
            .eq('is_available', true)
            .order('display_order');

        // Kategorilere ürünleri ekle
        const categorizedMenu = categories.map(cat => ({
            ...cat,
            items: items.filter(item => item.category_id === cat.id)
        }));

        return {
            success: true,
            restaurant: restaurant,
            categories: categorizedMenu,
            totalItems: items.length
        };
    }

    /**
     * Tüm restoranları listele
     */
    async listRestaurants() {
        const { data, error } = await this.supabase
            .from('restaurants')
            .select('id, restaurant_key, name, slug, menu_url, is_active, created_at')
            .order('created_at', { ascending: false });

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true, restaurants: data };
    }
}

module.exports = MenuDatabase;
