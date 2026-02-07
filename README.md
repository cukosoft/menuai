# 🍽️ MenüAI — Akıllı Restoran Menü Platformu

<div align="center">

![Version](https://img.shields.io/badge/version-2.1.0-blue)
![Status](https://img.shields.io/badge/status-Sprint%201%20Active-orange)
![Node](https://img.shields.io/badge/node-18%2B-green)
![License](https://img.shields.io/badge/license-MIT-purple)

**Restoranların donuk QR menülerini akıllandır.**

*QR kodunu tara → Menüyü gör → Garson çağır → Sipariş bildir → Hesap iste*

</div>

---

## 🎯 Nedir?

MenüAI, restoranların mevcut QR menülerinin üzerine **akıllı bir deneyim katmanı** ekleyen bir platformdur.

Restoran tarafında **sıfır entegrasyon** gerektirir — mevcut menü sitesini olduğu gibi kullanır, üstüne modern butonlar ve bildirim sistemi ekler.

### Problem
- Restoranların QR menüleri **statik, ruhsuz ve tek yönlü**
- Kalabalık mekanlarda garson çağırmak zor
- Müşteri sipariş vermek için garsonu beklemek zorunda
- Menü siteleri genellikle mobil uyumsuz ve yavaş

### Çözüm
- Mevcut menü sitesini **aynalayıp** altına modern bir bar ekle
- **🔔 Garson Çağır** — garsonun PWA'sına anında bildirim
- **🛒 Sipariş Bildir** — ne istediğini yazıp garsona ilet
- **💳 Hesap İste** — hesabını tek tuşla iste
- Menüyü AI ile parse edip **akıllı öneri ve autocomplete** sun

---

## 🏗️ Nasıl Çalışıyor?

```
┌─────────────────────────────────────────────────┐
│                MÜŞTERİ AKIŞI                     │
│                                                   │
│  1. Masadaki QR kodu tarar                       │
│     → menuai.app/r/lezzet-burger/masa/5          │
│                                                   │
│  2. Restoranın menüsü açılır                     │
│     (iframe / proxy / fallback UI — otomatik)    │
│                                                   │
│  3. Akıllı Alt Bar görünür                       │
│     ┌──────┬──────┬──────┐                       │
│     │  🔔  │  🛒  │  💳  │                       │
│     │Garson│Sipariş│Hesap │                       │
│     └──────┴──────┴──────┘                       │
│                                                   │
│  4. Buton basıldığında → Garson bildirim alır    │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│                GARSON AKIŞI                       │
│                                                   │
│  1. Garson PWA'yı telefonuna kurar               │
│     → menuai.app/r/lezzet-burger/garson          │
│                                                   │
│  2. Bildirimler anında gelir:                    │
│     🔔 Masa 5: Garson çağırıyor                  │
│     🛒 Masa 3: 2x Adana Kebap, 1x Ayran         │
│     💳 Masa 8: Hesap istiyor                     │
│                                                   │
│  3. "Görüldü" butonu ile tamamlar                │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│              RESTORAN SAHİBİ AKIŞI               │
│                                                   │
│  1. menuai.app/admin'den kayıt olur              │
│  2. Menü URL'sini girer                          │
│  3. AI menüyü otomatik parse eder               │
│  4. Masa sayısını belirler → QR'lar üretilir     │
│  5. QR'ları masalara yapıştırır                  │
│  6. Garsonlara PWA linkini paylaşır              │
│  7. Aylık abonelik ile kullanır                  │
└─────────────────────────────────────────────────┘
```

---

## 🧠 Teknik Mimari

```
                    MÜŞTERİ                          GARSON
                      │                                │
        QR tarar      │                                │  PWA açık
                      ▼                                ▼
             /r/:slug/masa/:no              /r/:slug/garson
                      │                                │
                      ▼                                │
             ┌── Smart Switcher ──┐                    │
             │                     │                    │
             │  1. iframe dene     │                    │
             │     ↓ engellendi?   │                    │
             │  2. proxy dene      │                    │
             │     ↓ başarısız?    │                    │
             │  3. fallback UI     │                    │
             │     (DB'den menü)   │                    │
             │                     │                    │
             └────────┬────────────┘                    │
                      │                                │
                      ▼                                │
             Overlay Görünür                           │
             (garson/hesap/sipariş)                    │
                      │                                │
             Buton basıldı                             │
                      │                                │
                      ▼                                │
             POST /api/notify ──► Supabase ──────► Realtime
                                  notifications      Subscription
                                    table                │
                                                         ▼
                                                  🔔 Push Bildirim
                                                  + Ses + Titreşim
```

### 3 Katmanlı Aynalama Stratejisi

| Katman | Yöntem | Ne Zaman | Nasıl |
|--------|--------|----------|-------|
| **1. iframe** | Siteyi iframe içinde göster | Site izin veriyorsa (~%60-70) | `<iframe src="restoran.com">` + overlay |
| **2. Proxy** | HTML'i çekip overlay enjekte et | iframe engelliyse (~%20-25) | axios + cheerio + overlay inject |
| **3. Fallback UI** | Kendi menü sayfamızı göster | Hiçbiri çalışmazsa (~%10-15) | Supabase'den menü verisi → güzel UI |

### Menü Verisi Neden Saklanıyor?

Menüler Supabase'e kaydediliyor çünkü:
1. **Autocomplete** — Sipariş verirken "Ad" yaz → "Adana Kebap ₺600" önerisi çıksın
2. **Fallback** — Restoranın sitesi çökerse bile müşteri menüyü görebilsin
3. **Analitik** — İleride: en çok sipariş edilen ürün, fiyat değişimi takibi

---

## 📂 Proje Yapısı

```
menuai/
│
├── 🖥️  BACKEND
│   ├── server.js              ← Express sunucu (Smart Switcher, API endpoints)
│   ├── menuParser.js          ← AI menü parser (Gemini Vision + DOM scraping)
│   ├── menuDatabase.js        ← Supabase CRUD işlemleri
│   └── supabase_schema.sql    ← PostgreSQL veritabanı şeması
│
├── 🎨  FRONTEND (Müşteri)
│   ├── index.html             ← Ana sayfa (menü wrapper + glass bar)
│   ├── app.js                 ← Frontend mantığı (cart, search, notifications)
│   ├── styles.css             ← Ana stil dosyası
│   └── overlay.html           ← Ghost Mode overlay (proxy modunda enjekte)
│
├── 🔧  ADMIN
│   └── admin.html             ← Restoran yönetim paneli
│
├── 📋  DOCS
│   ├── README.md              ← Bu dosya
│   ├── MASTER_PLAN.md         ← Detaylı yol haritası ve sprint planı
│   └── project_state.md       ← Anlık proje durumu
│
├── ⚙️  CONFIG
│   ├── package.json           ← Node.js bağımlılıkları
│   ├── .env                   ← API anahtarları (git'te yok)
│   ├── .env.example           ← Env şablonu
│   └── .gitignore
│
└── 📁  GENERATED
    ├── parsed_menu.json       ← Son parse edilen menü
    ├── menu.json              ← Menü verisi
    ├── screenshots/           ← Parser screenshot'ları
    └── public/uploads/        ← PDF yüklemeleri
```

---

## 🛠️ Teknoloji Stack

| Katman | Teknoloji | Neden |
|--------|-----------|-------|
| **Backend** | Express.js (Node 18+) | Hızlı, hafif, proxy desteği |
| **Veritabanı** | Supabase (PostgreSQL) | Realtime, Auth, Storage, ücretsiz tier |
| **AI** | Google Gemini Vision | Menü görsellerinden ürün çıkarma |
| **Scraping** | Puppeteer + Stealth | Anti-bot bypass, screenshot capture |
| **HTML İşleme** | Cheerio | Server-side DOM manipulation (proxy mode) |
| **Frontend** | Vanilla JS + CSS | Framework yok, hızlı, hafif |
| **Stil** | Glassmorphism + Inter Font | Modern, premium görünüm |
| **Garson** | PWA + Web Push API | Install edilebilir, push bildirim |
| **QR** | qrcode (npm) | Dinamik QR üretimi |

---

## 🧩 Bileşen Detayları

### 1. Smart Switcher (`server.js`)
Hedef URL'yi analiz edip en uygun görüntüleme modunu seçer:
- `X-Frame-Options` ve `Content-Security-Policy` header'larını kontrol eder
- PDF ise otomatik viewer moduna geçer
- iframe engelleniyorsa proxy moduna düşer
- Hiçbiri çalışmazsa fallback UI devreye girer

### 2. Menu Parser (`menuParser.js`)
İki aşamalı AI destekli menü çıkarma:
- **Aşama 1: DOM Scraping** — Sayfadaki metin tabanlı menüleri direkt çeker
- **Aşama 2: Gemini Vision** — DOM yetersizse screenshot alıp AI ile analiz eder
- **Özellikler:**
  - Accordion/tab açma (yakında)
  - Deep scroll ile uzun sayfaları yakalama
  - Kategori normalizasyonu (Türkçe/İngilizce)
  - Akıllı deduplication
  - "Diğer" kategorisi otomatik dağıtımı

### 3. Ghost Overlay (`overlay.html`)
Restoranın sitesi üzerinde görünen minimalist kontrol paneli:
- `pointer-events: none` ile sitenin tıklamalarını engellemez
- `backdrop-filter: blur()` glassmorphism efekti
- 3 floating buton: 🔔 Garson, 🛒 Sepet, 💳 Hesap
- Genişletilebilir sepet kartı (arama + autocomplete)
- `!important` ile site CSS çakışmalarını önler

### 4. Menü Database (`menuDatabase.js`)
Supabase ile menü verisi yönetimi:
- Restoran oluşturma (otomatik key ve slug)
- Kategori ve ürün upsert
- Parse log kaydı
- Menü getirme (key veya slug ile)

### 5. Admin Paneli (`admin.html`)
Restoran sahibinin menüsünü yönettiği dark-theme panel:
- URL gir → AI ile parse et → Supabase'e kaydet
- Kayıtlı restoranları listele
- Parse sonuçlarını görüntüle (kategori sayısı, ürün sayısı)

---

## 🗄️ Veritabanı Şeması

```sql
restaurants          -- Restoran bilgileri
├── id               UUID PK
├── restaurant_key   VARCHAR(50) UNIQUE   -- "POTE-2026-X7K9"
├── name             VARCHAR(255)
├── slug             VARCHAR(100) UNIQUE  -- "pote-adana"
├── menu_url         TEXT                 -- Orijinal menü URL
├── logo_url         TEXT
├── is_active        BOOLEAN
└── created_at       TIMESTAMP

tables               -- Masa bilgileri (🔴 Sprint 1'de ekleniyor)
├── id               UUID PK
├── restaurant_id    UUID FK → restaurants
├── table_number     INT
└── qr_code_url      TEXT

menu_categories      -- Menü kategorileri
├── id               UUID PK
├── restaurant_id    UUID FK → restaurants
├── name             VARCHAR(255)
└── display_order    INT

menu_items           -- Menü ürünleri
├── id               UUID PK
├── restaurant_id    UUID FK → restaurants
├── category_id      UUID FK → menu_categories
├── name             VARCHAR(255)
├── description      TEXT
├── price            DECIMAL(10,2)
├── image_url        TEXT
└── is_available     BOOLEAN

notifications        -- Bildirimler (🔴 Sprint 1'de ekleniyor)
├── id               UUID PK
├── restaurant_id    UUID FK → restaurants
├── table_id         UUID FK → tables
├── type             VARCHAR(20)          -- 'waiter' | 'bill' | 'order'
├── message          TEXT
├── items            JSONB                -- Sipariş detayları
├── status           VARCHAR(20)          -- 'pending' | 'seen' | 'done'
└── created_at       TIMESTAMP

waiters              -- Garsonlar (🔴 Sprint 2'de ekleniyor)
├── id               UUID PK
├── restaurant_id    UUID FK → restaurants
├── name             VARCHAR(100)
├── push_subscription JSONB              -- Web Push subscription
└── is_active        BOOLEAN

menu_parse_logs      -- Parse geçmişi
├── id               UUID PK
├── restaurant_id    UUID FK → restaurants
├── source_url       TEXT
├── items_found      INT
├── categories_found INT
├── status           VARCHAR(20)
└── parsed_at        TIMESTAMP
```

---

## 🚀 Kurulum

```bash
# 1. Repo'yu klonla
git clone https://github.com/your-username/menuai.git
cd menuai

# 2. Bağımlılıkları kur
npm install

# 3. Env dosyasını oluştur
cp .env.example .env
# .env dosyasını düzenle:
#   GEMINI_API_KEY=your_key_here
#   SUPABASE_URL=your_supabase_url
#   SUPABASE_KEY=your_supabase_anon_key

# 4. Supabase şemasını çalıştır
# Supabase Dashboard → SQL Editor → supabase_schema.sql yapıştır

# 5. Başlat
npm start
# → http://localhost:3000

# 6. Menü parse et (CLI)
node menuParser.js "https://restoran-site.com/menu"
```

---

## 📡 API Endpoints

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/` | Ana sayfa (landing) |
| `GET` | `/admin` | Admin paneli |
| `GET` | `/view?target=URL` | Menü aynalama (iframe/proxy/PDF) |
| `GET` | `/r/:slug/masa/:no` | 🔴 Müşteri menü sayfası (Sprint 1) |
| `GET` | `/r/:slug/garson` | 🔴 Garson PWA (Sprint 2) |
| `POST` | `/api/menu/parse` | Menü parse et (Gemini AI) |
| `GET` | `/api/menu/items` | Menü ürünlerini getir |
| `GET` | `/api/menu/:key` | Restoran key ile menü getir |
| `GET` | `/api/restaurants` | Tüm restoranları listele |
| `POST` | `/api/notify` | 🔴 Bildirim gönder (Sprint 1) |
| `POST` | `/upload` | PDF menü yükle |

---

## 📊 Proje Durumu

### ✅ Tamamlanan Fazlar

| Faz | Açıklama | Tarih |
|-----|----------|-------|
| V1.0 | İlk prototip — iframe + basit overlay | Ocak 2026 |
| V2.0 | Ultimate Core — Smart Switcher (iframe/proxy/PDF) | Ocak 2026 |
| V3.0 | Supabase entegrasyonu + Admin paneli | Ocak 2026 |
| V4.0 | Menü parser (Gemini Vision + DOM scraping) | Şubat 2026 |
| V5.0 | Ghost Mode overlay (floating glassmorphism) | Şubat 2026 |
| V5.3 | Parser güçlendirme (kategori normalizasyon, dedup, tab keşfi) | Şubat 2026 |

### 🔄 Aktif Sprint: Sprint 1 — Temel Altyapı

| Görev | Durum | Açıklama |
|-------|-------|----------|
| 1.1 Supabase Şema Güncelle | 🔄 Aktif | tables, notifications tabloları |
| 1.2 URL Routing | ⬜ Bekliyor | /r/:slug/masa/:no endpoint |
| 1.3 Fallback Menü UI | ⬜ Bekliyor | DB'den güzel menü sayfası |
| 1.4 Overlay → Backend Bağla | ⬜ Bekliyor | Butonlar gerçek bildirim gönder |

### ⬜ Gelecek Sprintler

| Sprint | Konu | Tahmini Süre |
|--------|------|-------------|
| Sprint 2 | Garson PWA + Realtime Bildirim | 3-4 gün |
| Sprint 3 | QR Üreteci + Restoran Onboarding | 2-3 gün |
| Sprint 4 | Deploy + Abonelik + Cila | 2-3 gün |

---

## 🧪 Test Edilen Siteler

Menu Parser aşağıdaki sitelerde test edilmiştir:

| Site | Tip | Sonuç |
|------|-----|-------|
| asiminyeri.com.tr | Resim tabanlı menü | ✅ 90+ ürün (Vision AI) |
| sks.nevsehir.edu.tr | Haftalık yemek tablosu | ✅ 18 ürün (Vision AI) |
| mps27.mobresposmenu.com.tr | Dijital menü servisi | ✅ DOM scraping |

### iframe Uyumluluk Testi

| Site Tipi | iframe Çalışır? |
|-----------|-----------------|
| Küçük/orta restoran siteleri | ✅ %60-70 |
| QR menü servisleri (menux, menulux) | ✅ Çoğu |
| Büyük zincirler (Dominos, BK, Popeyes) | ❌ Engelliyor |
| 3. parti SaaS menü servisleri | ⚠️ Değişir |

---

## 🤝 Katkıda Bulunma

Bu proje aktif geliştirme aşamasındadır. Katkıda bulunmak için:

1. Fork et
2. Feature branch oluştur (`git checkout -b feature/yeni-ozellik`)
3. Commit et (`git commit -m 'Yeni özellik ekle'`)
4. Push et (`git push origin feature/yeni-ozellik`)
5. Pull Request aç

---

## 📄 Lisans

MIT License — Detaylar için `LICENSE` dosyasına bakın.

---

<div align="center">

**MenüAI** — *Her masada akıllı menü deneyimi* 🍽️

Geliştirici: Kaya | 2026

</div>
