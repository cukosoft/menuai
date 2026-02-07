-- =====================================================
-- MenüAi Veritabanı Şeması v2.0
-- Supabase PostgreSQL
-- Sprint 1: tables + notifications eklendi
-- =====================================================

-- 1. Restoranlar Tablosu
CREATE TABLE IF NOT EXISTS restaurants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_key VARCHAR(50) UNIQUE NOT NULL,  -- Benzersiz restoran anahtarı (örn: POTE-2024-A1B2)
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE,  -- URL-friendly isim (örn: pote-adana)
    menu_url TEXT,  -- Orijinal menü URL'si
    logo_url TEXT,
    address TEXT,
    phone VARCHAR(20),
    email VARCHAR(255),
    table_count INT DEFAULT 10,  -- Masa sayısı
    subscription_status VARCHAR(20) DEFAULT 'trial',  -- trial, active, expired, cancelled
    subscription_expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Masalar Tablosu (YENİ)
CREATE TABLE IF NOT EXISTS tables (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    table_number INT NOT NULL,
    label VARCHAR(50),  -- Opsiyonel etiket: "Bahçe 1", "VIP", "Teras 3"
    qr_code_url TEXT,   -- Üretilen QR kodun URL'si
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(restaurant_id, table_number)
);

-- 3. Menü Kategorileri Tablosu
CREATE TABLE IF NOT EXISTS menu_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Menü Ürünleri Tablosu
CREATE TABLE IF NOT EXISTS menu_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    category_id UUID REFERENCES menu_categories(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) DEFAULT 0,
    image_url TEXT,
    is_available BOOLEAN DEFAULT true,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Bildirimler Tablosu (YENİ)
CREATE TABLE IF NOT EXISTS notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    table_id UUID REFERENCES tables(id) ON DELETE SET NULL,
    table_number INT,  -- Hızlı erişim için (table_id olmadan da çalışsın)
    type VARCHAR(20) NOT NULL CHECK (type IN ('waiter', 'bill', 'order')),
    message TEXT,
    items JSONB,  -- Sipariş detayları: [{name, price, qty}]
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'seen', 'done', 'cancelled')),
    seen_at TIMESTAMP WITH TIME ZONE,
    done_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Garsonlar Tablosu (YENİ)
CREATE TABLE IF NOT EXISTS waiters (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    pin VARCHAR(6),  -- Basit giriş için PIN
    push_subscription JSONB,  -- Web Push subscription object
    is_active BOOLEAN DEFAULT true,
    last_seen_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Menü Parse Geçmişi (Audit Log)
CREATE TABLE IF NOT EXISTS menu_parse_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    source_url TEXT,
    items_found INT DEFAULT 0,
    categories_found INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'success',  -- success, partial, failed
    error_message TEXT,
    parsed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- Indexler
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_restaurants_key ON restaurants(restaurant_key);
CREATE INDEX IF NOT EXISTS idx_restaurants_slug ON restaurants(slug);
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_categories_restaurant ON menu_categories(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_tables_restaurant ON tables(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_restaurant ON notifications(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_waiters_restaurant ON waiters(restaurant_id);

-- =====================================================
-- Güncelleme Trigger'ları
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_restaurants_updated_at ON restaurants;
CREATE TRIGGER update_restaurants_updated_at
    BEFORE UPDATE ON restaurants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_menu_items_updated_at ON menu_items;
CREATE TRIGGER update_menu_items_updated_at
    BEFORE UPDATE ON menu_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Supabase Realtime (notifications tablosu için)
-- =====================================================
-- Supabase Dashboard > Database > Replication bölümünden
-- notifications tablosunu Realtime'a ekleyin.
-- Veya SQL ile:
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- =====================================================
-- RLS (Row Level Security)
-- Production'da aktif edilmeli
-- =====================================================
-- ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE waiters ENABLE ROW LEVEL SECURITY;

-- Örnek RLS politikaları:
-- Herkes restoran ve menü bilgilerini okuyabilir
-- CREATE POLICY "Public read restaurants" ON restaurants FOR SELECT USING (true);
-- CREATE POLICY "Public read menu_items" ON menu_items FOR SELECT USING (true);
-- Bildirim herkes ekleyebilir (müşteri), sadece restoran sahibi görebilir
-- CREATE POLICY "Anyone can insert notification" ON notifications FOR INSERT WITH CHECK (true);
