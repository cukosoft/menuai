/**
 * Eksik tabloları Supabase'de oluştur
 * Çalıştır: node create_tables.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

async function main() {
    // RPC kullanamıyoruz (exec_sql yok), Supabase Dashboard SQL Editor'den çalıştırılmalı.
    // Ama tabloların var olup olmadığını kontrol edebiliriz.

    console.log('\n=== MenüAI Supabase Tablo Kontrolü ===\n');

    const tables = [
        'restaurants',
        'menu_categories',
        'menu_items',
        'menu_parse_logs',
        'tables',
        'notifications',
        'waiters'
    ];

    const missing = [];

    for (const t of tables) {
        const { data, error } = await supabase.from(t).select('id').limit(1);
        if (error && error.message.includes('not find')) {
            console.log(`❌ ${t} — EKSIK`);
            missing.push(t);
        } else if (error) {
            console.log(`⚠️  ${t} — ${error.message}`);
        } else {
            console.log(`✅ ${t} — VAR`);
        }
    }

    if (missing.length > 0) {
        console.log(`\n⚠️  ${missing.length} tablo eksik: ${missing.join(', ')}`);
        console.log('\nAşağıdaki SQL\'i Supabase Dashboard > SQL Editor\'de çalıştırın:\n');

        if (missing.includes('tables')) {
            console.log(`-- MASALAR TABLOSU
CREATE TABLE IF NOT EXISTS tables (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    table_number INT NOT NULL,
    label VARCHAR(50),
    qr_code_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(restaurant_id, table_number)
);
CREATE INDEX IF NOT EXISTS idx_tables_restaurant ON tables(restaurant_id);
`);
        }

        if (missing.includes('waiters')) {
            console.log(`-- GARSONLAR TABLOSU
CREATE TABLE IF NOT EXISTS waiters (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    pin VARCHAR(6),
    push_subscription JSONB,
    is_active BOOLEAN DEFAULT true,
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_waiters_restaurant ON waiters(restaurant_id);
`);
        }

        if (missing.includes('notifications')) {
            console.log(`-- BİLDİRİMLER TABLOSU
CREATE TABLE IF NOT EXISTS notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    table_id UUID REFERENCES tables(id) ON DELETE SET NULL,
    table_number INT,
    type VARCHAR(20) NOT NULL CHECK (type IN ('waiter', 'bill', 'order')),
    message TEXT,
    items JSONB,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'seen', 'done', 'cancelled')),
    seen_at TIMESTAMP WITH TIME ZONE,
    done_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_restaurant ON notifications(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
`);
        }
    } else {
        console.log('\n✅ Tüm tablolar mevcut!');
    }

    // Mevcut veri özeti
    console.log('\n=== Mevcut Veri ===\n');

    const { data: restaurants } = await supabase.from('restaurants').select('id, name, slug, menu_url');
    console.log(`Restoranlar: ${restaurants?.length || 0}`);
    if (restaurants) {
        restaurants.forEach(r => console.log(`  📍 ${r.name} | slug: ${r.slug} | url: ${r.menu_url?.substring(0, 50)}...`));
    }

    const { data: items } = await supabase.from('menu_items').select('id');
    console.log(`Menü ürünleri: ${items?.length || 0}`);

    const { data: categories } = await supabase.from('menu_categories').select('id');
    console.log(`Kategoriler: ${categories?.length || 0}`);

    const { data: notifs } = await supabase.from('notifications').select('id');
    console.log(`Bildirimler: ${notifs?.length || 0}`);
}

main().catch(console.error);
