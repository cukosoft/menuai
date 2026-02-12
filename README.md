# 🍽️ MenüAI — Universal Menu Intelligence Platform

<div align="center">

![Version](https://img.shields.io/badge/version-8.0-blue)
![Status](https://img.shields.io/badge/status-Agentic%20Brain%20Pipeline-brightgreen)
![Node](https://img.shields.io/badge/node-18%2B-green)
![AI](https://img.shields.io/badge/AI-Gemini%203%20Pro-orange)
![Live](https://img.shields.io/badge/live-menuai.tr-purple)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

**Herhangi bir restoran menü sitesini verin — AI otomatik parse etsin, yayınlasın, akıllandırsın.**

*URL gir → Brain analiz eder → Ürünler çıkarılır → Otomatik yayınlanır → Müşteri sipariş verir*

🌐 **[menuai.tr](https://menuai.tr)**

</div>

---

## 📌 Tek Cümlede

> MenüAI, herhangi bir restoran menü URL'sini alır, **Gemini 3 Pro "Brain"** ile sayfayı otonom keşfeder, ürünleri çıkarır, doğrular ve **tek komutla canlıya alır** — restoran tarafında sıfır entegrasyon gerekir.

---

## 🧠 Neden Farklı?

Klasik menü parser'lar sabit kurallara dayalıdır — her site için ayrı scraper yazılır. **MenüAI farklı:**

| Klasik Yaklaşım | MenüAI |
|------------------|--------|
| Her site için ayrı scraper | **Tek pipeline, her site** |
| Manuel kural tanımlama | **Brain kendi kuralını yazar** |
| Crash olunca durur | **Brain screenshot alıp kendini iyileştirir** |
| Sadece text parse | **Text + Screenshot + OCR — üçlü fallback** |
| Manuel yayınlama | **Auto-publish + Brain validasyon** |
| Statik QR menü | **Proxy + akıllı enjeksiyon + sepet sistemi** |

---

## 🏗️ Büyük Resim — End-to-End Akış

```
 ┌──────────────────────────────────────────────────────────────────────┐
 │  node geminiOrchestrator.js "https://restoran.com/menu/"            │
 └────────────────────────────┬─────────────────────────────────────────┘
                              │
                              ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │  1️⃣  SAYFA YÜKLEME + YAPI ANALİZİ                                 │
 │                                                                     │
 │  Playwright → Sayfayı aç → DOM yapısını analiz et                  │
 │  ├── Fiyat pattern tespiti (130₺, 45.00 TL, vb.)                   │
 │  ├── Ürün element sayısı (CSS: product, item, card...)             │
 │  ├── Menü linkleri (alt sayfalar var mı?)                          │
 │  ├── Tab/Accordion tespiti                                         │
 │  └── ⚠️ Crash olursa → Brain Self-Healing (screenshot + diagnosis) │
 └────────────────────────────┬────────────────────────────────────────┘
                              │
                              ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │  2️⃣  BRAIN AGENTIC PRE-SCAN 🔭                                    │
 │                                                                     │
 │  Brain (Gemini 3 Pro) sayfanın 3 screenshot'ını alır:              │
 │  ├── Top / Middle / Bottom → 3 görsel                              │
 │  ├── Sayfa yapısı + görselleri analiz eder                         │
 │  ├── Beklenti oluşturur:                                           │
 │  │   ├── expectedItemRange: { min: 80, max: 150 }                  │
 │  │   ├── expectedCategoryCount: { min: 10, max: 20 }               │
 │  │   ├── likelyCategories: ["Kahvaltı", "İçecek", ...]            │
 │  │   ├── pageComplexity: "simple" | "medium" | "complex"           │
 │  │   └── hiddenContent: true/false                                 │
 │  │                                                                  │
 │  ├── Gerekirse aksiyon alır:                                       │
 │  │   ├── CLICK → Gizli menü açma (tab, modal)                     │
 │  │   ├── SCROLL_TO → Daha fazla içerik görme                      │
 │  │   └── DONE → Beklentiyi raporla                                │
 │  └── Max 5 iterasyon, 45s timeout                                  │
 └────────────────────────────┬────────────────────────────────────────┘
                              │
                              ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │  3️⃣  PIPELINE RULES ENGINE ⚙️                                     │
 │                                                                     │
 │  Brain'in daha önce yazdığı kurallar otomatik uygulanır:           │
 │  ├── "Ürünsüz Kategori Sayfası" → USE_SUBPAGES                    │
 │  ├── "Fiyatsız Kategori Dağılımı" → USE_SUBPAGES                  │
 │  ├── "Tek Sayfa Menü Yoğunluk" → SCROLL_MORE                     │
 │  └── Kurallar pipelineRules.json'da kalıcı saklanır               │
 │                                                                     │
 │  Kural yoksa → Brain'e danışılır (strateji üretir)                 │
 └────────────────────────────┬────────────────────────────────────────┘
                              │
                              ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │  4️⃣  EXTRACTION — Üçlü Strateji                                   │
 │                                                                     │
 │  ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐        │
 │  │ A) DOM TEXT  │   │ B) SCREENSHOT│   │ C) MULTI-PAGE    │        │
 │  │             │   │   FALLBACK   │   │    EXTRACTION    │        │
 │  ├─────────────┤   ├──────────────┤   ├──────────────────┤        │
 │  │ DOM'dan     │   │ Sayfa        │   │ Her alt sayfayı  │        │
 │  │ metin çıkar │   │ screenshot'la│   │ ayrı ayrı        │        │
 │  │ Gemini ile  │→→→│ Gemini Vision│   │ ziyaret et       │        │
 │  │ parse et    │   │ ile oku      │   │ A veya B ile     │        │
 │  │             │   │              │   │ çıkar            │        │
 │  │ 0 ürün mü?  │   │ Screenshot   │   │                  │        │
 │  │ → B'ye git  │   │ batch'leri   │   │ Merge + dedup    │        │
 │  └─────────────┘   └──────────────┘   └──────────────────┘        │
 │                                                                     │
 │  Extraction sırasında Brain müdahale edebilir:                     │
 │  ├── "Chunk çok büyük, böl"                                        │
 │  ├── "Bu kategoride data eksik, tekrar dene"                       │
 │  └── "Strategy değiştir: DISCOVER_SUBPAGES"                        │
 └────────────────────────────┬────────────────────────────────────────┘
                              │
                              ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │  5️⃣  BRAIN VALIDATION + AUTO-PUBLISH ✅                            │
 │                                                                     │
 │  Brain çıkarılan veriyi 3 denemede doğrular:                       │
 │  ├── Pre-Scan beklentisiyle karşılaştır                            │
 │  ├── Kategori isimleri anlamlı mı?                                 │
 │  ├── Fiyat politikası tutarlı mı?                                  │
 │  ├── Ürün dağılımı dengeli mi?                                     │
 │  └── Skor: 1-10 (7+ → onay)                                       │
 │                                                                     │
 │  Onay → Supabase'e import → menuai.tr/p/slug yayında!             │
 │  Red → Sorun raporla → Düzeltme dene → 3x'te de redse durur       │
 └────────────────────────────┬────────────────────────────────────────┘
                              │
                              ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │  6️⃣  SELF-IMPROVEMENT 🔧                                          │
 │                                                                     │
 │  Brain müdahale ettiyse → kalıcı kural üretir:                     │
 │  └── pipelineRules.json'a yazar                                    │
 │  Gelecekte aynı durumda Brain'e gerek kalmaz                       │
 │                                                                     │
 │  Strategy Store:                                                    │
 │  └── strategyStore.json → URL bazlı başarılı strateji kaydı        │
 └─────────────────────────────────────────────────────────────────────┘
```

---

## 🧬 Brain Mimarisi — İki Seviyeli AI

| Rol | Model | Görevi |
|-----|-------|--------|
| 🧠 **Brain** | Gemini 3 Pro | Strateji, karar, analiz, kural yazma, validasyon, self-healing |
| ⚡ **Worker** | Gemini 3 Flash | Bulk extraction, OCR, metin parse (hızlı, ucuz) |

**Brain şunları yapabilir:**
- Sayfaya bakıp ne tür bir menü olduğunu anlar
- Gizli içerik varsa tıklayıp açar
- DOM analizi crash ederse **screenshot alıp kendi teşhis koyar**
- Extraction sonucunu Pre-Scan beklentisiyle karşılaştırır
- Sorun bulursa düzeltme önerir ve tekrar dener
- Başarılı stratejileri kalıcı kurallar olarak yazar

---

## 🔭 Brain Self-Healing

Brain, bir insan geliştirici gibi sorun çözer:

```
Normal akış:
  DOM analiz → başarılı → devam

Crash durumu (ör: SVG elementleri, iframe sorunları):
  DOM analiz → CRASH! 💥
  ├── Brain: "Tamam, sayfanın screenshot'ını verirler misiniz?"
  ├── Screenshot alınır 📸
  ├── Brain görseli analiz eder:
  │   "Bu bir menü sayfası. ~100 ürün görüyorum.
  │    Kruvasanlar, Tatlılar, İçecekler kategorileri var.
  │    Crash sebebi muhtemelen SVG elementleri."
  └── Fallback structure üretir → pipeline kırılmadan devam eder ✅
```

---

## 🌐 Müşteri Deneyimi — Proxy + Akıllı Enjeksiyon

Extraction sadece başlangıç. Gerçek değer **müşteri deneyiminde:**

```
Müşteri QR kodunu tarar → menuai.tr/p/slug
                              │
                              ▼
                   ┌── Proxy Engine ──────────┐
                   │                           │
                   │  Orijinal site aynalanır  │
                   │  + MenüAi scriptleri      │
                   │    enjekte edilir          │
                   └────────────┬──────────────┘
                                │
           ┌────────────────────┼────────────────────┐
           │                    │                    │
    Text-Based Menü      Image Menü +          Image Menü
           │              OCR Overlay              │
           ▼                    ▼                    ▼
    DOM'da ürünleri      Resmin üzerine        Fallback Panel
    bul → "+" buton      interaktif zone       Kategorili liste
           │                    │                    │
           └────────────────────┼────────────────────┘
                                │
                                ▼
                   ┌── Sepet + Sipariş ──────┐
                   │  🛒 Cart FAB            │
                   │  📋 Bottom Sheet        │
                   │  🍽️ Sipariş Gönder     │
                   └─────────────────────────┘
```

### Üçlü Enjeksiyon Stratejisi

| Strateji | Ne Zaman | Nasıl |
|----------|----------|-------|
| **Text Match** | DOM'da ürün adı bulundu | Ürünün yanına `+` butonu eklenir |
| **OCR Zone Overlay** | OCR pozisyon verisi mevcut | Resmin üzerine görünmez zone + `+` butonu |
| **Fallback Panel** | 0 text match + OCR yok | "Sipariş" FAB → tam ekran ürün listesi |

---

## ✅ Test Edilen Siteler ve Sonuçlar

| Site | Tip | Ürün | Kategori | Brain | Strateji |
|------|-----|------|----------|-------|----------|
| [Kahverengi Cafe](https://menuai.tr/p/kahverengicafe-turkiye) | Tek sayfa, text | **208** | **21** | 10/10 ✅ | SCROLL_MORE |
| [Cafe Blanca](https://menuai.tr/p/cafeblanca-turkiye) | Multi-page, 21 alt sayfa | **263** | **20** | 10/10 ✅ | USE_SUBPAGES |
| [Phokaia Cafe](https://menuai.tr/p/phokaiacafeshop) | Tek sayfa, screenshot | **116** | **14** | Onay ✅ | DOM + Screenshot fallback |
| [Dede Kebap](https://menuai.tr/p/dedekebap-turkiye) | Multi-page | **178** | **15** | Onay ✅ | USE_SUBPAGES |
| Starbucks TR | Tek sayfa | **160+** | **20+** | Onay ✅ | SCROLL_MORE |
| Pote | Dijital menü (SPA) | **650+** | **60** | Onay ✅ | DOM Text Match |

---

## 📂 Proje Yapısı

```
menuai/
│
├── 🧠 CORE AI ENGINE
│   ├── geminiOrchestrator.js   ← Ana pipeline (~2100 satır)
│   │   ├── GeminiOrchestrator  — Agentic extraction loop
│   │   ├── PipelineRulesEngine — Otomatik kural motoru
│   │   ├── StrategyStore       — URL bazlı strateji hafızası
│   │   ├── _brainPreScan()     — Agentic Pre-Scan (screenshot + keşif)
│   │   ├── Brain Self-Healing  — Crash'te screenshot diagnosis
│   │   └── Auto-Publish        — Validation + Supabase import
│   │
│   ├── pipelineRules.json      ← Brain'in yazdığı kalıcı kurallar
│   └── strategyStore.json      ← URL bazlı başarılı strateji kaydı
│
├── 🖥️ BACKEND
│   ├── server.js               ← Express sunucu (Proxy Engine, API, Native Menu)
│   ├── menuDatabase.js         ← Supabase CRUD
│   ├── importToSupabase.js     ← JSON → Supabase importer
│   └── addRestaurant.js        ← Restoran ekleme CLI
│
├── 🎨 CLIENT-SIDE (public/)
│   ├── menuai-inject.js        ← Proxy enjeksiyon scripti
│   │   ├── Network Interceptor
│   │   ├── Text Match Engine  
│   │   ├── Cart System + UI
│   │   └── Fallback Panel Loader
│   ├── menuai-fallback-panel.js ← Kategorili ürün paneli
│   ├── menuai-ocr-overlay.js   ← OCR Zone Overlay
│   └── zone-demo.html          ← OCR zone demo
│
├── 🌐 FRONTEND
│   ├── index.html              ← Landing page
│   ├── admin.html              ← Admin paneli
│   └── styles.css              ← Ana stiller
│
└── ⚙️ CONFIG
    ├── Dockerfile + .dockerignore  ← Cloud Run deployment
    ├── .env.example                ← Env şablonu
    └── supabase_schema.sql         ← DB şeması
```

---

## 🛠️ Teknoloji Stack

| Katman | Teknoloji | Rol |
|--------|-----------|-----|
| **AI Brain** | Gemini 3 Pro | Strateji, validasyon, self-healing, kural yazma |
| **AI Worker** | Gemini 3 Flash | Bulk extraction, OCR, metin parse |
| **Browser** | Playwright | Headless sayfa yükleme, screenshot, DOM erişim |
| **Backend** | Express.js (Node 18+) | Proxy engine, API, static serve |
| **Database** | Supabase (PostgreSQL) | Ürün, kategori, restoran verisi |
| **Hosting** | Google Cloud Run | Production deployment |
| **Domain** | menuai.tr (Cloudflare) | Custom domain + SSL |
| **Frontend** | Vanilla JS + CSS | Hafif, framework'süz client |

---

## 🚀 Hızlı Başlangıç

```bash
# 1. Klonla
git clone https://github.com/cukosoft/menuai.git
cd menuai

# 2. Bağımlılıkları kur
npm install

# 3. Env dosyası
cp .env.example .env
# .env'yi düzenle:
#   GEMINI_API_KEY=your_gemini_key
#   SUPABASE_URL=your_supabase_url
#   SUPABASE_KEY=your_supabase_anon_key

# 4. Menü çıkar (tek komut — tamamen otonom)
node geminiOrchestrator.js "https://restoran.com/menu/"
# → Brain analiz eder → çıkarır → validate eder → Supabase'e yazar → yayınlar

# 5. Sunucuyu başlat (müşteri deneyimi)
npm start
# → http://localhost:3000
# → /p/slug → proxy + injection
```

---

## 📡 API Endpoints

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/p/:slug/*` | **Proxy Engine** — menü sitesini aynala + script enjekte |
| `GET` | `/m/:slug` | **Native Menu** — iframe block durumunda standalone menü |
| `GET` | `/api/menu-items/:slug` | Slug bazlı menü ürünleri (JSON) |
| `GET` | `/api/restaurants` | Tüm restoranları listele |
| `POST` | `/api/menu/parse` | Menü parse tetikle (Gemini AI) |
| `GET` | `/r/:slug/masa/:no` | QR giriş → proxy'ye redirect |

---

## 🗄️ Veritabanı Şeması

```sql
restaurants              -- Restoran bilgileri
├── id                   UUID PK
├── restaurant_key       VARCHAR(50) UNIQUE   -- "MAKI-2026-X7K9"
├── name                 VARCHAR(255)
├── slug                 VARCHAR(100) UNIQUE  -- "kahverengicafe-turkiye"
├── menu_url             TEXT                 -- Orijinal menü URL
├── is_active            BOOLEAN
└── created_at           TIMESTAMP

menu_categories          -- Menü kategorileri
├── id                   UUID PK
├── restaurant_id        UUID FK → restaurants
├── name                 VARCHAR(255)
└── display_order        INT

menu_items               -- Menü ürünleri
├── id                   UUID PK
├── restaurant_id        UUID FK → restaurants
├── category_id          UUID FK → menu_categories
├── name                 VARCHAR(255)
├── description          TEXT
├── price                DECIMAL(10,2)
└── is_available         BOOLEAN
```

---

## 🔮 Vizyon — Nereye Gidiyoruz?

### ✅ Tamamlanan (Şu An)
- [x] Gemini Orchestrator Agent — otonom extraction pipeline
- [x] Brain Pre-Scan — agentic sayfa keşfi
- [x] Brain Self-Healing — crash'te screenshot diagnosis
- [x] Pipeline Rules Engine — Brain'in kendi yazdığı kurallar
- [x] Strategy Store — URL bazlı strateji hafızası
- [x] Auto-Publish — validate + Supabase import + canlıya alma
- [x] Proxy Engine — orijinal siteyi aynala + injection
- [x] Text Match + Fallback Panel + OCR Zone — üçlü enjeksiyon
- [x] Cloud Run deployment + menuai.tr domain

### 🔜 Sonraki Adımlar
- [ ] **Garson PWA** — Realtime sipariş bildirimi (garson cebindeki uygulamaya)
- [ ] **Sipariş sistemi** — Mutfak ekranı, sipariş takibi
- [ ] **QR Üretici** — Masa bazlı QR kod auto-generate
- [ ] **Batch Onboarding** — Admin panelden toplu restoran ekleme
- [ ] **Multi-language** — İngilizce/Almanca menü desteği

### 🎯 Uzun Vadeli Hedef

> Bir restoran sahibi menuai.tr'ye menü URL'sini girer.
> AI menüyü otomatik çıkarır, yayınlar.
> Masalara QR kod yapıştırılır.
> Müşteri tarar, menüyü görür, ürün seçer, sipariş verir.
> Garsonun cebindeki uygulamaya bildirim düşer.
> **Sıfır entegrasyon. Sıfır kurulum. Anında başla.**

---

## 🗺️ Versiyon Geçmişi

| Versiyon | Açıklama | Tarih |
|----------|----------|-------|
| V1.0 | İlk prototip — iframe + basit overlay | Ocak 2026 |
| V2.0 | Smart Switcher (iframe/proxy/PDF) | Ocak 2026 |
| V3.0 | Supabase entegrasyonu + Admin paneli | Ocak 2026 |
| V5.0 | Ghost Mode overlay | Şubat 2026 |
| V6.0 | Proxy Engine Refactor — external injection | Şubat 2026 |
| V6.5 | Sepet sistemi — FAB + BottomSheet | Şubat 2026 |
| V7.0 | Fallback Panel — Image-based menü desteği | Şubat 2026 |
| V7.2 | OCR Zone Overlay — görsel menülere interaktif buton | Şubat 2026 |
| **V8.0** | **Gemini Orchestrator Agent** — Agentic Brain Pipeline, Pre-Scan, Self-Healing, Auto-Publish, Self-Improvement Rules | **Şubat 2026** |

---

## 📄 Lisans

MIT License

---

<div align="center">

**MenüAI v8.0** — *Agentic Brain Pipeline Edition* 🧠🍽️

Brain keşfeder. Brain çıkarır. Brain doğrular. Brain kuralını yazar.

**Tek komut. Tam otonom. Her menü.**

`node geminiOrchestrator.js "https://herhangi-bir-restoran.com/menu/"`

Geliştirici: **Kaya** | 2026

</div>
