# MenüAI — Master Plan (Güncel Durum Analizi)
## "Restoranların donuk QR menülerini akıllandır"

---

## 🎯 Ürün Özeti

Restoran → MenüAI'ye kayıt olur → Menü URL'sini girer → Her masa için QR üretilir
Müşteri → QR tarar → Menüyü görür (iframe/proxy/fallback) + Akıllı Alt Bar
Garson → PWA'dan bildirim alır (🔔 garson çağır, 💳 hesap iste, 🛒 sipariş bildirimi)

**Gelir:** Aylık abonelik | **Kapsam:** Sadece bildirim (POS yok)

---

## 📂 Proje Dosya Haritası

```
menuai/
├── server.js              ← Express backend (iframe/proxy/PDF mods)
├── app.js                 ← Frontend JS (Supabase, cart, notifications)
├── index.html             ← Ana müşteri sayfası (glass bar, cart sheet)
├── overlay.html           ← Ghost Mode overlay (proxy modunda enjekte)
├── styles.css             ← Ana sayfa stilleri
├── admin.html             ← Admin paneli (menü yükleme + restoran listesi)
├── menuParser.js          ← Gemini Vision + DOM menü parser
├── menuDatabase.js        ← Supabase CRUD işlemleri
├── supabase_schema.sql    ← Veritabanı şeması
├── package.json           ← Bağımlılıklar
├── .env                   ← API anahtarları
└── public/uploads/        ← PDF yüklemeleri
```

---

## 📊 Detaylı Durum Analizi

### ✅ HAZIR OLANLAR

| # | Bileşen | Dosya | Ne Yapıyor | Durum |
|---|---------|-------|------------|-------|
| 1 | **Menu Parser** | menuParser.js | URL ver → Gemini Vision + DOM → JSON menü | ✅ %80 |
| 2 | **Smart Switcher** | server.js:analyzeTarget() | iframe/proxy/PDF otomatik seçim | ✅ %90 |
| 3 | **iframe Mode** | server.js:renderIframeMode() | Site + overlay enjekte | ✅ Çalışıyor |
| 4 | **Proxy Mode** | server.js:renderProxyMode() | HTML çek, overlay ekle | ✅ Çalışıyor |
| 5 | **PDF Viewer** | server.js:renderViewerMode() | PDF göster + overlay | ✅ Çalışıyor |
| 6 | **Ghost Overlay** | overlay.html | 3 floating buton (garson/sepet/hesap) | ✅ V5.3 |
| 7 | **Supabase Şema** | supabase_schema.sql | restaurants, menu_categories, menu_items, parse_logs | ✅ Tanımlı |
| 8 | **Menü DB İşlemleri** | menuDatabase.js | save/get/list menü + restoran CRUD | ✅ Çalışıyor |
| 9 | **Admin Paneli** | admin.html | URL gir → parse et → Supabase'e kaydet + restoran listele | ✅ Basic |
| 10 | **Ana Sayfa** | index.html + app.js | Glass bar, sepet, arama, sipariş, garson çağır | ✅ Basic |
| 11 | **Supabase Client** | app.js:initSupabase() | Frontend Supabase bağlantısı | ✅ Çalışıyor |
| 12 | **Bildirim Gönderme** | app.js:sendNotification() | notifications tablosuna INSERT | ✅ Backend hazır |
| 13 | **Restoran Yükleme** | app.js:loadRestaurant(slug) | Slug ile restoran + menü yükle | ✅ Çalışıyor |
| 14 | **Sipariş Gönderme** | app.js:submitOrder() | Supabase orders tablosuna kaydet | ✅ Basic |
| 15 | **Menü Arama** | app.js:searchMenuItems() | DB'den menü ürünü ara (autocomplete) | ✅ Basic |

### 🟡 KISMEN HAZIR / İYİLEŞTİRME GEREKİYOR

| # | Bileşen | Sorun | Ne Lazım |
|---|---------|-------|----------|
| 1 | **Supabase Şema** | `tables`, `notifications`, `waiters`, `orders` tabloları YOK | Şemaya ekle |
| 2 | **URL Routing** | `/view?target=URL` şeklinde, `/r/:slug/masa/:no` yok | REST route ekle |
| 3 | **Menu Parser** | Tab keşfi çalışmıyor (Vejetaryen tab kaçırılıyor) | Tab detection fix |
| 4 | **Overlay** | Garson/hesap butonları sadece toast gösteriyor, gerçek bildirim yok | Backend bağla |
| 5 | **Admin Panel** | Sadece URL parse + listele var, masa/garson yönetimi yok | Genişlet |
| 6 | **index.html** | Sipariş sistemi var ama masa numarası query param'dan, QR'dan değil | QR entegrasyonu |

### 🔴 EKSİK OLANLAR

