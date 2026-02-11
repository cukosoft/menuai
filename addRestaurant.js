#!/usr/bin/env node
/**
 * addRestaurant.js — Tek Komutla Restoran Ekleme
 * 
 * Kullanım:
 *   node addRestaurant.js <url> --slug <slug> --name <name>
 *   node addRestaurant.js "https://mps27.mobresposmenu.com.tr/?id=MP422" --slug pote --name "Pote"
 *   node addRestaurant.js "https://tuccogastrocoffee.com/qrmenu/" --slug tucco --name "Tucco"
 * 
 * Otomatik olarak:
 * 1. Site tipini tespit eder (MobResPos, Statik, vb.)
 * 2. Doğru adaptörle menü çıkarır
 * 3. Supabase'e import eder
 * 4. menuai.tr/p/<slug> hazır!
 */

require('dotenv').config();
const { detectAdapter } = require('./adapters');
const { importMenu } = require('./importToSupabase');
const fs = require('fs');
const path = require('path');

// ═══ CLI ARGS ═══
function parseArgs() {
    const args = process.argv.slice(2);
    const result = { url: null, slug: null, name: null, skipExtract: false, dryRun: false };

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--slug' && args[i + 1]) {
            result.slug = args[++i];
        } else if (args[i] === '--name' && args[i + 1]) {
            result.name = args[++i];
        } else if (args[i] === '--skip-extract') {
            result.skipExtract = true;
        } else if (args[i] === '--dry-run') {
            result.dryRun = true;
        } else if (!args[i].startsWith('--') && !result.url) {
            result.url = args[i];
        }
    }

    return result;
}

function slugify(name) {
    return name
        .toLowerCase()
        .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ü/g, 'u')
        .replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g')
        .replace(/İ/g, 'i').replace(/Ö/g, 'o').replace(/Ü/g, 'u')
        .replace(/Ş/g, 's').replace(/Ç/g, 'c').replace(/Ğ/g, 'g')
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 30);
}

// ═══ MAIN ═══
async function main() {
    const opts = parseArgs();

    if (!opts.url) {
        console.log(`
╔══════════════════════════════════════════════════════╗
║  addRestaurant.js — Tek Komutla Restoran Ekleme     ║
╚══════════════════════════════════════════════════════╝

Kullanım:
  node addRestaurant.js <url> --slug <slug> --name <name>

Örnekler:
  node addRestaurant.js "https://mps27.mobresposmenu.com.tr/?id=MP422" --slug pote --name "Pote"
  node addRestaurant.js "https://tuccogastrocoffee.com/qrmenu/" --slug tucco --name "Tucco"

Opsiyonlar:
  --slug <slug>      URL kısayolu (otomatik oluşturulur)
  --name <name>      Restoran adı (extract'tan alınır)
  --skip-extract     Sadece Supabase kaydı oluştur, menü çıkarma
  --dry-run          Gerçek import yapma, sonucu göster
`);
        process.exit(1);
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  🍽️  MenüAi — Restoran Ekleme`);
    console.log(`${'═'.repeat(60)}\n`);
    console.log(`📎 URL: ${opts.url}`);

    // 1. Adaptör tespit
    const adapter = detectAdapter(opts.url);
    console.log(`🔍 Tespit: ${adapter.NAME} adaptörü seçildi`);

    let menuData;
    let restaurantName = opts.name;
    let slug = opts.slug;

    if (opts.skipExtract) {
        // Menü çıkarma atla — sadece boş kayıt
        console.log(`⏭️  Menü çıkarma atlandı (--skip-extract)`);
        menuData = {
            restaurant: restaurantName || 'Yeni Restoran',
            menu_url: opts.url,
            categories: []
        };
    } else {
        // 2. Menü çıkar
        console.log(`\n${'─'.repeat(40)}`);
        console.log(`📂 Menü çıkarılıyor...`);
        console.log(`${'─'.repeat(40)}`);

        menuData = await adapter.extract(opts.url);

        // Restoran adını extract'tan al (eğer verilmediyse)
        if (!restaurantName && menuData.restaurant) {
            restaurantName = menuData.restaurant;
            console.log(`📛 Restoran adı otomatik: ${restaurantName}`);
        }
    }

    // Fallback isim/slug
    if (!restaurantName) {
        restaurantName = new URL(opts.url).hostname.split('.')[0];
        console.log(`📛 Restoran adı URL'den: ${restaurantName}`);
    }
    if (!slug) {
        slug = slugify(restaurantName);
        console.log(`🏷️  Slug otomatik: ${slug}`);
    }

    // Sonuç özeti
    const totalItems = menuData.categories.reduce((a, c) => a + c.items.length, 0);
    console.log(`\n${'─'.repeat(40)}`);
    console.log(`📊 Sonuç Özeti:`);
    console.log(`   Restoran: ${restaurantName}`);
    console.log(`   Slug: ${slug}`);
    console.log(`   Kategoriler: ${menuData.categories.length}`);
    console.log(`   Ürünler: ${totalItems}`);
    console.log(`${'─'.repeat(40)}`);

    // Dry run — sadece göster
    if (opts.dryRun) {
        console.log(`\n🏁 Dry run — import yapılmadı`);
        // JSON kaydet
        const outFile = path.join(__dirname, `extracted_menu_${slug}.json`);
        fs.writeFileSync(outFile, JSON.stringify(menuData, null, 2), 'utf8');
        console.log(`💾 Veri kaydedildi: ${outFile}`);
        return;
    }

    // 3. Supabase import
    console.log(`\n${'─'.repeat(40)}`);
    console.log(`📤 Supabase'e aktarılıyor...`);
    console.log(`${'─'.repeat(40)}`);

    // JSON dosyasını geçici kaydet (importMenu file bekliyor)
    const tmpFile = path.join(__dirname, `_tmp_${slug}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify(menuData, null, 2), 'utf8');

    try {
        await importMenu(menuData, slug, restaurantName, opts.url);
    } finally {
        // Geçici dosyayı temizle
        try { fs.unlinkSync(tmpFile); } catch (e) { }
    }

    // 4. Kalıcı JSON de kaydet
    const outFile = path.join(__dirname, `extracted_menu_${slug}.json`);
    fs.writeFileSync(outFile, JSON.stringify(menuData, null, 2), 'utf8');

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  ✅ TAMAMLANDI!`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`  🌐 Sayfa: https://menuai.tr/p/${slug}`);
    console.log(`  📂 Veri: ${outFile}`);
    console.log(`  📊 ${totalItems} ürün, ${menuData.categories.length} kategori`);
    console.log(`${'═'.repeat(60)}\n`);
}

main().catch(err => {
    console.error(`\n❌ HATA: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
});
