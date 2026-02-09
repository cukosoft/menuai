# 🍽️ MenüAI — Akıllı Restoran Menü Platformu

<div align="center">

![Version](https://img.shields.io/badge/version-7.2.0-blue)
![Status](https://img.shields.io/badge/status-OCR%20Zone%20Overlay-brightgreen)
![Node](https://img.shields.io/badge/node-18%2B-green)
![License](https://img.shields.io/badge/license-MIT-purple)

**Restoranların donuk QR menülerini akıllandır.**

*QR kodunu tara → Menüyü gör → Ürün ekle → Sipariş ver*

</div>

---

## 🎯 Nedir?

MenüAI, restoranların mevcut QR menülerinin üzerine **akıllı bir deneyim katmanı** ekleyen bir platformdur.

Restoran tarafında **sıfır entegrasyon** gerektirir — mevcut menü sitesini olduğu gibi proxy modunda aynalar, üstüne **sepet sistemi, ürün butonları ve sipariş paneli** ekler.

### Problem
- Restoranların QR menüleri **statik, ruhsuz ve tek yönlü**
- Kalabalık mekanlarda garson çağırmak zor
- Müşteri sipariş vermek için garsonu beklemek zorunda
- Image-based (görsel) menülerde ürün seçmek imkansız

### Çözüm
- Mevcut menü sitesini **aynalayıp** akıllı ürün butonları ekle
- **Text-based menüler:** DOM'da ürün isimlerini eşleştirip otomatik **+** butonu enjekte et
- **Image-based menüler:** Fallback panel ile kategorili ürün listesi sun
- **🆕 OCR Zone Overlay:** Görsel menü fotoğraflarının üzerine doğrudan **interaktif + butonları** yerleştir
- **🛒 Sepet sistemi** — ürünleri seçip tek tuşla sipariş gönder

---

## 🏗️ Nasıl Çalışıyor?

```
┌─────────────────────────────────────────────────┐
│                MÜŞTERİ AKIŞI                     │
│                                                   │
│  1. Masadaki QR kodu tarar                       │
│     → menuai.app/r/tucco/masa/5                  │
│                                                   │
│  2. Proxy modunda menü görünür                   │
│     (orijinal site + MenüAi injection)           │
│                                                   │
│  3a. TEXT-BASED menü → Ürünlere "+" eklenir      │
│      Ürün adı DOM'da bulunur → buton enjekte     │
│                                                   │
│  3b. IMAGE-BASED menü → İki yöntem:             │
│      • OCR Zone Overlay → Resmin üzerinde "+"   │
│      • Fallback Panel  → Kategorili ürün listesi│
│                                                   │
│  4. Ürünler sepete eklenir                       │
│     🛒 Cart FAB → Bottom Sheet → "Gönder"       │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│              RESTORAN SAHİBİ AKIŞI               │
│                                                   │
│  1. menuai.app/admin'den kayıt olur              │
│  2. Menü URL'sini girer                          │
│  3. AI menüyü otomatik parse eder               │
│  4. Supabase'e ürün + kategori verisi kaydedilir │
│  5. QR'ları masalara yapıştırır                  │
│  6. Slug bazlı erişim: /p/slug/                  │
└─────────────────────────────────────────────────┘
```

---

## 🧠 Teknik Mimari

```
                    MÜŞTERİ                
                      │                    
        QR tarar      │                    
                      ▼                    
             /r/:slug/masa/:no   →  302 redirect
                      │                    
                      ▼                    
              /p/:slug/*  (Proxy)          
                      │                    
                      ▼                    
         ┌── Proxy Engine ────────────┐    
         │                             │    
         │  1. HTML fetch (axios)      │    
         │  2. URL rewriting           │    
         │     /assets → /p/slug/assets│    
         │  3. Script injection        │    
         │     menuai-inject.js        │    
         │  4. Header cleanup          │    
         │     (X-Frame-Options etc.)  │    
         └────────────┬───────────────┘    
                      │                    
                      ▼                    
         ┌── Client-Side Script ──────┐    
         │  menuai-inject.js          │    
         │                             │    
         │  ► Network Interceptor      │    
         │    fetch/XHR → proxy path   │    
         │                             │    
         │  ► Menu API Fetch           │    
         │    /api/menu-items/:slug    │    
         │                             │    
         │  ► Text Matching Engine     │    
         │    DOM text ↔ DB ürünler    │    
         │    eşleşme → "+" butonu     │    
         │                             │    
         │  ► Fallback Panel Loader    │    
         │    0 eşleşme → panel mod    │    
         │    menuai-fallback-panel.js  │    
         │                             │    
         │  ► Cart System              │    
         │    addToCart/removeFromCart   │    
         │    CartFAB + BottomSheet     │    
         └────────────────────────────┘    
```

### Üçlü Enjeksiyon Stratejisi

| Strateji | Tetikleme | Yöntem | Uygun Menü Tipi |
|----------|-----------|--------|-----------------|
| **Text Match** | DOM'da ürün adı bulundu | Ürünün yanına `+` butonu eklenir | Dijital menüler, metin tabanlı siteler |
| **OCR Zone Overlay** | OCR pozisyon verisi mevcut | Resmin üzerine görünmez zone + `+` butonu | Image-based menüler (fotoğraf/görsel) |
| **Fallback Panel** | 0 text match + OCR yok | "Sipariş" FAB → tam ekran ürün listesi | PDF menüler, fallback |

Üç stratejide de aynı **sepet sistemi** kullanılır.

---

## 📂 Proje Yapısı

```
menuai/
│
├── 🖥️  BACKEND
│   ├── server.js              ← Express sunucu (Proxy Engine, API endpoints)
│   ├── menuParser.js          ← AI menü parser (Gemini Vision + DOM scraping)
│   ├── menuDatabase.js        ← Supabase CRUD işlemleri
│   ├── importToSupabase.js    ← Extracted JSON → Supabase importer
│   └── supabase_schema.sql    ← PostgreSQL veritabanı şeması
│
├── 🎨  CLIENT-SIDE INJECTION (public/)
│   ├── menuai-inject.js       ← Ana istemci scripti (proxy sayfaya enjekte edilir)
│   │   ├─ Network Interceptor  (fetch/XHR → proxy path rewrite)
│   │   ├─ Cart System           (ekleme/çıkarma/miktar/toplam)
│   │   ├─ Cart UI               (FAB + Badge + BottomSheet)
│   │   ├─ CSS Injection         (tüm stiller burada)
│   │   ├─ Text Match Engine     (DOM scan → + buton)
│   │   └─ Fallback Panel Loader (0 match → panel modu)
│   │
│   ├── menuai-ocr-overlay.js  ← OCR Overlay (proxy sayfadaki görsellere zone enjekte)
│   ├── menuai-fallback-panel.js ← Fallback: kategorili ürün paneli
│   ├── zone-demo.html         ← Zone modu demo (çoklu sayfa, interaktif butonlar)
│   ├── native-menu.html       ← Native menü görünümü (standalone)
│   └── ocr-positions-*.json   ← OCR pozisyon verileri (sayfa bazlı bbox)
│
├── 🎨  FRONTEND (Sayfalar)
│   ├── index.html             ← Ana sayfa (landing)
│   ├── admin.html             ← Admin paneli
│   ├── app.js                 ← Frontend mantığı
│   ├── styles.css             ← Ana stil dosyası
│   └── overlay.html           ← Ghost Mode overlay (legacy)
│
├── 📋  DOCS
│   ├── README.md              ← Bu dosya
│   ├── MASTER_PLAN.md         ← Detaylı yol haritası
│   └── project_state.md       ← Anlık proje durumu
│
├── ⚙️  CONFIG
│   ├── package.json
│   ├── .env                   ← API anahtarları (git'te yok)
│   ├── .env.example           ← Env şablonu
│   └── .gitignore
│
└── 🔧  TOOLS
    ├── extractMenu.js         ← AI ile menü çıkarma CLI
    ├── universalExtractor.js  ← Evrensel menü çıkarma motoru
    ├── singleQueryOcr.js      ← Tek sorgu OCR (Gemini Vision)
    ├── preciseOcr.js          ← Precise OCR (bbox çıkarma, 2-step)
    ├── smartScroll.js         ← Akıllı scroll / deep extraction
    └── create_tables.js       ← DB tablo oluşturma
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
| **HTTP** | Axios | Proxy backend HTTP istekleri |
| **Frontend** | Vanilla JS + CSS | Framework yok, hızlı, hafif |
| **Stil** | Glassmorphism + Inter Font | Modern, premium görünüm |
| **QR** | qrcode (npm) | Dinamik QR üretimi |

---

## 🧩 Bileşen Detayları

### 1. Proxy Engine (`server.js`)

Hedef restoran sitesini proxy modunda aynalar ve istemci scriptini enjekte eder:

```
GET /p/:slug/*  →  Proxy Handler
  ├── DB'den restoran slug → menu_url bulma
  ├── Target URL oluşturma (origin + path)
  ├── axios ile HTML, CSS, JS, image fetch
  ├── HTML işleme:
  │   ├── URL rewriting (src, href → /p/slug/...)
  │   ├── menuai-inject.js oku + placeholder replace
  │   │   ├── __MENUAI_SLUG__  → slug
  │   │   └── __MENUAI_ORIGIN__ → origin
  │   ├── <head>'e script enjekte
  │   └── Security header temizleme
  ├── CSS işleme: url() referansları proxy path'e çevir
  └── Diğer asset'ler: direkt aktar + cache
```

### 2. Client-Side Injection (`public/menuai-inject.js`)

Proxy sayfasına enjekte edilen ana script. 6 modülden oluşur:

| Modül | İşlev |
|-------|-------|
| **Network Interceptor** | `fetch()` ve `XMLHttpRequest` hijack — relative URL'leri `/p/slug/` prefix'ine yönlendir |
| **Cart System** | Global sepet state (`window.__menuaiCart`), addToCart, removeFromCart, changeQty |
| **Cart UI** | FAB (turuncu, sağ-alt), badge, BottomSheet (slide-up), toast bildirimi |
| **CSS Injection** | Tüm MenüAi stilleri (butonlar, cart, toast, sheet) |
| **Text Match Engine** | DOM'daki metin elementlerini Supabase ürünleriyle eşleştirip `+` butonu ekle |
| **Fallback Panel Loader** | 0 eşleşme → `menuai-fallback-panel.js` yükle → kategorili panel göster |

### 3. Fallback Product Panel (`public/menuai-fallback-panel.js`)

Image-based menüler için tam ekran ürün listesi:

- **Sipariş FAB** — Mor, sol-alt, hamburger ikonu + "Sipariş" yazısı
- **Panel** — Dark-theme, slide-up, tam ekran
- **Kategori Tabları** — Yatay scroll, aktif kategoriye mor gradient
- **Ürün Listesi** — İsim, açıklama, fiyat + `+` butonu
- **Arama** — Input ile tüm kategorilerde anlık filtreleme
- **Sepet Entegrasyonu** — `+` butonları ana sepet sistemini kullanır

### 4. Menu API (`/api/menu-items/:slug`)

Supabase'den slug bazlı menü verisi döndürür:

```json
{
  "success": true,
  "categories": [
    {
      "name": "Kahvaltı",
      "items": [
        { "name": "GRANDOLA", "price": 340, "description": "..." },
        { "name": "TUCCO KAHVALTI", "price": 550, "description": "" }
      ]
    }
  ]
}
```

### 5. Menu Parser (`menuParser.js`)
İki aşamalı AI destekli menü çıkarma:
- **Aşama 1: DOM Scraping** — Sayfadaki metin tabanlı menüleri çeker
- **Aşama 2: Gemini Vision** — DOM yetersizse screenshot alıp AI ile analiz eder
- Kategori normalizasyonu, deduplication, "Diğer" kategorisi dağıtımı

### 6. Admin Paneli (`admin.html`)
Restoran sahibinin menüsünü yönettiği dark-theme panel:
- URL gir → AI ile parse et → Supabase'e kaydet
- Kayıtlı restoranları listele
- Parse sonuçlarını görüntüle

---

## 🗄️ Veritabanı Şeması

```sql
restaurants          -- Restoran bilgileri
├── id               UUID PK
├── restaurant_key   VARCHAR(50) UNIQUE   -- "POTE-2026-X7K9"
├── name             VARCHAR(255)
├── slug             VARCHAR(100) UNIQUE  -- "tucco", "pote"
├── menu_url         TEXT                 -- Orijinal menü URL
├── logo_url         TEXT
├── is_active        BOOLEAN
└── created_at       TIMESTAMP

menu_categories      -- Menü kategorileri
├── id               UUID PK
├── restaurant_id    UUID FK → restaurants
├── name             VARCHAR(255)         -- "Kahvaltı", "Tostlar"
└── display_order    INT

menu_items           -- Menü ürünleri
├── id               UUID PK
├── restaurant_id    UUID FK → restaurants
├── category_id      UUID FK → menu_categories
├── name             VARCHAR(255)         -- "GRANDOLA"
├── description      TEXT
├── price            DECIMAL(10,2)        -- 340.00
├── image_url        TEXT
└── is_available     BOOLEAN

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

## 📡 API Endpoints

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/` | Ana sayfa (landing) |
| `GET` | `/admin` | Admin paneli |
| `GET` | `/p/:slug/*` | **Proxy Engine** — menü sitesini ayna + script enjekte |
| `GET` | `/r/:slug/masa/:no` | Müşteri giriş → `/p/:slug/` redirect |
| `GET` | `/api/menu-items/:slug` | Slug bazlı menü ürünleri (Supabase) |
| `GET` | `/api/menu/items` | Legacy menü API (parsed_menu.json) |
| `GET` | `/api/restaurants` | Tüm restoranları listele |
| `POST` | `/api/menu/parse` | Menü parse et (Gemini AI) |
| `GET` | `/view?target=URL` | Legacy menü aynalama |
| `POST` | `/upload` | PDF menü yükle |

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
#   GEMINI_API_KEY=your_key
#   SUPABASE_URL=your_url
#   SUPABASE_KEY=your_anon_key

# 4. Supabase şemasını çalıştır
# Supabase Dashboard → SQL Editor → supabase_schema.sql yapıştır

# 5. Başlat
npm start
# → http://localhost:3000

# 6. Menü parse et (CLI)
node menuParser.js "https://restoran-site.com/menu"

# 7. Extracted JSON'ı Supabase'e aktar
node importToSupabase.js
```

---

## 🧪 Test Edilen Siteler

| Site | Slug | Tip | Strateji | Sonuç |
|------|------|-----|----------|-------|
| Pote (mps27.mobresposmenu.com.tr) | `pote` | Dijital menü (text-based) | **Text Match** → + butonlar | ✅ 60 kategori, DOM match |
| Tucco Gastro Coffee | `tucco` | Image-based menü | **Fallback Panel** → Sipariş UI | ✅ 46 kategori, 426 ürün |
| asiminyeri.com.tr | — | Resim tabanlı menü | Vision AI parse | ✅ 90+ ürün |
| sks.nevsehir.edu.tr | — | Haftalık yemek tablosu | Vision AI parse | ✅ 18 ürün |

### Fallback Panel Test Sonuçları (Tucco)

```
[MenüAi] 426 ürün yüklendi                    ✅ API'den veri geldi
[MenüAi] Text match yok, fallback panel aktif  ✅ Image menü algılandı
[MenüAi] Fallback panel injected — 46 kategori ✅ Panel açıldı
✓ GRANDOLA sepete eklendi                      ✅ Sepet çalışıyor
```

- ✅ Sipariş FAB butonu görünür (mor, sol-alt)
- ✅ Panel açılır (kategorili ürün listesi)
- ✅ Ürün arama çalışır
- ✅ `+` butonlarıyla sepete ekleme çalışır
- ✅ Cart FAB (turuncu, sağ-alt) badge ile görünür
- ✅ Bottom Sheet sepet detayı gösterir
- ✅ Sipariş gönder fonksiyonel

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
| V5.3 | Parser güçlendirme (kategori normalizasyon, dedup) | Şubat 2026 |
| **V6.0** | **Proxy Engine overhauled** — external injection script | **Şubat 2026** |
| **V6.5** | **Sepet sistemi** — FAB + BottomSheet + Toast | **Şubat 2026** |
| **V6.8** | **Text Match Engine** — DOM scan + buton enjeksiyonu | **Şubat 2026** |
| **V7.0** | **Fallback Panel** — Image-based menüler için evrensel UI | **Şubat 2026** |
| **V7.1** | **Tucco Gastro Coffee** — 426 ürün, 46 kategori import | **Şubat 2026** |

### V6.0-V7.1 Detaylı Değişiklik Günlüğü

#### V6.0 — Proxy Engine Refactor
- `server.js`: ~460 satır inline string concatenation kodu → harici dosyalara taşındı
- Enjeksiyon scripti artık `public/menuai-inject.js` dosyasından okunuyor
- Placeholder sistemi: `__MENUAI_SLUG__`, `__MENUAI_ORIGIN__` → runtime'da replace
- `express.static('public')` eklendi

#### V6.5 — Sepet Sistemi
- Global sepet state: `window.__menuaiCart`
- `addToCart(name, price)`, `removeFromCart(idx)`, `changeQty(idx, delta)`
- Cart FAB: turuncu, sağ-alt, SVG cart ikonu + yeşil badge
- Cart BottomSheet: slide-up, dark-theme, ürün listesi, miktar kontrol, toplam
- Toast bildirimi: "✓ Ürün sepete eklendi" (2s)
- "Sipariş Gönder" fonksiyonu

#### V6.8 — Text Match Engine
- DOM elementlerini scan (`h1-h6, p, span, div, a, li, td, label`)
- Supabase'deki ürün isimleriyle case-insensitive eşleştirme
- Eşleşen elementi `position: relative` yapıp `+` butonu ekleme
- MutationObserver ile SPA navigasyonlarında yeniden scan

#### V7.0 — Fallback Product Panel
- Text match 0 sonuç → fallback modu aktif
- `menuai-fallback-panel.js` dinamik yükleme
- "Sipariş" FAB (mor, sol-alt) → tam ekran panel
- Kategorili ürün listesi (horizontal scroll tablar)
- Ürün arama (anlık filtreleme)
- Aynı sepet sistemiyle entegre

#### V7.1 — Tucco Gastro Coffee Entegrasyonu
- Image-based menü analizi ve 426 ürün çıkarma
- 46 kategoriye ayrılmış ürün verisi
- Supabase import (importToSupabase.js)
- API field uyumu düzeltmesi (`category` → `name`)
- E2E test: FAB → Panel → Kategori → Ürün → Sepet → Sipariş ✅

#### V7.2 — OCR Zone Overlay (🚧 Devam Ediyor)
- **Görsel menülerin üzerine interaktif `+` butonları** — resme dokunarak sipariş ver
- Gemini Vision ile 2-adımlı precise OCR: ürün çıkarma → bbox koordinat bulma
- `ocr-positions-tucco.json` — 49 sayfa, 449 ürün, bbox formatı `[yMin, xMin, yMax, xMax]` (0-1000)
- `zone-demo.html` çoklu sayfa desteği: tüm sayfalar alt alta, scroll ile gezinme
- Her ürün için görünmez zone + sol kenar `+` butonu
- İki dokunuşlu etkileşim: 1. turuncu highlight + neon glow → 2. yeşil ✓ + sepete ekle
- Sparkle animasyonu, toast bildirimi, otomatik reset
- `.page-inner` iç container ile doğru absolute pozisyonlama
- **Durum:** 49 sayfanın 3'ünde bbox var (sayfa 6, 7, 9). Kalan 36 sayfa için toplu OCR gerekli.

### ⬜ Acil Sonraki Adımlar

| # | Konu | Detay |
|---|------|-------|
| 1 | **Batch Precise OCR** | Kalan 36 sayfada bbox eksik → `preciseOcr.js` ile toplu Gemini çağrısı |
| 2 | **Sol Kenar Layout Fix** | Plus butonlarının resim dışına taşma sorunu (`.page-inner` ile düzeltildi, test gerekli) |
| 3 | **Zone Demo → Native Menu Entegrasyonu** | `zone-demo.html` mantığını `native-menu.html` ve ana akışa taşıma |

### ⬜ Gelecek Fazlar

| Sprint | Konu | Tahmini Süre |
|--------|------|-------------|
| Sprint 2 | Garson PWA + Realtime Bildirim | 3-4 gün |
| Sprint 3 | QR Üreteci + Restoran Onboarding | 2-3 gün |
| Sprint 4 | Deploy + Abonelik + Cila | 2-3 gün |

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

**MenüAI v7.2** — *OCR Zone Overlay Edition* 🍽️

Her menü tipi için evrensel sipariş deneyimi:
Text → `+` buton | Image → OCR Zone Overlay | Fallback → Sipariş paneli

Geliştirici: Kaya | 2026

</div>