| # | Bileşen | Açıklama | Öncelik |
|---|---------|----------|---------|
| 1 | **Fallback Menü UI** | iframe/proxy çalışmadığında DB'den güzel menü göster | 🔥 Yüksek |
| 2 | **Masa QR Üreteci** | Her masa için benzersiz QR → menuai.app/r/slug/masa/5 | 🔥 Yüksek |
| 3 | **Garson PWA** | Gelen bildirimleri göster, ses + push notification | 🔥 Yüksek |
| 4 | **Realtime Bildirim** | Supabase Realtime ile garson anında bildirim alsın | 🔥 Yüksek |
| 5 | **Push Notification** | Service Worker + Web Push API | 🟡 Orta |
| 6 | **Restoran Kayıt Akışı** | Tam onboarding: kayıt → menü parse → QR üret | 🟡 Orta |
| 7 | **Abonelik/Ödeme** | Stripe/iyzico aylık ödeme | 🟢 Düşük (sonra) |
| 8 | **Deploy** | Cloud Run/Vercel + custom domain | 🟢 Düşük (sonra) |

---

## 🗺️ ÖNCELİKLENDİRİLMİŞ YOL HARİTASI

### SPRINT 1: Temel Altyapı Tamamla (3-4 gün)
> **Amaç:** Uçtan uca bir restoran için çalışan akış

**1.1 Supabase Şema Güncelle** ⏱️ 1 saat
```sql
-- Eksik tablolar:
tables          (id, restaurant_id, table_number, qr_code_url)
notifications   (id, restaurant_id, table_id, type, message, status, created_at)
waiters         (id, restaurant_id, name, device_token, is_active)
orders          (id, restaurant_id, table_id, items, status, created_at)
```

**1.2 URL Routing** ⏱️ 2 saat
```
GET /r/:slug/masa/:tableNo  → Müşteri menü sayfası
GET /r/:slug/garson         → Garson PWA
GET /r/:slug/admin          → Restoran yönetimi
```

**1.3 Fallback Menü UI** ⏱️ 4 saat
- iframe/proxy fail → DB'den menü çek → Güzel mobile-first kart tasarımı
- Kategoriler, fiyatlar, açıklamalar
- Overlay (garson/hesap/sipariş) her durumda mevcut

**1.4 Overlay → Backend Bağlantısı** ⏱️ 2 saat
- "Garson Çağır" → POST /api/notify { type: 'waiter', table: 5, restaurant: slug }
- "Hesap İste" → POST /api/notify { type: 'bill' }
- "Sipariş" → POST /api/notify { type: 'order', items: [...] }

### SPRINT 2: Garson PWA + Realtime (3-4 gün)
> **Amaç:** Müşteri buton basar → Garson anında bildirim alır

**2.1 Garson PWA Sayfası** ⏱️ 4 saat
- /r/:slug/garson → Bildirimleri listele
- Her bildirimde: Masa no, tip, zaman
- "Görüldü" butonu
- Mobil uyumlu, PWA installable

**2.2 Supabase Realtime** ⏱️ 3 saat
- notifications tablosuna INSERT → Garson PWA anında güncellenir
- Ses çal (🔔) + titreşim

**2.3 Push Notification** ⏱️ 3 saat
- Service Worker kaydı
- Web Push API (garson uygulama kapalıyken bile bildirim)
- Supabase Edge Function ile push gönder

### SPRINT 3: QR + Onboarding (2-3 gün)
> **Amaç:** Restoran sahibi kendi kendine kurabilsin

**3.1 QR Kod Üreteci** ⏱️ 3 saat
- Admin panelde: "Masa Sayısı: [10]" → 10 QR üret
- Her QR → menuai.app/r/slug/masa/N
- Toplu PDF indirme (A4 baskıya hazır)

**3.2 Admin Panel Genişlet** ⏱️ 3 saat
- Menü düzenleme (ürün ekle/sil/fiyat güncelle)
- Garson ekleme
- Bildirim geçmişi
- QR yönetimi

**3.3 Restoran Kayıt Akışı** ⏱️ 2 saat
- Form: Ad, menü URL, masa sayısı
- Otomatik: slug oluştur → menü parse → QR üret → hazır!

### SPRINT 4: Cila + Deploy (2-3 gün)
> **Amaç:** Production-ready

- [ ] Deploy (Cloud Run veya Vercel)
- [ ] Custom domain (menuai.app)
- [ ] SSL, CDN
- [ ] Abonelik sistemi (iyzico/Stripe)
- [ ] PWA manifest + icons
- [ ] Error handling, rate limiting

---

## 🔑 TEKNİK KARARLAR

| Karar | Sonuç |
|---|---|
| Sipariş sistemi | Sadece bildirim, POS entegrasyonu yok |
| Satış modeli | Restoran sahibine aylık abonelik |
| Masa tanımlama | Her masada benzersiz QR |
| Garson arayüzü | PWA (Push Notification) |
| Aynalama | iframe → proxy → fallback UI (3 katman) |
| Menü verisi | Parser ile çek + DB'de tut (autocomplete + fallback) |
| Realtime | Supabase Realtime (WebSocket) |
| Frontend | Vanilla JS (framework yok) |
| Backend | Express.js + Supabase |
| AI | Gemini Vision (menü parsing) |
